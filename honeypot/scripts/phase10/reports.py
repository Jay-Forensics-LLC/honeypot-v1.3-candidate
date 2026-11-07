"""Offline, scoped assessment reports and privacy-preserving aggregate imports.

These adapters parse data only. They never invoke the originating applications.
CloudFox, BloodHound and awareness inputs use the documented version-1 envelopes.
"""
import datetime as dt
import ipaddress
import re
from urllib.parse import urlsplit, urlunsplit

from .io import parse_json, parse_jsonl, parse_xml
from .model import MAX_BYTES, MAX_RECORDS, Phase10Error, in_scope, make_finding, normalize_indicator


_SEVERITIES = {'info', 'informational', 'low', 'medium', 'high', 'critical', 'unknown'}
_ID = re.compile(r'[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}\Z')
_PORT_STATES = {'open', 'closed', 'filtered', 'unfiltered', 'open|filtered', 'closed|filtered', 'unknown'}
_LAB_METRICS = {'nodes', 'edges', 'domains', 'users', 'computers', 'groups', 'ous', 'containers', 'sessions', 'privileged_paths'}
_TRAINING_METRICS = {'sent', 'opened', 'clicked', 'reported', 'completed'}
_TRAINING_PROVIDERS = {'gophish', 'king-phisher', 'microsoft-attack-simulation-training'}


def _input(data, format_name, expected):
    if format_name != expected or not isinstance(data, bytes) or len(data) > MAX_BYTES:
        raise Phase10Error('Unsupported report format or size')


def _closed(row, required, optional=()):
    if not isinstance(row, dict) or not set(required) <= row.keys() or row.keys() - set(required) - set(optional):
        raise Phase10Error('Unsupported report schema')


def _version(row):
    if type(row.get('schema_version')) is not int or row['schema_version'] != 1:
        raise Phase10Error('Unsupported report schema version')


def _text(value, maximum=4096):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum or any(ord(c) < 32 or ord(c) == 127 for c in value):
        raise Phase10Error('Invalid report field')
    return value.strip()


def _identifier(value):
    value = _text(value, 128)
    if not _ID.fullmatch(value):
        raise Phase10Error('Invalid report identifier')
    return value


def _limit(rows, context):
    maximum = context.get('max_records', MAX_RECORDS)
    if type(maximum) is not int or not 1 <= maximum <= MAX_RECORDS or len(rows) > maximum:
        raise Phase10Error('Report record limit exceeded')
    return rows


def _assessment(context, scoped=True):
    if context.get('assessment_approved') is not True:
        raise Phase10Error('Assessment import requires explicit approval')
    if scoped and not context.get('scope'):
        raise Phase10Error('Assessment import requires explicit target scope')


def _scoped(kind, value, context):
    if not in_scope(kind, value, context.get('scope', ())):
        raise Phase10Error('Report target is outside approved scope')


