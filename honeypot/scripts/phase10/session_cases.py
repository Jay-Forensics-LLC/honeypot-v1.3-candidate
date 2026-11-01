"""Finite saved-sensor selections and explicitly qualified offline packet overlap.

Normalized logs are projections, not raw evidence. Selection tokens identify an
immutable acquisition in this process; captured strings never select paths or
commands. Preserved packet copies are eligible only with verified acquisition
receipts. Tuple/time overlap remains an association, not session/actor identity.
"""
from collections import OrderedDict
from contextlib import contextmanager
from dataclasses import dataclass
import datetime as dt
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import stat
import struct
import threading
import time

from hp_common import runtime_path
from .io import parse_json, read_regular
from .model import Phase10Error

MAX_CAPTURE_BYTES = 64 * 1024**2
MAX_LOG_FILE_BYTES = 1024**2
MAX_LOG_RECORDS = 10000
MAX_LINE_BYTES = 64 * 1024
MAX_SELECTION_RECORDS = 500
MAX_SELECTION_BYTES = 2 * 1024**2
MAX_SELECTIONS = 100
MAX_CACHE_BYTES = 16 * 1024**2
SELECTION_TTL_SECONDS = 300
MAX_PACKETS = 32768
MAX_PACKET_REFERENCES = 128
MAX_MATCH_SECONDS = 2
MAX_INCIDENT_ENTRIES = 2000
MAX_METADATA_BYTES = 8 * 1024**2
MAX_CANDIDATES = 6
MAX_PREPARE_SECONDS = 8
TIME_TOLERANCE_NS = 2 * 10**9
_DIRECTORY = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
_CODE = re.compile(r'[A-Za-z0-9_.:-]{1,128}')
_HASH = re.compile(r'[a-f0-9]{64}')
_TIME = re.compile(r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})')
_SOURCES = ('cowrie', 'opencanary')
_CLOCK = 'normalized_sensor_time_unverified'
_LIMITATIONS = (
    'Saved normalized projection; raw records remain authoritative.',
    'Sensor time is unverified; normalization may have substituted receipt time or assumed UTC.',
    'A bounded retained selection does not establish a complete session.',
    'Structured passwords are withheld; command text can still contain sensitive values.',
)


def _json(value):
    return (json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(',', ':'),
                       allow_nan=False) + '\n').encode()


def _sha(raw):
    return hashlib.sha256(raw).hexdigest()


def _utc():
    return dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00', 'Z')


def _instant(value):
    if not isinstance(value, str) or len(value) > 40:
        return None
    match = _TIME.fullmatch(value)
    if match is None:
        return None
    try:
        when = dt.datetime.fromisoformat(match[1] + match[3].replace('Z', '+00:00'))
        delta = when.astimezone(dt.timezone.utc) - dt.datetime(1970, 1, 1, tzinfo=dt.timezone.utc)
        return (delta.days * 86400 + delta.seconds) * 10**9 + int((match[2] or '').ljust(9, '0'))
    except (ValueError, OverflowError):
        return None


def _port(value):
    return value if type(value) is int and 1 <= value <= 65535 else None


def _text(value, maximum):
    return value if isinstance(value, str) and len(value) <= maximum else ''


def _address(value):
    try:
        if not isinstance(value, str) or '%' in value:
            return ''
        return str(ipaddress.ip_address(value))
    except ValueError:
        return ''


def _open(path):
    """Pin all ancestors and reject special files and hard-linked inputs."""
    path = Path(path).absolute()
    if '..' in path.parts:
        raise Phase10Error('Unsupported saved source path')
    parent = os.open(path.anchor, _DIRECTORY)
    try:
        for part in path.parent.parts[1:]:
            child = os.open(part, _DIRECTORY, dir_fd=parent)
            os.close(parent)
            parent = child
        descriptor = os.open(path.name, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW |
                             os.O_CLOEXEC, dir_fd=parent)
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            os.close(descriptor)
            raise Phase10Error('Saved source must be a regular file')
        return parent, descriptor, info
    except BaseException:
        os.close(parent)
        raise


