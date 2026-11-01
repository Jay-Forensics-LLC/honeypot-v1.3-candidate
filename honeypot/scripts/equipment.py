"""Private operator equipment inventory and explicitly sourced status observations."""
import datetime as dt
import json
import os
from pathlib import Path
import re
import secrets
import stat

from hp_common import _lock_log_directory
from phase10.io import parse_json
from phase10.model import Phase10Error

MAX_ENTRIES = 200
MAX_BYTES = 1024 * 1024
CATEGORIES = ('hardware', 'tool', 'sensor')
TRACKING = ('manual', 'heartbeat', 'cowrie', 'opencanary', 'suricata', 'incidentd', 'pcap', 'sentinel')
STATUSES = ('operational', 'degraded', 'offline', 'unknown')
_FIELDS = {'id', 'name', 'description', 'category', 'active', 'tracking', 'equipment_class', 'value',
           'reported_status', 'reported_at', 'created_at', 'updated_at'}
_EDITABLE = {'name', 'description', 'category', 'active', 'tracking', 'equipment_class', 'value'}
_OPTIONAL = {'equipment_class', 'value'}
_DIRECTORY = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC


def _require(condition, message='Invalid equipment inventory'):
    if not condition:
        raise Phase10Error(message)


def _utc():
    return dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00', 'Z')


