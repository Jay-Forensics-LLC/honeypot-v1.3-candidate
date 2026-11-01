"""Immutable local receipts; consistency checks do not authenticate evidence authors."""
from contextlib import contextmanager
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import stat

from .case_leads import AUTHORSHIP_STATEMENT
from .cases import _case
from .io import parse_json, parse_jsonl
from .model import Phase10Error, timestamp
from .sentinel import CONTRACT, verify_bundle

MAX_RECEIPT_BYTES = 8 * 1024**2
MAX_CONTEXT_BYTES = 256 * 1024
_DIRECTORY = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
_HASH = re.compile(r'[a-f0-9]{64}')
_JOB = re.compile(r'[a-f0-9]{32}')
_FILES = {'capture.pcap': 64 * 1024**2, 'session.jsonl': 4 * 1024**2,
          'transcript.json': 4 * 1024**2, 'session-provenance.json': 4 * 1024**2}
_OMISSIONS = [
    'Original source paths, private bundle manifest and checksum ledger contents are omitted from this report.',
    'Private index, pseudonym key, original capture/log bytes and command contents are not embedded in this report.',
    'Raw sensor logs and older rotations were not acquired by the saved normalized selection.',
    'Capture origin, the person operating the local account and historical sensor health are unverified.',
    'Local receipt hashes do not prevent replacement or rollback without an independently retained reference.']


def _require(condition, message='Invalid local custody record'):
    if not condition:
        raise Phase10Error(message)


def _json(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True,
                      allow_nan=False).encode()


def _sha(raw):
    return hashlib.sha256(raw).hexdigest()


def _id(value):
    _require(isinstance(value, str) and _HASH.fullmatch(value), 'Choose an existing case')


def _text(value, maximum=512):
    return value if isinstance(value, str) and len(value) <= maximum and all(
        ord(char) >= 32 and ord(char) != 127 for char in value) else None


def _projection(value, keys):
    if not isinstance(value, dict):
        return {}
    return {key: item for key in keys if key in value for item in [value[key]]
            if item is None or type(item) in (bool, int) or _text(item) is not None}


def _context(value):
    _require(isinstance(value, dict), 'Custody context must be a bounded object')
    pending, count = [(value, 0)], 0
    while pending:
        item, depth = pending.pop()
        count += 1
        _require(depth <= 16 and count <= 20000, 'Custody context exceeds its bounds')
        if type(item) is dict:
            _require(all(type(key) is str for key in item))
            pending.extend((child, depth + 1) for child in item.values())
        elif type(item) is list:
            pending.extend((child, depth + 1) for child in item)
        else:
            _require(type(item) in (str, bool, int, float, type(None)))
    try:
        raw = _json(value)
        _require(len(raw) <= MAX_CONTEXT_BYTES, 'Custody context exceeds its bounds')
        return parse_json(raw)
    except (TypeError, ValueError, RecursionError):
        raise Phase10Error('Invalid finite custody context') from None


def _directory(path, *, create=False, private=True):
    path = Path(path).absolute()
    _require('..' not in path.parts)
    descriptor = os.open(path.anchor, _DIRECTORY)
    try:
        for part in path.parts[1:]:
            try:
                child = os.open(part, _DIRECTORY, dir_fd=descriptor)
            except FileNotFoundError:
                if not create:
                    raise
                try:
                    os.mkdir(part, 0o700, dir_fd=descriptor)
                except FileExistsError:
                    pass
                child = os.open(part, _DIRECTORY, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        info = os.fstat(descriptor)
        _require(not private or info.st_uid == os.geteuid() and not info.st_mode & 0o077,
                 'Custody and artifact directories must be private and operator-owned')
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def _read(parent, name, maximum, *, private=True):
    descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC,
                         dir_fd=parent)
    try:
        before = os.fstat(descriptor)
        _require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_size <= maximum and
                 (not private or before.st_uid == os.geteuid() and not before.st_mode & 0o077),
                 'Unsupported custody file')
        chunks, remaining = [], before.st_size
        while remaining:
            part = os.read(descriptor, min(65536, remaining))
            _require(part, 'Custody file changed during read')
            chunks.append(part)
            remaining -= len(part)
        signature = lambda item: (item.st_dev, item.st_ino, item.st_mode, item.st_nlink,
                                  item.st_size, item.st_mtime_ns, item.st_ctime_ns)
        _require(signature(before) == signature(os.fstat(descriptor)) == signature(
            os.stat(name, dir_fd=parent, follow_symlinks=False)), 'Custody file changed during read')
        return b''.join(chunks)
    finally:
        os.close(descriptor)