def _window(path):
    parent, descriptor, before = _open(path)
    try:
        offset = max(0, before.st_size - MAX_LOG_FILE_BYTES)
        start = max(0, offset - 1)
        raw = os.pread(descriptor, before.st_size - start, start)
        if len(raw) != before.st_size - start or os.pread(descriptor, len(raw), start) != raw:
            raise Phase10Error('Saved source changed during acquisition')
        after, current = os.fstat(descriptor), os.stat(Path(path).name, dir_fd=parent,
                                                       follow_symlinks=False)
        if (after.st_size < before.st_size or not stat.S_ISREG(current.st_mode) or
                (current.st_dev, current.st_ino) != (before.st_dev, before.st_ino)):
            raise Phase10Error('Saved source rotated or truncated during acquisition')
        partial = bool(offset)
        if offset:
            if raw[:1] == b'\n':
                raw, start = raw[1:], offset
            else:
                boundary = raw.find(b'\n')
                raw, start = (raw[boundary + 1:], start + boundary + 1) if boundary >= 0 else (b'', before.st_size)
        if raw and not raw.endswith(b'\n'):
            raw = raw[:raw.rfind(b'\n') + 1]
            partial = True
        return raw, start, {'device': before.st_dev, 'inode': before.st_ino,
                           'initial_size': before.st_size, 'mtime_ns': before.st_mtime_ns,
                           'ctime_ns': before.st_ctime_ns, 'acquired_offset': start,
                           'acquired_bytes': len(raw), 'acquired_sha256': _sha(raw),
                           'partial': partial, 'acquired_at': _utc()}
    finally:
        os.close(descriptor)
        os.close(parent)


def _stable_bytes(path, maximum):
    parent, descriptor, before = _open(path)
    try:
        if not 0 < before.st_size <= maximum:
            raise Phase10Error('Preserved copy exceeds input limit')
        chunks, position = [], 0
        while position < before.st_size:
            chunk = os.pread(descriptor, min(65536, before.st_size - position), position)
            if not chunk:
                raise Phase10Error('Preserved copy changed during acquisition')
            chunks.append(chunk)
            position += len(chunk)
        identity = lambda info: (info.st_dev, info.st_ino, info.st_size,
                                 info.st_mtime_ns, info.st_ctime_ns, info.st_nlink)
        current = os.stat(Path(path).name, dir_fd=parent, follow_symlinks=False)
        if (not stat.S_ISREG(current.st_mode) or identity(before) != identity(os.fstat(descriptor))
                or identity(before) != identity(current)):
            raise Phase10Error('Preserved copy changed during acquisition')
        return b''.join(chunks)
    finally:
        os.close(descriptor)
        os.close(parent)


@dataclass(frozen=True)
class CaptureCandidate:
    relative_path: str
    sha256: str
    size: int
    receipt_bytes: bytes


@dataclass(frozen=True)
class SessionPlan:
    log_bytes: bytes
    transcript_bytes: bytes
    provenance_bytes: bytes
    summary_bytes: bytes
    capture_bytes: bytes | None = None
    capture_info_bytes: bytes = b'{"status":"unavailable"}'
    candidates: tuple = ()

    @property
    def summary(self):
        return json.loads(self.summary_bytes)

    @property
    def transcript(self):
        return json.loads(self.transcript_bytes)

    @property
    def provenance(self):
        return json.loads(self.provenance_bytes)

    @property
    def capture(self):
        return json.loads(self.capture_info_bytes)


