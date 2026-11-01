"""Offline interoperability with Sentinel's documented, minimized v1 exchange.

The analyzer remains a separate project. This consumer imports no Sentinel code.
"""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import uuid

from .io import parse_json, parse_jsonl
from .model import MAX_BYTES, MAX_RECORDS, Phase10Error, make_finding

CONTRACT = 'sentinel.honeytrace/1'
_HASH = re.compile(r'[a-f0-9]{64}')
_PSEUDONYM = re.compile(r'p_[a-f0-9]{32}')
_CODE = re.compile(r'[A-Za-z0-9_.:-]{1,128}')
_NULL_INT = (int, type(None))
_FIELDS = {
    'case': {'status': str, 'run_id': str, 'parser_version': str, 'tools': dict,
             'configuration': dict, 'privacy': dict, 'limitations': list},
    'source': {'id': int, 'sha256': str, 'size': int, 'kind': str,
               'parser_version': str, 'metadata': dict},
    'observation': {'id': str, 'source_id': int, 'ordinal': int, 'kind': str,
                    'protocol': str, 'context': str, 'time': dict, 'data': dict,
                    'provenance': dict, 'duplicate_of': (str, type(None))},
    'timeline': {'event_id': str, 'source_id': int, 'ordinal': int, 'kind': str,
                 'protocol': str, 'context': str, 'original_utc_ns': _NULL_INT,
                 'utc_ns': _NULL_INT, 'time': dict, 'storage': str, 'row_id': int},
    'association': {'id': int, 'relationship': str, 'context': str, 'left_type': str,
                    'left_value': str, 'right_type': str, 'right_value': str,
                    'start_ns': _NULL_INT, 'end_ns': _NULL_INT, 'evidence_id': int,
                    'rule': str, 'rule_version': str, 'confidence': str,
                    'explanation': str, 'limitations': list, 'conflicts': list},
    'finding': {'id': int, 'rule': str, 'rule_version': str, 'context': str,
                'start_ns': _NULL_INT, 'end_ns': _NULL_INT, 'severity': str,
                'confidence': str, 'explanation': str, 'alternatives': list,
                'limitations': list, 'evidence': dict, 'metrics': dict},
    'coverage': {'name': str, 'details': dict},
    'error': {'code': str, 'source_id': _NULL_INT, 'ordinal': _NULL_INT, 'details': dict},
}
_COUNTS = {'packet_records', 'observations', 'flows', 'associations', 'conflicts',
           'findings', 'parse_errors', 'duplicate_records'}
_IDENTIFIERS = {'src', 'dst', 'src_mac', 'dst_mac', 'client_mac', 'assigned_ip',
                'client_ip', 'mac', 'bssid', 'ssid', 'address', 'name', 'scanner',
                'server_name', 'manufacturer_data', 'service_data', 'service_uuids',
                'manufacturer_id', 'security', 'scan_id', 'source_addresses'}


def _require(condition):
    if not condition:
        raise Phase10Error('Invalid Sentinel exchange or incomplete provenance')


def _integer(value, *, nullable=False, positive=False):
    _require(value is None and nullable or type(value) is int and
             (1 if positive else 0) <= value < 2**63)


def _time(value):
    _require(set(value) == {'utc_ns', 'precision', 'timezone', 'status', 'clock'})
    ns, precision = value['utc_ns'], value['precision']
    _require(ns is None or type(ns) is int and -(2**63) < ns < 2**63)
    _require(value['status'] in ('missing', 'unresolved', 'normalized', 'timezone_unknown',
                                 'invalid', 'outside_index_time_range'))
    zone = value['timezone']
    _require(zone is None or isinstance(zone, str) and
             re.fullmatch(r'UTC|Z|[+-][0-9]{2}:[0-9]{2}', zone))
    clock = value['clock']
    _require(clock in ('unknown', 'capture_interface', 'scanner_unverified', 'diagnostic_unverified')
             or isinstance(clock, str) and _PSEUDONYM.fullmatch(clock))
    if precision is not None:
        _require(isinstance(precision, dict))
        if set(precision) == {'decimal_digits'}:
            _require(type(precision['decimal_digits']) is int and 0 <= precision['decimal_digits'] <= 9)
        else:
            _require(set(precision) == {'numerator', 'denominator'} and
                     type(precision['numerator']) is int and precision['numerator'] == 1 and
                     type(precision['denominator']) is int and 1 <= precision['denominator'] <= 10**63)
    # Decimal strings retain nanoseconds/rational resolution without float conversion.
    return {**value, 'utc_ns': None if ns is None else str(ns),
            'precision': None if precision is None else
            {key: str(item) if key in ('numerator', 'denominator') else item
             for key, item in precision.items()}}