def _ledger(raw):
    try:
        lines = raw.decode('utf-8').splitlines()
    except UnicodeError:
        raise Phase10Error('Invalid retained checksum ledger') from None
    expected = {}
    for line in lines:
        _require(len(expected) < 1000 and len(line) <= 4096 and '  ' in line)
        digest, name = line.split('  ', 1)
        parts = PurePosixPath(name).parts
        _require(_HASH.fullmatch(digest) and name not in expected and name != 'SHA256SUMS' and
                 not name.startswith('/') and '\\' not in name and '/'.join(parts) == name and
                 all(part not in ('.', '..') for part in parts) and _text(name, 4096))
        expected[name] = digest
    _require({'manifest.json', 'export/exchange.jsonl', 'state.json', 'index.sqlite'} <= set(expected))
    return expected


def _machine_identity():
    name = None
    try:
        import pwd
        name = _text(pwd.getpwuid(os.geteuid()).pw_name, 128)
    except (ImportError, KeyError, OSError):
        pass
    return ({'name': name, 'uid': os.geteuid(), 'identity_status': 'local_os_account_not_verified_person'},
            {key: _text(value, 256) for key, value in
             (('hostname', platform.node()), ('system', platform.system()), ('release', platform.release()))})


def _session(context):
    result = _projection(context.get('session'), ('source', 'kind', 'label', 'first_seen', 'last_seen',
        'event_count', 'command_count', 'partial', 'synthetic'))
    if context.get('synthetic') is True:
        result['synthetic'] = True
    result['limitations'] = ['Bounded saved observations; sensor times and capture completeness are unverified.']
    return result


def _capture(value):
    result = _projection(value, ('sha256', 'bytes', 'candidate_count', 'verified_at'))
    statuses = {'matched', 'unavailable', 'ambiguous', 'too_large', 'uncertain', 'unknown', 'unmatched', 'malformed'}
    status = value.get('status') if isinstance(value, dict) else 'unavailable'
    result['status'] = status if isinstance(status, str) and status in statuses else 'unknown'
    reasons = {
        'matched': 'A retained capture has qualified tuple and time overlap with this saved selection.',
        'unavailable': 'No uniquely qualified retained capture was recorded.',
        'ambiguous': 'More than one candidate or destination prevented a unique packet association.',
        'too_large': 'A candidate exceeded the supported inspection size; packet support remains unknown.',
        'uncertain': 'Capture search or validation could not establish qualified packet support.',
        'unknown': 'The supported inspection could not establish packet support.',
        'unmatched': 'No qualifying tuple and time overlap was found in the inspected subset.',
        'malformed': 'Capture framing or supported packet headers were invalid.'}
    result['reason'] = reasons[result['status']]
    codes = value.get('omissions', []) if isinstance(value, dict) else []
    result['omissions'] = sorted({code if isinstance(code, str) and code in statuses | {'search_incomplete'} else 'other'
                                  for code in codes[:100]}) if isinstance(codes, list) else ['other']
    if isinstance(value, dict) and isinstance(value.get('association'), dict):
        association = value['association']
        result['association'] = _projection(association, ('status', 'rule', 'packet_count',
            'inspection_complete', 'packet_references_truncated', 'time_tolerance_ns'))
        result['association']['packets'] = [_projection(item, ('ordinal', 'byte_offset', 'byte_length',
            'record_sha256', 'interface', 'section', 'timestamp_utc_ns', 'time_resolution_denominator'))
            for item in association.get('packets', [])[:128] if isinstance(item, dict)] if isinstance(association.get('packets', []), list) else []
    result['limitations'] = ['Tuple/time overlap is an inferred association, not session or actor identity.',
                            'No payload/command matching, decryption, reassembly or capture continuity is established.']
    return result


