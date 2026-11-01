"""Read-only views of independently verified, minimized Sentinel imports."""
import datetime as dt
import json
import re

from .model import Phase10Error
from .sentinel import CONTRACT
from .case_leads import AUTHORSHIP_STATEMENT, EXPORT_OMISSIONS, case_lead_details

_CODE = re.compile(r'[A-Za-z0-9_.:-]{1,128}')
_HASH = re.compile(r'[a-f0-9]{64}')
_TIME = re.compile(r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})')
_DEFAULTS = {'query': '', 'protocol': '', 'source_id': None, 'since': '', 'until': '',
             'include_unresolved': True, 'offset': 0, 'limit': 50}


def _require(condition, message='Invalid saved Sentinel case'):
    if not condition:
        raise Phase10Error(message)


def _instant(value):
    if value == '':
        return None
    _require(isinstance(value, str) and len(value) <= 40, 'Use a timezone-explicit ISO timestamp')
    match = _TIME.fullmatch(value)
    _require(match is not None, 'Use a timezone-explicit ISO timestamp')
    _require(match[3] == 'Z' or int(match[3][1:3]) <= 23 and int(match[3][4:]) <= 59,
             'Invalid timeline timezone')
    try:
        when = dt.datetime.fromisoformat(match[1] + match[3].replace('Z', '+00:00'))
        delta = when.astimezone(dt.timezone.utc) - dt.datetime(1970, 1, 1, tzinfo=dt.timezone.utc)
    except (ValueError, OverflowError) as exc:
        raise Phase10Error('Invalid timeline timestamp') from exc
    return (delta.days * 86400 + delta.seconds) * 10**9 + int((match[2] or '').ljust(9, '0'))


def _filters(values):
    _require(isinstance(values, dict) and not set(values) - set(_DEFAULTS), 'Unsupported timeline filters')
    result = _DEFAULTS | values
    query, protocol = result['query'], result['protocol']
    _require(isinstance(query, str) and len(query) <= 256 and
             all(ord(char) >= 32 and ord(char) != 127 for char in query), 'Invalid timeline search')
    _require(isinstance(protocol, str) and (protocol == '' or _CODE.fullmatch(protocol)),
             'Invalid timeline protocol')
    source = result['source_id']
    _require(source is None or type(source) is int and 1 <= source <= 4096, 'Invalid source filter')
    _require(type(result['include_unresolved']) is bool, 'Invalid unresolved-time filter')
    for key, minimum, maximum in (('offset', 0, 10000), ('limit', 1, 200)):
        _require(type(result[key]) is int and minimum <= result[key] <= maximum, 'Invalid timeline page')
    since, until = _instant(result['since']), _instant(result['until'])
    _require(since is None or until is None or since <= until, 'Timeline start must precede its end')
    return result, since, until


def _entity(row):
    return row.get('details', {}).get('metrics', {}).get('entity')


def _case(store, case_id):
    imported = store.read_import(case_id)
    manifest, rows = imported['manifest'], imported['findings']
    _require(manifest.get('plugin_id') == 'sentinel')
    cases = [row for row in rows if _entity(row) == 'case']
    _require(len(cases) == 1)
    details = cases[0]['details']
    namespace = details.get('namespace')
    _require(isinstance(namespace, str) and namespace.startswith(CONTRACT + ':') and
             _HASH.fullmatch(namespace[len(CONTRACT) + 1:]) and details.get('status') == 'COMPLETE')
    ledger = details.get('provenance', {}).get('checksum_ledger_sha256')
    _require(isinstance(ledger, str) and _HASH.fullmatch(ledger), 'A verified completed case is required')
    _require(all(row.get('details', {}).get('namespace') == namespace and
                 row['details'].get('provenance', {}).get('checksum_ledger_sha256') == ledger
                 for row in rows))
    summary = {'case_id': case_id, 'imported_at': manifest['imported_at'],
               'parser_version': details['metrics']['parser_version'], 'namespace': namespace,
               'source_count': sum(_entity(row) == 'source' for row in rows),
               'event_count': sum(_entity(row) == 'timeline' for row in rows),
               'finding_count': sum(_entity(row) == 'finding' for row in rows),
               'verification': 'verified', 'exchange_sha256': manifest['raw_source_hash'],
               'checksum_ledger_sha256': ledger}
    return summary, rows


