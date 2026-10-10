#!/usr/bin/env python3
"""Sanitized intel pack. Never reads raw Cowrie logs, TTY, or secrets."""
import datetime as dt
import hashlib
import json
import re
from pathlib import Path
import uuid
from hp_common import ROOT, redact, runtime_path, utc

def parse_since(text):
    match = re.fullmatch(r'(\d+)([dhm])', str(text).strip())
    if not match:
        raise SystemExit('since must look like 7d, 24h, or 30m')
    return int(match.group(1)) * {'d': 86400, 'h': 3600, 'm': 60}[match.group(2)]

def _stamp(value):
    text = str(value or '')
    if text.endswith('Z'):
        text = text[:-1] + '+00:00'
    try:
        parsed = dt.datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed

def _secrets_from(obj, found):
    if isinstance(obj, dict):
        for key, value in obj.items():
            lower = str(key).lower()
            if lower not in ('password_present', 'password_length') and any(token in lower for token in ('password', 'passwd', 'secret')):
                if value:
                    found.add(str(value))
            else:
                _secrets_from(value, found)
    elif isinstance(obj, list):
        for item in obj:
            _secrets_from(item, found)

def _scrub(value, secrets):
    if isinstance(value, dict):
        clean = {}
        for key, item in value.items():
            if key == 'raw':
                continue
            lower = str(key).lower()
            if any(token in lower for token in ('tty', 'transcript', 'outfile', 'pcap', 'private_key', 'session_log')):
                continue
            if lower not in ('password_present', 'password_length') and any(token in lower for token in ('password', 'passwd', 'secret')):
                clean['password_present'] = True
                continue
            clean[key] = _scrub(item, secrets)
        return redact(clean)
    if isinstance(value, list):
        return [_scrub(item, secrets) for item in value]
    if isinstance(value, str):
        for secret in secrets:
            if secret and secret in value:
                value = value.replace(secret, '[redacted]')
        return value
    return value

_BAIT = re.compile(r'HPAKIA[0-9a-fA-F]{8,}')
_PEM = re.compile(r'-----BEGIN [A-Z0-9 ]{0,40}PRIVATE KEY-----.*?-----END [A-Z0-9 ]{0,40}PRIVATE KEY-----', re.S)

def _public(value):
    if not isinstance(value, str):
        return value
    value = _PEM.sub('[redacted-key]', value)
    return _BAIT.sub('[bait]', value)

def _ngrams(command):
    words = re.findall(r'[A-Za-z0-9_./-]{2,}', str(command).lower())
    return [' '.join(words[index:index + 3]) for index in range(max(0, len(words) - 2))][:12]