class SessionCatalog:
    """Bounded saved observations; tokens never resolve an HTTP-supplied path."""

    def __init__(self, runtime_root):
        self.root = Path(runtime_root).absolute()
        self._cache = OrderedDict()
        self._lock = threading.Lock()

    def _expire(self):
        now = time.monotonic()
        for token, (created, _) in list(self._cache.items()):
            if now - created > SELECTION_TTL_SECONDS:
                del self._cache[token]

    def snapshot(self):
        events, conflicts, omissions, sources = {}, set(), [], []
        total = 0
        for source in _SOURCES:
            for slot in range(3):
                relative = f'logs/normalized/{source}.jsonl' + (f'.{slot}' if slot else '')
                try:
                    raw, offset, acquired = _window(self.root / relative)
                except FileNotFoundError:
                    continue
                except (OSError, Phase10Error):
                    omissions.append({'code': 'source_unavailable', 'source': source, 'slot': slot})
                    continue
                sources.append({'path': relative, **acquired})
                line_number = 1 if offset == 0 else None
                for line in raw.splitlines(keepends=True):
                    position = offset
                    offset += len(line)
                    total += 1
                    if total > MAX_LOG_RECORDS:
                        omissions.append({'code': 'record_limit'})
                        break
                    try:
                        if len(line) > MAX_LINE_BYTES:
                            raise Phase10Error('Oversized saved record')
                        row = parse_json(line)
                        if (not isinstance(row, dict) or row.get('source') != source or
                                not isinstance(row.get('event_id'), str) or not _CODE.fullmatch(row['event_id'])):
                            raise Phase10Error('Unsupported saved record')
                        eid = row['event_id']
                        digest = _sha(line)
                        if eid in conflicts:
                            continue
                        # Exact serialized repeats are normal projection replay. A
                        # different line with the same occurrence ID is a conflict.
                        if eid in events:
                            if events[eid][2]['record_sha256'] != digest:
                                del events[eid]
                                conflicts.add(eid)
                            continue
                        sid = _text(row.get('session_id'), 128) if source == 'cowrie' else ''
                        stamp = _text(row.get('timestamp'), 40)
                        ns = _instant(stamp)
                        normalized = {'event_id': eid, 'source': source, 'session_id': sid,
                                      'timestamp': stamp if ns is not None else None,
                                      'parsed_utc_ns': str(ns) if ns is not None else None,
                                      'time_status': 'normalized_unverified' if ns is not None else 'unresolved',
                                      'source_clock': _CLOCK, 'source_ip': _address(row.get('source_ip')),
                                      'source_port': _port(row.get('source_port')),
                                      'destination_port': _port(row.get('destination_port')),
                                      'service': _text(row.get('service'), 32),
                                      'event_type': _text(row.get('event_type'), 128),
                                      'password_present': row.get('password_present') is True}
                        if source == 'cowrie':
                            normalized['command'] = _text(row.get('command'), 8192)
                        reference = {'event_id': eid, 'source': source, 'path': relative,
                                     'line': line_number, 'byte_offset': position,
                                     'byte_length': len(line), 'record_sha256': digest,
                                     'source_device': acquired['device'], 'source_inode': acquired['inode']}
                        key = source + (':session:' + sid if source == 'cowrie' and sid else ':event:' + eid)
                        events[eid] = (key, normalized, reference)
                    except (Phase10Error, ValueError, TypeError):
                        omissions.append({'code': 'record_withheld', 'source': source, 'slot': slot,
                                          'byte_offset': position})
                    finally:
                        if line_number is not None:
                            line_number += 1
                if total > MAX_LOG_RECORDS:
                    break
        if conflicts:
            omissions.append({'code': 'conflicting_event_ids', 'count': len(conflicts)})
        omissions.append({'code': 'rotation_scope', 'note': 'Current normalized file and slots 1–2 only; older rotations and raw logs were not scanned.'})
        groups = {}
        for key, row, reference in events.values():
            groups.setdefault(key, []).append((row, reference))
        ordered = sorted(groups.values(), key=lambda rows: max(
            (int(row['parsed_utc_ns']) for row, _ in rows if row['parsed_utc_ns'] is not None), default=0), reverse=True)
        selected, used = [], 0
        with self._lock:
            self._expire()
            # Replacing the cache would invalidate still-open selections. Evict
            # oldest acquisitions only as the published bounded cache requires.
            for rows in ordered[:MAX_SELECTIONS]:
                rows.sort(key=lambda item: (item[0]['parsed_utc_ns'] is None,
                                           int(item[0]['parsed_utc_ns'] or 0), item[0]['event_id']))
                dropped = max(0, len(rows) - MAX_SELECTION_RECORDS)
                rows = rows[-MAX_SELECTION_RECORDS:]
                encoded = [_json(row) for row, _ in rows]
                size, first_index = sum(map(len, encoded)), 0
                while first_index < len(rows) and size > MAX_SELECTION_BYTES:
                    size -= len(encoded[first_index])
                    first_index += 1
                    dropped += 1
                rows, encoded = rows[first_index:], encoded[first_index:]
                if not rows:
                    continue
                log = b''.join(encoded)
                commands = [{'command': row['command'], 'timestamp': row['timestamp'],
                             'assessment': 'Observed emulated shell input; real-host execution is unknown.',
                             'reference': reference} for row, reference in rows if row.get('command')]
                first, source = rows[0][0], rows[0][0]['source']
                sid = first['session_id']
                stamps = [row['timestamp'] for row, _ in rows if row['parsed_utc_ns'] is not None]
                limitations = list(_LIMITATIONS)
                if not sid or source == 'opencanary':
                    limitations.append('Exact saved event selection; no sensor-reported session identity is available.')
                if source == 'opencanary':
                    limitations.append('OpenCanary supplies probe/authentication observations, not a command transcript.')
                summary = {'source': source, 'kind': 'sensor_session' if source == 'cowrie' and sid else 'event',
                           'label': 'Cowrie session' if source == 'cowrie' and sid else source.title() + ' event',
                           'first_seen': stamps[0] if stamps else None, 'last_seen': stamps[-1] if stamps else None,
                           'event_count': len(rows), 'command_count': len(commands),
                           'source_ip': first['source_ip'], 'source_port': first['source_port'],
                           'destination_port': first['destination_port'], 'partial': True,
                           'limitations': limitations}
                provenance = {'schema_version': 1, 'selection_kind': summary['kind'],
                              'acquired_at': _utc(),
                              'source_clock': _CLOCK, 'sources': sources,
                              'records': [reference for _, reference in rows],
                              'selected_log_sha256': _sha(log), 'omissions': omissions +
                              ([{'code': 'selection_limit', 'records_omitted': dropped}] if dropped else []),
                              'limitations': limitations, 'raw_refs_followed': False}
                plan = SessionPlan(log, _json({'schema_version': 1, 'commands': commands,
                                              'limitations': limitations}), _json(provenance), _json(summary))
                weight = len(log) + len(plan.transcript_bytes) + len(plan.provenance_bytes)
                if used + weight > MAX_CACHE_BYTES:
                    break
                token = secrets.token_hex(16)
                self._cache[token] = (time.monotonic(), plan)
                used += weight
                selected.append({'selection_id': token, **summary})
            while len(self._cache) > MAX_SELECTIONS or sum(
                    len(plan.log_bytes) + len(plan.transcript_bytes) + len(plan.provenance_bytes)
                    for _, plan in self._cache.values()) > MAX_CACHE_BYTES:
                self._cache.popitem(last=False)
        return {'status': 'available' if sources else 'unavailable' if omissions[:-1] else 'not_collected',
                'sessions': selected, 'omissions': omissions[:100],
                'limits': {'selections': MAX_SELECTIONS, 'selection_ttl_seconds': SELECTION_TTL_SECONDS,
                           'records': MAX_LOG_RECORDS, 'bytes_per_file': MAX_LOG_FILE_BYTES,
                           'records_per_selection': MAX_SELECTION_RECORDS,
                           'selections_omitted': max(0, len(ordered) - len(selected))}}

    def prepare(self, selection_id):
        if not isinstance(selection_id, str) or re.fullmatch(r'[a-f0-9]{32}', selection_id) is None:
            raise Phase10Error('Choose a current saved sensor selection')
        with self._lock:
            self._expire()
            saved = self._cache.get(selection_id)
            if saved is None:
                raise Phase10Error('Saved selection expired; refresh the sensor observations')
            plan = saved[1]
        return self._capture_plan(plan)

    def _capture_plan(self, plan):
        """Read only fixed, receipt-named copies under the configured incident root."""
        started, scanned, read_bytes, metadata_bytes = time.monotonic(), 0, 0, 0
        candidates, failures, matches = [], [], []
        event_ids = {row['event_id'] for row in plan.provenance['records']}
        try:
            incident_root = Path(runtime_path('INCIDENT_PATH', 'incidents', self.root)).absolute()
            # Bounded names only; never consult captured raw_ref/source paths.
            parent, directory, _ = _open_directory(incident_root)
            os.close(parent)
            try:
                days = _names(directory, MAX_INCIDENT_ENTRIES)
                for day in sorted(days, reverse=True):
                    if re.fullmatch(r'\d{4}-\d{2}-\d{2}', day) is None:
                        continue
                    with _directory_fd(directory, day) as day_fd:
                        for identity in _names(day_fd, MAX_INCIDENT_ENTRIES):
                            scanned += 1
                            if (scanned > MAX_INCIDENT_ENTRIES or metadata_bytes >= MAX_METADATA_BYTES or
                                    time.monotonic() - started > MAX_PREPARE_SECONDS):
                                raise Phase10Error('Preserved capture search limit')
                            if re.fullmatch(r'[a-f0-9]{24}-\d{4}', identity) is None:
                                continue
                            folder = incident_root / day / identity
                            try:
                                raw_metadata = read_regular(folder / 'incident.json', min(1024**2, MAX_METADATA_BYTES - metadata_bytes))
                                metadata_bytes += len(raw_metadata)
                                incident = parse_json(raw_metadata)
                                related = incident.get('related_events') if isinstance(incident, dict) else None
                                if (not isinstance(related, list) or len(related) > MAX_LOG_RECORDS or
                                        not any(isinstance(value, str) and value in event_ids for value in related)):
                                    continue
                                if metadata_bytes >= MAX_METADATA_BYTES:
                                    failures.append('search_incomplete')
                                    raise Phase10Error('Preservation metadata read limit')
                                raw_metadata = read_regular(folder / 'metadata.json', min(1024**2, MAX_METADATA_BYTES - metadata_bytes))
                                metadata_bytes += len(raw_metadata)
                                metadata = parse_json(raw_metadata)
                                copies = metadata.get('copies') if isinstance(metadata, dict) else None
                                if not isinstance(copies, list) or len(copies) > 100:
                                    raise Phase10Error('Invalid preservation receipt')
                                for receipt in copies:
                                    if (len(candidates) >= MAX_CANDIDATES or
                                            time.monotonic() - started > MAX_PREPARE_SECONDS):
                                        failures.append('search_incomplete')
                                        raise Phase10Error('Preserved capture candidate limit')
                                    if not _valid_receipt(receipt):
                                        failures.append('uncertain')
                                        continue
                                    size, digest = receipt['size'], receipt['sha256']
                                    if size + len(plan.log_bytes) > MAX_CAPTURE_BYTES or read_bytes + size > MAX_CAPTURE_BYTES:
                                        failures.append('too_large')
                                        continue
                                    path = folder / 'pcap' / receipt['destination']
                                    raw = _stable_bytes(path, size)
                                    read_bytes += len(raw)
                                    if len(raw) != size or _sha(raw) != digest:
                                        failures.append('uncertain')
                                        continue
                                    candidate = CaptureCandidate(f'{day}/{identity}/pcap/{receipt["destination"]}',
                                                                 digest, size, _json(_receipt_summary(receipt, _sha(raw_metadata))))
                                    candidates.append(candidate)
                                    overlap = match_capture(raw, plan)
                                    if overlap['status'] == 'matched':
                                        if not any(previous[1].sha256 == digest for previous in matches):
                                            matches.append((raw, candidate, overlap))
                                    else:
                                        failures.append(overlap['status'])
                            except (OSError, Phase10Error, ValueError, TypeError, KeyError):
                                failures.append('uncertain')
            finally:
                os.close(directory)
        except FileNotFoundError:
            pass
        except (OSError, Phase10Error, ValueError, TypeError):
            failures.append('search_incomplete')
        raw = None
        info = {'status': 'unavailable', 'candidate_count': len(candidates),
                'verified_at': _utc(),
                'limitations': ['Only verified stable preserved incident copies were considered; the active ring was not read.',
                                'Preservation stability and tuple/time overlap do not establish a complete session or actor identity.'],
                'omissions': sorted(set(failures))}
        if len(matches) == 1 and 'search_incomplete' not in failures:
            raw, candidate, overlap = matches[0]
            info.update(status='matched', sha256=candidate.sha256, bytes=candidate.size,
                        relative_path=candidate.relative_path, association=overlap,
                        acquisition_receipt=json.loads(candidate.receipt_bytes))
        elif len(matches) > 1:
            info['status'] = 'ambiguous'
        elif failures:
            info['status'] = 'too_large' if set(failures) == {'too_large'} else 'uncertain'
        provenance = plan.provenance
        provenance['capture'] = info
        provenance['capture_candidates'] = [{'relative_path': candidate.relative_path,
                                              'sha256': candidate.sha256, 'bytes': candidate.size,
                                              'acquisition_receipt': json.loads(candidate.receipt_bytes)}
                                             for candidate in candidates]
        return SessionPlan(plan.log_bytes, plan.transcript_bytes, _json(provenance),
                           plan.summary_bytes, raw, _json(info), tuple(candidates))


