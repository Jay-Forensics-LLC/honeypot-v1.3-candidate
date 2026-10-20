"""Single-writer durable incident evidence. Corruption is never repaired here."""
import json
import os
import hashlib
import sqlite3
from contextlib import contextmanager
from collections import OrderedDict
from collections.abc import Mapping
from pathlib import Path
from hp_common import atomic_json, sha256

class EvidenceIntegrityError(RuntimeError):
    pass

def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)

MAX_INCIDENT_BYTES = 64 * 1024 * 1024
MAX_MIGRATION_ENTRIES = 100000
_INDEXES = OrderedDict()


class ReplayIndexPending(RuntimeError):
    """Historical location backfill must finish before allocating evidence."""


class EventLocations:
    """Single-writer durable locator, reserved before the first evidence write.

    Evidence remains authoritative. A location is never moved or expired with a
    correlation window. SQLite bounds lookup memory independently of retention.
    """
    def __init__(self, path, incidents):
        self.path, self.incidents = Path(path), Path(incidents)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.database() as db:
            db.execute('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS locations '
                       '(event_id TEXT PRIMARY KEY, incident TEXT NOT NULL, evidenced INTEGER NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS migration '
                       '(incident TEXT PRIMARY KEY, state TEXT NOT NULL, signatures TEXT, '
                       'evidence_sha256 TEXT, metadata_sha256 TEXT, reason TEXT)')
            db.execute('CREATE TABLE IF NOT EXISTS conflicts '
                       '(event_id TEXT NOT NULL, incident TEXT NOT NULL, PRIMARY KEY(event_id, incident))')
            db.execute('CREATE INDEX IF NOT EXISTS conflict_incidents ON conflicts(incident)')
            scope = str(self.incidents.resolve())
            db.execute('INSERT OR IGNORE INTO settings VALUES (?, ?)', ('scope', scope))
            if db.execute('SELECT value FROM settings WHERE key=?', ('scope',)).fetchone()[0] != scope:
                raise EvidenceIntegrityError('Event locator belongs to a different incident root')
        os.chmod(self.path, 0o640)
        sync_directory(self.path.parent)

    @contextmanager
    def database(self):
        if self.path.is_symlink(): raise EvidenceIntegrityError('Symlink event locator')
        db = None
        try:
            db = sqlite3.connect(self.path)
            db.execute('PRAGMA synchronous=FULL')
            db.execute('PRAGMA journal_mode=DELETE')
            with db:
                yield db
        except sqlite3.DatabaseError as exc:
            raise EvidenceIntegrityError('Event locator database failure') from exc
        finally:
            if db is not None: db.close()

    def validate_relative(self, value):
        if (type(value) is not str or not value or len(value) > 1024 or '\0' in value):
            raise EvidenceIntegrityError('Invalid stored event location')
        relative = Path(value)
        if (relative.is_absolute() or len(relative.parts) != 2 or
                any(p in ('.', '..') for p in relative.parts) or str(relative) != value):
            raise EvidenceIntegrityError('Invalid stored event location')
        return relative

    def relative(self, directory):
        try: relative = Path(directory).relative_to(self.incidents)
        except (ValueError, TypeError) as exc:
            raise EvidenceIntegrityError('Event location is outside incident root') from exc
        return str(self.validate_relative(str(relative)))

    def lookup(self, event_id):
        with self.database() as db:
            if db.execute('SELECT 1 FROM conflicts WHERE event_id=? LIMIT 1', (event_id,)).fetchone():
                raise EvidenceIntegrityError('Ambiguous historical event location; replay blocked')
            row = db.execute('SELECT incident, evidenced FROM locations WHERE event_id=?', (event_id,)).fetchone()
        if row is None: return None
        directory = self.incidents / self.validate_relative(row[0])
        if type(row[1]) is not int or row[1] not in (0, 1):
            raise EvidenceIntegrityError('Invalid stored evidence confirmation')
        if directory.resolve() != directory.absolute(): raise EvidenceIntegrityError('Symlink event location')
        return directory, bool(row[1])

    def remember(self, directory, event_ids, evidenced=False):
        relative = self.relative(directory)
        event_ids = list(event_ids)
        if (len(event_ids) > 10000 or
                any(type(eid) is not str or not 1 <= len(eid) <= 128 for eid in event_ids)):
            raise EvidenceIntegrityError('Invalid event IDs for locator')
        conflicted = False
        with self.database() as db:
            for event_id in event_ids:
                row = db.execute('SELECT incident FROM locations WHERE event_id=?', (event_id,)).fetchone()
                if row is not None and row[0] != relative:
                    self.validate_relative(row[0])
                    for location in (row[0], relative):
                        db.execute('INSERT OR IGNORE INTO conflicts VALUES (?, ?)', (event_id, location))
                    conflicted = True
                    continue
                if db.execute('SELECT 1 FROM conflicts WHERE event_id=? LIMIT 1', (event_id,)).fetchone():
                    db.execute('INSERT OR IGNORE INTO conflicts VALUES (?, ?)', (event_id, relative))
                    conflicted = True
                    continue
                db.execute('INSERT INTO locations VALUES (?, ?, ?) ON CONFLICT(event_id) '
                           'DO UPDATE SET evidenced=MAX(evidenced, excluded.evidenced)',
                           (event_id, relative, int(evidenced)))
        # Also make creation/removal of SQLite journal and database entries durable.
        sync_directory(self.path.parent)
        # Raise only after the transaction commits: raising inside it would undo
        # the conflict fence and leave the first location eligible for replay.
        if conflicted:
            raise EvidenceIntegrityError('Ambiguous historical event location; replay blocked')

    def ready(self):
        with self.database() as db:
            return db.execute('SELECT 1 FROM settings WHERE key=?', ('backfill_complete',)).fetchone() is not None

    def finish_backfill(self):
        with self.database() as db:
            if db.execute("SELECT 1 FROM migration WHERE state IN ('pending', 'blocked') LIMIT 1").fetchone():
                return False
            seals = json.loads(db.execute('SELECT value FROM settings WHERE key=?', ('inventory',)).fetchone()[0])
            for name, expected in seals.items():
                if directory_signature(self.incidents/name) != expected:
                    db.execute('INSERT OR REPLACE INTO settings VALUES (?, ?)',
                               ('inventory_error', 'Incident directory inventory changed; operator review required'))
                    return False
            for relative, signature in db.execute('SELECT incident, signatures FROM migration'):
                if self.signatures(self.incidents/self.validate_relative(relative)) != json.loads(signature):
                    db.execute("UPDATE migration SET state='blocked', reason=? WHERE incident=?",
                               ('Historical files changed during migration; operator review required', relative))
                    return False
            db.execute('INSERT OR IGNORE INTO settings VALUES (?, ?)', ('backfill_complete', '1'))
        sync_directory(self.path.parent)
        return True

    def prepare_backfill(self):
        """One finite, streaming name inventory; payload work resumes from SQLite."""
        with self.database() as db:
            if db.execute('SELECT 1 FROM settings WHERE key=?', ('inventory',)).fetchone(): return
            seals = {'.': directory_signature(self.incidents)}
            count = 0
            if self.incidents.exists():
                with scan_directory(self.incidents) as days:
                    for day_entry in days:
                        count += 1
                        if count > MAX_MIGRATION_ENTRIES: raise EvidenceIntegrityError('Migration name inventory exceeds bound')
                        day = self.incidents/day_entry.name
                        seals[day.name] = directory_signature(day)
                        with scan_directory(day) as directories:
                            for entry in directories:
                                count += 1
                                if count > MAX_MIGRATION_ENTRIES: raise EvidenceIntegrityError('Migration name inventory exceeds bound')
                                directory = day/entry.name
                                relative = self.relative(directory)
                                db.execute("INSERT INTO migration(incident,state,signatures) VALUES (?, 'pending', ?)",
                                           (relative, json.dumps(self.signatures(directory))))
            if any(directory_signature(self.incidents/name) != stamp for name, stamp in seals.items()):
                raise EvidenceIntegrityError('Incident inventory changed during discovery')
            db.execute('INSERT INTO settings VALUES (?, ?)', ('inventory', json.dumps(seals)))
        sync_directory(self.path.parent)

    def pending(self, budget):
        with self.database() as db:
            rows = db.execute("SELECT incident FROM migration WHERE state='pending' ORDER BY incident LIMIT ?", (budget,)).fetchall()
        return [self.incidents/self.validate_relative(row[0]) for row in rows]

    def signatures(self, directory):
        return {name: list(identity(directory/name)) if (directory/name).exists() else None
                for name in ('events.jsonl', 'incident.json')}

    def unchanged_pending(self, directory):
        relative = self.relative(directory)
        with self.database() as db:
            expected = db.execute('SELECT signatures FROM migration WHERE incident=?', (relative,)).fetchone()
            if expected is None or self.signatures(directory) != json.loads(expected[0]):
                db.execute("UPDATE migration SET state='blocked', reason=? WHERE incident=?",
                           ('Historical files changed since inventory; operator review required', relative))
                return False
        return True

    def record_inspection(self, directory, event_ids, state, signatures, reason=''):
        relative = self.relative(directory)
        digests = {}
        for name in ('events.jsonl', 'incident.json'):
            path = directory/name
            limit = MAX_INCIDENT_BYTES if name == 'events.jsonl' else 1024**2
            if path.exists() and not path.is_symlink() and path.stat().st_size <= limit:
                try: digests[name] = sha256(path)[0]
                except (OSError, ValueError): pass
        if self.signatures(directory) != signatures:
            raise EvidenceIntegrityError('Historical files changed during migration read')
        affected = set()
        with self.database() as db:
            for eid in event_ids:
                row = db.execute('SELECT incident FROM locations WHERE event_id=?', (eid,)).fetchone()
                if row and row[0] != relative:
                    for location in (row[0], relative):
                        self.validate_relative(location)
                        db.execute('INSERT OR IGNORE INTO conflicts VALUES (?, ?)', (eid, location))
                        affected.add(location)
                else:
                    db.execute('INSERT INTO locations VALUES (?, ?, 1) ON CONFLICT(event_id) DO UPDATE SET evidenced=1', (eid, relative))
            db.execute('UPDATE migration SET state=?, signatures=?, evidence_sha256=?, metadata_sha256=?, reason=? WHERE incident=?',
                       (state, json.dumps(signatures), digests.get('events.jsonl'), digests.get('incident.json'), reason, relative))
            for location in affected:
                db.execute("UPDATE migration SET state='quarantined', reason=? WHERE incident=?",
                           ('Ambiguous historical event ID; originals preserved', location))
        sync_directory(self.path.parent)
        return [self.incidents/value for value in affected]

    def blocked(self, directory):
        with self.database() as db:
            relative = self.relative(directory)
            row = db.execute('SELECT state FROM migration WHERE incident=?', (relative,)).fetchone()
            conflict = db.execute('SELECT 1 FROM conflicts WHERE incident=? LIMIT 1', (relative,)).fetchone()
        return bool(conflict) or (row is not None and row[0] in ('quarantined', 'blocked'))

    def status(self):
        with self.database() as db:
            counts = dict(db.execute('SELECT state,count(*) FROM migration GROUP BY state'))
            error = db.execute('SELECT value FROM settings WHERE key=?', ('inventory_error',)).fetchone()
            details = [dict(zip(('incident', 'state', 'evidence_sha256', 'metadata_sha256', 'reason'), row)) for row in
                       db.execute("SELECT incident,state,evidence_sha256,metadata_sha256,reason FROM migration WHERE state IN ('blocked','quarantined') ORDER BY incident LIMIT 32")]
        return {'complete': self.ready(), 'counts': counts, 'inventory_error': error[0] if error else None,
                'details': details, 'detail_limit': 32}