def load_events(root, since_seconds, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    cutoff = now - dt.timedelta(seconds=since_seconds)
    incidents = runtime_path('INCIDENT_PATH', 'incidents', root)
    events = []
    if not incidents.exists():
        return events
    for path in incidents.rglob('events.jsonl'):
        for line in path.read_text(encoding='utf-8', errors='replace').splitlines():
            try:
                row = json.loads(line)
            except ValueError:
                continue
            secrets = set()
            _secrets_from(row, secrets)
            normalized = _scrub(row.get('normalized') or {}, secrets)
            seen = _stamp(normalized.get('timestamp'))
            if seen is not None and seen < cutoff:
                continue
            normalized['_incident_dir'] = str(path.parent)
            events.append(normalized)
    return events

def cluster(events):
    groups = {}
    for event in events:
        key = event.get('source_ip') or 'UNKNOWN'
        bucket = groups.setdefault(key, {
            'source_ip': key, 'asn': 'UNKNOWN', 'assessment': 'OBSERVED',
            'usernames': [], 'command_ngrams': [], 'urls': [], 'domains': [],
            'hashes': [], 'user_agents': [], 'ports': [], 'bait_hits': [],
            'first_seen': event.get('timestamp'), 'last_seen': event.get('timestamp'),
            'event_count': 0, 'links': [],
        })
        bucket['event_count'] += 1
        for field, dest in (('username', 'usernames'), ('url', 'urls'), ('domain', 'domains'),
                            ('sha256', 'hashes'), ('user_agent', 'user_agents'), ('destination_port', 'ports')):
            value = _public(event.get(field))
            if value and value not in bucket[dest]:
                bucket[dest].append(value)
        for gram in _ngrams(_public(event.get('command', ''))):
            if gram not in bucket['command_ngrams']:
                bucket['command_ngrams'].append(gram)
        seen_asn = str(event.get('asn') or '').strip()
        if seen_asn and bucket['asn'] == 'UNKNOWN':
            bucket['asn'] = seen_asn
        for bait_id in event.get('bait_ids') or []:
            hit = {'bait_id': bait_id, 'assessment': 'OBSERVED', 'source_ip': key}
            if hit not in bucket['bait_hits']:
                bucket['bait_hits'].append(hit)
        stamp = event.get('timestamp') or ''
        if stamp and (not bucket['first_seen'] or stamp < bucket['first_seen']):
            bucket['first_seen'] = stamp
        if stamp and (not bucket['last_seen'] or stamp > bucket['last_seen']):
            bucket['last_seen'] = stamp
    by_user = {}
    for bucket in groups.values():
        for username in bucket['usernames']:
            by_user.setdefault(username, []).append(bucket['source_ip'])
    for bucket in groups.values():
        for username in bucket['usernames']:
            others = [ip for ip in by_user.get(username, []) if ip != bucket['source_ip']]
            if others:
                bucket['links'].append({'signal': 'username', 'assessment': 'INFERRED', 'also_seen_on': others[:10]})
    return [groups[key] for key in sorted(groups)]

def _stix_time(value):
    parsed = _stamp(value) or dt.datetime.now(dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%fZ')

def stix_bundle(clusters):
    objects = []
    for cluster_row in clusters:
        ip = cluster_row['source_ip']
        if ip == 'UNKNOWN':
            continue
        try:
            ipaddress_ok = bool(__import__('ipaddress').ip_address(ip))
        except ValueError:
            ipaddress_ok = False
        if not ipaddress_ok:
            continue
        created = _stix_time(cluster_row.get('first_seen'))
        indicator = uuid.uuid5(uuid.NAMESPACE_OID, 'indicator:' + ip + ':' + created)
        observed = uuid.uuid5(uuid.NAMESPACE_OID, 'observed:' + ip + ':' + created)
        objects.append({
            'type': 'indicator', 'spec_version': '2.1', 'id': 'indicator--' + str(indicator),
            'created': created, 'modified': created,
            'name': 'honeypot-src-' + ip, 'pattern_type': 'stix', 'valid_from': created,
            'pattern': "[ipv4-addr:value = '" + ip + "']",
            'labels': ['anonymized'],
        })
        objects.append({
            'type': 'observed-data', 'spec_version': '2.1', 'id': 'observed-data--' + str(observed),
            'created': created, 'modified': created, 'first_observed': created, 'last_observed': _stix_time(cluster_row.get('last_seen')),
            'number_observed': cluster_row['event_count'],
            'object_refs': ['ipv4-addr--' + str(uuid.uuid5(uuid.NAMESPACE_OID, ip))],
            'note': 'password_present may be true; plaintext passwords are not included',
        })
        for hit in cluster_row['bait_hits']:
            bait = uuid.uuid5(uuid.NAMESPACE_OID, 'bait:' + hit['bait_id'] + ':' + ip)
            objects.append({
                'type': 'indicator', 'spec_version': '2.1', 'id': 'indicator--' + str(bait),
                'created': created, 'modified': created, 'pattern_type': 'stix', 'valid_from': created,
                'name': hit['bait_id'], 'pattern': "[network-traffic:dst_ref.type = 'ipv4-addr']",
                'labels': ['honeytoken', 'OBSERVED'],
            })
    return {'type': 'bundle', 'id': 'bundle--' + str(uuid.uuid5(uuid.NAMESPACE_OID, json.dumps(clusters, sort_keys=True))), 'objects': objects}

def brief(clusters, generated):
    lines = ['# Honeypot weekly brief', '', 'Generated: ' + generated, '', 'This brief is sanitized. It is not raw evidence and contains no passwords or TTY.', '']
    if not clusters:
        lines.append('No incidents in the selected window.')
    for row in clusters:
        lines.append('## ' + row['source_ip'])
        lines.append('- Assessment: OBSERVED source. ASN: UNKNOWN unless already present in evidence (not enriched here).')
        lines.append('- Events: ' + str(row['event_count']) + ' first ' + str(row['first_seen']) + ' last ' + str(row['last_seen']))
        lines.append('- Usernames: ' + (', '.join(map(str, row['usernames'])) or 'none'))
        lines.append('- Ports: ' + (', '.join(map(str, row['ports'])) or 'none'))
        lines.append('- Bait hits: ' + (', '.join(hit['bait_id'] for hit in row['bait_hits']) or 'none') + ' (OBSERVED tripwire, not identity)')
        if row['links']:
            lines.append('- Cross-source username overlap: INFERRED, not an identity claim.')
        lines.append('')
    lines.append('Retainership use: send this brief and pack.stix.json. Do not attach raw logs, PCAPs, or secrets.')
    return '\n'.join(lines) + '\n'

def build_pack(root=ROOT, since='7d', now=None):
    root = Path(root)
    events = load_events(root, parse_since(since), now=now)
    clusters = cluster(events)
    generated = utc()
    out = root / 'work/intel-packs' / generated.replace(':', '').replace('-', '')
    out.mkdir(parents=True, exist_ok=True)
    pack = {'generated': generated, 'since': since, 'assessment_key': 'OBSERVED is direct evidence; INFERRED is a shared signal, not identity', 'clusters': clusters}
    (out / 'pack.json').write_text(json.dumps(pack, indent=2) + '\n', encoding='utf-8')
    (out / 'pack.stix.json').write_text(json.dumps(stix_bundle(clusters), indent=2) + '\n', encoding='utf-8')
    (out / 'brief.md').write_text(brief(clusters, generated), encoding='utf-8')
    manifest = []
    for path in sorted(out.iterdir()):
        if path.name == 'MANIFEST.sha256':
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        manifest.append(digest + '  ' + path.name)
    (out / 'MANIFEST.sha256').write_text('\n'.join(manifest) + '\n', encoding='utf-8')
    combined = ''.join(path.read_text(encoding='utf-8') for path in out.iterdir())
    return out, combined

if __name__ == '__main__':
    raise SystemExit('Use scripts/hp.py intel pack')
