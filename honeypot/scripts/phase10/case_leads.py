"""Bounded derivative lead support and local review; originals remain unchanged."""
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

from .io import parse_json, parse_jsonl
from .model import Phase10Error, timestamp
from .sentinel import _shape

STATUSES = ('unreviewed', 'in_review', 'false_positive', 'reviewed')
MAX_SUPPORT_RECORDS = 100
MAX_SUPPORT_BYTES = 256 * 1024
MAX_CASE_SUPPORT_BYTES = 2 * 1024**2
MAX_REVIEW_BYTES = 4 * 1024**2
MAX_REVISIONS = 10000
AUTHORSHIP_STATEMENT = ('Checksums establish consistency with the supplied references. They do not prove '
                        'authorship, authenticity, capture origin, or the correctness of an interpretation.')
EXPORT_OMISSIONS = ['Original capture and log bytes', 'Exact source identifiers and original paths',
                    'Private index, pseudonym key and private diagnostics',
                    'Encrypted content and unsupported data remain unexamined',
                    'Supporting records beyond the explicit sample limits']
REVIEW_LIMITATION = ('Operator review is derivative state. Local revision checks detect inconsistency '
                     'against the saved history; they do not authenticate an operator or prevent replacement or rollback.')
_HASH = re.compile(r'[a-f0-9]{64}')
_LABEL = re.compile(r'p_[a-f0-9]{32}')
_DIRECTORY = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
_DEFAULTS = {'window_seconds': 60, 'syn_minimum': 10, 'port_minimum': 10,
             'dns_label_minimum': 50, 'dns_minimum_questions': 5, 'mapping_minimum_conflicts': 1}
_RULES = {
    'repeated_syn': ('Repeated TCP SYN-without-ACK packets to one destination and port.',
                     ['Retransmissions after packet loss', 'Authorized availability monitoring',
                      'A busy client reconnecting'],
                     ['Counts packets, not distinct attempts or completed sessions.',
                      'Partial capture and fixed window boundaries can change the observed pattern.']),
    'destination_ports': ('A source contacts many destination TCP ports on one address in one window.',
                          ['Authorized inventory or security tooling', 'Service discovery',
                           'An application using many services'],
                          ['Observed ports do not establish intent.', 'Missing packets and fixed windows can hide a pattern.']),
    'dns_long_labels': ('Repeated complete DNS questions containing a long label.',
                        ['CDN cache keys', 'Anti-abuse tokens', 'Legitimate telemetry and tracking domains'],
                        ['Label length does not prove tunneling or exfiltration.',
                         'Encrypted DNS and split TCP messages are not evaluated.']),
    'conflicting_mappings': ('Different MAC address statements for one IP overlap in one context.',
                             ['Proxy ARP', 'DHCP reassignment or revocation', 'Virtual IP failover', 'Clock errors'],
                             ['Address statements are not authenticated ownership.',
                              'No persistent device identity or cross-network conflict is inferred.'])}


def _require(condition, message='Invalid local case review'):
    if not condition:
        raise Phase10Error(message)


def _canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True,
                      allow_nan=False).encode()


def _integer(value, low=0, high=2**63 - 1):
    return type(value) is int and low <= value <= high


def _label(value):
    return isinstance(value, str) and _LABEL.fullmatch(value) is not None


def _note(value):
    _require(isinstance(value, str), 'Use a bounded review note')
    value = value.replace('\r\n', '\n')
    _require(len(value) <= 512 and all(char == '\n' or 32 <= ord(char) != 127 for char in value),
             'Use a review note without control characters')
    return value.strip()