def _shape(row):
    _require(set(row) == {'contract', 'entity', 'id', 'payload'} and row['contract'] == CONTRACT)
    entity, ident, payload = row['entity'], row['id'], row['payload']
    _require(isinstance(entity, str) and entity in _FIELDS and isinstance(ident, str)
             and _CODE.fullmatch(ident) and isinstance(payload, dict))
    expected = _FIELDS[entity]
    _require(set(payload) == set(expected))
    for key, types in expected.items():
        accepted = types if isinstance(types, tuple) else (types,)
        _require(type(payload[key]) in accepted)
    try:
        encoded = json.dumps(row, ensure_ascii=True, separators=(',', ':'), allow_nan=False).encode()
    except (ValueError, TypeError):
        raise Phase10Error('Invalid finite Sentinel JSON record') from None
    _require(len(encoded) <= 1024**2)
    for key in ('source_id', 'ordinal', 'row_id', 'evidence_id'):
        if key in payload:
            _integer(payload[key], nullable=entity == 'error', positive=True)
    for key in ('context', 'left_value', 'right_value'):
        if key in payload:
            _require(_PSEUDONYM.fullmatch(payload[key]))
    for key in ('kind', 'protocol', 'rule', 'rule_version', 'relationship', 'confidence', 'severity'):
        if key in payload:
            _require(isinstance(payload[key], str) and _CODE.fullmatch(payload[key]))
    for key in ('start_ns', 'end_ns', 'original_utc_ns', 'utc_ns'):
        if key in payload:
            number = payload[key]
            _require(number is None or type(number) is int and -(2**63) < number < 2**63)
    if entity in ('observation', 'timeline'):
        _time(payload['time'])
    return entity, ident, payload


def _count_map(value):
    _require(isinstance(value, dict) and len(value) <= 100)
    result = {}
    for key, number in value.items():
        _require(isinstance(key, str) and _CODE.fullmatch(key) and type(number) is int
                 and 0 <= number <= 10**15)
        result[key] = number
    return result


