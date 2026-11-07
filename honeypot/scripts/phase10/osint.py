"""Pure, bounded adapters for offline OSINT exports; relationships imply no ownership."""
import csv
import datetime as dt
import io
import json
import math
import re

from .io import parse_json, parse_jsonl, parse_xml
from .model import MAX_BYTES, MAX_RECORDS, Phase10Error, make_finding, normalize_indicator


def _key(value):
    return re.sub(r'[^a-z0-9]', '', str(value).lower())


_TYPES = {
    'ip': 'ip', 'ipaddress': 'ip', 'ipv4address': 'ip', 'ipv6address': 'ip',
    'domain': 'domain', 'domainname': 'domain', 'dnsname': 'domain',
    'internetname': 'domain', 'internetnameunresolved': 'domain',
    'affiliateinternetname': 'domain', 'cohostedsite': 'domain',
    'cohostedsitedomain': 'domain', 'url': 'url', 'urlunverified': 'url',
    'linkedurlinternal': 'url', 'linkedurlexternal': 'url',
    'email': 'email', 'emailaddr': 'email', 'emailaddress': 'email',
    'affiliateemailaddr': 'email', 'file': 'file', 'other': 'other',
}
_COHOST = {'cohostedsite', 'cohostedsitedomain'}
_HEADERS = {
    'type': ('type', 'eventtype', 'eventname'),
    'value': ('data', 'value', 'indicator', 'indicatorvalue'),
    'id': ('id', 'eventid', 'recordid'),
    'time': ('updated', 'timestamp', 'collectedat', 'time'),
    'source': ('source', 'sourcedata', 'parentdata'),
    'fp': ('fp', 'falsepositive'),
}


def _text(value, limit=4096):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise Phase10Error('Invalid OSINT text field')
    if any(ord(char) < 32 for char in value):
        raise Phase10Error('Invalid OSINT text field')
    return value.strip()


def _limit(context):
    limit = context.get('max_records', MAX_RECORDS)
    if type(limit) is not int or not 1 <= limit <= MAX_RECORDS:
        raise Phase10Error('Invalid OSINT record limit')
    return limit


def _input(data, context):
    if not isinstance(data, bytes) or len(data) > MAX_BYTES:
        raise Phase10Error('OSINT input exceeds byte limit')
    return _limit(context)


def _time(value):
    """Retain known UTC instants; timezone-free exports have unknown collection time."""
    if value in (None, ''):
        return None
    try:
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            if not math.isfinite(value):
                return None
            stamp = dt.datetime.fromtimestamp(value, dt.timezone.utc)
        else:
            stamp = dt.datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        if stamp.tzinfo is None:
            return None
        return stamp.astimezone(dt.timezone.utc).isoformat().replace('+00:00', 'Z')
    except (ValueError, TypeError, OverflowError, OSError):
        return None


def _kind(value):
    kind = _TYPES.get(_key(_text(value, 128)))
    if kind is None:
        raise Phase10Error('Unsupported OSINT event type')
    return kind


def _entity(value):
    """Recognize an optional source entity without retaining arbitrary source text."""
    if not isinstance(value, str) or not value.strip() or len(value) > 4096:
        return None
    for kind in ('ip', 'url', 'email', 'domain'):
        try:
            return normalize_indicator(kind, value)
        except (ValueError, TypeError):
            pass
    return None


def _finding(tool, record_id, event_type, value, context, *, source=None,
             collected_at=None, assessment='informational', confidence=None):
    kind, value = normalize_indicator(_kind(event_type), _text(value))
    origin = _entity(source)
    shared = _key(event_type) in _COHOST
    relation = None
    if origin and origin != (kind, value):
        relation = {'source': origin[1], 'target': value,
                    'type': 'co_hosted' if shared else 'observed_relation'}
    return make_finding(tool, _text(record_id, 256), kind, value, context,
                        relationship=relation, collected_at=_time(collected_at),
                        assessment=assessment, confidence=confidence,
                        scope_status='shared_infrastructure' if shared else None)


def _csv(data, context):
    limit = _limit(context)
    try:
        reader = csv.DictReader(io.StringIO(data.decode('utf-8-sig')), strict=True)
        names = reader.fieldnames
        if not names or len(names) > 64:
            raise Phase10Error('Invalid SpiderFoot CSV header')
        headers = {_key(name): name for name in names}
        if len(headers) != len(names) or '' in headers:
            raise Phase10Error('Duplicate or empty SpiderFoot CSV header')
        selected = {}
        for field, aliases in _HEADERS.items():
            matches = [headers[name] for name in aliases if name in headers]
            if len(matches) > 1:
                raise Phase10Error('Ambiguous SpiderFoot CSV header')
            selected[field] = matches[0] if matches else None
        if not selected['type'] or not selected['value']:
            raise Phase10Error('SpiderFoot CSV requires type and data columns')
        findings = []
        for number, row in enumerate(reader, 1):
            if number > limit:
                raise Phase10Error('OSINT record limit exceeded')
            if None in row or any(value is None for value in row.values()):
                raise Phase10Error('Malformed SpiderFoot CSV row')
            values = {field: row.get(column, '') if column else ''
                      for field, column in selected.items()}
            fp = values['fp'].strip().lower()
            if fp not in ('', '0', 'false', 'no', '1', 'true', 'yes'):
                raise Phase10Error('Invalid SpiderFoot false-positive flag')
            findings.append(_finding(
                'spiderfoot', values['id'] or f'row:{number}', values['type'],
                values['value'], context, source=values['source'],
                collected_at=values['time'],
                assessment='false_positive' if fp in ('1', 'true', 'yes') else 'informational'))
        return findings
    except (UnicodeError, csv.Error) as exc:
        raise Phase10Error('Invalid SpiderFoot CSV') from exc