@contextmanager
def scan_directory(path):
    """Stream names from an opened directory, never a materialized name list."""
    path = Path(path)
    if path.resolve() != path.absolute():
        raise EvidenceIntegrityError('Symlink incident inventory directory')
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        with os.scandir(fd) as entries:
            yield entries
    finally:
        os.close(fd)


def directory_signature(path):
    path = Path(path)
    if path.is_symlink() or path.resolve() != path.absolute(): raise EvidenceIntegrityError('Symlink migration directory')
    if not path.exists(): return None
    if not path.is_dir(): raise EvidenceIntegrityError('Non-directory in incident inventory')
    info = path.stat()
    return [info.st_dev, info.st_ino, info.st_mtime_ns, info.st_ctime_ns]


def zero_tail_ids(directory):
    """Fence intact IDs and metadata references for the recognizable NUL-tail case.

    No damaged record is decoded, reconstructed or accepted as evidence. Any
    nonzero malformed content, missing metadata or inconsistent ID set is unknown.
    """
    metadata = directory/'incident.json'
    if metadata.is_symlink() or not metadata.is_file() or metadata.stat().st_size > 1024**2:
        raise EvidenceIntegrityError('NUL-tail migration requires bounded regular metadata')
    meta = json.loads(metadata.read_text())
    ids = meta.get('related_events') if isinstance(meta, dict) else None
    if (not isinstance(ids, list) or not 1 <= len(ids) <= 10000 or
            any(type(eid) is not str or not 1 <= len(eid) <= 128 for eid in ids) or len(set(ids)) != len(ids)):
        raise EvidenceIntegrityError('NUL-tail metadata IDs are invalid')
    evidence = directory/'events.jsonl'
    if evidence.is_symlink() or not evidence.is_file() or evidence.stat().st_size > MAX_INCIDENT_BYTES:
        raise EvidenceIntegrityError('NUL-tail evidence is missing, unsafe or exceeds bound')
    metadata_ids = set(ids)
    intact = set(); saw_tail = False
    with evidence.open('rb') as stream:
        while True:
            line = stream.readline(32*1024*1024+1)
            if not line: break
            if not line.strip(b'\0'):
                saw_tail = True
                while True:
                    chunk = stream.read(1024*1024)
                    if not chunk: break
                    if chunk.strip(b'\0'): raise EvidenceIntegrityError('Unknown nonzero content after damaged tail')
                break
            if len(line) > 32*1024*1024 or not line.endswith(b'\n') or b'\0' in line:
                raise EvidenceIntegrityError('Unknown malformed evidence content')
            row = json.loads(line); eid = row['event_id']
            if (type(eid) is not str or eid not in metadata_ids or eid in intact or
                    row['normalized']['event_id'] != eid):
                raise EvidenceIntegrityError('NUL-tail intact IDs disagree with metadata')
            intact.add(eid)
    if not saw_tail or not intact: raise EvidenceIntegrityError('Not a recognized complete-prefix/NUL-tail incident')
    return ids