def list_cases(store):
    """Summaries retain case boundaries, even when the overview is truncated."""
    if not store.policy.enabled or 'sentinel' not in store.policy.plugins:
        return []
    summaries = [_case(store, manifest['import_id'])[0] for manifest in store.manifests()
                 if manifest.get('plugin_id') == 'sentinel']
    return sorted(summaries, key=lambda row: (dt.datetime.fromisoformat(
        row['imported_at'].replace('Z', '+00:00')), row['case_id']), reverse=True)


def case_detail(store, case_id, filters=None, decision_path=None):
    """Filter one bounded case; exact time comparisons never use floats."""
    selected, since, until = _filters({} if filters is None else filters)
    summary, rows = _case(store, case_id)
    lead_details, case_review = case_lead_details(store, summary, rows, decision_path)
    observations = {row['details']['provenance']['occurrence_id']: row
                    for row in rows if _entity(row) == 'observation'}
    timeline, protocols, source_ids = [], set(), set()
    for row in rows:
        if _entity(row) != 'timeline':
            continue
        details = row['details']
        metrics, provenance = details['metrics'], details['provenance']
        observation = observations.get(provenance['occurrence_id'])
        _require(observation is not None)
        # Keep both saved records intact: finding_id identifies the original
        # normalized contents, rather than a modified joined projection.
        item = {**row, 'observation': observation}
        protocols.add(metrics['protocol'])
        source_ids.add(provenance['source_id'])
        ns = metrics['adjusted_utc_ns']
        instant = None if ns is None else int(ns)
        if instant is None:
            if not selected['include_unresolved'] or since is not None or until is not None:
                continue
        elif (since is not None and instant < since or until is not None and instant > until):
            continue
        if selected['protocol'] and metrics['protocol'] != selected['protocol']:
            continue
        if selected['source_id'] is not None and provenance['source_id'] != selected['source_id']:
            continue
        if selected['query'].casefold() not in json.dumps(
                [details, observation['details']], ensure_ascii=False, sort_keys=True).casefold():
            continue
        timeline.append(item)
    timeline.sort(key=lambda row: (
        row['details']['metrics']['adjusted_utc_ns'] is None,
        int(row['details']['metrics']['adjusted_utc_ns'] or 0),
        row['details']['provenance']['source_id'], int(row['details']['provenance']['ordinal']),
        row['details']['provenance']['occurrence_id']))
    offset, limit = selected['offset'], selected['limit']
    return {'case': summary,
            'sources': [row for row in rows if _entity(row) == 'source'],
            'coverage': [row for row in rows if _entity(row) == 'coverage'],
            'findings': [row for row in rows if _entity(row) == 'finding'],
            'lead_details': lead_details, 'case_review': case_review,
            'timeline': {'items': timeline[offset:offset + limit], 'total': len(timeline),
                         'offset': offset, 'limit': limit},
            'filters': {'protocols': sorted(protocols), 'source_ids': sorted(source_ids),
                        'applied': selected}}


def case_export(store, case_id, decision_path=None):
    """Export minimized normalized records; private originals stay in the store."""
    summary, rows = _case(store, case_id)
    lead_details, case_review = case_lead_details(store, summary, rows, decision_path)
    return {'schema_version': 1, 'case': summary, 'findings': rows,
            'lead_details': lead_details, 'case_review': case_review,
            'export_scope': {'authorship_statement': AUTHORSHIP_STATEMENT,
                             'omissions': list(EXPORT_OMISSIONS),
                             'review_state': 'Derivative operator decisions; original findings are unchanged.'}}
