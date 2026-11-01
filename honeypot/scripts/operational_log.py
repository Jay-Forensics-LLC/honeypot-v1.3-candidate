"""Bounded, private operational diagnostics. Evidence stays in its own stores.

Callers provide fixed event codes and structured metadata, never free-form
messages, exceptions, request bodies, filenames or captured identifiers.
"""
from contextlib import contextmanager
from contextvars import ContextVar
import datetime as dt
import json
import math
import os
from pathlib import Path
import re
import stat
import threading
import uuid

from hp_common import ROOT, append_json

LEVELS = {'DEBUG': 10, 'INFO': 20, 'WARNING': 30, 'ERROR': 40, 'CRITICAL': 50}
COMPONENTS = frozenset(('suite', 'cli', 'dashboard', 'imports', 'store', 'jobs',
                        'incidentd', 'health', 'guard', 'decoys'))
PREFIXES = COMPONENTS | {'http', 'policy', 'import', 'worker', 'job', 'case', 'decoy', 'equipment', 'review', 'diagnostics'}
PLUGINS = frozenset(('spiderfoot', 'recon-ng', 'bbot', 'nmap', 'nuclei', 'cloudfox',
                     'bloodhound', 'awareness', 'mock-ti', 'forensics', 'sentinel', 'imazing'))
ROUTES = frozenset(('/', '/app.js', '/styles.css', '/api/state', '/api/export',
                    '/api/guide', '/api/cases', '/api/case', '/api/case-export',
                    '/api/jobs', '/api/job-cancel', '/api/policy', '/api/import',
                    '/api/sentinel', '/api/imazing', '/api/forensics', '/api/enrich',
                    '/api/diagnostics', '/api/diagnostics-export'))
ROUTES = ROUTES | {'/api/decoys', '/api/decoy-profile', '/api/equipment', '/api/equipment-save',
                   '/api/equipment-report', '/api/equipment-remove', '/api/review-imports',
                   '/api/security-review', '/api/security-triage', '/api/security-report'}
ROUTES = ROUTES | {'/api/sessions', '/api/session-open-case', '/api/demo-session',
                   '/api/case-review', '/api/case-custody', '/api/case-custody-export',
                   '/api/case-artifact', '/api/capture-upload'}
COMMANDS = frozenset(('dashboard', 'integrations', 'status', 'health', 'stop',
                      'readiness', 'boot-start', 'doctor', 'start', 'guard', 'pcap',
                      'wan', 'intel', 'bait', 'incident', 'logs', 'demo', 'unknown'))
_CODE = re.compile(r'[a-z][a-z0-9_.-]{0,63}')
_CORRELATION = ContextVar('suite_correlation', default=None)
_CURRENT_LOG = ContextVar('suite_log', default=None)
_BACKENDS, _BACKEND_LOCK = {}, threading.Lock()
MAX_TAIL_BYTES = 2 * 1024**2
MAX_LINE_BYTES = 4096


@contextmanager
def correlation(identifier=None):
    identifier = identifier if isinstance(identifier, str) and re.fullmatch(r'[a-f0-9]{32}', identifier) else uuid.uuid4().hex
    token = _CORRELATION.set(identifier)
    try:
        yield identifier
    finally:
        _CORRELATION.reset(token)


def _fields(fields):
    """A closed schema drops secrets even when callers add unexpected metadata."""
    clean = {}
    for key, value in fields.items():
        if key in ('correlation_id', 'request_id', 'job_id'):
            if isinstance(value, str) and re.fullmatch(r'[a-f0-9]{32}', value):
                clean[key] = value
        elif key in ('case_id', 'import_id'):
            if isinstance(value, str) and re.fullmatch(r'[a-f0-9]{64}', value):
                clean[key] = value
        elif key in ('duration_ms',):
            if type(value) in (int, float) and 0 <= value <= 10**12 and math.isfinite(value):
                clean[key] = round(value, 3)
        elif key in ('records', 'bytes', 'count', 'problems', 'warnings', 'returncode'):
            if type(value) is int and -255 <= value <= 10**15:
                clean[key] = value
        elif key in ('status_code',):
            if type(value) is int and 100 <= value <= 599:
                clean[key] = value
        elif key in ('success', 'deduplicated', 'enabled', 'stopped'):
            if type(value) is bool:
                clean[key] = value
        elif key == 'method' and value in ('GET', 'POST', 'HEAD', 'OPTIONS', 'OTHER'):
            clean[key] = value
        elif key == 'route' and isinstance(value, str) and value in ROUTES:
            clean[key] = value
        elif key == 'plugin' and isinstance(value, str) and value in PLUGINS:
            clean[key] = value
        elif key == 'command' and isinstance(value, str) and value in COMMANDS:
            clean[key] = value
        elif key in ('operation', 'status', 'stage', 'error_code', 'format'):
            if isinstance(value, str) and _CODE.fullmatch(value):
                clean[key] = value
        elif key == 'severity' and value in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN'):
            clean[key] = value
        elif key == 'error_type' and isinstance(value, str) and re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,63}', value):
            clean[key] = value
    return clean


