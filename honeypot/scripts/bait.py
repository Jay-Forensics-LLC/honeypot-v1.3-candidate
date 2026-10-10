#!/usr/bin/env python3
"""Per-deployment honeytokens. Tokens are tripwires, never valid credentials."""
import json
import os
from pathlib import Path
import secrets
from hp_common import ROOT, atomic_json

LEVEL = {'LOW': 0, 'MEDIUM': 1, 'HIGH': 2, 'CRITICAL': 3}
TOKEN_FIELDS = ('cloud_key', 'invoice_token', 'http_token', 'banner_token')

def inventory_path(root=ROOT):
    return Path(root) / 'state/bait/inventory.json'

def load_inventory(root=ROOT):
    path = inventory_path(root)
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None

def _token():
    return 'HPAKIA' + secrets.token_hex(8)

def ensure_inventory(root=ROOT):
    path = inventory_path(root)
    existing = load_inventory(root)
    if existing:
        return existing, False
    cloud, invoice, http, banner = _token(), _token(), _token(), _token()
    row = {
        'cloud_key': cloud,
        'invoice_name': 'INVOICE-' + invoice + '.xlsx',
        'invoice_token': invoice,
        'http_path': '/internal/backup-' + http + '.zip',
        'http_token': http,
        'banner_infix': banner,
        'banner_token': banner,
        'ids': {
            cloud: 'bait-cloud',
            invoice: 'bait-invoice',
            http: 'bait-http',
            banner: 'bait-banner',
        },
        'note': 'Tripwires only. Not valid anywhere else. Do not commit this file.',
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    atomic_json(path, row)
    os.chmod(path, 0o640)
    try:
        os.chown(path, 0, 2000)
    except OSError:
        pass
    return row, True

def render(root=ROOT):
    row, _created = ensure_inventory(root)
    dest = Path(root) / 'state/bait/render'
    honey = dest / 'honeyfs/home'
    honey.mkdir(parents=True, exist_ok=True)
    (honey / row['invoice_name']).write_text('synthetic bait filename only\n', encoding='utf-8')
    aws = honey / '.aws'
    aws.mkdir(parents=True, exist_ok=True)
    (aws / 'credentials').write_text(
        '# NOT A REAL KEY. Deployment tripwire.\naws_access_key_id = ' + row['cloud_key'] + '\n',
        encoding='utf-8')
    (dest / 'cowrie-banner.txt').write_text('SSH-2.0-OpenSSH_8.9 ' + row['banner_infix'] + '\n', encoding='utf-8')
    (dest / 'http-tripwire.txt').write_text(row['http_path'] + '\nServer: Apache/' + row['http_token'] + '\n', encoding='utf-8')
    (dest / 'README.txt').write_text(
        'Rendered bait is local. It is not installed into the Cowrie image automatically.\n'
        'Tokens must never be reused as real credentials.\n', encoding='utf-8')
    return dest

def token_values(inventory):
    if not inventory:
        return []
    values = []
    for key in TOKEN_FIELDS:
        value = str(inventory.get(key, ''))
        if len(value) > len('HPAKIA'):
            values.append(value)
    return values

def match_tokens(text, inventory):
    if not text or not inventory:
        return []
    found = []
    ids = inventory.get('ids') or {}
    for value in token_values(inventory):
        if value and value in text:
            found.append(ids.get(value, 'bait-unknown'))
    return found

def annotate(event, root=ROOT):
    inventory = load_inventory(root)
    if not inventory or not isinstance(event, dict):
        return event
    blob = ' '.join(str(event.get(key, '')) for key in ('command', 'url', 'username', 'user_agent', 'domain', 'filename'))
    hits = match_tokens(blob, inventory)
    if not hits:
        return event
    event['bait_ids'] = hits
    event.setdefault('notes', [])
    note = 'OBSERVED: deployment-unique bait token matched; not proof of identity.'
    if note not in event['notes']:
        event['notes'].append(note)
    if LEVEL.get(event.get('severity', 'LOW'), 0) < LEVEL['HIGH']:
        event['severity'] = 'HIGH'
    return event

def status_text(root=ROOT):
    row = load_inventory(root)
    if not row:
        return 'bait inventory absent'
    return 'bait inventory present ids=' + ','.join(sorted(set(row.get('ids', {}).values())))

if __name__ == '__main__':
    raise SystemExit('Use scripts/hp.py bait status|render')