def _open_directory(path):
    path = Path(path)
    if '..' in path.parts:
        raise Phase10Error('Unsupported preservation directory')
    parent = os.open(path.anchor, _DIRECTORY)
    try:
        for part in path.parts[1:-1]:
            child = os.open(part, _DIRECTORY, dir_fd=parent)
            os.close(parent)
            parent = child
        child = os.open(path.name, _DIRECTORY, dir_fd=parent)
        return parent, child, os.fstat(child)
    except BaseException:
        os.close(parent)
        raise


@contextmanager
def _directory_fd(parent, name):
    descriptor = os.open(name, _DIRECTORY, dir_fd=parent)
    try:
        yield descriptor
    finally:
        os.close(descriptor)


def _names(descriptor, limit):
    names = []
    with os.scandir(descriptor) as entries:
        for entry in entries:
            if len(names) >= limit:
                raise Phase10Error('Preservation inventory exceeds bound')
            names.append(entry.name)
    return names


def _valid_receipt(row):
    if not isinstance(row, dict):
        return False
    digest, size, identity = row.get('sha256'), row.get('size'), row.get('source_identity')
    return (isinstance(digest, str) and _HASH.fullmatch(digest) is not None and
            row.get('destination') == digest + '.pcapng' and row.get('verified_stable') is True and
            type(size) is int and size > 0 and row.get('source_sha256_at_start') == digest and
            type(row.get('source_size_at_start')) is int and row['source_size_at_start'] == size and
            type(row.get('acquisition_limit_bytes')) is int and row['acquisition_limit_bytes'] == size and
            isinstance(identity, dict) and set(identity) == {'device', 'inode', 'mtime_ns', 'ctime_ns'} and
            all(type(value) is int and 0 <= value < 2**64 for value in identity.values()))


