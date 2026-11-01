"""Bounded Apple/iMazing backup metadata; no decryption or file recovery."""
import hashlib
import os
from pathlib import Path
import plistlib
import re
import sqlite3
import tempfile

from .io import parse_xml, read_regular
from .model import MAX_BYTES, MAX_RECORDS, Phase10Error, make_finding

_PLIST_DOCTYPE = re.compile(
    r'<!DOCTYPE\s+plist\s+PUBLIC\s+"-//Apple//DTD PLIST 1\.0//EN"\s+'
    r'"http://www\.apple\.com/DTDs/PropertyList-1\.0\.dtd"\s*>')
_FIELDS = {'fileID': 'TEXT', 'domain': 'TEXT', 'relativePath': 'TEXT',
           'flags': 'INTEGER', 'file': 'BLOB'}
_SIDECARS = ('Manifest.db-wal', 'Manifest.db-shm', 'Manifest.db-journal')


def _limits(data, context):
    limit = context.get('max_records', MAX_RECORDS)
    byte_limit = context.get('max_bytes', MAX_BYTES)
    if (type(limit) is not int or not 1 <= limit <= MAX_RECORDS or
            type(byte_limit) is not int or not 1 <= byte_limit <= MAX_BYTES or
            not isinstance(data, bytes) or len(data) > byte_limit):
        raise Phase10Error('Backup metadata quota exceeded')
    return limit


def _plist(data):
    if not data.startswith(b'bplist00'):
        try:
            text = data.decode('utf-8-sig')
        except UnicodeError as exc:
            raise Phase10Error('Unsupported plist encoding') from exc
        # Ordinary Apple plist DOCTYPE is declarative. Other declarations and
        # entity definitions are rejected by the existing bounded XML reader.
        text, count = _PLIST_DOCTYPE.subn('', text)
        if count > 1:
            raise Phase10Error('Unsupported plist declarations')
        parse_xml(text.encode('utf-8'))
        data = text.encode('utf-8')
    try:
        value = plistlib.loads(data)
    except (ValueError, TypeError, OverflowError, RecursionError) as exc:
        raise Phase10Error('Invalid backup plist') from exc
    stack, nodes = [(value, 0)], 0
    while stack:
        item, depth = stack.pop()
        nodes += 1
        if depth > 32 or nodes > 100000:
            raise Phase10Error('Backup plist structure limit exceeded')
        if isinstance(item, (dict, list)):
            children = item
            if isinstance(item, dict):
                if any(not isinstance(key, str) or len(key) > 4096 for key in item):
                    raise Phase10Error('Invalid plist keys')
                children = item.values()
            stack.extend((child, depth + 1) for child in children)
        elif isinstance(item, (str, bytes)) and len(item) > 65536:
            raise Phase10Error('Backup plist value exceeds limit')
    if not isinstance(value, dict):
        raise Phase10Error('Backup metadata dictionary required')
    return value


def _plist_summary(data):
    value = _plist(data)
    if 'IsEncrypted' in value and 'SnapshotState' not in value:
        if type(value['IsEncrypted']) is not bool:
            raise Phase10Error('Invalid backup encryption status')
        return 'manifest-properties', {'namespace': 'apple-backup-metadata/1',
                                       'status': 'encrypted' if value['IsEncrypted'] else 'unencrypted'}
    if 'SnapshotState' in value and 'IsEncrypted' not in value:
        if not isinstance(value['SnapshotState'], str):
            raise Phase10Error('Invalid backup snapshot status')
        return 'backup-status', {'namespace': 'apple-backup-metadata/1',
                                 'status': 'finished' if value['SnapshotState'] == 'finished' else 'incomplete'}
    raise Phase10Error('Unsupported backup metadata plist')