def parse_sentinel(data, format_name, context):
    """Import a complete bounded exchange; no raw identifiers or classifications."""
    _require(format_name == 'jsonl' and isinstance(data, bytes) and len(data) <= MAX_BYTES)
    digest = hashlib.sha256(data).hexdigest()
    _require(context.get('raw_source_hash') == digest)
    rows = parse_jsonl(data, context.get('max_records', MAX_RECORDS))
    _require(rows and rows[0].get('entity') == 'case')
    entity, ident, case = _shape(rows[0])
    _require(entity == 'case' and ident == 'case' and case['status'] == 'COMPLETE')
    try:
        _require(str(uuid.UUID(case['run_id'])) == case['run_id'])
    except (ValueError, AttributeError):
        raise Phase10Error('Invalid Sentinel case identity') from None
    _require(case['privacy'].get('export') == 'case_scoped_hmac_minimized_not_anonymous'
             and case['privacy'].get('payload_retention') is False)
    receipt = context.get('sentinel_bundle_receipt')
    if receipt is not None:
        _require(isinstance(receipt, dict) and receipt.get('exchange_sha256') == digest
                 and receipt.get('status') == 'COMPLETE' and receipt.get('run_id') == case['run_id']
                 and receipt.get('parser_version') == case['parser_version']
                 and isinstance(receipt.get('bundle_sha256'), str)
                 and _HASH.fullmatch(receipt['bundle_sha256']))
    namespace = hashlib.sha256((case['run_id'] + ':' + digest).encode()).hexdigest()
    sources, observations, seen, result = {}, {}, set(), []
    coverage_seen = False
    for row in rows:
        entity, ident, payload = _shape(row)
        _require((entity, ident) not in seen)
        seen.add((entity, ident))
        _require(entity != 'case' or len(result) == 0)
        metrics = {'entity': entity}
        provenance = {'exchange_sha256': digest, 'occurrence_id': ident}
        if receipt is not None:
            provenance['checksum_ledger_sha256'] = receipt['bundle_sha256']
        details = {'namespace': CONTRACT + ':' + namespace, 'metrics': metrics,
                   'provenance': provenance,
                   'note': 'Minimized offline observation; review leads do not establish compromise or identity.'}
        relationship = None
        if entity == 'case':
            details['status'] = 'COMPLETE'
            metrics['parser_version'] = payload['parser_version']
        elif entity == 'source':
            sid = payload['id']
            _integer(sid, positive=True)
            _integer(payload['size'])
            _require(sid <= 4096 and sid not in sources and _HASH.fullmatch(payload['sha256'])
                     and ident == 'source:' + str(sid))
            sources[sid] = payload
            provenance.update(source_id=sid, source_sha256=payload['sha256'])
            metrics.update(source_bytes=str(payload['size']), source_kind=payload['kind'])
        elif entity in ('observation', 'timeline'):
            sid = payload['source_id']
            _require(sid in sources)
            provenance.update(source_id=sid, source_sha256=sources[sid]['sha256'],
                              ordinal=str(payload['ordinal']))
            metrics.update(kind=payload['kind'], protocol=payload['protocol'], context=payload['context'])
            details['source_time'] = _time(payload['time'])
            details['time_status'] = payload['time']['status']
            if entity == 'observation':
                _require(payload['id'] == ident)
                ref = payload['provenance']
                _require(ref.get('source_id') == sid and type(ref.get('source_id')) is int
                         and ref.get('precision') in ('byte', 'logical', 'archive_member_logical'))
                if ref['precision'] == 'byte':
                    _integer(ref.get('byte_offset'))
                    _integer(ref.get('byte_length'))
                    _require(ref['byte_offset'] + ref['byte_length'] <= sources[sid]['size'])
                    provenance.update(byte_offset=ref['byte_offset'], byte_length=ref['byte_length'])
                if 'record_sha256' in ref:
                    _require(isinstance(ref['record_sha256'], str) and _HASH.fullmatch(ref['record_sha256']))
                    provenance['record_sha256'] = ref['record_sha256']
                provenance['precision'] = ref['precision']
                labels = {}
                for key in _IDENTIFIERS & payload['data'].keys():
                    value = payload['data'][key]
                    _require(value is None or isinstance(value, str) and _PSEUDONYM.fullmatch(value))
                    labels[key] = value
                if labels:
                    metrics['identifiers'] = labels
                if 'losses' in payload['data']:
                    losses = payload['data']['losses']
                    _require(isinstance(losses, list) and len(losses) <= 100 and
                             all(isinstance(code, str) and _CODE.fullmatch(code) for code in losses))
                    metrics['decoding_losses'] = losses
                duplicate = payload['duplicate_of']
                if duplicate is not None:
                    _require(_CODE.fullmatch(duplicate))
                    if duplicate.startswith('record:'):
                        match = re.fullmatch(r'record:([1-9][0-9]*):([1-9][0-9]*)', duplicate)
                        _require(match is not None and int(match[1]) in sources)
                    else:
                        _require(duplicate in observations)
                    provenance['duplicate_of'] = duplicate
                observations[ident] = (sid, payload['ordinal'])
            else:
                _require(payload['event_id'] == ident and observations.get(ident) == (sid, payload['ordinal']))
                metrics['adjusted_utc_ns'] = None if payload['utc_ns'] is None else str(payload['utc_ns'])
                metrics['original_utc_ns'] = None if payload['original_utc_ns'] is None else str(payload['original_utc_ns'])
        elif entity in ('association', 'finding'):
            _integer(payload['id'], positive=True)
            _require(ident == entity + ':' + str(payload['id']))
            metrics.update(rule=payload['rule'], rule_version=payload['rule_version'],
                           confidence_label=payload['confidence'], context=payload['context'],
                           start_ns=None if payload['start_ns'] is None else str(payload['start_ns']),
                           end_ns=None if payload['end_ns'] is None else str(payload['end_ns']))
            if entity == 'association':
                _require('observation:' + str(payload['evidence_id']) in observations)
                relationship = {'source': namespace + ':' + payload['left_value'],
                                'target': namespace + ':' + payload['right_value'],
                                'type': payload['relationship']}
                provenance['evidence_id'] = 'observation:' + str(payload['evidence_id'])
            else:
                metrics['source_severity'] = payload['severity']
        elif entity == 'coverage':
            _require(not coverage_seen and payload['name'] == 'supported_subset')
            coverage_seen = True
            cov = payload['details']
            _require(_COUNTS <= set(cov.get('counts', {})))
            details['counts'] = _count_map({key: cov['counts'][key] for key in _COUNTS})
            for original, normalized in (('decoding_losses', 'decoding_losses'),
                                         ('capture_blocks', 'capture_blocks'),
                                         ('protocol_distribution', 'protocol_distribution')):
                metrics[normalized] = _count_map(cov.get(original, {}))
            _require(cov.get('filtered_packets') == 0 and cov.get('payload_retention') is False)
            metrics.update(filtered_packets=0, payload_retention=False)
        elif entity == 'error':
            _require(_CODE.fullmatch(payload['code']))
            _require(payload['source_id'] is None or payload['source_id'] in sources)
            metrics['code'] = payload['code']
            provenance.update(source_id=payload['source_id'],
                              ordinal=None if payload['ordinal'] is None else str(payload['ordinal']))
        result.append(make_finding('sentinel', namespace + ':' + entity + ':' + ident,
                                   'relation' if relationship else 'other',
                                   'sentinel:' + namespace + ':' + entity + ':' + ident,
                                   context, relationship=relationship, scope_status='unknown',
                                   assessment='possible' if entity == 'finding' else 'informational',
                                   collected_at=None, details=details))
    _require(coverage_seen)
    return result