def identity(path):
    info = Path(path).stat()
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


class RecordIndex(Mapping):
    """Bounded offsets/hashes, never a retained copy of attacker-controlled payloads."""
    def __init__(self, path, entries, signature):
        self.path, self.entries, self.signature = Path(path), entries, signature

    def __iter__(self):
        return iter(self.entries)

    def __len__(self):
        return len(self.entries)

    def __getitem__(self, key):
        offset, length, digest = self.entries[key]
        fd = os.open(self.path, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            if identity(self.path) != self.signature:
                raise EvidenceIntegrityError('Indexed evidence changed')
            line = os.pread(fd, length, offset)
            if hashlib.sha256(line).hexdigest() != digest or identity(self.path) != self.signature:
                raise EvidenceIntegrityError('Indexed evidence changed during read')
            return json.loads(line)
        finally:
            os.close(fd)


def records(path, limit=32*1024*1024):
    path = Path(path)
    if path.is_symlink(): raise EvidenceIntegrityError(f'Symlink evidence: {path}')
    if not path.exists(): return {}
    signature = identity(path)
    key = (str(path.absolute()), limit)
    cached = _INDEXES.get(key)
    if cached is not None and cached.signature == signature:
        _INDEXES.move_to_end(key)
        return cached
    if signature[2] > MAX_INCIDENT_BYTES:
        raise EvidenceIntegrityError('Evidence file exceeds aggregate read bound')
    entries = {}
    with path.open('rb') as f:
        while True:
            offset = f.tell(); line = f.readline(limit+1)
            if not line: break
            try:
                if len(line)>limit or not line.endswith(b'\n') or b'\0' in line:
                    raise ValueError('Incomplete, oversized or NUL record')
                row = json.loads(line); eid = row['event_id']
                if not isinstance(eid,str) or not 1 <= len(eid) <= 128 or eid in entries:
                    raise ValueError('Invalid or duplicate event ID')
                if row['normalized']['event_id'] != eid: raise ValueError('Normalized identity mismatch')
                if len(entries) >= 10000: raise ValueError('Evidence record count exceeds bound')
                entries[eid] = (offset, len(line), hashlib.sha256(line).hexdigest())
            except (ValueError,KeyError,TypeError) as exc:
                raise EvidenceIntegrityError(f'Evidence integrity failure: {path} offset {offset}: {exc}') from exc
    if identity(path) != signature: raise EvidenceIntegrityError('Evidence changed during index scan')
    result = RecordIndex(path, entries, signature)
    _INDEXES[key] = result; _INDEXES.move_to_end(key)
    while len(_INDEXES) > 64 or sum(len(value) for value in _INDEXES.values()) > 20000:
        _INDEXES.popitem(last=False)
    return result

def append(path,row,limit=32*1024*1024):
    path=Path(path); existing=records(path,limit)
    if row['event_id'] in existing:
        if existing[row['event_id']]!=row: raise EvidenceIntegrityError('Replay content differs')
        # A prior complete write may have failed fsync. Re-sync before commit.
        fd=os.open(path,os.O_RDONLY | os.O_NOFOLLOW)
        try: os.fsync(fd)
        finally: os.close(fd)
        return False
    data=(json.dumps(row,ensure_ascii=True,separators=(',',':'))+'\n').encode()
    if len(data)>limit: raise EvidenceIntegrityError('Evidence record exceeds bound')
    new=not path.exists()
    offset = 0 if new else path.stat().st_size
    if offset + len(data) > MAX_INCIDENT_BYTES:
        raise EvidenceIntegrityError('Evidence append exceeds aggregate bound')
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_APPEND|os.O_NOFOLLOW,0o640)
    try:
        view=memoryview(data)
        while view:
            count=os.write(fd,view)
            if count<=0: raise OSError('Evidence short write')
            view=view[count:]
        os.fsync(fd)
    finally: os.close(fd)
    if new: sync_directory(path.parent)
    if isinstance(existing, RecordIndex):
        existing.entries[row['event_id']] = (offset, len(data), hashlib.sha256(data).hexdigest())
        existing.signature = identity(path)
    else:
        index = RecordIndex(path, {row['event_id']: (offset,len(data),hashlib.sha256(data).hexdigest())}, identity(path))
        _INDEXES[(str(path.absolute()),limit)] = index
    while len(_INDEXES)>64 or sum(len(value) for value in _INDEXES.values())>20000:
        _INDEXES.popitem(last=False)
    return True

def commit(path,data):
    atomic_json(path,data)
    sync_directory(Path(path).parent)