def _instant(value):
    if not isinstance(value, str) or not re.fullmatch(
            r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z', value):
        return None
    try:
        return dt.datetime.fromisoformat(value[:-1] + '+00:00')
    except ValueError:
        return None


def _identifier(value):
    _require(isinstance(value, str) and re.fullmatch(r'[a-f0-9]{32}', value),
             'Choose an existing equipment entry')


def _text(value, maximum, *, empty=False, multiline=False):
    if multiline and isinstance(value, str):
        value = value.replace('\r\n', '\n')
    _require(isinstance(value, str) and (empty or value.strip()) and len(value) <= maximum
             and all((multiline and char == '\n') or ord(char) >= 32 and ord(char) != 127 for char in value),
             'Use a bounded label or description without control characters')
    return value.strip()


def _editable(row):
    _require(isinstance(row, dict) and set(row) == _EDITABLE, 'Unsupported equipment fields')
    result = {**row, 'name': _text(row['name'], 80),
              'description': _text(row['description'], 500, empty=True, multiline=True),
              'equipment_class': _text(row['equipment_class'], 80, empty=True),
              'value': _text(row['value'], 80, empty=True)}
    _require(result['category'] in CATEGORIES and result['tracking'] in TRACKING
             and type(result['active']) is bool, 'Choose an equipment category and status source')
    return result


def _entry(row):
    _require(isinstance(row, dict) and _FIELDS - _OPTIONAL <= set(row) <= _FIELDS)
    row = {**dict.fromkeys(_OPTIONAL, ''), **row}
    _identifier(row['id'])
    _editable({key: row[key] for key in _EDITABLE})
    _require(row['reported_status'] in STATUSES and
             (row['reported_at'] is None or _instant(row['reported_at']) is not None) and
             all(_instant(row[key]) is not None for key in ('created_at', 'updated_at')))
    return row


class EquipmentStore:
    """Atomic inventory edits; directory locking serializes independent processes."""

    def __init__(self, path):
        self.path = Path(path).absolute()
        _require('..' not in self.path.parts and self.path.name not in ('', '.', '..'),
                 'Unsupported equipment inventory path')

    def _parent(self, create=False):
        descriptor = os.open(self.path.anchor, _DIRECTORY)
        try:
            for part in self.path.parent.parts[1:]:
                try:
                    child = os.open(part, _DIRECTORY, dir_fd=descriptor)
                except FileNotFoundError:
                    if not create:
                        raise
                    try:
                        os.mkdir(part, mode=0o700, dir_fd=descriptor)
                    except FileExistsError:
                        pass
                    child = os.open(part, _DIRECTORY, dir_fd=descriptor)
                os.close(descriptor)
                descriptor = child
            info = os.fstat(descriptor)
            _require(info.st_uid == os.geteuid() and not info.st_mode & 0o077,
                     'Equipment inventory directory must be private and operator-owned')
            _lock_log_directory(descriptor)
            return descriptor
        except BaseException:
            os.close(descriptor)
            raise

    def _read(self, parent):
        try:
            descriptor = os.open(self.path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK |
                                 os.O_CLOEXEC, dir_fd=parent)
        except FileNotFoundError:
            return []
        try:
            before = os.fstat(descriptor)
            _require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and
                     before.st_uid == os.geteuid() and not before.st_mode & 0o077 and
                     0 < before.st_size <= MAX_BYTES, 'Unsupported equipment inventory file')
            chunks, remaining = [], before.st_size
            while remaining:
                chunk = os.read(descriptor, min(65536, remaining))
                _require(chunk, 'Equipment inventory changed during read')
                chunks.append(chunk)
                remaining -= len(chunk)
            signature = lambda item: (item.st_dev, item.st_ino, item.st_mode, item.st_nlink,
                                      item.st_size, item.st_mtime_ns, item.st_ctime_ns)
            _require(signature(before) == signature(os.fstat(descriptor)) == signature(
                os.stat(self.path.name, dir_fd=parent, follow_symlinks=False)),
                'Equipment inventory changed during read')
            data = parse_json(b''.join(chunks))
            _require(isinstance(data, dict) and set(data) == {'schema_version', 'equipment'}
                     and type(data['schema_version']) is int and data['schema_version'] == 1
                     and isinstance(data['equipment'], list) and len(data['equipment']) <= MAX_ENTRIES)
            rows = [_entry(row) for row in data['equipment']]
            _require(len({row['id'] for row in rows}) == len(rows))
            return rows
        finally:
            os.close(descriptor)

    def _write(self, parent, rows):
        raw = (json.dumps({'schema_version': 1, 'equipment': rows}, ensure_ascii=True,
                          separators=(',', ':'), allow_nan=False) + '\n').encode()
        _require(len(raw) <= MAX_BYTES, 'Equipment inventory is full')
        name = '.equipment-' + secrets.token_hex(16)
        created = False
        try:
            descriptor = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW |
                                 os.O_CLOEXEC, 0o600, dir_fd=parent)
            created = True
            with os.fdopen(descriptor, 'wb') as stream:
                stream.write(raw)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(name, self.path.name, src_dir_fd=parent, dst_dir_fd=parent)
            os.fsync(parent)
        finally:
            if created:
                try:
                    os.unlink(name, dir_fd=parent)
                except FileNotFoundError:
                    pass

    def list(self):
        try:
            parent = self._parent()
        except FileNotFoundError:
            return []
        try:
            return self._read(parent)
        finally:
            os.close(parent)

    def _mutate(self, action):
        parent = self._parent(create=True)
        try:
            rows = self._read(parent)
            result = action(rows)
            self._write(parent, rows)
            return dict(result)
        finally:
            os.close(parent)

    def save(self, row):
        _require(isinstance(row, dict) and _EDITABLE - _OPTIONAL <= set(row)
                 and set(row) <= _EDITABLE | {'id'},
                 'Unsupported equipment fields')
        identity = row.get('id')
        if 'id' in row:
            _identifier(identity)
        values = _editable({key: row.get(key, '') for key in _EDITABLE})

        def edit(rows):
            previous = next((item for item in rows if item['id'] == identity), None)
            _require(identity is None or previous is not None, 'Choose an existing equipment entry')
            now = _utc()
            if previous is None:
                _require(len(rows) < MAX_ENTRIES, 'Equipment inventory is full')
                previous = {'id': secrets.token_hex(16), 'created_at': now,
                            'reported_status': 'unknown', 'reported_at': None}
                rows.append(previous)
            elif previous['tracking'] != values['tracking']:
                previous.update(reported_status='unknown', reported_at=None)
            previous.update(values, updated_at=now)
            return previous

        return self._mutate(edit)

    def remove(self, identifier):
        _identifier(identifier)

        def delete(rows):
            previous = next((item for item in rows if item['id'] == identifier), None)
            _require(previous is not None, 'Choose an existing equipment entry')
            rows.remove(previous)
            return previous

        return self._mutate(delete)

    def report(self, identifier, status):
        _identifier(identifier)
        _require(isinstance(status, str) and status in STATUSES, 'Choose a supported equipment status')

        def record(rows):
            previous = next((item for item in rows if item['id'] == identifier), None)
            _require(previous is not None, 'Choose an existing equipment entry')
            _require(previous['tracking'] in ('manual', 'heartbeat'),
                     'This entry uses automatic HoneyTrace observations')
            previous.update(reported_status=status, reported_at=_utc(), updated_at=_utc())
            return previous

        return self._mutate(record)