def _sqlite_summary(data, limit):
    if not data.startswith(b'SQLite format 3\x00'):
        raise Phase10Error('Unencrypted SQLite manifest required')
    with tempfile.TemporaryDirectory(prefix='hp-backup-metadata-') as scratch:
        path = Path(scratch) / 'Manifest.db'
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(data)
        try:
            db = sqlite3.connect(path.as_uri() + '?mode=ro&immutable=1', uri=True)
            try:
                db.enable_load_extension(False)
                db.execute('PRAGMA query_only=ON')
                db.execute('PRAGMA trusted_schema=OFF')
                ticks = 0

                def progress():
                    nonlocal ticks
                    ticks += 1
                    return ticks > 1000

                db.set_progress_handler(progress, 1000)
                kind = db.execute("SELECT type,sql FROM sqlite_schema WHERE name='Files'").fetchone()
                if not kind or kind[0] != 'table' or not isinstance(kind[1], str) or re.match(r'\s*CREATE\s+VIRTUAL\b', kind[1], re.I):
                    raise Phase10Error('Unsupported Files table')
                fields = db.execute('PRAGMA table_info(Files)').fetchall()
                if (len(fields) != len(_FIELDS) or
                        {row[1]: row[2].upper() for row in fields} != _FIELDS):
                    raise Phase10Error('Unsupported Files schema')

                def authorize(action, table, column, database, trigger):
                    if action == sqlite3.SQLITE_SELECT:
                        return sqlite3.SQLITE_OK
                    if action == sqlite3.SQLITE_READ and table == 'Files' and column in _FIELDS:
                        return sqlite3.SQLITE_OK
                    if action == sqlite3.SQLITE_FUNCTION and column in ('typeof', 'length'):
                        return sqlite3.SQLITE_OK
                    return sqlite3.SQLITE_DENY

                db.set_authorizer(authorize)
                counts = {'records': 0, 'app_domains': 0, 'home_domains': 0,
                          'media_domains': 0, 'other_domains': 0,
                          'flag_1': 0, 'flag_2': 0, 'other_flags': 0}
                rows = db.execute('SELECT fileID,domain,relativePath,flags,typeof(file),length(file) FROM Files LIMIT ?', (limit + 1,))
                for file_id, domain, relative, flags, blob_type, blob_length in rows:
                    if counts['records'] >= limit:
                        raise Phase10Error('Backup record quota exceeded')
                    if (not isinstance(file_id, str) or not re.fullmatch('[0-9a-fA-F]{40}', file_id) or
                            not isinstance(domain, str) or not 1 <= len(domain) <= 512 or
                            not isinstance(relative, str) or len(relative) > 4096 or
                            type(flags) is not int or not 0 <= flags <= 2**31 - 1 or
                            blob_type not in ('blob', 'null') or
                            blob_length is not None and not 0 <= blob_length <= MAX_BYTES):
                        raise Phase10Error('Invalid backup file metadata')
                    counts['records'] += 1
                    category = ('app_domains' if domain.startswith(('AppDomain-', 'AppDomainGroup-', 'AppDomainPlugin-'))
                                else 'home_domains' if domain == 'HomeDomain'
                                else 'media_domains' if domain == 'MediaDomain' else 'other_domains')
                    counts[category] += 1
                    counts['flag_' + str(flags) if flags in (1, 2) else 'other_flags'] += 1
                return {'namespace': 'apple-backup-manifest/1', 'counts': counts,
                        'note': 'Metadata inventory only; file payloads, ownership and compromise were not analyzed.'}
            finally:
                db.close()
        except sqlite3.Error as exc:
            raise Phase10Error('Invalid or unsupported backup database') from exc


def parse_imazing(data, format_name, context):
    """Read only metadata structures; all personal text remains in restricted originals."""
    limit = _limits(data, context)
    if format_name == 'plist':
        identifier, details = _plist_summary(data)
    elif format_name == 'sqlite':
        identifier, details = 'files-summary', _sqlite_summary(data, limit)
    else:
        raise Phase10Error('Unsupported backup metadata format')
    return [make_finding('imazing', identifier, 'file', context['raw_source_hash'],
                         context, details=details)]


def _closed_backup(path):
    path = Path(path).absolute()
    if '..' in path.parts or path.resolve(strict=True) != path or not path.is_dir():
        raise Phase10Error('Canonical backup directory required')
    if any(os.path.lexists(path / name) for name in _SIDECARS):
        raise Phase10Error('Closed backup snapshot required')
    return path


def import_backup(root, policy, backup_path):
    """Import a finished, unencrypted metadata snapshot without touching payload files."""
    from .service import parse_report, utc
    from .store import Store

    policy.require('imazing')
    backup = _closed_backup(backup_path)
    imported_at = utc()
    inputs, findings, digests = {}, {}, {}
    formats = {'Manifest.plist': 'plist', 'Status.plist': 'plist', 'Manifest.db': 'sqlite'}
    for name, format_name in formats.items():
        raw = read_regular(backup / name, min(policy.max_bytes, 1024 * 1024) if format_name == 'plist' else policy.max_bytes)
        digest = hashlib.sha256(raw).hexdigest()
        rows = parse_report('imazing', format_name, raw, policy.context(digest, imported_at), policy.timeout_seconds)
        if name == 'Manifest.plist' and rows[0]['details']['status'] != 'unencrypted':
            raise Phase10Error('Encrypted backups are unsupported')
        if name == 'Status.plist' and rows[0]['details']['status'] != 'finished':
            raise Phase10Error('Finished backup metadata required')
        inputs[name], findings[name], digests[name] = raw, rows, digest
    _closed_backup(backup)
    for name, raw in inputs.items():
        if read_regular(backup / name, policy.max_bytes) != raw:
            raise Phase10Error('Backup metadata changed during validation')
    _closed_backup(backup)
    store = Store(root, policy)
    manifests = [store.save('imazing', formats[name], raw, findings[name], imported_at)
                 for name, raw in inputs.items()]
    return {'coverage': 'metadata-only', 'snapshot_state': 'finished',
            'manifest_encrypted': False, 'source_sha256': digests,
            'counts': findings['Manifest.db'][0]['details']['counts'],
            'manifests': manifests,
            'limitations': ['No decryption, backup-file recovery or payload analysis.',
                            'Snapshot state is supplied metadata; acquisition authenticity and payload completeness are unverified.']}