def _collected(value):
    if value is None:
        return None
    try:
        parsed = dt.datetime.fromisoformat(_text(value, 64).replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            raise ValueError
        return parsed.astimezone(dt.timezone.utc).isoformat().replace('+00:00', 'Z')
    except (TypeError, ValueError, OverflowError):
        raise Phase10Error('Invalid collection timestamp') from None


def _epoch(value):
    if value is None:
        return None
    try:
        if not re.fullmatch(r'[0-9]{1,12}', value):
            raise ValueError
        return dt.datetime.fromtimestamp(int(value), dt.timezone.utc).isoformat().replace('+00:00', 'Z')
    except (ValueError, TypeError, OverflowError, OSError):
        raise Phase10Error('Invalid collection timestamp') from None


def _severity(value):
    value = _text(value, 32).lower()
    if value not in _SEVERITIES:
        raise Phase10Error('Invalid report severity')
    return value


def _target(value):
    """Keep only target identity; report URLs never export queries or fragments."""
    value = _text(value)
    try:
        return normalize_indicator('ip', str(ipaddress.ip_address(value)))
    except ValueError:
        pass
    try:
        parsed = urlsplit(value if '://' in value else '//' + value)
        if parsed.username is not None or parsed.password is not None or not parsed.hostname:
            raise ValueError
        if parsed.scheme in ('http', 'https'):
            # Paths can contain secret identifiers too; retain the origin only.
            return normalize_indicator('url', urlunsplit((parsed.scheme, parsed.netloc, '', '', '')))
        if parsed.scheme and parsed.scheme not in ('tcp', 'udp'):
            raise ValueError
        host = parsed.hostname
        try:
            return normalize_indicator('ip', str(ipaddress.ip_address(host)))
        except ValueError:
            return normalize_indicator('domain', host)
    except (ValueError, TypeError):
        raise Phase10Error('Invalid report target') from None


def parse_nmap(data, format_name, context):
    _input(data, format_name, 'xml')
    _assessment(context)
    # Native Nmap output has this inert declaration. Other DTD/entity forms are
    # still rejected by the shared XML reader; no external identifiers resolve.
    root = parse_xml(re.sub(rb'<!DOCTYPE\s+nmaprun\s*>', b'', data))
    if root.tag != 'nmaprun':
        raise Phase10Error('Unsupported Nmap report root')
    hosts = _limit(root.findall('host'), context)
    findings = []
    for index, host in enumerate(hosts):
        addresses = []
        for address in host.findall('address'):
            if address.get('addrtype') in ('ipv4', 'ipv6'):
                kind, value = normalize_indicator('ip', address.get('addr'))
                _scoped(kind, value, context)
                addresses.append((kind, value))
        if not addresses:
            for hostname in host.findall('hostnames/hostname'):
                kind, value = normalize_indicator('domain', hostname.get('name'))
                _scoped(kind, value, context)
                addresses.append((kind, value))
        if not addresses:
            raise Phase10Error('Nmap host has no supported address')
        state = host.find('status')
        host_status = state.get('state', 'unknown') if state is not None else 'unknown'
        if host_status not in ('up', 'down', 'unknown'):
            raise Phase10Error('Invalid Nmap host status')
        collected = _epoch(host.get('starttime') or root.get('start'))
        ports = _limit(host.findall('ports/port'), context)
        observations = []
        for port in ports:
            number = port.get('portid', '')
            protocol = port.get('protocol')
            if not re.fullmatch(r'[0-9]{1,5}', number) or not 0 <= int(number) <= 65535 or protocol not in ('tcp', 'udp', 'sctp', 'ip'):
                raise Phase10Error('Invalid Nmap port')
            port_state = port.find('state')
            status = port_state.get('state') if port_state is not None else None
            if status not in _PORT_STATES:
                raise Phase10Error('Invalid Nmap port state')
            service = port.find('service')
            name = service.get('name', 'unknown') if service is not None else 'unknown'
            if not re.fullmatch(r'[A-Za-z0-9._+-]{1,64}', name):
                raise Phase10Error('Invalid Nmap service name')
            observations.append((protocol + ':' + number, {'ports': [int(number)], 'service': protocol + '/' + name, 'status': status}))
        if not observations:
            observations.append(('host', {'status': host_status}))
        for kind, value in addresses:
            for suffix, details in observations:
                findings.append(make_finding('nmap', f'{index}:{value}:{suffix}', kind, value, context,
                                             collected_at=collected, details=details))
                _limit(findings, context)
    return findings


def parse_nuclei(data, format_name, context):
    _input(data, format_name, 'jsonl')
    _assessment(context)
    findings = []
    for index, row in enumerate(parse_jsonl(data, context.get('max_records', MAX_RECORDS))):
        if not isinstance(row, dict) or not isinstance(row.get('info'), dict):
            raise Phase10Error('Unsupported Nuclei record')
        template = _identifier(row.get('template-id'))
        target = row.get('matched-at') or row.get('host')
        kind, value = _target(target)
        _scoped(kind, value, context)
        if row.get('host'):
            host_kind, host_value = _target(row['host'])
            _scoped(host_kind, host_value, context)
        details = {'template_id': template, 'severity': _severity(row['info'].get('severity', 'unknown'))}
        if row.get('matcher-name'):
            details['matcher_name'] = _identifier(row['matcher-name'])
        if 'matcher-status' in row and type(row['matcher-status']) is not bool:
            raise Phase10Error('Invalid Nuclei matcher status')
        assessment = 'informational' if row.get('matcher-status') is False else 'possible'
        if row.get('error'):
            assessment = 'scan_error'
        findings.append(make_finding('nuclei', f'{index}:{template}', kind, value, context,
                                     assessment=assessment, collected_at=_collected(row.get('timestamp')), details=details))
    return _limit(findings, context)


def parse_cloudfox(data, format_name, context):
    _input(data, format_name, 'json')
    _assessment(context)
    document = parse_json(data)
    _closed(document, ('schema_version', 'records'))
    _version(document)
    if not isinstance(document['records'], list):
        raise Phase10Error('Invalid CloudFox records')
    findings = []
    for row in _limit(document['records'], context):
        _closed(row, ('id', 'resource', 'finding_type'), ('severity', 'collected_at'))
        record_id = _identifier(row['id'])
        resource = _text(row['resource'], 1024)
        _scoped('other', resource, context)
        details = {'finding_type': _identifier(row['finding_type']), 'severity': _severity(row.get('severity', 'unknown'))}
        findings.append(make_finding('cloudfox', record_id, 'other', resource, context,
                                     assessment='possible', collected_at=_collected(row.get('collected_at')), details=details))
    return findings


def _metrics(row, allowed, required):
    _closed(row, required, allowed - set(required))
    if any(type(value) is not int or not 0 <= value <= 10**9 for value in row.values()):
        raise Phase10Error('Invalid aggregate count')
    return dict(row)


def parse_bloodhound(data, format_name, context):
    _input(data, format_name, 'json')
    _assessment(context, scoped=False)
    document = parse_json(data)
    _closed(document, ('schema_version', 'lab_authorized', 'summary'), ('report_id', 'collected_at'))
    _version(document)
    if document['lab_authorized'] is not True:
        raise Phase10Error('BloodHound summary requires authorized isolated-lab provenance')
    metrics = _metrics(document['summary'], _LAB_METRICS, ('nodes', 'edges'))
    record_id = _identifier(document.get('report_id', 'lab-summary'))
    return [make_finding('bloodhound', record_id, 'other', 'lab-summary:' + record_id, context,
                         collected_at=_collected(document.get('collected_at')),
                         details={'metrics': metrics, 'lab_authorized': True})]


def parse_awareness(data, format_name, context):
    _input(data, format_name, 'json')
    if context.get('awareness_approved') is not True or not isinstance(context.get('privacy_policy'), str) or not context['privacy_policy'].strip():
        raise Phase10Error('Awareness import requires approval and a privacy policy')
    privacy_policy = _text(context['privacy_policy'], 256)
    document = parse_json(data)
    _closed(document, ('schema_version', 'campaign_id', 'totals'), ('provider', 'collected_at'))
    _version(document)
    campaign = _identifier(document['campaign_id'])
    metrics = _metrics(document['totals'], _TRAINING_METRICS, ('sent',))
    if any(value > metrics['sent'] for value in metrics.values()):
        raise Phase10Error('Aggregate recipient counts exceed sent count')
    details = {'campaign_id': campaign, 'metrics': metrics, 'privacy_policy': privacy_policy}
    if 'provider' in document:
        if not isinstance(document['provider'], str) or document['provider'] not in _TRAINING_PROVIDERS:
            raise Phase10Error('Unsupported awareness provider')
        details['provider'] = document['provider']
    return [make_finding('awareness', campaign, 'other', 'training-campaign:' + campaign, context,
                         collected_at=_collected(document.get('collected_at')), details=details)]