def operational_status(entry, health_status, health, jobs_snapshot, now=None):
    """Classify observations without probing hardware or claiming live sensor health."""
    now = now or dt.datetime.now(dt.timezone.utc)
    health = health if isinstance(health, dict) else {}
    jobs_snapshot = jobs_snapshot if isinstance(jobs_snapshot, dict) else {}
    tracking = entry['tracking']

    def result(status, source, observed_at=None, stale=False, note=''):
        return {'status': status, 'source': source, 'observed_at': observed_at,
                'stale': stale, 'note': note}

    if not entry['active']:
        return result('inactive', 'manual', note='Inactive in this inventory; the equipment was not stopped.')
    if tracking in ('manual', 'heartbeat'):
        stamp = entry['reported_at']
        when = _instant(stamp)
        if tracking == 'manual':
            return result(entry['reported_status'] if when else 'unknown', 'manual', stamp,
                          note='Operator reported; this is not an automatic equipment check.')
        age = (now - when).total_seconds() if when else None
        stale = age is None or age < -5 or age > 120
        return result('unknown' if stale else entry['reported_status'], 'heartbeat', stamp, stale,
                      'No recent local heartbeat.' if stale else 'Reported by a recent local heartbeat.')
    if tracking == 'sentinel':
        jobs = jobs_snapshot.get('jobs') if isinstance(jobs_snapshot.get('jobs'), list) else []
        running = any(row.get('status') == 'running' for row in jobs
                      if isinstance(row, dict))
        status = 'operational' if running else 'ready' if jobs_snapshot.get('available') else 'offline'
        return result(status, 'local_analyzer', now.isoformat().replace('+00:00', 'Z'), note=
                      'Offline analysis is running.' if running else
                      'Analyzer is available; no analysis is running.' if status == 'ready' else
                      'The local analyzer is unavailable.')
    stamp = health.get('timestamp')
    when = _instant(stamp)
    age = (now - when).total_seconds() if when else None
    if (health_status != 'available' or health.get('stale') is not False or age is None
            or age < -5 or age > 180):
        return result('unknown', 'saved_telemetry', stamp, True,
                      'No recent saved HoneyTrace observation is available.')
    if tracking == 'pcap':
        value = health.get('pcap_running')
        status = 'operational' if value is True else 'offline' if value is False else 'unknown'
        return result(status, 'saved_telemetry', stamp, note='Capture state at the last saved observation.')
    services = health.get('services') if isinstance(health.get('services'), list) else []
    service = next((row for row in services if isinstance(row, dict)
                    and row.get('name') == tracking), {})
    state, checked = service.get('state'), service.get('health')
    if state == 'running' and checked in ('healthy', 'none'):
        status = 'operational'
    elif state in ('exited', 'dead', 'paused', 'created'):
        status = 'offline'
    elif state == 'restarting' or state == 'running' and checked in ('unhealthy', 'starting'):
        status = 'degraded'
    else:
        status = 'unknown'
    return result(status, 'saved_telemetry', stamp, note=
                  'Running at the last saved observation; no health check was configured.' if checked == 'none' else
                  'Service state at the last saved observation; this is not a fresh runtime check.')