def _directory(path):
    path = Path(path).absolute()
    _require('..' not in path.parts)
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
    descriptor = os.open(path.anchor, flags)
    try:
        for part in path.parts[1:]:
            child = os.open(part, flags, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def _member(root, name):
    parts = PurePosixPath(name).parts
    _require(name and not name.startswith('/') and '\\' not in name and
             '/'.join(parts) == name and all(part not in ('.', '..') for part in parts)
             and all(ord(char) >= 32 and ord(char) != 127 for char in name))
    parent = os.dup(root)
    try:
        for part in parts[:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC,
                            dir_fd=parent)
            os.close(parent)
            parent = child
        fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC,
                     dir_fd=parent)
        return fd, parent, parts[-1]
    except BaseException:
        os.close(parent)
        raise


def _read_member(root, name, limit, *, retain=False):
    fd, parent, leaf = _member(root, name)
    try:
        before = os.fstat(fd)
        _require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_size <= limit)
        digest, chunks, remaining = hashlib.sha256(), [], before.st_size
        while remaining:
            chunk = os.read(fd, min(65536, remaining))
            _require(bool(chunk))
            digest.update(chunk)
            if retain:
                chunks.append(chunk)
            remaining -= len(chunk)
        signature = lambda st: (st.st_dev, st.st_ino, st.st_mode, st.st_nlink,
                                st.st_size, st.st_mtime_ns, st.st_ctime_ns)
        _require(signature(before) == signature(os.fstat(fd)) ==
                 signature(os.stat(leaf, dir_fd=parent, follow_symlinks=False)))
        return digest.hexdigest(), before.st_size, b''.join(chunks)
    finally:
        os.close(fd)
        os.close(parent)


