"""Operator-invoked imports, separated from running honeypot services."""
import base64
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from operational_log import get_log

from .io import parse_json, read_regular
from .model import MAX_BYTES, Phase10Error
from .registry import PLUGINS
from .store import Store


def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00', 'Z')


def _parse_report(plugin_id, format_name, raw, context, timeout_seconds):
    if os.geteuid() == 0:
        raise Phase10Error('Report workers must run as an unprivileged operator')
    if type(timeout_seconds) is not int or not 1 <= timeout_seconds <= 30:
        raise Phase10Error('Invalid parser deadline')
    spec = PLUGINS.get(plugin_id)
    if (spec is None or plugin_id in ('forensics', 'mock-ti') or
            format_name not in spec.input_formats):
        raise Phase10Error('Unsupported report plugin or format')
    if len(raw) > MAX_BYTES:
        raise Phase10Error('Report exceeds quota')
    request = json.dumps({'plugin': plugin_id, 'format': format_name,
                          'data': base64.b64encode(raw).decode('ascii'),
                          'context': context}, allow_nan=False).encode()
    if len(request) > 2 * MAX_BYTES:
        raise Phase10Error('Worker envelope exceeds quota')
    if sys.platform != 'linux':
        raise Phase10Error('Bounded parser workers require Linux resource limits')
    with tempfile.TemporaryDirectory(prefix='hp-import-') as scratch:
        try:
            result = subprocess.run(
                [sys.executable, '-I', '-B', str(Path(__file__).with_name('worker.py'))],
                input=request, capture_output=True, timeout=timeout_seconds,
                cwd=scratch, close_fds=True,
                env={'HOME': scratch, 'TMPDIR': scratch,
                     'LANG': 'C.UTF-8', 'PYTHONDONTWRITEBYTECODE': '1'})
        except subprocess.TimeoutExpired as exc:
            raise Phase10Error('Parser worker timed out') from exc
    if result.returncode:
        raise Phase10Error('Parser rejected report')
    if len(result.stdout) > MAX_BYTES:
        raise Phase10Error('Worker output exceeds quota')
    findings = parse_json(result.stdout)
    if not isinstance(findings, list) or len(findings) > context['max_records']:
        raise Phase10Error('Invalid worker result')
    return findings


def parse_report(plugin_id, format_name, raw, context, timeout_seconds):
    log, started = get_log('imports'), time.monotonic()
    log.event('worker.started', plugin=plugin_id, format=format_name,
              bytes=len(raw) if isinstance(raw, bytes) else 0)
    try:
        findings = _parse_report(plugin_id, format_name, raw, context, timeout_seconds)
    except (OSError, ValueError, TypeError, subprocess.SubprocessError) as exc:
        log.event('worker.failed', level='WARNING', plugin=plugin_id, format=format_name,
                  error_type=type(exc).__name__,
                  error_code='worker_timeout' if isinstance(exc.__cause__, subprocess.TimeoutExpired) else 'worker_rejected',
                  duration_ms=(time.monotonic() - started) * 1000)
        raise
    log.event('worker.completed', plugin=plugin_id, format=format_name, records=len(findings),
              duration_ms=(time.monotonic() - started) * 1000)
    return findings


def import_report(root, policy, plugin_id, format_name, path):
    policy.require(plugin_id)
    if plugin_id in ('sentinel', 'imazing'):
        raise Phase10Error('Use the dedicated completed-case or backup import')
    raw = read_regular(path, policy.max_bytes)
    imported_at = utc()
    digest = hashlib.sha256(raw).hexdigest()
    context = policy.context(digest, imported_at)
    findings = parse_report(plugin_id, format_name, raw, context, policy.timeout_seconds)
    return Store(root, policy).save(plugin_id, format_name, raw, findings, imported_at)


def import_sentinel(root, policy, bundle_path):
    from .sentinel import verify_bundle

    policy.require('sentinel')
    verified = verify_bundle(bundle_path)
    raw, receipt = verified['exchange'], verified['receipt']
    if len(raw) > policy.max_bytes:
        raise Phase10Error('Exchange exceeds import quota')
    imported_at = utc()
    context = policy.context(hashlib.sha256(raw).hexdigest(), imported_at)
    context['sentinel_bundle_receipt'] = receipt
    findings = parse_report('sentinel', 'jsonl', raw, context, policy.timeout_seconds)
    return {'manifest': Store(root, policy).save('sentinel', 'jsonl', raw, findings, imported_at),
            'verification': receipt}
