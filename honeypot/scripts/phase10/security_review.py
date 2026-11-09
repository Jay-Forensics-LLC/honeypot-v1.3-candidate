"""Scoped assessment review; operator decisions never rewrite source evidence."""
from contextlib import contextmanager
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import stat
from urllib.parse import urlsplit

from .io import parse_json
from .model import Phase10Error, in_scope, normalize_indicator, timestamp

STATUSES = ('unreviewed', 'in_review', 'resolved', 'accepted_risk', 'false_positive')
PRIORITIES = ('high', 'normal', 'routine', 'collection_issue', 'informational')
MAX_SELECTED_BYTES = 32 * 1024**2
MAX_SELECTED_RECORDS = 20000
MAX_DECISIONS = 10000
MAX_DECISION_BYTES = 4 * 1024**2
_HASH = re.compile(r'[a-f0-9]{64}')
_DIRECTORY = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
_DEFAULTS = {'query': '', 'asset_id': None, 'status': 'all', 'offset': 0, 'limit': 50}
_STEPS = ['Confirm the target and collection time are relevant to the approved assessment.',
          'Inspect the retained report and source references before accepting its interpretation.',
          'Compare the observation with the intended service configuration and applicable vendor guidance.',
          'Record your review decision; perform any verification or changes through an authorized workflow.']


def _require(condition, message='Invalid security review input'):
    if not condition:
        raise Phase10Error(message)


def _id(value):
    _require(isinstance(value, str) and _HASH.fullmatch(value), 'Choose an existing review record')
    return value


def _text(value, maximum):
    _require(isinstance(value, str) and len(value) <= maximum and
             all(ord(char) >= 32 and ord(char) != 127 for char in value), 'Use bounded plain text')
    return value.strip()


def _note(value):
    _require(isinstance(value, str), 'Use a bounded review note')
    value = value.replace('\r\n', '\n')
    _require(len(value) <= 512 and all(char == '\n' or ord(char) >= 32 and ord(char) != 127
                                      for char in value), 'Use a review note without control characters')
    return value.strip()


def _digest(value):
    return hashlib.sha256(json.dumps(value, separators=(',', ':'), ensure_ascii=True).encode()).hexdigest()


def _asset(row):
    kind, value = row['indicator_type'], row['indicator_value']
    if kind == 'url':
        value = urlsplit(value).hostname
        try:
            kind, value = normalize_indicator('ip', value)
        except Phase10Error:
            kind, value = normalize_indicator('domain', value)
    _require(kind in ('ip', 'domain'), 'This observation has no supported asset identity')
    return normalize_indicator(kind, value)


def _priority(row):
    details = row.get('details', {})
    if row['assessment'] == 'scan_error':
        return 'collection_issue', 'collection_error'
    if row['source_tool'] == 'nuclei':
        if row['assessment'] != 'possible':
            return 'informational', 'informational_observation'
        severity = details.get('severity')
        if severity in ('critical', 'high'):
            return 'high', 'reported_high_severity'
        if severity == 'medium':
            return 'normal', 'reported_medium_severity'
        return 'routine', 'reported_low_or_unknown_severity'
    state = details.get('status')
    if state == 'open':
        return 'normal', 'open_service_observed'
    if state in ('open|filtered', 'closed|filtered', 'filtered', 'unfiltered', 'unknown'):
        return 'routine', 'service_state_uncertain'
    return 'informational', 'service_state_observed' if details.get('ports') else 'host_status_observed'


