"""Explicit hash-bound clean-room identities. This module grants no live authority."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import stat

MAX_AGE_SECONDS = 3600
RECEIPTS = {'prerequisites', 'demo', 'capture', 'confirmation'}


def json_document(data):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('Duplicate qualification JSON key')
            result[key] = value
        return result
    return json.loads(data, object_pairs_hook=unique)


def canonical(path, directory=False):
    path = Path(path)
    if not path.is_absolute() or path != path.resolve(strict=True):
        raise ValueError('Context path must be absolute, canonical and non-symlink')
    info = path.lstat()
    if not (stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)):
        raise ValueError('Unexpected context path type')
    return path


def stable_bytes(path, limit):
    path = canonical(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        identity = lambda value: (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns)
        if before.st_size > limit:
            raise ValueError('Context receipt exceeds finite limit')
        data = os.pread(fd, before.st_size + 1, 0)
        if (len(data) != before.st_size or identity(before) != identity(os.fstat(fd)) or
                identity(before) != identity(path.lstat()) or path != path.resolve(strict=True)):
            raise ValueError('Context receipt changed during read')
        return data
    finally:
        os.close(fd)


def fresh(timestamp, max_age=MAX_AGE_SECONDS, now=None):
    value = dt.datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
    if value.tzinfo is None or value.utcoffset() != dt.timedelta(0):
        raise ValueError('Qualification timestamp must be UTC')
    age = ((now or dt.datetime.now(dt.timezone.utc)) - value).total_seconds()
    if age < -5 or age > max_age:
        raise ValueError('Qualification identity/receipt stale or future-dated')


class Context:
    def __init__(self, path, digest, source, runtime, *, now=None, boot_id=None, purpose='qualification'):
        if not re.fullmatch('[0-9a-f]{64}', digest or ''):
            raise ValueError('Explicit context SHA-256 required')
        data = stable_bytes(path, 1024**2)
        if hashlib.sha256(data).hexdigest() != digest:
            raise ValueError('Context hash differs')
        value = json_document(data)
        required = {'schema_version', 'mode', 'phase', 'issued_utc', 'source_root', 'runtime_root', 'evidence_root',
                    'source_commit', 'boot_id', 'deployment_id', 'receipts'}
        if (not isinstance(value, dict) or set(value) != required or
                type(value['schema_version']) is not int or value['schema_version'] != 1 or value['mode'] != 'cleanroom'):
            raise ValueError('Unknown or incomplete qualification context schema')
        if value['phase'] not in ('acquisition', 'qualification') or (
                purpose == 'qualification' and value['phase'] != 'qualification'):
            raise ValueError('Complete qualification context required; acquisition context cannot qualify')
        if not re.fullmatch('[0-9a-f]{40}', value['source_commit'] or ''):
            raise ValueError('Invalid context source commit')
        if not re.fullmatch('[A-Za-z0-9_-]{8,128}', value['deployment_id'] or ''):
            raise ValueError('Explicit deployment identity required')
        current_boot = boot_id or Path('/proc/sys/kernel/random/boot_id').read_text().strip()
        if value['boot_id'] != current_boot:
            raise ValueError('Context belongs to another host boot')
        if canonical(value['source_root'], True) != canonical(source, True):
            raise ValueError('Context source root differs')
        if canonical(value['runtime_root'], True) != canonical(runtime, True):
            raise ValueError('Context runtime root differs')
        fresh(value['issued_utc'], now=now)
        expected_receipts = RECEIPTS if value['phase'] == 'qualification' else set()
        if not isinstance(value['receipts'], dict) or set(value['receipts']) != expected_receipts:
            raise ValueError('Complete explicit receipt set required')
        self.value, self.path, self.sha256 = value, str(canonical(path)), digest
        self.runtime = canonical(runtime, True)
        self.source = canonical(source, True)
        if self.runtime.is_relative_to(self.source) or self.source.is_relative_to(self.runtime):
            raise ValueError('Runtime and source must be separate canonical roots')
        self.evidence_root = canonical(value['evidence_root'], True)
        if any(self.evidence_root.is_relative_to(root) or root.is_relative_to(self.evidence_root)
               for root in (self.source, self.runtime)):
            raise ValueError('Qualification evidence must remain outside source and runtime')
        canonical(path).relative_to(self.evidence_root)
        # Validate every locator and digest immediately, including non-JSON PCAP.
        for name in expected_receipts:
            entry = value['receipts'][name]
            if (not isinstance(entry, dict) or set(entry) != {'path', 'sha256'} or
                    not re.fullmatch('[0-9a-f]{64}', entry.get('sha256', ''))):
                raise ValueError('Invalid context receipt locator: ' + name)
            canonical(entry['path']).relative_to(self.evidence_root)
            self.receipt(name, parse=False)

    def receipt(self, name, *, parse=True):
        entry = self.value['receipts'][name]
        data = stable_bytes(entry['path'], 64 * 1024**2 if name == 'capture' else 32 * 1024**2)
        if hashlib.sha256(data).hexdigest() != entry['sha256']:
            raise ValueError('Context receipt hash differs: ' + name)
        return json_document(data) if parse else data

    def identity(self):
        return {key: self.value[key] for key in ('mode', 'source_root', 'runtime_root', 'evidence_root',
                'source_commit', 'boot_id', 'deployment_id')}

    def check_identity(self, row, *, max_age=MAX_AGE_SECONDS):
        if row.get('qualification_identity') != self.identity():
            raise ValueError('Receipt deployment/source/boot identity differs')
        fresh(row['timestamp'], max_age)

    def check_runtime(self, row):
        if (row.get('boot_id') != self.value['boot_id'] or
                row.get('runtime_root') != str(self.runtime) or
                row.get('candidate_source_commit') != self.value['source_commit'] or
                row.get('candidate_source_dirty') is not False):
            raise ValueError('Observed runtime source/boot/root differs from context')

    def validate_current(self):
        current_boot = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
        if current_boot != self.value['boot_id']:
            raise ValueError('Host reboot invalidated qualification context')
        fresh(self.value['issued_utc'])
        data = stable_bytes(self.path, 1024**2)
        if hashlib.sha256(data).hexdigest() != self.sha256:
            raise ValueError('Context changed after loading')
        if json_document(data) != self.value:
            raise ValueError('In-memory qualification context differs from pinned bytes')


def load(path, digest, source, runtime, *, purpose='qualification'):
    if path is None and digest is None:
        return None
    if path is None or digest is None:
        raise ValueError('--context and --context-sha256 must be supplied together')
    return Context(path, digest, source, runtime, purpose=purpose)