class _Decisions:
    """Private atomic history, serialized across processes by its directory lock."""

    def __init__(self, path):
        self.path = Path(path).absolute()
        _require('..' not in self.path.parts and self.path.name not in ('', '.', '..'))

    @contextmanager
    def parent(self, create=False):
        fd = os.open(self.path.anchor, _DIRECTORY)
        try:
            for part in self.path.parent.parts[1:]:
                try:
                    child = os.open(part, _DIRECTORY, dir_fd=fd)
                except FileNotFoundError:
                    if not create:
                        raise
                    try:
                        os.mkdir(part, 0o700, dir_fd=fd)
                    except FileExistsError:
                        pass
                    child = os.open(part, _DIRECTORY, dir_fd=fd)
                os.close(fd)
                fd = child
            info = os.fstat(fd)
            _require(info.st_uid == os.geteuid() and not info.st_mode & 0o077,
                     'Case review directory must be private and operator-owned')
            fcntl.flock(fd, (fcntl.LOCK_EX if create else fcntl.LOCK_SH) | fcntl.LOCK_NB)
            yield fd
        finally:
            os.close(fd)

    def read(self, parent):
        try:
            fd = os.open(self.path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK |
                         os.O_CLOEXEC, dir_fd=parent)
        except FileNotFoundError:
            return []
        try:
            before = os.fstat(fd)
            _require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and
                     before.st_uid == os.geteuid() and not before.st_mode & 0o077 and
                     0 < before.st_size <= MAX_REVIEW_BYTES, 'Unsupported case review history')
            with os.fdopen(fd, 'rb', closefd=False) as stream:
                raw = stream.read(MAX_REVIEW_BYTES + 1)
            signature = lambda item: (item.st_dev, item.st_ino, item.st_mode, item.st_nlink,
                                      item.st_size, item.st_mtime_ns, item.st_ctime_ns)
            _require(len(raw) == before.st_size and signature(before) == signature(os.fstat(fd)) ==
                     signature(os.stat(self.path.name, dir_fd=parent, follow_symlinks=False)),
                     'Case review history changed during read')
            document = parse_json(raw)
            _require(isinstance(document, dict) and set(document) == {'schema_version', 'events'} and
                     type(document['schema_version']) is int and document['schema_version'] == 1 and
                     isinstance(document['events'], list) and len(document['events']) <= MAX_REVISIONS)
            previous = None
            for revision, event in enumerate(document['events'], 1):
                _require(isinstance(event, dict) and set(event) == {'case_id', 'finding_id', 'status',
                         'note', 'updated_at', 'revision', 'previous_sha256', 'event_sha256'})
                _require(all(isinstance(event[key], str) and _HASH.fullmatch(event[key])
                             for key in ('case_id', 'finding_id', 'event_sha256')) and
                         event['status'] in STATUSES and _note(event['note']) == event['note'] and
                         timestamp(event['updated_at']) == event['updated_at'] and
                         type(event['revision']) is int and event['revision'] == revision and
                         event['previous_sha256'] == previous)
                content = {key: value for key, value in event.items() if key != 'event_sha256'}
                _require(hashlib.sha256(_canonical(content)).hexdigest() == event['event_sha256'],
                         'Case review revision digest mismatch')
                previous = event['event_sha256']
            return document['events']
        finally:
            os.close(fd)

    def events(self):
        try:
            with self.parent() as parent:
                return self.read(parent)
        except FileNotFoundError:
            return []

    def append(self, values):
        with self.parent(create=True) as parent:
            events = self.read(parent)
            _require(len(events) < MAX_REVISIONS, 'Case review history is full')
            event = {**values, 'revision': len(events) + 1,
                     'previous_sha256': events[-1]['event_sha256'] if events else None}
            event['event_sha256'] = hashlib.sha256(_canonical(event)).hexdigest()
            raw = _canonical({'schema_version': 1, 'events': [*events, event]}) + b'\n'
            _require(len(raw) <= MAX_REVIEW_BYTES, 'Case review history is full')
            temporary = '.case-review-' + secrets.token_hex(16)
            created = False
            try:
                fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW |
                             os.O_CLOEXEC, 0o600, dir_fd=parent)
                created = True
                with os.fdopen(fd, 'wb') as stream:
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
            return event


def _review(case_id, findings, decision_path):
    available, reason, events = decision_path is not None, None, []
    if available:
        try:
            events = _Decisions(decision_path).events()
        except (OSError, Phase10Error):
            available, reason = False, 'decisions_unavailable'
    else:
        reason = 'not_configured'
    identifiers = {row['finding_id'] for row in findings}
    history = [event for event in events if event['case_id'] == case_id and event['finding_id'] in identifiers]
    latest = {event['finding_id']: event for event in history}
    items = []
    for row in findings:
        event = latest.get(row['finding_id'])
        items.append({'finding_id': row['finding_id'], **({key: event[key] for key in
                      ('status', 'note', 'updated_at', 'revision')} if event else
                     {'status': 'unreviewed', 'note': '', 'updated_at': None, 'revision': None})})
    return {'decisions_available': available, 'reason': reason, 'items': items,
            'history': history, 'limitations': [REVIEW_LIMITATION]}