class ReviewWorkspace:
    def __init__(self, store, decisions_path):
        self.store = store
        self.path = Path(decisions_path).absolute()
        _require('..' not in self.path.parts and self.path.name not in ('', '.', '..'),
                 'Unsupported review decisions path')

    def _reason(self):
        policy = self.store.policy
        if not policy.enabled:
            return 'offline_imports_disabled'
        if not policy.assessment_approved:
            return 'assessment_not_approved'
        if not policy.scope:
            return 'scope_required'
        if not set(policy.plugins) & {'nmap', 'nuclei'}:
            return 'assessment_modules_disabled'
        return None

    def imports(self):
        reason = self._reason()
        return {'available': reason is None, 'reason': reason, 'imports': [] if reason else [
            {key: row[key] for key in ('import_id', 'plugin_id', 'imported_at', 'scope')} |
            {'records': row['normalized']['records']}
            for row in self.store.manifests()
            if row['plugin_id'] in ('nmap', 'nuclei') and row['plugin_id'] in self.store.policy.plugins]}

    @contextmanager
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
                     'Review decisions directory must be private and operator-owned')
            fcntl.flock(descriptor, (fcntl.LOCK_EX if create else fcntl.LOCK_SH) | fcntl.LOCK_NB)
            yield descriptor
        finally:
            os.close(descriptor)

    def _read(self, parent):
        try:
            descriptor = os.open(self.path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK |
                                 os.O_CLOEXEC, dir_fd=parent)
        except FileNotFoundError:
            return {}
        try:
            before = os.fstat(descriptor)
            _require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and
                     before.st_uid == os.geteuid() and not before.st_mode & 0o077 and
                     0 < before.st_size <= MAX_DECISION_BYTES, 'Unsupported review decisions file')
            with os.fdopen(descriptor, 'rb', closefd=False) as stream:
                raw = stream.read(MAX_DECISION_BYTES + 1)
            signature = lambda info: (info.st_dev, info.st_ino, info.st_mode, info.st_nlink,
                                      info.st_size, info.st_mtime_ns, info.st_ctime_ns)
            _require(len(raw) == before.st_size and signature(before) == signature(os.fstat(descriptor)) ==
                     signature(os.stat(self.path.name, dir_fd=parent, follow_symlinks=False)),
                     'Review decisions changed during read')
            data = parse_json(raw)
            _require(isinstance(data, dict) and set(data) == {'schema_version', 'decisions'} and
                     type(data['schema_version']) is int and data['schema_version'] == 1 and
                     isinstance(data['decisions'], dict) and len(data['decisions']) <= MAX_DECISIONS,
                     'Invalid saved review decisions')
            for identity, row in data['decisions'].items():
                _id(identity)
                _require(isinstance(row, dict) and set(row) ==
                         {'import_id', 'finding_id', 'status', 'note', 'updated_at'})
                _require(identity == _digest(['review/v1', _id(row['import_id']), _id(row['finding_id'])]) and
                         row['status'] in STATUSES and _note(row['note']) == row['note'] and
                         timestamp(row['updated_at']) == row['updated_at'], 'Invalid saved review decision')
            return data['decisions']
        finally:
            os.close(descriptor)

    def _decisions(self):
        try:
            with self._parent() as parent:
                return self._read(parent)
        except FileNotFoundError:
            return {}

    def _write(self, parent, decisions):
        raw = (json.dumps({'schema_version': 1, 'decisions': decisions}, ensure_ascii=True,
                          separators=(',', ':'), allow_nan=False) + '\n').encode()
        _require(len(decisions) <= MAX_DECISIONS and len(raw) <= MAX_DECISION_BYTES,
                 'Review decisions are full')
        temporary = '.review-' + secrets.token_hex(16)
        created = False
        try:
            descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW |
                                 os.O_CLOEXEC, 0o600, dir_fd=parent)
            created = True
            with os.fdopen(descriptor, 'wb') as stream:
                stream.write(raw)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.path.name, src_dir_fd=parent, dst_dir_fd=parent)
            os.fsync(parent)
        finally:
            if created:
                try:
                    os.unlink(temporary, dir_fd=parent)
                except FileNotFoundError:
                    pass

    def _select(self, identifiers):
        _require(self._reason() is None, 'Enable assessment modules, approval and target scope in Settings')
        _require(isinstance(identifiers, list) and 1 <= len(identifiers) <= 20 and
                 all(isinstance(value, str) and _HASH.fullmatch(value) for value in identifiers) and
                 len(set(identifiers)) == len(identifiers), 'Select one to twenty assessment reports')
        sources, items, total_bytes, total_records, excluded = [], [], 0, 0, 0
        for identifier in sorted(identifiers):
            imported = self.store.read_import(identifier)
            manifest = imported['manifest']
            _require(manifest['plugin_id'] in ('nmap', 'nuclei'), 'Select Nmap or Nuclei reports')
            total_bytes += manifest['normalized']['bytes']
            total_records += len(imported['findings'])
            _require(total_bytes <= MAX_SELECTED_BYTES and total_records <= MAX_SELECTED_RECORDS,
                     'Select fewer reports to stay within the review workspace bounds')
            sources.append({key: manifest[key] for key in
                            ('import_id', 'plugin_id', 'imported_at', 'scope', 'raw_source_hash')} |
                           {'records': len(imported['findings'])})
            for row in imported['findings']:
                kind, value = _asset(row)
                if not (in_scope(kind, value, self.store.policy.scope) and in_scope(kind, value, manifest['scope'])):
                    excluded += 1
                    continue
                priority, reason = _priority(row)
                items.append({'review_id': _digest(['review/v1', identifier, row['finding_id']]),
                              'import_id': identifier, 'asset_id': _digest(['asset/v1', kind, value]),
                              'priority': priority, 'reason_code': reason, 'source': row,
                              'asset': {'kind': kind, 'value': value}, 'review_steps': _STEPS})
        return sources, items, excluded

    def _build(self, identifiers):
        sources, items, excluded = self._select(identifiers)
        decisions, assets = self._decisions(), {}
        for item in items:
            saved = decisions.get(item['review_id'], {})
            item['triage'] = {key: saved.get(key, default) for key, default in
                              (('status', 'unreviewed'), ('note', ''), ('updated_at', None))}
            item['needs_attention'] = item['triage']['status'] in ('unreviewed', 'in_review')
            asset = assets.setdefault(item['asset_id'], {'asset_id': item['asset_id'], **item['asset'],
                                      'priority': item['priority'], 'open_reviews': 0, 'source_tools': [], 'observations': 0})
            if PRIORITIES.index(item['priority']) < PRIORITIES.index(asset['priority']):
                asset['priority'] = item['priority']
            asset['observations'] += 1
            asset['open_reviews'] += item['needs_attention']
            if item['source']['source_tool'] not in asset['source_tools']:
                asset['source_tools'].append(item['source']['source_tool'])
        items.sort(key=lambda item: (PRIORITIES.index(item['priority']), item['asset_id'], item['review_id']))
        return {'selection_id': _digest(['selection/v1', sorted(identifiers)]), 'complete': True,
                'counts': {'selected_imports': len(sources), 'observations': len(items), 'assets': len(assets),
                           'excluded_scope': excluded, 'open_reviews': sum(item['needs_attention'] for item in items),
                           'high_priority': sum(item['priority'] == 'high' and item['needs_attention'] for item in items)},
                'assets': sorted(assets.values(), key=lambda item: (PRIORITIES.index(item['priority']), item['kind'], item['value'])),
                'items': items, 'sources': sources}

    def view(self, row):
        _require(isinstance(row, dict) and 'import_ids' in row and not set(row) - {'import_ids'} - set(_DEFAULTS))
        filters = _DEFAULTS | {key: value for key, value in row.items() if key != 'import_ids'}
        query = _text(filters['query'], 256).casefold()
        _require(filters['asset_id'] is None or isinstance(filters['asset_id'], str) and _HASH.fullmatch(filters['asset_id']))
        _require(filters['status'] in ('all',) + STATUSES and type(filters['offset']) is int and
                 0 <= filters['offset'] <= MAX_SELECTED_RECORDS and type(filters['limit']) is int and
                 1 <= filters['limit'] <= 100, 'Invalid review filters or page')
        result = self._build(row['import_ids'])
        items = [item for item in result['items'] if
                 (filters['asset_id'] is None or item['asset_id'] == filters['asset_id']) and
                 (filters['status'] == 'all' or item['triage']['status'] == filters['status']) and
                 query in json.dumps([item['source'], item['asset'], item['triage']], ensure_ascii=False).casefold()]
        offset, limit = filters['offset'], filters['limit']
        return result | {'items': items[offset:offset + limit],
                         'pagination': {'offset': offset, 'limit': limit, 'total': len(items)}}

    def triage(self, row):
        _require(isinstance(row, dict) and set(row) == {'import_id', 'finding_id', 'status', 'note'})
        _id(row['finding_id'])
        _require(row['status'] in STATUSES, 'Choose a supported review decision')
        note = _note(row['note'])
        _, items, _ = self._select([row['import_id']])
        item = next((item for item in items if item['source']['finding_id'] == row['finding_id']), None)
        _require(item is not None, 'Choose a finding inside the current approved scope')
        with self._parent(create=True) as parent:
            decisions = self._read(parent)
            saved = {'import_id': row['import_id'], 'finding_id': row['finding_id'], 'status': row['status'],
                     'note': note, 'updated_at': dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00', 'Z')}
            decisions[item['review_id']] = saved
            self._write(parent, decisions)
        return {'review_id': item['review_id'], 'triage': {key: saved[key] for key in ('status', 'note', 'updated_at')}}

    def report(self, row):
        _require(isinstance(row, dict) and set(row) == {'import_ids'})
        return {'schema_version': 1, 'report_type': 'honeytrace.security-review',
                'generated_at': dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00', 'Z'),
                'approved_scope': list(self.store.policy.scope),
                'limitations': ['Source severity determines review order, not likelihood of compromise.',
                                'Exact host grouping does not establish ownership or resolve DNS identity.',
                                'Operator decisions are review records, not verification of remediation.',
                                'Checksums establish consistency with retained reports, not authenticity.'],
                **self._build(row['import_ids'])}
