"""Verify a pinned normalized source after the existing rename-based rotation.

Only the original device/inode in the live filename or its ten configured
rotation slots is accepted. This module never writes or reconstructs evidence.
"""
import hashlib
import json
import os
from pathlib import Path
import stat

NAME = 'logs/normalized/events.jsonl'
MAX_BYTES = 384 * 1024**2


def verify(root, provenance, event_id):
    root = Path(root)
    original = root / NAME
    if provenance['path'] != str(original):
        raise ValueError('Unexpected pinned normalized source path')
    offset, length = provenance['offset'], provenance['length']
    qualified_size = provenance['qualified_snapshot_size']
    retained_size = provenance['current_snapshot_size']
    if (any(type(value) is not int for value in (offset, length, qualified_size, retained_size)) or
            offset < 0 or not 0 < length <= 1024**2 or
            not offset + length <= qualified_size <= retained_size <= MAX_BYTES):
        raise ValueError('Invalid pinned source bounds')
    expected_identity = provenance['identity']
    matches = []
    for path in [original] + [Path(str(original) + '.' + str(i)) for i in range(1, 11)]:
        try: info = path.lstat()
        except FileNotFoundError: continue
        if not stat.S_ISREG(info.st_mode) or path.resolve() != path.absolute():
            raise ValueError('Source candidate must be canonical, regular and non-symlink')
        if f'{info.st_dev}:{info.st_ino}' == expected_identity:
            matches.append(path)
    if len(matches) != 1:
        raise RuntimeError('Pinned normalized source identity absent or ambiguous in retained rotation slots')
    path = matches[0]
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or f'{before.st_dev}:{before.st_ino}' != expected_identity:
            raise RuntimeError('Pinned source identity changed during open')
        if not retained_size <= before.st_size <= MAX_BYTES:
            raise RuntimeError('Pinned source truncated or exceeds read budget')
        def read_at(position, count):
            data = os.pread(fd, count, position)
            if len(data) != count: raise RuntimeError('Pinned source truncated during read')
            return data
        if offset and read_at(offset - 1, 1) != b'\n':
            raise RuntimeError('RECORD_BOUNDARY_CHANGED: preceding LF missing')
        line = read_at(offset, length)
        if not line.endswith(b'\n') or b'\n' in line[:-1]:
            raise RuntimeError('RECORD_BOUNDARY_CHANGED: exact record length differs')
        record_hash = hashlib.sha256(line).hexdigest()
        if record_hash != provenance['record_sha256']:
            raise RuntimeError('QUALIFIED_RECORD_CHANGED')
        row = json.loads(line)
        if row.get('event_id') != event_id or provenance['event_id'] != event_id:
            raise RuntimeError('Event identity mismatch')
        for key, expected in [('timestamp', provenance['timestamp']),
                              ('event_type', provenance['event_type']), ('source', 'suricata')]:
            if row.get(key) != expected: raise RuntimeError('Qualified event semantics mismatch: ' + key)
        def prefix_hash(size):
            digest = hashlib.sha256()
            position = 0
            while position < size:
                chunk = read_at(position, min(1024**2, size - position))
                digest.update(chunk); position += len(chunk)
            return digest.hexdigest()
        if prefix_hash(qualified_size) != provenance['previously_qualified_source_file_sha256']:
            raise RuntimeError('Qualified whole-file prefix changed')
        if prefix_hash(retained_size) != provenance['source_file_sha256']:
            raise RuntimeError('Recovery acquisition prefix changed')
        current_hash = prefix_hash(before.st_size)
        # Re-read the entire pinned recovery snapshot; a matching row alone is insufficient.
        if prefix_hash(retained_size) != provenance['source_file_sha256']:
            raise RuntimeError('Pinned source rewritten during verification')
        after = os.fstat(fd); current = path.lstat()
        if (after.st_size < before.st_size or not stat.S_ISREG(current.st_mode) or
                path.resolve() != path.absolute() or
                (current.st_dev, current.st_ino) != (before.st_dev, before.st_ino)):
            raise RuntimeError('Source path replaced or truncated during verification')
    finally:
        os.close(fd)
    return row, {'recorded_path': str(original), 'path': str(path), 'identity': expected_identity,
        'offset': offset, 'length': length, 'record_sha256': record_hash, 'event_id': event_id,
        'qualified_snapshot_size': qualified_size, 'qualified_prefix_verified': True,
        'previously_qualified_source_file_sha256': provenance['previously_qualified_source_file_sha256'],
        'recovery_snapshot_size': retained_size, 'recovery_prefix_verified': True,
        'recovery_snapshot_sha256': provenance['source_file_sha256'],
        'current_snapshot_size': before.st_size, 'source_file_sha256': current_hash,
        'rotation_verified': path != original,
        'source_file_state': 'QUALIFIED_SAME_INODE_ROTATION' if path != original else 'QUALIFIED_PREFIX_INTACT',
        'note': 'Exact original identity, offset, record, qualified snapshot and recovery snapshot verified; '
                'current hash covers the initial read size, excluding concurrent later appends.'}