def _receipt_summary(row, metadata_hash):
    keys = ('destination', 'sha256', 'size', 'verified_stable', 'source_size_at_start',
            'acquisition_limit_bytes', 'source_sha256_at_start', 'source_identity')
    result = {key: row[key] for key in keys}
    result.update(source_path=_text(row.get('source'), 4096) or None,
                  recorded_at=row.get('timestamp') if _instant(row.get('timestamp')) is not None else None,
                  preservation_metadata_sha256=metadata_hash,
                  logical_receipt_sha256=_sha(_json(row)), source_path_followed=False)
    return result


def _packet(data):
    """Exact common Ethernet/IP/TCP/UDP headers; no reassembly or payload parsing."""
    if len(data) < 14:
        raise ValueError('truncated_ethernet')
    kind = int.from_bytes(data[12:14], 'big')
    offset = 14
    for _ in range(4):
        if kind not in (0x8100, 0x88a8):
            break
        if len(data) < offset + 4:
            raise ValueError('truncated_vlan')
        kind = int.from_bytes(data[offset + 2:offset + 4], 'big')
        offset += 4
    if kind == 0x0800:
        if len(data) < offset + 20 or data[offset] >> 4 != 4:
            raise ValueError('invalid_ipv4')
        length, total = (data[offset] & 15) * 4, int.from_bytes(data[offset + 2:offset + 4], 'big')
        if length < 20 or total < length or len(data) < offset + total:
            raise ValueError('truncated_ipv4')
        if int.from_bytes(data[offset + 6:offset + 8], 'big') & 0x3fff:
            return None
        protocol = data[offset + 9]
        src, dst = str(ipaddress.ip_address(data[offset + 12:offset + 16])), str(ipaddress.ip_address(data[offset + 16:offset + 20]))
        payload = data[offset + length:offset + total]
    elif kind == 0x86dd:
        if len(data) < offset + 40 or data[offset] >> 4 != 6:
            raise ValueError('invalid_ipv6')
        size = int.from_bytes(data[offset + 4:offset + 6], 'big')
        if not size or len(data) < offset + 40 + size:
            raise ValueError('truncated_or_jumbo_ipv6')
        protocol = data[offset + 6]
        src, dst = str(ipaddress.ip_address(data[offset + 8:offset + 24])), str(ipaddress.ip_address(data[offset + 24:offset + 40]))
        payload = data[offset + 40:offset + 40 + size]
    else:
        return None
    if protocol == 6:
        if len(payload) < 20 or not 20 <= (payload[12] >> 4) * 4 <= len(payload):
            raise ValueError('invalid_tcp')
    elif protocol == 17:
        if len(payload) < 8 or not 8 <= int.from_bytes(payload[4:6], 'big') <= len(payload):
            raise ValueError('invalid_udp')
    else:
        return None
    return src, dst, int.from_bytes(payload[:2], 'big'), int.from_bytes(payload[2:4], 'big'), 'tcp' if protocol == 6 else 'udp'


