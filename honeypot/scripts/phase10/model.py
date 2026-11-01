"""Small normalized findings; source observations never imply common ownership."""
import datetime as dt
import hashlib
import ipaddress
import json
import math
import re
from urllib.parse import urlsplit, urlunsplit

MAX_BYTES = 8 * 1024 * 1024
MAX_RECORDS = 10000
DETAIL_KEYS = frozenset(('ports', 'services', 'status', 'template_id', 'severity',
                         'matcher_name', 'finding_type', 'metrics', 'lab_authorized',
                         'provider', 'privacy_policy', 'service', 'categories', 'score',
                         'note', 'namespace', 'workspace', 'scan_id', 'campaign_id',
                         'counts', 'provenance', 'limitations', 'time_status', 'source_time'))
_SECRET = re.compile(r'password|passwd|secret|token|credential|cookie|authorization|private.?key|raw|session', re.I)


class Phase10Error(ValueError):
    pass


def _text(value, limit=4096):
    if (not isinstance(value, str) or not value or len(value) > limit or
            any(ord(c) < 32 or ord(c) == 127 for c in value)):
        raise Phase10Error('Invalid bounded text field')
    return value


def _domain(value):
    try:
        value = _text(value, 253).removesuffix('.').encode('idna').decode('ascii').lower()
    except UnicodeError as exc:
        raise Phase10Error('Invalid domain') from exc
    if not value or len(value) > 253 or any(not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', p) for p in value.split('.')):
        raise Phase10Error('Invalid domain')
    return value


def normalize_indicator(kind, value):
    if kind not in ('ip', 'domain', 'url', 'email', 'file', 'relation', 'other'):
        raise Phase10Error('Unsupported indicator type')
    value = _text(value).strip()
    if not value:
        raise Phase10Error('Empty indicator')
    try:
        if kind == 'ip':
            if '%' in value:
                raise ValueError('Scoped addresses are unsupported')
            value = str(ipaddress.ip_address(value))
        elif kind == 'domain':
            value = _domain(value)
        elif kind == 'email':
            local, domain = value.rsplit('@', 1)
            if len(local) > 64 or not re.fullmatch(r'[^\s@]+', local):
                raise ValueError('Invalid local part')
            value = local + '@' + _domain(domain)
            if len(value) > 254:
                raise ValueError('Oversized email')
        elif kind == 'url':
            parsed = urlsplit(value)
            if parsed.scheme.lower() not in ('http', 'https') or not parsed.hostname or parsed.username is not None or parsed.password is not None:
                raise ValueError('Invalid URL authority')
            host = parsed.hostname
            try:
                host = str(ipaddress.ip_address(host))
                if '%' in host:
                    raise ValueError('Scoped address')
            except ValueError:
                host = _domain(host)
            authority = '[' + host + ']' if ':' in host else host
            port = parsed.port
            if port is not None and port != {'http': 80, 'https': 443}[parsed.scheme.lower()]:
                authority += ':' + str(port)
            # Queries and fragments commonly carry credentials and are not exportable indicators.
            value = urlunsplit((parsed.scheme.lower(), authority, parsed.path or '/', '', ''))
        elif kind == 'file' and re.fullmatch(r'(?:sha256:)?[a-fA-F0-9]{64}', value):
            value = value.lower()
    except (ValueError, UnicodeError) as exc:
        raise Phase10Error('Invalid indicator') from exc
    return kind, value


def in_scope(kind, value, scope):
    kind, value = normalize_indicator(kind, value)
    if kind == 'relation':
        return False
    if kind == 'url':
        value = urlsplit(value).hostname
        try:
            ipaddress.ip_address(value)
            kind = 'ip'
        except ValueError:
            kind = 'domain'
    elif kind == 'email':
        value, kind = value.rsplit('@', 1)[1], 'domain'
    for asset in scope:
        if not isinstance(asset, str):
            continue
        if kind == 'ip':
            try:
                if ipaddress.ip_address(value) in ipaddress.ip_network(asset, strict=False):
                    return True
            except ValueError:
                pass
        elif kind == 'domain':
            try:
                domain = _domain(asset)
            except Phase10Error:
                continue
            if value == domain or value.endswith('.' + domain):
                return True
        elif value == asset:
            return True
    return False


def timestamp(value, optional=False):
    if value is None and optional:
        return None
    try:
        parsed = dt.datetime.fromisoformat(_text(value, 64).replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            raise ValueError('Timezone required')
        return parsed.astimezone(dt.timezone.utc).isoformat().replace('+00:00', 'Z')
    except (ValueError, TypeError, OverflowError) as exc:
        raise Phase10Error('Invalid timestamp') from exc


def _detail(value, depth=0):
    if depth > 4:
        raise Phase10Error('Detail nesting limit exceeded')
    if value is None or type(value) is bool:
        return value
    if type(value) in (int, float):
        if abs(value) > 10**15 or not math.isfinite(value):
            raise Phase10Error('Invalid detail number')
        return value
    if isinstance(value, str):
        return _text(value)
    if isinstance(value, list) and len(value) <= 100:
        return [_detail(item, depth + 1) for item in value]
    if isinstance(value, dict) and len(value) <= 100:
        result = {}
        for key, item in value.items():
            key = _text(key, 64)
            aggregate_sessions = key == 'sessions' and type(item) is int and 0 <= item <= 10**15
            if _SECRET.search(key) and not aggregate_sessions:
                raise Phase10Error('Secret-bearing detail fields are unsupported')
            result[key] = _detail(item, depth + 1)
        return result
    raise Phase10Error('Invalid detail value')


def make_finding(source_tool, source_record_id, indicator_type, indicator_value, context,
                 *, relationship=None, assessment='informational', confidence=None,
                 collected_at=None, scope_status=None, details=None):
    tool, record = _text(source_tool, 64), _text(source_record_id, 512)
    kind, value = normalize_indicator(indicator_type, indicator_value)
    raw_hash = context.get('raw_source_hash')
    if not isinstance(raw_hash, str) or not re.fullmatch('[a-f0-9]{64}', raw_hash):
        raise Phase10Error('Invalid source digest')
    if assessment not in ('confirmed', 'possible', 'false_positive', 'informational', 'scan_error'):
        raise Phase10Error('Invalid assessment')
    if confidence is not None and (type(confidence) not in (int, float) or not math.isfinite(confidence) or not 0 <= confidence <= 1):
        raise Phase10Error('Invalid confidence')
    owned = in_scope(kind, value, context.get('scope', ()))
    status = scope_status or ('owned' if owned else 'unknown')
    if status not in ('owned', 'third_party', 'shared_infrastructure', 'unknown') or (status == 'owned' and not owned):
        raise Phase10Error('Unsupported ownership claim')
    if relationship is not None:
        if not isinstance(relationship, dict) or set(relationship) != {'source', 'target', 'type'}:
            raise Phase10Error('Invalid relationship')
        relationship = {k: _text(v) for k, v in relationship.items()}
    row = {'source_tool': tool, 'source_record_id': record,
           'collected_at': timestamp(collected_at, optional=True),
           'imported_at': timestamp(context.get('imported_at')), 'indicator_type': kind,
           'indicator_value': value, 'relationship': relationship, 'scope_status': status,
           'assessment': assessment, 'evidence_reference': 'sha256:' + raw_hash,
           'confidence': confidence, 'raw_source_hash': 'sha256:' + raw_hash}
    if details is not None:
        if not isinstance(details, dict) or set(details) - DETAIL_KEYS:
            raise Phase10Error('Unsupported detail fields')
        row['details'] = _detail(details)
    identity = {key: val for key, val in row.items() if key != 'imported_at'}
    row['finding_id'] = hashlib.sha256(json.dumps(identity, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()).hexdigest()
    return row
