"""Single-writer durable incident evidence. Corruption is never repaired here."""
import json
import os
import hashlib
from collections import OrderedDict
from collections.abc import Mapping
from pathlib import Path
from hp_common import atomic_json

class EvidenceIntegrityError(RuntimeError):
    pass

def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)

MAX_INCIDENT_BYTES = 64 * 1024 * 1024
_INDEXES = OrderedDict()


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