def save_case_review(store, decision_path, row):
    """Save one operator action, after verifying a real lead in the selected case."""
    from .cases import _case
    _require(decision_path is not None, 'Case review storage is not configured')
    _require(isinstance(row, dict) and {'case_id', 'finding_id', 'status'} <= set(row) <=
             {'case_id', 'finding_id', 'status', 'note'}, 'Unsupported case review fields')
    _require(all(isinstance(row[key], str) and _HASH.fullmatch(row[key])
                 for key in ('case_id', 'finding_id')) and row['status'] in STATUSES)
    _, records = _case(store, row['case_id'])
    _require(any(item['finding_id'] == row['finding_id'] and
                 item['details']['metrics']['entity'] == 'finding' for item in records),
             'Choose a review lead in this case')
    event = _Decisions(decision_path).append({
        'case_id': row['case_id'], 'finding_id': row['finding_id'], 'status': row['status'],
        'note': _note(row.get('note', '')),
        'updated_at': dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00', 'Z')})
    return {key: event[key] for key in ('case_id', 'finding_id', 'status', 'note', 'updated_at', 'revision')}


def _configuration(case):
    supplied = case.get('configuration', {}).get('rules', {})
    _require(isinstance(supplied, dict) and not set(supplied) - set(_DEFAULTS))
    config = _DEFAULTS | supplied
    _require(all(_integer(value, 1, 10**6) for value in config.values()) and
             config['dns_label_minimum'] <= 63 and config['mapping_minimum_conflicts'] == 1)
    return config


def _evaluation(rule, metrics, config):
    keys, minimum = {
        'repeated_syn': (('window_seconds', 'syn_minimum'), config['syn_minimum']),
        'destination_ports': (('window_seconds', 'port_minimum'), config['port_minimum']),
        'dns_long_labels': (('window_seconds', 'dns_label_minimum', 'dns_minimum_questions'), config['dns_minimum_questions']),
        'conflicting_mappings': (('mapping_minimum_conflicts',), 2)}[rule]
    value = metrics.get('evaluation')
    _require(isinstance(value, dict) and set(value) == {'required_coverage', 'minimum_sample_size', 'sample_unit', 'thresholds'} and
             type(value['minimum_sample_size']) is int and value['minimum_sample_size'] == minimum and
             isinstance(value['thresholds'], dict) and set(value['thresholds']) == set(keys) and
             all(type(value['thresholds'][key]) is int and value['thresholds'][key] == config[key] for key in keys))


def _indexes(exchange, rows, config):
    observed = {row['details']['provenance']['occurrence_id']: row for row in rows
                if row['details']['metrics']['entity'] == 'observation'}
    timeline = {row['details']['provenance']['occurrence_id']: row['details']['metrics']['adjusted_utc_ns']
                for row in rows if row['details']['metrics']['entity'] == 'timeline'}
    packets, dns, associations = {}, {}, {}
    window = config['window_seconds'] * 10**9
    for entity, ident, payload in exchange:
        if entity == 'association':
            associations[payload['id']] = payload
        if entity != 'observation' or ident not in observed:
            continue
        saved = observed[ident]
        provenance = saved['details']['provenance']
        _require(payload['source_id'] == provenance['source_id'] and str(payload['ordinal']) == provenance['ordinal'])
        instant = timeline.get(ident)
        if instant is None:
            continue
        data, context, bucket = payload['data'], payload['context'], int(instant) // window
        if ident.startswith('packet:') and payload['kind'] == 'network.tcp' and payload['protocol'] == 'tcp':
            if (all(_label(data.get(key)) for key in ('src', 'dst')) and
                    _integer(data.get('tcp_flags'), 0, 511) and _integer(data.get('dport'), 0, 65535) and
                    data['tcp_flags'] & 2 and not data['tcp_flags'] & 16):
                key = context, data['src'], data['dst'], bucket
                packets.setdefault(key, []).append((int(ident.split(':')[1]), data['dport'], saved))
        if ident.startswith('observation:') and payload['kind'] == 'dns.question':
            labels = data.get('label_lengths')
            if (data.get('response') is False and isinstance(labels, list) and
                    all(_integer(length, 0, 63) for length in labels)):
                dns.setdefault((context, bucket), []).append((int(ident.split(':')[1]), max(labels, default=0), saved))
    return packets, dns, associations, observed


def _resolve(payload, indexes, config):
    rule, evidence, metrics = payload['rule'], payload['evidence'], payload['metrics']
    _evaluation(rule, metrics, config)
    packets, dns, associations, observed = indexes
    if rule in ('repeated_syn', 'destination_ports'):
        _require(set(evidence) - {'reproduction'} == {'first_packet', 'last_packet', 'selector'} and
                 all(_integer(evidence[key], 1) for key in ('first_packet', 'last_packet')))
        selector = evidence['selector']
        _require(isinstance(selector, dict) and set(selector) == {'table', 'context', 'src', 'dst', 'bucket', 'dport'} and
                 selector['table'] == 'rule_packets' and selector['context'] == payload['context'] and
                 all(_label(selector[key]) for key in ('context', 'src', 'dst')) and
                 _integer(selector['bucket'], -(2**63)))
        _require(set(metrics) == {'eligible_count', 'window_bucket', 'src', 'dst', 'evaluation'} and
                 _integer(metrics['eligible_count'], 1) and type(metrics['window_bucket']) is int and
                 metrics['window_bucket'] == selector['bucket'] and
                 all(metrics[key] == selector[key] for key in ('src', 'dst')))
        candidates = packets.get(tuple(selector[key] for key in ('context', 'src', 'dst', 'bucket')), [])
        if rule == 'repeated_syn':
            _require(_integer(selector['dport'], 0, 65535))
            candidates = [item for item in candidates if item[1] == selector['dport']]
            count, minimum = len(candidates), config['syn_minimum']
        else:
            _require(selector['dport'] is None)
            count, minimum = len({item[1] for item in candidates}), config['port_minimum']
        _require(candidates and count == metrics['eligible_count'] and count >= minimum and
                 min(item[0] for item in candidates) == evidence['first_packet'] and
                 max(item[0] for item in candidates) == evidence['last_packet'])
    elif rule == 'dns_long_labels':
        _require(set(evidence) - {'reproduction'} == {'first_observation', 'last_observation', 'selector'} and
                 all(_integer(evidence[key], 1) for key in ('first_observation', 'last_observation')))
        selector = evidence['selector']
        _require(isinstance(selector, dict) and set(selector) == {'table', 'context', 'bucket', 'minimum_label_length'} and
                 selector['table'] == 'rule_dns' and selector['context'] == payload['context'] and
                 _label(selector['context']) and _integer(selector['bucket'], -(2**63)) and
                 type(selector['minimum_label_length']) is int and selector['minimum_label_length'] == config['dns_label_minimum'])
        _require(set(metrics) == {'questions', 'long_label_questions', 'window_bucket', 'evaluation'} and
                 all(_integer(metrics[key], 1) for key in ('questions', 'long_label_questions')) and
                 type(metrics['window_bucket']) is int and metrics['window_bucket'] == selector['bucket'])
        questions = dns.get((selector['context'], selector['bucket']), [])
        candidates = [item for item in questions if item[1] >= selector['minimum_label_length']]
        _require(candidates and len(questions) == metrics['questions'] and
                 len(candidates) == metrics['long_label_questions'] and len(candidates) >= config['dns_minimum_questions'] and
                 min(item[0] for item in questions) == evidence['first_observation'] and
                 max(item[0] for item in questions) == evidence['last_observation'])
    else:
        _require(set(metrics) == {'conflicts', 'evaluation'} and type(metrics['conflicts']) is int and metrics['conflicts'] == 1 and
                 set(evidence) - {'reproduction'} == {'conflict', 'associations'} and _integer(evidence['conflict'], 1))
        references = evidence['associations']
        _require(isinstance(references, list) and len(references) == 2 and
                 all(_integer(value, 1) for value in references) and len(set(references)) == 2)
        pair = [associations.get(value) for value in references]
        _require(all(isinstance(value, dict) and value['context'] == payload['context'] and
                     value['left_type'] == 'ip' and value['right_type'] == 'mac' and
                     all(_integer(conflict, 1) for conflict in value['conflicts']) and
                     evidence['conflict'] in value['conflicts'] and
                     _integer(value['start_ns'], -(2**63)) and _integer(value['end_ns'], -(2**63)) and
                     value['end_ns'] >= value['start_ns'] for value in pair))
        overlap = max(value['start_ns'] for value in pair)
        _require(pair[0]['left_value'] == pair[1]['left_value'] and pair[0]['right_value'] != pair[1]['right_value'] and
                 all(value['start_ns'] <= overlap and (overlap < value['end_ns'] or
                     overlap == value['start_ns'] == value['end_ns']) for value in pair))
        candidates = []
        for association in pair:
            ident = 'observation:' + str(association['evidence_id'])
            _require(ident in observed)
            saved = observed[ident]
            metadata = saved['details']['metrics']
            fields = ('assigned_ip', 'client_mac') if metadata['kind'] == 'dhcp.message' else ('address', 'mac')
            identifiers = metadata.get('identifiers', {})
            _require(metadata['kind'] in ('arp.mapping', 'ndp.mapping', 'dhcp.message') and
                     metadata['context'] == association['context'] and
                     identifiers.get(fields[0]) == association['left_value'] and
                     identifiers.get(fields[1]) == association['right_value'])
            candidates.append((association['evidence_id'], 0, saved))
    return [item[2] for item in sorted(candidates, key=lambda item: item[0])]


def case_lead_details(store, summary, rows, decision_path=None):
    """Join only recognized selectors to unchanged, same-case normalized records."""
    findings = [row for row in rows if row['details']['metrics']['entity'] == 'finding']
    review = _review(summary['case_id'], findings, decision_path)
    decisions = {item['finding_id']: item for item in review['items']}
    exchange, indexes, config = [], None, None
    if findings:
        raw = store._read_verified_original(summary['case_id'])
        try:
            exchange = [_shape(row) for row in parse_jsonl(raw, store.policy.max_records)]
            config = _configuration(exchange[0][2])
            indexes = _indexes(exchange, rows, config)
        except (Phase10Error, KeyError, TypeError, ValueError, IndexError):
            pass
    payloads = {ident: payload for entity, ident, payload in exchange if entity == 'finding'}
    result, remaining = [], MAX_CASE_SUPPORT_BYTES
    for row in findings:
        metrics, provenance = row['details']['metrics'], row['details']['provenance']
        rule, version = metrics['rule'], metrics['rule_version']
        known = rule in _RULES and version == '1.0.0'
        description, alternatives, limitations = _RULES[rule] if known else (
            'This rule has no supported local explanation or selector schema.', [],
            ['Original finding remains preserved; supporting records are unavailable in this view.'])
        support = {'status': 'unavailable', 'records': [], 'returned_records': 0,
                   'total_matching_records': None, 'truncated': False,
                   'reason': 'unsupported_rule' if not known else 'invalid_selector_or_reference'}
        payload = payloads.get(provenance['occurrence_id'])
        evaluation, pattern_metrics = None, {}
        if known and indexes is not None and payload is not None:
            try:
                _require(payload['rule'] == rule and payload['rule_version'] == version)
                matched = _resolve(payload, indexes, config)
                evaluation = {key: payload['metrics']['evaluation'][key] for key in
                              ('minimum_sample_size', 'thresholds')}
                count_fields = {
                    'repeated_syn': {'syn_packets': 'eligible_count'},
                    'destination_ports': {'distinct_destination_ports': 'eligible_count'},
                    'dns_long_labels': {'questions': 'questions', 'long_label_questions': 'long_label_questions'},
                    'conflicting_mappings': {'conflicts': 'conflicts'}}[rule]
                pattern_metrics = {label: payload['metrics'][key] for label, key in count_fields.items()}
                used, selected = 0, []
                for item in matched:
                    size = len(_canonical(item))
                    if len(selected) >= MAX_SUPPORT_RECORDS or used + size > min(MAX_SUPPORT_BYTES, remaining):
                        break
                    selected.append(item)
                    used += size
                remaining -= used
                truncated = len(selected) < len(matched)
                support = {'status': 'partial' if truncated else 'resolved', 'records': selected,
                           'returned_records': len(selected), 'total_matching_records': len(matched),
                           'truncated': truncated, 'reason': 'sample_limit' if truncated else None}
            except (Phase10Error, KeyError, TypeError, ValueError, IndexError):
                pass
        result.append({'finding_id': row['finding_id'], 'rule': rule, 'rule_version': version,
                       'explanation': description, 'alternatives': list(alternatives),
                       'evaluation': evaluation, 'pattern_metrics': pattern_metrics,
                       'limitations': [*limitations, 'Supporting rows are imported metadata; original capture or log bytes are not reopened.'],
                       'support': support, 'review': decisions[row['finding_id']]})
    return result, review