def _options(raw, position, end, order):
    count = 0
    while position < end:
        count += 1
        if count > 4096 or position + 4 > end:
            raise ValueError('invalid_pcapng_option')
        code, length = struct.unpack_from(order + 'HH', raw, position)
        position += 4
        padded = ((length + 3) // 4) * 4
        if position + padded > end:
            raise ValueError('invalid_pcapng_option')
        if code == 0:
            if length or any(raw[position:end]):
                raise ValueError('invalid_pcapng_option_end')
            return
        yield code, raw[position:position + length]
        position += padded


class _UnsupportedCapture(ValueError):
    pass


def _frames(raw, deadline):
    """Yield finite frames with exact source record locators and rational time."""
    classic = {b'\xd4\xc3\xb2\xa1': ('<', 10**6), b'\xa1\xb2\xc3\xd4': ('>', 10**6),
               b'\x4d\x3c\xb2\xa1': ('<', 10**9), b'\xa1\xb2\x3c\x4d': ('>', 10**9)}
    ordinal, offset, blocks = 0, 0, 0
    if raw[:4] in classic:
        order, units = classic[raw[:4]]
        if len(raw) < 24:
            raise ValueError('truncated_pcap_header')
        major, minor, _, _, snaplen, link = struct.unpack_from(order + 'HHIIII', raw, 4)
        if (major, minor) != (2, 4) or not 0 < snaplen <= 1024**2:
            raise ValueError('invalid_pcap_header')
        offset = 24
        while offset < len(raw):
            ordinal += 1
            if ordinal > MAX_PACKETS or time.monotonic() > deadline:
                raise TimeoutError('packet_budget')
            if len(raw) - offset < 16:
                raise ValueError('truncated_pcap_record')
            seconds, fraction, captured, original = struct.unpack_from(order + 'IIII', raw, offset)
            if fraction >= units or captured > min(snaplen, original, 1024**2) or offset + 16 + captured > len(raw):
                raise ValueError('invalid_pcap_record')
            ref = {'ordinal': ordinal, 'byte_offset': offset, 'byte_length': 16 + captured,
                   'record_sha256': _sha(raw[offset:offset + 16 + captured]), 'interface': 0, 'section': 0}
            yield raw[offset + 16:offset + 16 + captured] if link == 1 else None, seconds * units + fraction, units, ref
            offset += 16 + captured
        return
    if raw[:4] != b'\x0a\x0d\x0d\x0a':
        raise _UnsupportedCapture('unsupported_capture_magic')
    order, interfaces, section = None, [], -1
    while offset < len(raw):
        blocks += 1
        if blocks > MAX_PACKETS * 2 or time.monotonic() > deadline:
            raise TimeoutError('block_budget')
        if len(raw) - offset < 12:
            raise ValueError('truncated_pcapng_block')
        is_section = raw[offset:offset + 4] == b'\x0a\x0d\x0d\x0a'
        if is_section:
            order = {b'\x4d\x3c\x2b\x1a': '<', b'\x1a\x2b\x3c\x4d': '>'}.get(raw[offset + 8:offset + 12])
            if order is None:
                raise ValueError('invalid_pcapng_byteorder')
        if order is None:
            raise ValueError('pcapng_missing_section')
        kind, size = struct.unpack_from(order + 'II', raw, offset)
        if size < 12 or size % 4 or size > 1024**2 + 65536 or offset + size > len(raw) or struct.unpack_from(order + 'I', raw, offset + size - 4)[0] != size:
            raise ValueError('invalid_pcapng_framing')
        if is_section:
            if size < 28 or struct.unpack_from(order + 'HH', raw, offset + 12) != (1, 0):
                raise _UnsupportedCapture('unsupported_pcapng_section')
            if struct.unpack_from(order + 'q', raw, offset + 16)[0] != -1:
                raise _UnsupportedCapture('unsupported_explicit_section_length')
            list(_options(raw, offset + 24, offset + size - 4, order))
            section += 1
            interfaces = []
        elif kind == 1:
            if size < 20 or len(interfaces) >= 4096:
                raise ValueError('invalid_pcapng_interface')
            link, _, snaplen = struct.unpack_from(order + 'HHI', raw, offset + 8)
            if snaplen > 1024**2:
                raise ValueError('pcapng_snaplen_budget')
            units, time_offset, seen = 10**6, 0, set()
            for code, value in _options(raw, offset + 16, offset + size - 4, order):
                length = len(value)
                if code in (9, 14) and code in seen:
                    raise ValueError('ambiguous_pcapng_time_option')
                seen.add(code)
                if code == 9:
                    if length != 1 or (value[0] & 127) > (63 if value[0] & 128 else 18):
                        raise ValueError('invalid_pcapng_resolution')
                    units = (2 if value[0] & 128 else 10) ** (value[0] & 127)
                elif code == 14:
                    if length != 8:
                        raise ValueError('invalid_pcapng_time_offset')
                    time_offset = struct.unpack(order + 'q', value)[0]
            interfaces.append((link, snaplen, units, time_offset))
        elif kind == 6:
            ordinal += 1
            if ordinal > MAX_PACKETS:
                raise TimeoutError('packet_budget')
            if size < 32:
                raise ValueError('pcapng_packet_length')
            interface, high, low, captured, original = struct.unpack_from(order + 'IIIII', raw, offset + 8)
            if interface >= len(interfaces):
                raise ValueError('invalid_pcapng_packet_interface')
            link, snaplen, units, time_offset = interfaces[interface]
            if captured > min(original, 1024**2) or snaplen and captured > snaplen or 32 + ((captured + 3) // 4) * 4 > size:
                raise ValueError('invalid_pcapng_packet_length')
            list(_options(raw, offset + 28 + ((captured + 3) // 4) * 4,
                          offset + size - 4, order))
            ref = {'ordinal': ordinal, 'byte_offset': offset, 'byte_length': size,
                   'record_sha256': _sha(raw[offset:offset + size]), 'interface': interface, 'section': section}
            yield raw[offset + 28:offset + 28 + captured] if link == 1 else None, (high << 32 | low) + time_offset * units, units, ref
        elif kind in (2, 3):
            ordinal += 1
            if ordinal > MAX_PACKETS:
                raise TimeoutError('packet_budget')
            if size < (32 if kind == 2 else 16):
                raise ValueError('invalid_unsupported_packet_block')
            yield None, None, None, {'ordinal': ordinal, 'byte_offset': offset, 'byte_length': size}
        else:
            yield None, None, None, {'unsupported_block': True, 'block_type': kind,
                                     'byte_offset': offset, 'byte_length': size}
        offset += size


def match_capture(raw, plan):
    """Pure bounded tuple/time overlap; never assert encrypted command contents."""
    result = {'status': 'unknown', 'rule': 'saved-endpoint-time-overlap/1',
              'source_clock': _CLOCK, 'time_tolerance_ns': str(TIME_TOLERANCE_NS),
              'packet_clock': 'capture_interface_unverified', 'transport_basis': 'saved_service_mapping',
              'inspection_complete': False,
              'matching_fields': ['source_ip', 'source_port', 'destination_port', 'transport', 'timestamp_window'],
              'destination_ip_asserted_by_log': False, 'packets': [], 'packet_count': 0,
              'unsupported_packets': 0, 'unsupported_blocks': 0,
              'limitations': ['Tuple/time overlap is an inferred association with a saved interaction.',
                              'Source clock is unverified; normalized time can be a receipt-time fallback.',
                              'No TCP reassembly, decryption, payload/command matching or capture-continuity claim.',
                              'IPv4/TCP/UDP checksums are unvalidated.']}
    if not isinstance(raw, bytes) or len(raw) + len(plan.log_bytes) > MAX_CAPTURE_BYTES:
        result['status'] = 'too_large'
        return result
    rows = [json.loads(line) for line in plan.log_bytes.splitlines()]
    values = [{row[key] for row in rows if row.get(key) not in ('', None)}
              for key in ('source_ip', 'source_port', 'destination_port')]
    stamps = [int(row['parsed_utc_ns']) for row in rows if row.get('parsed_utc_ns') is not None]
    services = {row.get('service') for row in rows if row.get('service')}
    tcp_services = {'ssh', 'telnet', 'http', 'ftp', 'redis', 'mysql', 'mssql', 'vnc'}
    transport = 'tcp' if services and services <= tcp_services else 'udp' if services == {'snmp'} else None
    if any(len(value) != 1 for value in values) or not stamps or transport is None or max(stamps) - min(stamps) > 86400 * 10**9:
        result['reason'] = 'Incomplete or conflicting endpoint, transport or time fields.'
        return result
    source, sport, dport = (next(iter(value)) for value in values)
    low, high = min(stamps) - TIME_TOLERANCE_NS, max(stamps) + TIME_TOLERANCE_NS
    destinations, matched = set(), []
    result['window_utc_ns'] = {'since': str(low), 'until': str(high)}
    try:
        for data, ticks, units, reference in _frames(raw, time.monotonic() + MAX_MATCH_SECONDS):
            if reference.get('unsupported_block'):
                result['unsupported_blocks'] += 1
                continue
            decoded = _packet(data) if data is not None else None
            if decoded is None or ticks is None:
                result['unsupported_packets'] += 1
                continue
            src, dst, source_port, destination_port, protocol = decoded
            forward = src == source and source_port == sport and destination_port == dport
            reverse = dst == source and destination_port == sport and source_port == dport
            if protocol == transport and (forward or reverse) and low * units <= ticks * 10**9 <= high * units:
                destinations.add(dst if forward else src)
                result['packet_count'] += 1
                if len(matched) < MAX_PACKET_REFERENCES:
                    matched.append({**reference, 'timestamp_utc_ns': str(ticks * 10**9 // units),
                                    'time_resolution_denominator': str(units), 'src': src, 'dst': dst,
                                    'source_port': source_port, 'destination_port': destination_port,
                                    'transport': protocol})
        result.update(status='ambiguous' if len(destinations) > 1 else 'matched' if matched else
                      'unknown' if result['unsupported_packets'] or result['unsupported_blocks'] else 'unmatched',
                      packets=matched, observed_destinations=sorted(destinations),
                      packet_references_truncated=result['packet_count'] > len(matched),
                      inspection_complete=True)
    except TimeoutError:
        result.update(status='unknown', reason='Packet inspection budget reached.', packets=[], packet_count=0)
    except _UnsupportedCapture:
        result.update(status='unknown', reason='Capture format or section layout is unsupported.', packets=[], packet_count=0)
    except (ValueError, struct.error, IndexError):
        result.update(status='malformed', reason='Capture framing or supported packet headers are invalid.', packets=[], packet_count=0)
    return result