def _record(row):
    if not isinstance(row, dict):
        return None
    component, event, level = row.get('component'), row.get('event'), row.get('level')
    if (component not in COMPONENTS or level not in LEVELS or not isinstance(event, str)
            or not _CODE.fullmatch(event) or event.partition('.')[0] not in PREFIXES):
        return None
    stamp = row.get('timestamp')
    if not isinstance(stamp, str) or not re.fullmatch(r'\d{4}-\d\d-\d\dT[\d:.]+Z', stamp):
        return None
    result = {'timestamp': stamp, 'level': level, 'component': component, 'event': event}
    for key in ('pid', 'thread'):
        if type(row.get(key)) is int and 0 <= row[key] < 2**63:
            result[key] = row[key]
    result.update(_fields(row))
    return result


def _tail(path, budget):
    """Read a bounded end snapshot without following any file or ancestor link."""
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
    parent = os.open(path.anchor, flags)
    descriptor = None
    try:
        for part in path.parent.parts[1:]:
            child = os.open(part, flags, dir_fd=parent)
            os.close(parent)
            parent = child
        descriptor = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=parent)
        info = os.fstat(descriptor)
        if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.geteuid()
                or info.st_mode & 0o077):
            raise ValueError('Unsafe diagnostics file')
        size = min(info.st_size, budget)
        os.lseek(descriptor, info.st_size - size, os.SEEK_SET)
        data = bytearray()
        while len(data) < size:
            chunk = os.read(descriptor, size - len(data))
            if not chunk:
                break
            data.extend(chunk)
        lines = bytes(data).splitlines()
        if size < info.st_size and lines:
            lines.pop(0)
        return lines, size, size < info.st_size
    finally:
        if descriptor is not None:
            os.close(descriptor)
        os.close(parent)


class SuiteLog:
    def __init__(self, root, component='suite', level=None):
        if not isinstance(component, str) or component not in COMPONENTS:
            raise ValueError('Unknown logging component')
        self.root = Path(root).absolute()
        if '..' in self.root.parts:
            raise ValueError('Unsupported logging root')
        self.path = self.root / 'logs/system' / f'suite-{os.geteuid()}.jsonl'
        self.component = component
        selected = level if level is not None else os.environ.get('HP_LOG_LEVEL', 'INFO')
        self.level = selected.upper() if isinstance(selected, str) and selected.upper() in LEVELS else 'INFO'
        with _BACKEND_LOCK:
            self._state = _BACKENDS.setdefault(str(self.path), {
                'write_failures': 0, 'last_error': None, 'last_written': None,
                'lock': threading.RLock()})

    def child(self, component):
        return SuiteLog(self.root, component, self.level)

    @contextmanager
    def bind(self):
        """Route nested CLI/import/store events to this operator workspace."""
        token = _CURRENT_LOG.set(self)
        try:
            yield self
        finally:
            _CURRENT_LOG.reset(token)

    def event(self, event_code, level='INFO', **fields):
        if (not isinstance(level, str) or level not in LEVELS or not isinstance(event_code, str) or not _CODE.fullmatch(event_code)
                or event_code.partition('.')[0] not in PREFIXES or LEVELS[level] < LEVELS[self.level]):
            return False
        stamp = dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00', 'Z')
        row = {'timestamp': stamp, 'level': level, 'component': self.component, 'event': event_code,
               'pid': os.getpid(), 'thread': threading.get_ident(), **_fields(fields)}
        if _CORRELATION.get() is not None:
            row['correlation_id'] = _CORRELATION.get()
        try:
            append_json(self.path, row, rotate=True, private=True)
        except (OSError, ValueError, TypeError):
            with self._state['lock']:
                self._state['write_failures'] += 1
                self._state['last_error'] = 'log_write_failed'
            return False
        with self._state['lock']:
            self._state['last_written'] = stamp
            self._state['last_error'] = None
        return True

    def status(self):
        with self._state['lock']:
            return {'level': self.level, 'write_failures': self._state['write_failures'],
                    'last_error': self._state['last_error'], 'last_written': self._state['last_written'],
                    'rotation_bytes': 20 * 1024**2, 'retained_archives': 10}

    def read_recent(self, limit=100, level='', component=''):
        if (type(limit) is not int or not 1 <= limit <= 200 or level not in ('', *LEVELS)
                or component not in ('', *COMPONENTS)):
            raise ValueError('Invalid diagnostics filter')
        entries, remaining, truncated, found = [], MAX_TAIL_BYTES, False, False
        try:
            for suffix in ('', *(f'.{number}' for number in range(1, 11))):
                try:
                    lines, size, partial = _tail(Path(str(self.path) + suffix), remaining)
                except FileNotFoundError:
                    continue
                found = True
                remaining -= size
                truncated = truncated or partial
                for line in reversed(lines):
                    if len(line) > MAX_LINE_BYTES:
                        continue
                    try:
                        row = _record(json.loads(line))
                    except (ValueError, TypeError, RecursionError):
                        continue
                    if row is None or level and LEVELS[row['level']] < LEVELS[level] or component and row['component'] != component:
                        continue
                    if len(entries) == limit:
                        truncated = True
                        break
                    entries.append(row)
                if len(entries) == limit or remaining <= 0:
                    truncated = True
                    break
            return {'status': 'available' if found else 'not_collected', 'entries': entries,
                    'truncated': truncated, **self.status()}
        except (OSError, ValueError):
            return {'status': 'unavailable', 'entries': [], 'truncated': False, **self.status()}


def get_log(component):
    current = _CURRENT_LOG.get()
    return current.child(component) if current is not None else SuiteLog(ROOT, component)