class CustodyStore:
    def __init__(self, path, store, workspace_path):
        self.path, self.store = Path(path).absolute(), store
        self.workspace_path = Path(workspace_path).absolute()
        _require('..' not in self.path.parts and '..' not in self.workspace_path.parts)

    @contextmanager
    def _parent(self, create=False):
        descriptor = _directory(self.path, create=create)
        try:
            fcntl.flock(descriptor, (fcntl.LOCK_EX if create else fcntl.LOCK_SH) | fcntl.LOCK_NB)
            yield descriptor
        finally:
            os.close(descriptor)

    def _validate(self, document, summary):
        _require(isinstance(document, dict) and set(document) == {'schema_version', 'record', 'custody_sha256'} and
                 type(document['schema_version']) is int and document['schema_version'] == 1 and
                 isinstance(document['record'], dict) and isinstance(document['custody_sha256'], str) and
                 _HASH.fullmatch(document['custody_sha256']) and _sha(_json(document['record'])) == document['custody_sha256'])
        record = document['record']
        _require(set(record) == {'case_id', 'recorded_at', 'imported_at', 'exchange_sha256',
                 'checksum_ledger_sha256', 'namespace', 'importer', 'machine', 'job', 'context', 'artifacts', 'bundle'})
        _require(all(record[key] == summary[key] for key in ('case_id', 'imported_at', 'exchange_sha256',
                     'checksum_ledger_sha256', 'namespace')) and timestamp(record['recorded_at']) == record['recorded_at'])
        _context(record['context'])
        _require(isinstance(record['bundle'], dict) and set(record['bundle']) == {'manifest_utf8', 'ledger_utf8'})
        manifest_raw = record['bundle']['manifest_utf8'].encode('utf-8')
        ledger_raw = record['bundle']['ledger_utf8'].encode('utf-8')
        expected = _ledger(ledger_raw)
        _require(_sha(ledger_raw) == record['checksum_ledger_sha256'] and
                 _sha(manifest_raw) == expected['manifest.json'] and
                 'sha256:' + expected['export/exchange.jsonl'] == record['exchange_sha256'])
        manifest = parse_json(manifest_raw)
        _require(isinstance(manifest, dict) and manifest.get('schema') == 'evidence-lab/2' and
                 manifest.get('status') == 'COMPLETE' and manifest.get('parser_version') == summary['parser_version'] and
                 isinstance(manifest.get('run_id'), str) and summary['namespace'] == CONTRACT + ':' +
                 _sha((manifest['run_id'] + ':' + expected['export/exchange.jsonl']).encode()))
        _require(isinstance(record['importer'], dict) and set(record['importer']) == {'name', 'uid', 'identity_status'} and
                 isinstance(record['machine'], dict) and set(record['machine']) == {'hostname', 'system', 'release'})
        job = record['job']
        _require(job is None or isinstance(job, dict) and set(job) == {'id', 'created_at'} and
                 isinstance(job['id'], str) and _JOB.fullmatch(job['id']) and timestamp(job['created_at']) == job['created_at'])
        _require(isinstance(record['artifacts'], list) and len(record['artifacts']) <= len(_FILES))
        names = set()
        for item in record['artifacts']:
            _require(isinstance(item, dict) and set(item) == {'id', 'name', 'sha256', 'bytes', 'job_id'} and
                     item['name'] in _FILES and item['name'] not in names and job is not None and item['job_id'] == job['id'] and
                     item['id'] == _sha((record['case_id'] + ':' + item['name']).encode()) and
                     isinstance(item['sha256'], str) and _HASH.fullmatch(item['sha256']) and
                     type(item['bytes']) is int and 0 <= item['bytes'] <= _FILES[item['name']])
            names.add(item['name'])
        return record, manifest

    def _load(self, case_id):
        _id(case_id)
        summary, _ = _case(self.store, case_id)
        try:
            with self._parent() as parent:
                document = parse_json(_read(parent, case_id + '.json', MAX_RECEIPT_BYTES))
        except FileNotFoundError:
            return summary, None, None, None
        record, manifest = self._validate(document, summary)
        return summary, record, manifest, document['custody_sha256']

    def _artifact_bytes(self, item):
        _require(item['name'] in _FILES and isinstance(item['job_id'], str) and _JOB.fullmatch(item['job_id']))
        root = _directory(self.workspace_path)
        folder = None
        try:
            folder = os.open(item['job_id'], _DIRECTORY, dir_fd=root)
            info = os.fstat(folder)
            _require(info.st_uid == os.geteuid() and not info.st_mode & 0o077)
            raw = _read(folder, item['name'], _FILES[item['name']])
        finally:
            if folder is not None:
                os.close(folder)
            os.close(root)
        _require(len(raw) == item['bytes'] and _sha(raw) == item['sha256'], 'Retained artifact digest mismatch')
        return raw

    def record(self, case_id, bundle_path, metadata=None):
        """Commit once; a repeated import preserves the original local snapshot."""
        _id(case_id)
        summary, rows = _case(self.store, case_id)
        try:
            _, previous, _, _ = self._load(case_id)
            if previous is not None:
                return self.detail(case_id)
        except FileNotFoundError:
            pass
        metadata = {} if metadata is None else metadata
        _require(isinstance(metadata, dict) and not set(metadata) - {'job_id', 'created_at', 'context', 'artifacts'})
        context = _context(metadata.get('context', {}))
        job_id = metadata.get('job_id')
        _require(job_id is None or isinstance(job_id, str) and _JOB.fullmatch(job_id))
        job = None if job_id is None else {'id': job_id, 'created_at': timestamp(metadata.get('created_at'))}
        supplied = metadata.get('artifacts', [])
        _require(isinstance(supplied, list) and len(supplied) <= len(_FILES))
        artifacts, names = [], set()
        sources = {(row['details']['provenance']['source_sha256'], int(row['details']['metrics']['source_bytes']))
                   for row in rows if row['details']['metrics']['entity'] == 'source'}
        for item in supplied:
            _require(isinstance(item, dict) and set(item) == {'path', 'name', 'sha256', 'bytes'} and
                     item['name'] in _FILES and item['name'] not in names and job is not None and
                     isinstance(item['path'], str) and Path(item['path']).is_absolute() and
                     Path(item['path']) == self.workspace_path / job_id / item['name'] and
                     isinstance(item['sha256'], str) and _HASH.fullmatch(item['sha256']) and
                     type(item['bytes']) is int and 0 <= item['bytes'] <= _FILES[item['name']],
                     'Artifact must be a fixed file in this private analysis job')
            saved = {key: item[key] for key in ('name', 'sha256', 'bytes')}
            saved.update(id=_sha((case_id + ':' + item['name']).encode()), job_id=job_id)
            self._artifact_bytes(saved)
            if item['name'] in ('capture.pcap', 'session.jsonl'):
                _require((item['sha256'], item['bytes']) in sources, 'Artifact does not match an analyzed source')
            artifacts.append(saved)
            names.add(item['name'])
        verified = verify_bundle(bundle_path)
        _require(verified['receipt']['bundle_sha256'] == summary['checksum_ledger_sha256'] and
                 'sha256:' + verified['receipt']['exchange_sha256'] == summary['exchange_sha256'])
        bundle = _directory(bundle_path, private=False)
        try:
            ledger = _read(bundle, 'SHA256SUMS', MAX_RECEIPT_BYTES, private=False)
            manifest = _read(bundle, 'manifest.json', MAX_RECEIPT_BYTES, private=False)
        finally:
            os.close(bundle)
        importer, machine = _machine_identity()
        record = {key: summary[key] for key in ('case_id', 'imported_at', 'exchange_sha256', 'checksum_ledger_sha256', 'namespace')}
        record.update(recorded_at=dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00', 'Z'),
                      importer=importer, machine=machine, job=job, context=context, artifacts=artifacts,
                      bundle={'manifest_utf8': manifest.decode('utf-8'), 'ledger_utf8': ledger.decode('utf-8')})
        document = {'schema_version': 1, 'record': record, 'custody_sha256': _sha(_json(record))}
        self._validate(document, summary)
        raw = _json(document) + b'\n'
        _require(len(raw) <= MAX_RECEIPT_BYTES, 'Custody receipt exceeds its byte limit')
        with self._parent(create=True) as parent:
            try:
                existing = _read(parent, case_id + '.json', MAX_RECEIPT_BYTES)
            except FileNotFoundError:
                existing = None
            if existing is not None:
                self._validate(parse_json(existing), summary)
            else:
                descriptor = os.open(case_id + '.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                                     os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=parent)
                try:
                    with os.fdopen(descriptor, 'wb') as stream:
                        stream.write(raw)
                        stream.flush()
                        os.fsync(stream.fileno())
                    os.fsync(parent)
                except BaseException:
                    os.unlink(case_id + '.json', dir_fd=parent)
                    raise
        return self.detail(case_id)

    def detail(self, case_id):
        _id(case_id)
        summary, _ = _case(self.store, case_id)
        base = {'case_id': case_id, 'authorship_statement': AUTHORSHIP_STATEMENT,
                'exchange_sha256': summary['exchange_sha256'],
                'checksum_ledger_sha256': summary['checksum_ledger_sha256'], 'omissions': list(_OMISSIONS)}
        try:
            _, record, manifest, digest = self._load(case_id)
            if record is None:
                return {**base, 'status': 'not_recorded', 'reason': 'No historical acquisition details were recorded.'}
            artifacts = []
            for item in record['artifacts']:
                public = {key: item[key] for key in ('id', 'name', 'sha256', 'bytes')}
                try:
                    self._artifact_bytes(item)
                    public.update(retained=True, verification='hash_and_size_verified')
                except (OSError, Phase10Error):
                    public.update(retained=False, verification='unavailable_or_digest_mismatch')
                artifacts.append(public)
            tools = manifest.get('tools', {})
            tools = tools if isinstance(tools, dict) else {}
            hashes = tools.get('code_sha256', {})
            hashes = {name: value for name, value in hashes.items() if isinstance(name, str) and
                      re.fullmatch(r'[A-Za-z0-9_.-]{1,128}\.py', name) and isinstance(value, str) and
                      _HASH.fullmatch(value)} if isinstance(hashes, dict) and len(hashes) <= 100 else {}
            analyzer = {'name': 'Sentinel offline analyzer', 'version': manifest['parser_version'],
                        'parser_version': manifest['parser_version'], 'python': _text(tools.get('python'), 64),
                        'sqlite': _text(tools.get('sqlite'), 64), 'code_sha256': hashes,
                        'analyzed_locally': record['job'] is not None,
                        'identity_status': 'Bundle-reported versions and hashes; authorship is unverified.'}
            sensor = _projection(record['context'].get('sensor'), ('equipment_id', 'name', 'equipment_class',
                'association', 'snapshot_at', 'last_heartbeat_at', 'reported_at', 'reported_status',
                'status_at_case_creation', 'historical_status', 'tracking', 'active', 'note'))
            capture = _capture(record['context'].get('capture'))
            if record['context'].get('workflow') == 'honeypot_session' and capture['status'] != 'matched':
                base['omissions'].append('Packet association: ' + capture['reason'])
                if capture['omissions']:
                    base['omissions'].append('Capture omission codes: ' + ', '.join(capture['omissions']) + '.')
            return {**base, 'status': 'available', 'recorded_at': record['recorded_at'],
                    'imported_at': record['imported_at'], 'workflow': _text(record['context'].get('workflow'), 64),
                    'custody_sha256': digest, 'importer': record['importer'], 'machine': record['machine'],
                    'analyzer': analyzer, 'sensor': sensor or None, 'session': _session(record['context']), 'capture': capture,
                    'artifacts': artifacts, 'verification': {'receipt': 'digest_verified',
                        'import': 'exchange_and_checksum_ledger_bound', 'artifacts': 'verified_individually_on_read'}}
        except (OSError, Phase10Error, KeyError, TypeError, ValueError, AttributeError):
            return {**base, 'status': 'unavailable', 'reason': 'Custody receipt is unavailable or inconsistent.'}

    def report(self, case_id):
        detail = self.detail(case_id)
        def display(value):
            if value is None or value == '':
                return 'Unknown / not recorded'
            if type(value) is bool:
                return 'Yes' if value else 'No'
            return str(value)

        def fields(values, labels):
            return [label + ': ' + display(values.get(key)) for key, label in labels]

        importer, machine, analyzer = (detail.get(key, {}) for key in ('importer', 'machine', 'analyzer'))
        lines = ['HoneyTrace local custody record', '', AUTHORSHIP_STATEMENT, '',
                 'Case: ' + case_id, 'Record status: ' + detail['status'], '', 'Acquisition and import',
                 *fields(detail, [('workflow', 'Workflow'), ('imported_at', 'Evidence imported at'),
                                  ('recorded_at', 'Custody recorded at')]),
                 *fields(importer, [('name', 'Local importer account'), ('uid', 'Local account UID'),
                                    ('identity_status', 'Account identity status')]),
                 'The local account identifies an OS account, not a verified person.', '', 'Import host',
                 *fields(machine, [('hostname', 'Hostname'), ('system', 'Operating system'), ('release', 'OS release')]),
                 'These machine facts describe the import host. They do not identify the original sensor or analyzer host.',
                 '', 'Analyzer information',
                 *fields(analyzer, [('name', 'Analyzer'), ('version', 'Bundle-reported parser version'),
                                    ('python', 'Bundle-reported Python version'), ('sqlite', 'Bundle-reported SQLite version'),
                                    ('analyzed_locally', 'Analyzed by this local job workflow')])]
        if analyzer.get('analyzed_locally') is False:
            lines.append('This receipt records import of a completed case; its earlier analysis host is unverified.')
        hashes = analyzer.get('code_sha256', {})
        lines.extend(['Analyzer module SHA-256: ' + name + ' = ' + digest for name, digest in sorted(hashes.items())]
                     if hashes else ['Analyzer module hashes: Unknown / not recorded'])
        lines.extend(['', 'Associated equipment snapshot'])
        sensor = detail.get('sensor') or {}
        lines.extend(fields(sensor, [('name', 'Inventory name'), ('equipment_id', 'Equipment ID'),
            ('equipment_class', 'Equipment class'), ('association', 'Association basis'),
            ('snapshot_at', 'Snapshot recorded at'), ('last_heartbeat_at', 'Last recorded heartbeat'),
            ('reported_at', 'Last status report'), ('reported_status', 'Reported status'),
            ('status_at_case_creation', 'Status at case creation'), ('historical_status', 'Status at capture time')]))
        lines.extend(['A current inventory snapshot does not establish historical capture-time sensor health.', '',
                      'Observed interaction times', *fields(detail.get('session', {}),
                      [('first_seen', 'First observed sensor time'), ('last_seen', 'Last observed sensor time'),
                       ('event_count', 'Retained event count'), ('command_count', 'Retained command-input count')]),
                      'Sensor timestamps are unverified; they may differ from import and receipt times.', '',
                      'Capture association', *fields(detail.get('capture', {}), [('status', 'Association status'),
                      ('reason', 'Reason')])])
        codes = detail.get('capture', {}).get('omissions', [])
        if codes:
            lines.append('Capture omission codes: ' + ', '.join(codes))
        lines.extend(['Tuple/time overlap is an association; it does not prove session continuity or actor identity.', '',
                      'Integrity references', *fields(detail, [('custody_sha256', 'Local custody record SHA-256'),
                       ('checksum_ledger_sha256', 'Checksum ledger SHA-256'), ('exchange_sha256', 'Minimized exchange SHA-256')]),
                      'The ledger digest covers the literal SHA256SUMS bytes. No signature or independent authorship verification is recorded.',
                      '', 'Retained evidence files'])
        for item in detail.get('artifacts', []):
            lines.extend([item['name'] + ': ' + str(item['bytes']) + ' bytes',
                          '  SHA-256: ' + item['sha256'], '  Verification: ' + item['verification'],
                          '  Available locally: ' + display(item['retained'])])
        if not detail.get('artifacts'):
            lines.append('No retained artifact files were recorded in this receipt.')
        if detail.get('reason'):
            lines.append(detail['reason'])
        lines.extend(['', 'Deliberate omissions and unknowns', *['- ' + item for item in detail['omissions']], ''])
        return {'filename': 'honeytrace-custody-' + case_id[:8] + '.txt', 'text': '\n'.join(lines)}

    def artifact(self, case_id, artifact_id):
        _id(artifact_id)
        _, record, _, _ = self._load(case_id)
        _require(record is not None, 'No retained custody artifacts were recorded')
        item = next((item for item in record['artifacts'] if item['id'] == artifact_id), None)
        _require(item is not None, 'Choose a retained artifact in this case')
        return self._artifact_bytes(item), item['name']

    def session_evidence(self, case_id):
        """Read bounded retained selections; captured text remains data, never instructions."""
        try:
            _, record, _, _ = self._load(case_id)
            if record is None or not any(item['name'] == 'session.jsonl' for item in record['artifacts']):
                return None
            files = {item['name']: self._artifact_bytes(item) for item in record['artifacts']
                     if item['name'] != 'capture.pcap'}
            rows = parse_jsonl(files['session.jsonl'], 500)
            transcript = parse_json(files['transcript.json'])
            provenance = parse_json(files['session-provenance.json'])
            _require(isinstance(transcript, dict) and isinstance(transcript.get('commands'), list) and
                     len(transcript['commands']) <= 500 and isinstance(provenance, dict) and
                     provenance.get('selected_log_sha256') == _sha(files['session.jsonl']))
            events = {row.get('event_id'): row for row in rows if isinstance(row.get('event_id'), str)}
            references = {item.get('event_id'): item for item in provenance.get('records', [])
                          if isinstance(item, dict) and isinstance(item.get('event_id'), str)}
            commands = []
            for item in transcript['commands']:
                _require(isinstance(item, dict) and isinstance(item.get('reference'), dict))
                reference = item['reference']
                event = events.get(reference.get('event_id'))
                _require(event is not None and isinstance(item.get('command'), str) and
                         len(item['command']) <= 8192 and item['command'] == event.get('command') and
                         reference == references.get(reference.get('event_id')))
                commands.append({'command': item['command'], 'timestamp': _text(item.get('timestamp'), 40),
                    'assessment': 'Observed emulated shell input; real-host execution is unknown.',
                    'reference': _projection(reference, ('event_id', 'source', 'line', 'byte_offset', 'byte_length', 'record_sha256'))})
            capture = _capture(provenance.get('capture', record['context'].get('capture')))
            public_provenance = {'selected_log_sha256': _sha(files['session.jsonl']),
                'source_clock': 'normalized_sensor_time_unverified', 'raw_refs_followed': False,
                'reference_verification': 'Retained acquisition declarations; original source log bytes were not reopened.',
                'synthetic': record['context'].get('synthetic') is True,
                'records': [_projection(item, ('event_id', 'source', 'line', 'byte_offset', 'byte_length', 'record_sha256'))
                            for item in references.values()],
                'omissions': ['Raw source paths and private acquisition metadata are withheld from this view.']}
            return {'status': 'available', 'summary': _session(record['context']),
                    'transcript': {'commands': commands, 'limitations': [
                        'Structured passwords are withheld; command text can still contain sensitive values.',
                        'Source record locators are retained acquisition declarations; original log bytes were not reverified.',
                        'A bounded selection is not a complete session.']},
                    'capture': capture, 'provenance': public_provenance}
        except (OSError, Phase10Error, KeyError, TypeError, ValueError, AttributeError):
            return {'status': 'unavailable', 'summary': {}, 'transcript': {'commands': [],
                    'limitations': ['Retained session evidence is unavailable or inconsistent.']},
                    'capture': {'status': 'unknown'}, 'provenance': {'omissions': ['Session evidence could not be verified.']}}