def _local(element):
    return element.tag.rsplit('}', 1)[-1]


def _attributes(element, titles):
    values = {_key(key): value for key, value in element.attrib.items()}
    for child in element:
        if _local(child) != 'attvalues':
            continue
        if len(child) > 64:
            raise Phase10Error('Too many GEXF attributes')
        for attr in child:
            key = _key(titles.get(attr.get('for'), attr.get('for', '')))
            if key in values:
                raise Phase10Error('Duplicate GEXF attribute')
            values[key] = attr.get('value', '')
    return values


def _gexf(data, context):
    root = parse_xml(data)
    if _local(root) != 'gexf':
        raise Phase10Error('Expected GEXF document')
    graphs = [child for child in root if _local(child) == 'graph']
    if len(graphs) != 1:
        raise Phase10Error('GEXF requires one graph')
    graph, limit = graphs[0], _limit(context)
    titles = {}
    for element in graph.iter():
        if _local(element) == 'attributes' and element.get('class') == 'node':
            for attr in element:
                key = _text(attr.get('id'), 128)
                if key in titles:
                    raise Phase10Error('Duplicate GEXF attribute definition')
                titles[key] = _text(attr.get('title'), 128)
    nodes, findings = {}, []
    for node in graph.iter():
        if _local(node) != 'node':
            continue
        if len(findings) >= limit:
            raise Phase10Error('OSINT record limit exceeded')
        node_id = _text(node.get('id'), 128)
        if node_id in nodes:
            raise Phase10Error('Duplicate GEXF node')
        values = _attributes(node, titles)
        value = values.get('data') or values.get('value') or node.get('label') or node_id
        event_type = values.get('eventtype') or values.get('type')
        if not event_type:
            inferred = _entity(value)
            if not inferred:
                raise Phase10Error('GEXF node requires supported entity type')
            event_type = inferred[0]
        finding = _finding('spiderfoot', 'node:' + node_id, event_type, value, context,
                           collected_at=values.get('timestamp') or values.get('updated'))
        nodes[node_id] = finding['indicator_value']
        findings.append(finding)
    edge_ids = set()
    for number, edge in enumerate((e for e in graph.iter() if _local(e) == 'edge'), 1):
        if len(findings) >= limit:
            raise Phase10Error('OSINT record limit exceeded')
        source, target = edge.get('source'), edge.get('target')
        if source not in nodes or target not in nodes:
            raise Phase10Error('GEXF edge references missing node')
        edge_id = _text(edge.get('id') or str(number), 128)
        if edge_id in edge_ids:
            raise Phase10Error('Duplicate GEXF edge')
        edge_ids.add(edge_id)
        findings.append(make_finding(
            'spiderfoot', 'edge:' + edge_id, 'relation',
            json.dumps([source, target], separators=(',', ':')), context,
            relationship={'source': nodes[source], 'target': nodes[target],
                          'type': 'observed_relation'}, scope_status='unknown'))
    return findings


def parse_spiderfoot(data, format_name, context):
    _input(data, context)
    if format_name == 'csv':
        return _csv(data, context)
    if format_name == 'gexf':
        return _gexf(data, context)
    raise Phase10Error('Unsupported SpiderFoot format')


def parse_recon_ng(data, format_name, context):
    _input(data, context)
    if format_name != 'json':
        raise Phase10Error('Unsupported Recon-ng format')
    payload = parse_json(data)
    if (not isinstance(payload, dict) or set(payload) != {'schema_version', 'workspace', 'records'}
            or type(payload['schema_version']) is not int or payload['schema_version'] != 1
            or not isinstance(payload['records'], list)):
        raise Phase10Error('Expected Recon-ng workspace schema version 1')
    workspace = _text(payload['workspace'], 128)
    if len(payload['records']) > _limit(context):
        raise Phase10Error('OSINT record limit exceeded')
    findings = []
    for number, row in enumerate(payload['records'], 1):
        if (not isinstance(row, dict) or not {'type', 'value'} <= set(row)
                or set(row) - {'id', 'type', 'value', 'source', 'collected_at', 'confidence'}):
            raise Phase10Error('Invalid Recon-ng workspace record')
        confidence = row.get('confidence')
        if confidence is not None and (type(confidence) not in (int, float)
                                       or not math.isfinite(confidence) or not 0 <= confidence <= 1):
            raise Phase10Error('Invalid Recon-ng confidence')
        findings.append(_finding(
            'recon-ng', row.get('id') or f'{workspace}:{number}', row['type'], row['value'],
            context, source=row.get('source'), collected_at=row.get('collected_at'),
            confidence=confidence))
    return findings


def parse_bbot(data, format_name, context):
    _input(data, context)
    if format_name != 'jsonl':
        raise Phase10Error('Unsupported BBOT format')
    findings = []
    for number, row in enumerate(parse_jsonl(data, _limit(context)), 1):
        if not isinstance(row, dict) or not {'type', 'data'} <= set(row):
            raise Phase10Error('Invalid BBOT event')
        findings.append(_finding(
            'bbot', row.get('id') or f'row:{number}', row['type'], row['data'], context,
            source=row.get('source'), collected_at=row.get('timestamp')))
    return findings
