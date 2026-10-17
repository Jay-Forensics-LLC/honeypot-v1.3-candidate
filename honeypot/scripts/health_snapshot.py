"""Validate saved health observations without claiming a fresh runtime check."""
import datetime as dt
from pathlib import Path

SERVICES = ('cowrie', 'opencanary', 'suricata', 'loki', 'alloy', 'grafana', 'incidentd')


def boot_id():
    try:
        return Path('/proc/sys/kernel/random/boot_id').read_text().strip() or None
    except OSError:
        return None


def problems(row, current_boot=None, now=None, max_age=180):
    if not isinstance(row, dict) or not row:
        return ['Health snapshot unavailable; run healthcheck.py on the runtime host']
    recorded = row.get('problems', [])
    issues = list(recorded) if isinstance(recorded, list) and all(isinstance(v, str) for v in recorded) else ['Malformed snapshot problem list']
    def mapping(value):
        return value if isinstance(value, dict) else {}
    now = now or dt.datetime.now(dt.timezone.utc)
    try:
        stamp = dt.datetime.fromisoformat(row['timestamp'].replace('Z', '+00:00'))
        if stamp.tzinfo is None:
            raise ValueError('Timestamp lacks timezone')
        age = (now - stamp).total_seconds()
        if age < -5 or age > max_age:
            issues.append('Health snapshot stale or future-dated; refresh on the runtime host')
    except (KeyError, ValueError, TypeError, AttributeError):
        issues.append('Health snapshot timestamp invalid')
    if not current_boot or row.get('boot_id') != current_boot:
        issues.append('Health snapshot boot identity unknown or different; refresh after reboot')
    if row.get('severity') not in ('LOW', 'MEDIUM'):
        issues.append('Health severity unsafe or unknown')
    if mapping(row.get('guard')).get('ok') is not True:
        issues.append('Containment not verified in snapshot')
    if row.get('pcap_running') is not True or mapping(row.get('capture')).get('ok') is not True:
        issues.append('Capture not verified in snapshot')
    for name in SERVICES:
        service = mapping(mapping(row.get('containers')).get(name))
        if service.get('state') != 'running' or service.get('health') != 'healthy':
            issues.append(name + ' not running and healthy in snapshot')
    return list(dict.fromkeys(issues))
