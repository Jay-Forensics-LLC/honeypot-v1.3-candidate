#!/usr/bin/env python3
"""Redacted operator alerts. Disabled unless configs/alert-bus.yml says enabled."""
import json
import os
from pathlib import Path
import re
import smtplib
import time
import urllib.request
from email.message import EmailMessage
from hp_common import ROOT, atomic_json, utc

def _coerce(value):
    if value in ('true', 'false'):
        return value == 'true'
    if re.fullmatch(r'-?\d+', value):
        return int(value)
    if len(value) >= 2 and value[0] == value[-1] and value[0] in '"\'':
        return value[1:-1]
    return value

def load_config(root=ROOT):
    path = Path(root) / 'configs/alert-bus.yml'
    if not path.exists():
        return {'enabled': False, 'max_per_10min': 5, 'configured': False}
    row = {'enabled': False, 'max_per_10min': 5, 'configured': True, 'webhook_url': '', 'smtp_host': '', 'smtp_port': 25, 'smtp_to': '', 'smtp_from': 'honeypot@localhost'}
    for raw in path.read_text(encoding='utf-8').splitlines():
        line = raw.split('#', 1)[0].strip()
        if not line or ':' not in line:
            continue
        key, value = line.split(':', 1)
        row[key.strip()] = _coerce(value.strip())
    row['configured'] = True
    row['enabled'] = row.get('enabled') is True
    return row

_BAIT = re.compile(r'HPAKIA[0-9a-fA-F]{8,}')

def _public_username(value, bait_tokens):
    text = str(value or '').strip()
    if not text or len(text) > 64 or any(char in text for char in '\r\n\x00'):
        return None
    lowered = text.lower()
    if text.startswith('-----') or _BAIT.search(text) or any(token in lowered for token in ('password', 'passwd', 'private key', 'tty', 'transcript')):
        return None
    if any(token and token in text for token in bait_tokens):
        return None
    return text

def build_payload(event, bait_tokens=()):
    command = str(event.get('command') or '')
    secretish = bool(re.search(r'password|passwd', command, re.I)) or any(token and token in command for token in bait_tokens) or bool(event.get('password'))
    payload = {
        'severity': event.get('severity'),
        'incident_id': event.get('incident_id'),
        'ports': list(event.get('ports') or []),
        'src_ip': event.get('source_ip') or event.get('src_ip'),
        'username': _public_username(event.get('username'), bait_tokens),
        'password_present': bool(event.get('password_present') or event.get('password') or secretish),
        'bait_id': event.get('bait_id') or ((event.get('bait_ids') or [None])[0]),
        'first_seen': event.get('first_seen') or event.get('timestamp'),
        'incident_path': event.get('incident_path'),
        'command_included': False,
    }
    cleaned = {}
    for key, value in payload.items():
        if isinstance(value, str) and _BAIT.search(value):
            cleaned[key] = None
        else:
            cleaned[key] = value
    return cleaned

def _window(path, now):
    try:
        stamps = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        stamps = []
    return [item for item in stamps if isinstance(item, (int, float)) and now - item < 600]

def allow(root, cfg, now=None):
    now = time.time() if now is None else now
    spool = Path(root) / 'state/alerts'
    spool.mkdir(parents=True, exist_ok=True)
    path = spool / 'window.json'
    stamps = _window(path, now)
    limit = int(cfg.get('max_per_10min') or 5)
    if len(stamps) >= limit:
        with (spool / 'digest.jsonl').open('a', encoding='utf-8') as handle:
            handle.write(json.dumps({'timestamp': utc(), 'suppressed': True}) + '\n')
        atomic_json(path, stamps)
        return False
    stamps.append(now)
    atomic_json(path, stamps)
    return True

def _deliver(cfg, payload):
    if cfg.get('webhook_url'):
        request = urllib.request.Request(cfg['webhook_url'], data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=8) as response:
            response.read()
        return 'webhook'
    if cfg.get('smtp_host') and cfg.get('smtp_to'):
        message = EmailMessage()
        message['Subject'] = 'honeypot ' + str(payload.get('severity'))
        message['From'] = cfg.get('smtp_from') or 'honeypot@localhost'
        message['To'] = cfg['smtp_to']
        message.set_content(json.dumps(payload))
        with smtplib.SMTP(cfg['smtp_host'], int(cfg.get('smtp_port') or 25), timeout=8) as smtp:
            smtp.send_message(message)
        return 'smtp'
    return 'spool-only'

def emit(event, root=ROOT, cfg=None, now=None):
    cfg = cfg if cfg is not None else load_config(root)
    spool = Path(root) / 'state/alerts'
    spool.mkdir(parents=True, exist_ok=True)
    if not cfg.get('enabled'):
        return {'status': 'disabled'}
    severity = event.get('severity')
    if severity not in ('HIGH', 'CRITICAL') and not event.get('bait_id') and not event.get('bait_ids'):
        return {'status': 'ignored'}
    payload = build_payload(event)
    if 'password' in json.dumps(payload).lower() and 'password_present' not in json.dumps(payload):
        return {'status': 'refused'}
    if not allow(root, cfg, now=now):
        atomic_json(spool / 'last.json', {'status': 'suppressed', 'timestamp': utc()})
        return {'status': 'suppressed', 'payload': payload}
    try:
        channel = _deliver(cfg, payload)
        result = {'status': 'sent', 'channel': channel, 'timestamp': utc(), 'payload': payload}
    except Exception as exc:
        result = {'status': 'FAILED', 'error': exc.__class__.__name__, 'timestamp': utc(), 'payload': payload}
    atomic_json(spool / 'last.json', {k: v for k, v in result.items() if k != 'payload'})
    with (spool / 'spool.jsonl').open('a', encoding='utf-8') as handle:
        handle.write(json.dumps(result) + '\n')
    return result

def health_note(root=ROOT):
    cfg = load_config(root)
    if not cfg.get('configured') or not cfg.get('enabled'):
        return None
    path = Path(root) / 'state/alerts/last.json'
    try:
        row = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None
    if row.get('status') == 'FAILED':
        return 'alert bus configured but last delivery FAILED'
    return None

if __name__ == '__main__':
    os.umask(0o027)
    print(json.dumps({'enabled': load_config().get('enabled') is True}))