def _inventory(root, max_files):
    names, visited = set(), 0
    def walk(fd, prefix='', depth=0):
        nonlocal visited
        _require(depth <= 16)
        before = os.fstat(fd)
        with os.scandir(fd) as entries:
            for entry in entries:
                visited += 1
                _require(visited <= max_files and entry.name not in ('.', '..'))
                path = prefix + entry.name
                info = entry.stat(follow_symlinks=False)
                if stat.S_ISDIR(info.st_mode):
                    child = os.open(entry.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC,
                                    dir_fd=fd)
                    try:
                        walk(child, path + '/', depth + 1)
                    finally:
                        os.close(child)
                else:
                    _require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1)
                    names.add(path)
        after = os.fstat(fd)
        _require((before.st_dev, before.st_ino, before.st_mtime_ns, before.st_ctime_ns) ==
                 (after.st_dev, after.st_ino, after.st_mtime_ns, after.st_ctime_ns))
    walk(root)
    return names


def verify_bundle(bundle_path, max_total_bytes=64 * 1024**2, max_files=1000):
    """Verify a bounded complete case; return only exchange bytes and a receipt.

    All case files, including the private index/key, are hashed locally. Neither
    those contents nor original paths are returned. Checksums establish consistency.
    """
    _require(type(max_total_bytes) is int and 1 <= max_total_bytes <= 1024**3 and
             type(max_files) is int and 1 <= max_files <= 10000)
    root = None
    try:
        root = _directory(bundle_path)
        initial = _inventory(root, max_files)
        _, ledger_size, ledger = _read_member(root, 'SHA256SUMS', min(MAX_BYTES, max_total_bytes), retain=True)
        try:
            lines = ledger.decode('utf-8').splitlines()
        except UnicodeError:
            raise Phase10Error('Invalid Sentinel checksum ledger') from None
        expected = {}
        for line in lines:
            _require(len(expected) < max_files and len(line) <= 4096 and '  ' in line)
            digest, name = line.split('  ', 1)
            _require(_HASH.fullmatch(digest) and name not in expected and name != 'SHA256SUMS')
            expected[name] = digest
        required = {'index.sqlite', 'manifest.json', 'state.json', 'export/exchange.jsonl'}
        _require(required <= set(expected) and initial == set(expected) | {'SHA256SUMS'})
        retained, total = {}, ledger_size
        for name, digest in expected.items():
            keep = name in ('state.json', 'manifest.json', 'export/exchange.jsonl')
            limit = min(MAX_BYTES if keep else max_total_bytes, max_total_bytes - total)
            _require(limit >= 0)
            actual, size, data = _read_member(root, name, limit, retain=keep)
            _require(actual == digest)
            total += size
            if keep:
                retained[name] = data
        _require(_inventory(root, max_files) == initial)
        state = parse_json(retained['state.json'])
        manifest = parse_json(retained['manifest.json'])
        _require(isinstance(state, dict) and isinstance(manifest, dict) and
                 state.get('status') == manifest.get('status') == 'COMPLETE' and
                 manifest.get('schema') == 'evidence-lab/2' and
                 isinstance(manifest.get('parser_version'), str) and
                 _CODE.fullmatch(manifest['parser_version']) and
                 isinstance(manifest.get('run_id'), str) and
                 state.get('version') == manifest.get('parser_version'))
        try:
            _require(str(uuid.UUID(manifest['run_id'])) == manifest['run_id'])
        except ValueError:
            raise Phase10Error('Invalid Sentinel case identity') from None
        current = _directory(bundle_path)
        try:
            _require((os.fstat(root).st_dev, os.fstat(root).st_ino) ==
                     (os.fstat(current).st_dev, os.fstat(current).st_ino))
        finally:
            os.close(current)
        return {'exchange': retained['export/exchange.jsonl'], 'receipt': {
            'bundle_sha256': hashlib.sha256(ledger).hexdigest(),
            'exchange_sha256': expected['export/exchange.jsonl'], 'files_verified': len(expected),
            'bytes_verified': total, 'status': 'COMPLETE', 'schema': 'evidence-lab/2',
            'parser_version': manifest.get('parser_version'), 'run_id': manifest.get('run_id')}}
    except OSError as exc:
        raise Phase10Error('Sentinel bundle unavailable or unsupported') from exc
    finally:
        if root is not None:
            os.close(root)
