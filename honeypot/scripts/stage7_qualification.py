#!/usr/bin/env python3
"""Fresh Stage 7 baseline and seven existing-container restarts; never executes Stage 8."""
import argparse
from contextlib import contextmanager
import copy
import datetime as dt
import hashlib
import ipaddress
import json
import math
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import tempfile
import time

import demo
from evidence_store import records
from hp_common import sha256, utc, runtime_path
from incidentd import normalize
import live_capture
from pcap_demo_recovery import compare_runtime, storage_gate
import stage7_preservation as preservation
import stage7_recovery_check as review
from runtime_inventory import collect
import qualification_context
from packet_snapshot import verify_acquisition

SOURCE = Path(__file__).resolve().parents[1]
RUNTIME = review.RUNTIME
CONTEXT = None
ORDER = ('opencanary', 'cowrie', 'suricata', 'alloy', 'loki', 'grafana', 'incidentd')
REQUIRED = ('identity', 'runtime', 'execution_configuration', 'capture', 'pipeline',
            'heartbeat', 'suricata_logging', 'routes', 'preservation', 'existing_loki', 'postflight')
DEMO_REPORT = SOURCE / 'work/demo/run-irv_hi81/report.json'
DEMO_HASH = 'be680acbf866dbbef9b8c4df31c0338a9678131ce6ba3b6dca30be3e07787a2d'
DEMO_CAPTURE_HASH = '8addc8592c727be99340ccfbae46e2b2fd1fffc8bcab5ce3b37d34611d2ad059'
CONFIRMATION = SOURCE / 'work/live-demo-hash-confirmation-gyflu16g/confirmation-report.json'
CONFIRMATION_HASH = '1719b6c45a9ff99cf4780838052a5a28eadde8c73ac5a6a4cbdf0230e1c139c5'


@contextmanager
def deadline(seconds):
    def expired(signum, frame):
        raise TimeoutError(f'Qualification phase exceeded {seconds} seconds')
    previous = signal.signal(signal.SIGALRM, expired)
    signal.alarm(seconds)
    try:
        yield
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, previous)


def command(argv, root=None, timeout=20):
    result = subprocess.run(argv, cwd=RUNTIME if root is None else root,
                            text=True, capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f'Command exit {result.returncode}: {argv[:3]}: {result.stderr[:2000]}')
    return result.stdout


def restart_existing(row, cid, folder=None):
    """One restart with retained diagnostics; runtime checks still prove identity."""
    if not re.fullmatch(r'[0-9a-f]{64}', cid):
        raise ValueError('Restart requires the inspected full container ID')
    argv = ['docker', 'restart', '--timeout', '15', cid]
    row['restart_command'] = argv
    row['restart_requested_utc'] = utc()
    if folder is not None:
        row['restart_intent'] = save(folder / 'restart-intent.json', {
            'service': row['service'], 'argv': argv, 'requested_utc': row['restart_requested_utc'],
            'scope': 'Intent only; command completion and recovery not yet established'})
    print('RESTART: ' + row['service'], flush=True)

    def output(value):
        if isinstance(value, bytes):
            value = value.decode('utf-8', errors='replace')
        return (value or '')[:16384]

    try:
        result = subprocess.run(argv, cwd=RUNTIME, text=True, capture_output=True, timeout=35)
    except subprocess.TimeoutExpired as exc:
        row['restart_exit'] = None
        row['restart_response'] = {'status': 'TIMEOUT', 'stdout': output(exc.stdout),
                                   'stderr': output(exc.stderr), 'completed_utc': utc()}
        if folder is not None:
            row['restart_response_artifact'] = save(folder / 'restart-response.json', row['restart_response'])
        raise
    except KeyboardInterrupt:
        row['restart_exit'] = None
        row['restart_response'] = {'status': 'INTERRUPTED', 'exit_code': None,
                                  'outcome': 'UNKNOWN: restart may have reached daemon; no retry',
                                  'completed_utc': utc()}
        if folder is not None:
            row['restart_response_artifact'] = save(folder / 'restart-response.json', row['restart_response'])
        raise
    row['restart_exit'] = result.returncode
    truncated = len(result.stdout) > 16384 or len(result.stderr) > 16384
    row['restart_response'] = {'status': 'RETURNED', 'stdout': output(result.stdout),
                               'stderr': output(result.stderr), 'exit_code': result.returncode,
                               'truncated': truncated, 'completed_utc': utc()}
    if folder is not None:
        row['restart_response_artifact'] = save(folder / 'restart-response.json', row['restart_response'])
    if result.returncode:
        raise RuntimeError(f'Docker restart exit {result.returncode}: {output(result.stderr)}')
    if truncated or result.stdout.strip() != cid:
        raise ValueError('Docker restart response identity differs')


def save(path, value):
    """Exclusive, durable new private artifact; never overwrites existing reports."""
    path = Path(path)
    data = (json.dumps(value, indent=2, sort_keys=True) + '\n').encode()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    parent = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(parent)
    finally:
        os.close(parent)
    # Only new report files/directories are assigned to the invoking operator.
    if os.geteuid() == 0 and os.environ.get('SUDO_UID'):
        owner = int(os.environ['SUDO_UID'])
        os.chown(path, owner, -1)
        os.chown(path.parent, owner, -1)
    return {'path': str(path), 'sha256': hashlib.sha256(data).hexdigest(),
            'bytes': len(data), 'acquired_utc': utc()}


def load_verified(path, digest, limit=32 * 1024**2):
    data = preservation.stable_bytes(path, limit)
    if hashlib.sha256(data).hexdigest() != digest:
        raise ValueError('Linked report hash differs: ' + str(path))
    return json.loads(data)


def implementation():
    paths = list((SOURCE / 'scripts').glob('*.py')) + list((SOURCE / 'tests').glob('test*.py'))
    paths += [SOURCE / 'Makefile']
    paths += [SOURCE / 'work/live-qualification' / (name + '.py') for name in (
        'stage7-reconciled-evidence', 'stage7-evidence-integrity-sweep', 'stage7-restart-resilience')]
    paths += list((SOURCE / 'work/live-qualification').glob('test-stage7*.py'))
    return {str(path.relative_to(SOURCE)): sha256(path)[0] for path in sorted(paths)}


def source_revision():
    if command(['git', 'status', '--porcelain', '--untracked-files=all'], SOURCE).strip():
        raise ValueError('Source working tree must be checkpointed before qualification')
    return command(['git', 'rev-parse', 'HEAD'], SOURCE).strip()


def prerequisite_passed(row):
    if CONTEXT is not None:
        CONTEXT.validate_current()
        CONTEXT.check_identity(row, max_age=120)
    evidence = row.get('evidence_integrity', {})
    if CONTEXT is not None:
        uniqueness = evidence.get('event_id_uniqueness', {})
        count = uniqueness.get('unique_event_ids')
        if (uniqueness.get('status') != 'VERIFIED_UNIQUE' or type(count) is not int or
                not 0 < count <= review.EVIDENCE_EVENT_ID_LIMIT or
                uniqueness.get('limit') != review.EVIDENCE_EVENT_ID_LIMIT):
            raise ValueError('Complete global event ID uniqueness review required')
    planned = evidence.get('planned_total_bytes')
    acquired = evidence.get('bytes_read')
    accounting = evidence.get('read_accounting')
    accounting_ok = isinstance(planned, int) and isinstance(acquired, int) and 0 < planned <= acquired <= review.EVIDENCE_READ_BUDGET
    # Inventory sizes are estimates collected before each later stable read.
    # Growth is accepted only with complete per-incident acquired-byte accounting.
    if accounting is not None:
        accounting_ok = accounting_ok and isinstance(accounting, list) and len(accounting) == evidence.get('files_scanned')
        names = set()
        planned_sum = acquired_sum = 0
        for item in accounting if isinstance(accounting, list) else []:
            if not isinstance(item, dict):
                accounting_ok = False
                break
            path = item.get('path')
            values = [item.get(key) for key in ('planned_event_bytes', 'planned_metadata_bytes', 'event_bytes', 'metadata_bytes')]
            if (not isinstance(path, str) or path in names or
                    any(type(value) is not int or value < 0 for value in values)):
                accounting_ok = False
                break
            names.add(path)
            pe, pm, ae, am = values
            if (pe > review.EVIDENCE_FILE_LIMIT or ae > review.EVIDENCE_FILE_LIMIT or
                    pm > review.EVIDENCE_METADATA_LIMIT or am > review.EVIDENCE_METADATA_LIMIT or ae < pe or am < pm):
                accounting_ok = False
            planned_sum += pe + pm
            acquired_sum += ae + am
        accounting_ok = accounting_ok and planned_sum == planned and acquired_sum == acquired
        accounting_ok = accounting_ok and evidence.get('inventory_size_delta_bytes') == acquired - planned
    else:
        # Historical equal-size reports remain usable as links; unexplained
        # differences without acquisition accounting require a fresh review.
        accounting_ok = accounting_ok and acquired == planned
    if (row.get('STATUS') != 'ACTIVE_PREREQUISITES_PASSED' or row.get('error') or
            row.get('runtime_comparison', {}).get('ok') is not True or
            evidence.get('status') != ('VERIFIED_KNOWN_DEFECT_ONLY' if CONTEXT is None else 'VERIFIED_CLEAN') or
            not evidence.get('files_in_inventory') or
            evidence.get('files_scanned') != evidence.get('files_in_inventory') or
            evidence.get('files_in_inventory', 0) > review.EVIDENCE_COUNT_LIMIT or
            not accounting_ok):
        raise ValueError('Complete active prerequisite review required: ' + str(
            row.get('error') or {k: evidence.get(k) for k in (
                'status', 'files_in_inventory', 'files_scanned', 'planned_total_bytes', 'bytes_read')}))
    review.active_gate(row['runtime'])
    review.active_gate(row['runtime_after'])
    if CONTEXT is not None:
        CONTEXT.check_runtime(row['runtime'])
        CONTEXT.check_runtime(row['runtime_after'])


def strict_compare(before, after, target=None, dynamic_mac=False):
    """Only this row's restarted endpoint/start may change; all other fields stay strict."""
    left, right = copy.deepcopy(before), copy.deepcopy(after)
    allowed = []
    if target is not None:
        old, new = left['containers'][target], right['containers'][target]
        if old['started_at'] == new['started_at'] or not new['started_at']:
            raise ValueError('Intended container has no new start identity')
        allowed.append({'field': f'containers.{target}.started_at',
                        'before': old['started_at'], 'after': new['started_at']})
        new['started_at'] = old['started_at']
        for name, endpoint in old['networks'].items():
            other = new['networks'].get(name, {})
            for field in ('EndpointID', 'MacAddress') if dynamic_mac else ('EndpointID',):
                if endpoint.get(field) != other.get(field):
                    allowed.append({'field': f'containers.{target}.networks.{name}.{field}',
                                    'before': endpoint.get(field), 'after': other.get(field)})
                other[field] = endpoint.get(field)
            for network in right['networks']:
                if network['Name'] != name:
                    continue
                prior = next(n for n in left['networks'] if n['Name'] == name)
                cid = old['id']
                if cid in prior.get('Containers', {}) and cid in network.get('Containers', {}):
                    member = network['Containers'][cid]
                    original = prior['Containers'][cid]
                    # Verify both views describe the same actual endpoint before normalization.
                    actual = after['containers'][target]['networks'][name]
                    if member.get('EndpointID') != actual.get('EndpointID') or member.get('MacAddress') != actual.get('MacAddress'):
                        raise ValueError('Container/network endpoint inventory is inconsistent')
                    for field in ('EndpointID', 'MacAddress') if dynamic_mac else ('EndpointID',):
                        member[field] = original.get(field)
    result = compare_runtime(left, right)
    result['documented_lifecycle_changes'] = allowed
    if result['ok'] is not True:
        raise ValueError('Unexpected runtime drift: ' + ', '.join(c['field'] for c in result['differences']))
    return {'status': 'PASS', **result}


def execution_configuration(runtime):
    ids = [runtime['containers'][n]['id'] for n in ORDER]
    inspected = json.loads(command(['docker', 'inspect', *ids]))
    if len(inspected) != len(ORDER):
        raise ValueError('Incomplete full container inspection')
    rendered = json.loads(command(['docker', 'compose', 'config', '--format', 'json']))
    result = {}
    dynamic = {}
    for name, container in zip(ORDER, inspected):
        if container['Id'] != runtime['containers'][name]['id']:
            raise ValueError('Container changed while inspecting execution configuration')
        config, host = container['Config'], container['HostConfig']
        # HostConfig includes restart policy, privileges, resources, DNS and port definitions.
        result[name] = {'HostConfig': host, 'Config': {k: v for k, v in config.items() if k not in ('Env',)},
                        'environment_sha256': hashlib.sha256(json.dumps(config.get('Env'), sort_keys=True).encode()).hexdigest()}
        spec = rendered['services'][name]
        entries = spec.get('networks') or {}
        configured = True
        if isinstance(entries, dict):
            configured = bool(spec.get('mac_address')) or any(
                isinstance(v, dict) and v.get('mac_address') for v in entries.values())
        configured = configured or bool(config.get('MacAddress')) or any(
            (v.get('IPAMConfig') or {}).get('MacAddress') or
            any('macaddress' in k.lower() or 'mac_address' in k.lower() for k in (v.get('DriverOpts') or {}))
            for v in container['NetworkSettings']['Networks'].values())
        dynamic[name] = not configured
    return {'status': 'PASS', 'containers': result, 'dynamic_mac': dynamic}


def routes_and_tty(runtime):
    def cat(service, path):
        return command(['docker', 'exec', runtime['containers'][service]['id'], 'cat', path])
    alloy = cat('alloy', '/etc/alloy/config.alloy')
    datasource = cat('grafana', '/etc/grafana/provisioning/datasources/loki.yml')
    if alloy != (RUNTIME / 'configs/alloy/config.alloy').read_text() or datasource != (RUNTIME / 'configs/grafana/provisioning/datasources/loki.yml').read_text():
        raise ValueError('Loaded logging route differs from mounted source')
    if not all(value in alloy for value in ('/logs/normalized/events.jsonl', 'loki.write.local.receiver', 'http://loki:3100/loki/api/v1/push')):
        raise ValueError('Required normalized telemetry to Loki route absent')
    if 'type: loki' not in datasource or 'http://loki:3100' not in datasource:
        raise ValueError('Grafana Loki route absent')
    tty = json.loads(command(['docker', 'exec', runtime['containers']['cowrie']['id'],
                             '/cowrie/cowrie-env/bin/python3', '-B', '-c',
                             'import json,os,stat; p="/cowrie/cowrie-git/var/lib/cowrie/tty"; s=os.stat(p); '
                             'assert stat.S_ISDIR(s.st_mode); print(json.dumps(dict(path=os.path.realpath(p),uid=s.st_uid,gid=s.st_gid,mode=stat.S_IMODE(s.st_mode))))']))
    return {'status': 'PASS', 'alloy_sha256': hashlib.sha256(alloy.encode()).hexdigest(),
            'grafana_datasource_sha256': hashlib.sha256(datasource.encode()).hexdigest(), 'tty': tty}


def evidence_permissions():
    result = {}
    capture_directory = (Path('/var/lib/honeypot/captures') if CONTEXT is None else
                         runtime_path('PCAP_PATH', 'captures', RUNTIME))
    for path in (RUNTIME / 'secrets', RUNTIME / 'incidents', RUNTIME / 'artifacts',
                 RUNTIME / 'state/trusted', capture_directory):
        info = path.lstat()
        if path.resolve() != path.absolute() or not path.is_dir() or info.st_mode & 0o007:
            raise ValueError('Evidence/security directory permissions differ: ' + str(path))
        result[str(path)] = {'uid': info.st_uid, 'gid': info.st_gid, 'mode': info.st_mode & 0o7777}
    return result


def quarantine_state():
    directory = RUNTIME / 'state/quarantine'
    if directory.is_symlink():
        raise ValueError('Quarantine directory symlink')
    result = {}
    if not directory.exists():
        return result
    for path in directory.iterdir():
        if path.suffix != '.json':
            raise ValueError('Unreviewed quarantine state file')
        data = preservation.stable_bytes(path, 64 * 1024)
        value = json.loads(data)
        if value.get('active') is not False or len(result) >= 100:
            raise ValueError('Active or oversized quarantine state requires separate review')
        result[path.name] = hashlib.sha256(data).hexdigest()
    return result


def loki_event(runtime, event):
    if not re.fullmatch('[0-9a-f]{64}', event['event_id']):
        raise ValueError('Invalid exact event ID')
    stamp = dt.datetime.fromisoformat(event['timestamp'].replace('Z', '+00:00')).timestamp()
    start, end = int((stamp - 60) * 10**9), int((stamp + 60) * 10**9)
    code = '''import json,sys,urllib.request,urllib.parse
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs): return None
q='{source="normalized"} |= '+json.dumps(sys.argv[1])
url='http://loki:3100/loki/api/v1/query_range?'+urllib.parse.urlencode(dict(query=q,start=sys.argv[2],end=sys.argv[3],limit=100))
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
data=json.load(opener.open(url,timeout=5))
assert data['status']=='success'
print(json.dumps([json.loads(v[1]) for s in data['data']['result'] for v in s['values'] if json.loads(v[1]).get('event_id')==sys.argv[1]]))
'''
    found = json.loads(command(['docker', 'exec', runtime['containers']['incidentd']['id'],
                                'python', '-B', '-c', code, event['event_id'], str(start), str(end)], timeout=10))
    if not found or any(value != event for value in found):
        raise ValueError('Exact unchanged normalized event absent from Loki: ' + event['event_id'])
    return {'status': 'PASS', 'event_id': event['event_id'], 'matches': len(found), 'start_ns': start, 'end_ns': end}


def observe():
    runtime = collect(RUNTIME, SOURCE)
    resources = live_capture.readiness(RUNTIME)
    try:
        if CONTEXT is not None:
            CONTEXT.validate_current()
            CONTEXT.check_runtime(runtime)
        review.active_gate(runtime)
        if runtime.get('http_readiness') != {'loki': True, 'alloy': True, 'grafana': True}:
            raise ValueError('Internal service HTTP readiness unverified')
        storage_gate(RUNTIME)
        if resources.get('ok') is not True:
            raise ValueError('Capture output/resources unready: ' + str(resources.get('problems')))
        if (RUNTIME / 'state/wan-approval.json').exists():
            raise ValueError('WAN approval state unexpectedly present')
    except Exception as exc:
        exc.runtime_observation = runtime
        exc.capture_observation = resources
        raise
    return runtime, resources


def integrity_startup(since=None):
    if CONTEXT is not None:
        CONTEXT.validate_current()
        path = RUNTIME / 'logs/system/evidence-startup.jsonl'
        rows = [json.loads(line) for line in preservation.stable_bytes(path, 16 * 1024**2).splitlines()]
        if not rows:
            raise ValueError('Positive evidence startup audit absent')
        latest = rows[-1]
        if (latest.get('action') != 'EVIDENCE_STARTUP_SCAN_COMPLETE' or
                latest.get('status') != 'CLEAN' or latest.get('scan_complete') is not True or
                latest.get('locator_ready') is not True or latest.get('migration_failed') is not False or
                type(latest.get('scanned_incidents')) is not int or latest['scanned_incidents'] < 0 or
                type(latest.get('blocked_incidents')) is not int or latest['blocked_incidents'] != 0 or
                type(latest.get('producer_pid')) is not int or latest['producer_pid'] <= 0 or
                type(latest.get('producer_started_ticks')) is not int or latest['producer_started_ticks'] <= 0 or
                latest.get('boot_id') != CONTEXT.value['boot_id']):
            raise ValueError('Complete clean current-boot startup scan required')
        qualification_context.fresh(latest['timestamp'])
        qualification_context.fresh(latest['started_utc'])
        if latest['started_utc'] > latest['timestamp']:
            raise ValueError('Startup scan timing is inconsistent')
        if since and dt.datetime.fromisoformat(latest['started_utc'].replace('Z', '+00:00')) < dt.datetime.fromisoformat(since.replace('Z', '+00:00')):
            raise ValueError('New incidentd startup audit absent after restart')
        cid = command(['docker', 'compose', 'ps', '-q', 'incidentd']).strip()
        if not re.fullmatch('[0-9a-f]{64}', cid):
            raise ValueError('Current incidentd container identity unavailable')
        code = ('import json; from pathlib import Path; '
                's=Path("/proc/1/stat").read_text().rsplit(")",1)[1].split(); '
                'print(json.dumps(dict(pid=1,started_ticks=int(s[19]),'
                'boot_id=Path("/proc/sys/kernel/random/boot_id").read_text().strip())))')
        producer = json.loads(command(['docker', 'exec', cid, 'python', '-B', '-c', code]))
        if (latest.get('producer_pid') != producer.get('pid') or
                latest.get('producer_started_ticks') != producer.get('started_ticks') or
                latest.get('boot_id') != producer.get('boot_id')):
            raise ValueError('Startup audit belongs to another producer/container start')
        return {'status': 'PASS', 'audit': latest, 'container_id': cid,
                'qualification_identity': CONTEXT.identity(), 'historical_closeout': 'UNKNOWN',
                'scope': 'Positive current-producer complete clean startup; full independent store sweep remains required'}
    historical = review.retained_module('stage7-reconciled-evidence')
    rows = demo.rows(RUNTIME / 'logs/system/evidence-integrity.jsonl')
    if not rows:
        raise ValueError('Evidence startup protection diagnostics absent')
    expected = '/hp/incidents/' + str(historical.ORIGINAL.relative_to(RUNTIME / 'incidents'))
    for row in rows:
        if (row.get('path') != expected or row.get('original_sha256') != historical.ORIGINAL_HASH or
                row.get('action') != 'BLOCK_INCIDENT_WRITES' or row.get('original_bytes_preserved') is not True):
            raise ValueError('Unexpected evidence-integrity startup diagnostic')
    if since and not any(row['timestamp'] >= since for row in rows):
        raise ValueError('New incidentd startup protection diagnostic absent')
    return {'status': 'PASS', 'original_sha256': historical.ORIGINAL_HASH,
            'blocked_original': expected, 'diagnostics_observed': len(rows),
            'scope': 'Pinned defect is retained and write-blocked; cause and power-loss durability remain separate obligations'}


def baseline(folder, supplied, supplied_hash, validation, validation_hash):
    if CONTEXT is not None:
        CONTEXT.validate_current()
        entry = CONTEXT.value['receipts']['prerequisites']
        if str(supplied) != entry['path'] or supplied_hash != entry['sha256']:
            raise ValueError('Supplied prerequisite receipt differs from context')
        historic = CONTEXT.receipt('prerequisites')
    else:
        historic = load_verified(supplied, supplied_hash)
    prerequisite_passed(historic)
    checked = load_verified(validation, validation_hash)
    if checked.get('status') != 'PASS' or checked.get('implementation') != implementation():
        raise ValueError('Validation does not cover current qualification implementation')
    expected_commands = {'make stage7-test', 'make test', 'make verify'}
    if not expected_commands <= {r['command'] for r in checked.get('commands', []) if r.get('exit_code') == 0}:
        raise ValueError('Required regression commands have not all passed')
    revision = source_revision()
    if CONTEXT is not None and revision != CONTEXT.value['source_commit']:
        raise ValueError('Clean source commit differs from context')
    # Refresh the full reviewed prerequisite scan within its unchanged deadline.
    fresh = review.inspect(RUNTIME, active=True)
    fresh_link = save(folder / 'fresh-prerequisites.json', fresh)
    prerequisite_passed(fresh)
    strict_compare(historic['runtime_after'], fresh['runtime'])
    before, resources = observe()
    strict_compare(fresh['runtime_after'], before)
    config = execution_configuration(before)
    routes = routes_and_tty(before)
    permissions = evidence_permissions()
    quarantine = quarantine_state()
    retained = acquire_preservation(folder, 'baseline-preservation')
    startup = integrity_startup()
    if CONTEXT is None:
        demo_report = load_verified(DEMO_REPORT, DEMO_HASH)
        load_verified(CONFIRMATION, CONFIRMATION_HASH)
        if demo_report.get('status') != 'PASS_LIVE' or sha256(DEMO_REPORT.parent / 'capture-match.pcapng')[0] != DEMO_CAPTURE_HASH:
            raise ValueError('Established guarded demonstration/capture differs')
        established = {'path': str(DEMO_REPORT), 'sha256': DEMO_HASH, 'capture_sha256': DEMO_CAPTURE_HASH}
    else:
        demo_report, established = cleanroom_demo(before)
    demo_event = records(Path(demo_report['result']['evidence_path']))[demo_report['result']['event_id']]['normalized']
    central = loki_event(before, demo_event)
    after, after_resources = observe()
    stability = strict_compare(before, after)
    if (execution_configuration(after) != config or routes_and_tty(after) != routes or
            evidence_permissions() != permissions or quarantine_state() != quarantine):
        raise ValueError('Execution configuration/routes changed during baseline')
    return {'status': 'BASELINE_PASS', 'created_utc': utc(), 'boot_id': before['boot_id'],
            'qualification_identity': None if CONTEXT is None else CONTEXT.identity(),
            'historical_closeout': 'LEGACY_VERIFICATION_REQUIRED' if CONTEXT is None else 'UNKNOWN',
            'source_commit': revision, 'implementation': implementation(),
            'validation': {'path': str(validation), 'sha256': validation_hash},
            'supplied_prerequisites': {'path': str(supplied), 'sha256': supplied_hash},
            'fresh_prerequisites': fresh_link, 'runtime': after, 'capture_resources': after_resources,
            'execution_configuration': config, 'routes': routes, 'preservation': retained,
            'evidence_permissions': permissions,
            'quarantine': quarantine,
            'startup_protection': startup, 'stable_second_observation': stability,
            'established_demo': established,
            'existing_event': demo_event, 'existing_loki': central,
            'historical_obligations': ['Original corruption cause UNKNOWN; derivative recovery is not original evidence',
                                       'Historical reboot capture gap UNKNOWN; Stage 8 NOT TESTED'],
            'durability_disposition': 'Stage 7 process-restart durability must pass preservation/dedup/startup checks; '
                                      'unresolved power-loss/root-cause investigation is not represented as passed'}


def cleanroom_demo(current):
    """Require fresh real guarded-demo receipts; never bootstrap a synthetic PASS."""
    CONTEXT.validate_current()
    report = CONTEXT.receipt('demo')
    confirmation = CONTEXT.receipt('confirmation')
    CONTEXT.check_identity(confirmation)
    qualification_context.fresh(report['timestamp'])
    if (report.get('status') != 'PASS_LIVE' or report.get('mode') != 'live' or
            report.get('synthetic') is not True or report.get('postflight', {}).get('status') != 'PASS' or
            report['postflight'].get('read_only') is not True or report['postflight'].get('problems') != [] or
            any(not isinstance(report.get('steps', {}).get(step), str) or
                not report['steps'][step].startswith('PASS:') for step in demo.STEPS)):
        raise ValueError('Fresh complete guarded live demo required')
    CONTEXT.check_runtime(report['runtime'])
    CONTEXT.check_runtime(current)
    review.active_gate(report['runtime'])
    runtime_comparison = strict_compare(report['runtime'], current)
    if report.get('implementation') != demo.implementation():
        raise ValueError('Guarded demo implementation differs from current source')
    marker = report.get('demo_run_id')
    interaction = report.get('interaction')
    if (not isinstance(interaction, dict) or set(interaction) != {
            'started_epoch', 'target_ip', 'target_port', 'host_port', 'protocol'} or
            interaction.get('protocol') != 'ftp' or type(interaction.get('target_port')) is not int or
            interaction['target_port'] != 2121 or type(interaction.get('host_port')) is not int or
            not 1 <= interaction['host_port'] <= 65535 or
            type(interaction.get('started_epoch')) not in (int, float) or
            not math.isfinite(interaction['started_epoch']) or
            not isinstance(marker, str) or not re.fullmatch(r'honeytrace-demo-[A-Za-z0-9_-]{1,96}', marker)):
        raise ValueError('Guarded demo interaction is incomplete or malformed')
    started = interaction['started_epoch']
    qualification_context.fresh(dt.datetime.fromtimestamp(started, dt.timezone.utc).isoformat())
    qualification_context.fresh(report['postflight']['completed_utc'])
    began = dt.datetime.fromisoformat(report['timestamp'].replace('Z', '+00:00')).timestamp()
    completed = dt.datetime.fromisoformat(report['postflight']['completed_utc'].replace('Z', '+00:00')).timestamp()
    if not began <= started <= completed:
        raise ValueError('Guarded demo interaction time lies outside its execution')
    canary = current['containers']['opencanary']
    expected_target = canary['networks']['honeypot-canary-net']['IPAddress']
    if (interaction['target_ip'] != expected_target or
            ipaddress.ip_address(expected_target) not in ipaddress.ip_network('172.29.41.0/24') or
            canary['ports'].get('2121/tcp') != [{'HostIp': '127.0.0.1', 'HostPort': str(interaction['host_port'])}]):
        raise ValueError('Guarded demo interaction differs from inspected loopback target')
    incident_path = qualification_context.canonical(report['result']['evidence_path'])
    incident_path.relative_to(RUNTIME / 'incidents')
    if incident_path.name != 'events.jsonl' or not re.fullmatch('[0-9a-f]{64}', report['result']['event_id']):
        raise ValueError('Guarded demo incident locator differs')
    if preservation.regular(incident_path).st_size > review.EVIDENCE_FILE_LIMIT:
        raise ValueError('Guarded demo incident exceeds unchanged evidence bound')
    record = records(incident_path)[report['result']['event_id']]
    normalized, raw = record['normalized'], record['raw']
    serialized = json.dumps(record, sort_keys=True, separators=(',', ':')).encode()
    if (normalized.get('event_id') != report['result']['event_id'] or
            normalized.get('source') != 'opencanary' or normalized.get('service') != 'ftp' or
            normalized.get('username') != marker or raw.get('logdata', {}).get('USERNAME') != marker or
            hashlib.sha256(serialized).hexdigest() != report['result'].get('record_sha256')):
        raise ValueError('Guarded demo marker/retained incident record linkage differs')
    entries = CONTEXT.value['receipts']
    packet = report.get('capture_evidence', {})
    if (confirmation.get('status') != 'PASS' or
            confirmation.get('demo_sha256') != entries['demo']['sha256'] or
            confirmation.get('capture_sha256') != entries['capture']['sha256'] or
            packet.get('ok') is not True or packet.get('sha256') != entries['capture']['sha256'] or
            packet.get('snapshot') != entries['capture']['path']):
        raise ValueError('Demo/capture/confirmation linkage differs')
    data = CONTEXT.receipt('capture', parse=False)
    if len(data) != packet.get('bytes'):
        raise ValueError('Demo retained packet byte count differs')
    acquisition = verify_acquisition(packet)
    packet_match = verify_packet_marker(packet, marker, expected_target, 2121, started, 'ftp')
    return report, {'path': entries['demo']['path'], 'sha256': entries['demo']['sha256'],
                    'capture_sha256': entries['capture']['sha256'],
                    'confirmation': entries['confirmation'],
                    'packet_acquisition': acquisition,
                    'packet_match': packet_match, 'runtime_comparison': runtime_comparison,
                    'qualification_identity': CONTEXT.identity(), 'historical_closeout': 'UNKNOWN'}


def ssh_banner(port, marker):
    with socket.create_connection(('127.0.0.1', port), timeout=5) as connection:
        connection.settimeout(5)
        greeting = b''
        until = time.monotonic() + 5
        while not greeting.endswith(b'\n') and len(greeting) < 1024:
            remaining = until - time.monotonic()
            if remaining <= 0:
                raise TimeoutError('SSH banner deadline exceeded')
            connection.settimeout(remaining)
            chunk = connection.recv(1024 - len(greeting))
            if not chunk:
                raise ValueError('Cowrie SSH banner truncated')
            greeting += chunk
        if not greeting.startswith(b'SSH-2.0-') or not greeting.endswith(b'\n'):
            raise ValueError('Unexpected Cowrie SSH server banner')
        connection.sendall(('SSH-2.0-' + marker + '\r\n').encode('ascii'))
        # No authentication, command, payload execution or external endpoint.
        time.sleep(0.25)


def probe_classification(raw, event, context, protocol):
    """Check this controlled input and the engine's receipt-order thresholds.

    A unique marker does not create a new correlation group: localhost probes
    can share an incident with earlier activity. Only the history through this
    exact event contributes; the incident's later aggregate severity does not.
    This is read-only and never constructs an Engine against live state.
    """
    source = {'ftp': 'opencanary', 'ssh_banner': 'cowrie'}[protocol]
    expected = normalize(source, raw)
    if (expected['severity'] != 'LOW' or expected['service'] != ('ftp' if protocol == 'ftp' else 'ssh') or
            expected['event_type'] != ('2000' if protocol == 'ftp' else 'cowrie.client.version')):
        raise ValueError('Unexpected controlled probe input')
    for field in ('source', 'service', 'event_type', 'username', 'fingerprint',
                  'password_present', 'command', 'url', 'sha256'):
        if event.get(field) != expected[field]:
            raise ValueError('Controlled probe normalization differs: ' + field)
    if event.get('bait_ids'):
        raise ValueError('Unexpected bait classification on controlled probe')
    rules_data = context['rules_json'].encode()
    if hashlib.sha256(rules_data).hexdigest() != context['rules_sha256']:
        raise ValueError('Retained classification rules hash differs')
    rules = json.loads(rules_data)
    for field in ('auth_threshold', 'service_threshold', 'max_field_values', 'max_events_per_incident'):
        if type(rules.get(field)) is not int or rules[field] < 1:
            raise ValueError('Invalid reviewed correlation threshold: ' + field)
    history = context['history']
    if (not isinstance(history, list) or not history or len(history) > rules['max_events_per_incident'] or
            history[-1].get('event_id') != event['event_id']):
        raise ValueError('Classification history must end at the exact probe event')
    seen, services, auth = set(), [], 0
    for row in history:
        eid = row['event_id']
        if (not isinstance(eid, str) or not eid or eid in seen or type(row.get('password_present')) is not bool or
                not isinstance(row.get('service'), str) or not isinstance(row.get('event_type'), str)):
            raise ValueError('Invalid/duplicate classification history')
        seen.add(eid)
        service = row['service']
        if service and service not in services and len(services) < rules['max_field_values']:
            services.append(service)
        if row['password_present'] or 'login.failed' in row['event_type']:
            auth += 1
    last = history[-1]
    if any(last[field] != event[field] for field in ('service', 'password_present', 'event_type')):
        raise ValueError('Classification history differs from exact probe event')
    severity = 'MEDIUM' if auth >= rules['auth_threshold'] or len(services) >= rules['service_threshold'] else 'LOW'
    if event.get('severity') != severity:
        raise ValueError(f'Controlled probe classification differs: expected {severity}, observed {event.get("severity")} '
                         f'(auth={auth}, services={len(services)})')
    return {'status': 'PASS', 'expected_severity': severity, 'observed_severity': event['severity'],
            'auth_attempt_count_at_event': auth, 'services_at_event': services, 'history_count': len(history),
            'auth_threshold': rules['auth_threshold'], 'service_threshold': rules['service_threshold'],
            'rules_sha256': context['rules_sha256'],
            'scope': 'Exact event classification; containing incident may have higher severity'}


def classification_context(retained, event, rules_json, rules_hash):
    history = []
    for eid, row in retained.items():
        normalized = row['normalized']
        history.append({'event_id': eid, **{k: normalized[k] for k in ('service', 'password_present', 'event_type')}})
        if eid == event['event_id']:
            return {'history': history, 'rules_json': rules_json, 'rules_sha256': rules_hash}
    raise ValueError('Exact probe event absent from classification history')


def probe(runtime, folder, marker, protocol='ftp'):
    service, network, port = ('opencanary', 'honeypot-canary-net', 2121) if protocol == 'ftp' else ('cowrie', 'honeypot-cowrie-net', 2222)
    bindings = runtime['containers'][service]['ports'][str(port) + '/tcp']
    if len(bindings) != 1 or bindings[0]['HostIp'] != '127.0.0.1':
        raise ValueError('Probe requires exactly one inspected literal loopback binding')
    target = runtime['containers'][service]['networks'][network]['IPAddress']
    started = time.time()
    folder.mkdir(mode=0o700)
    attempt = {'synthetic': True, 'source': 'test', 'purpose': 'Stage 7 restart probe',
               'demo_run_id': marker, 'protocol': protocol, 'started_epoch': started,
               'target_ip': target, 'target_port': port, 'loopback_port': int(bindings[0]['HostPort'])}
    save(folder / 'interaction-intent.json', {**attempt, 'interaction': 'NOT YET COMPLETED'})
    last_missing = []
    try:
        interaction = demo.ftp_interaction if protocol == 'ftp' else ssh_banner
        interaction(int(bindings[0]['HostPort']), marker)
        save(folder / 'interaction-completed.json', {**attempt, 'interaction': 'PASS', 'completed_utc': utc()})
        pending = time.monotonic() + 60
        while time.monotonic() < pending:
            raw = [v for v in demo.rows(RUNTIME / f'logs/{service}/{service}.json') if
                   (v.get('logdata', {}).get('USERNAME') == marker if protocol == 'ftp' else
                    v.get('eventid') == 'cowrie.client.version' and v.get('version') == 'SSH-2.0-' + marker)]
            normalized = [v for v in demo.rows(RUNTIME / 'logs/normalized/events.jsonl') if v.get('source') == service and
                          (v.get('username') == marker if protocol == 'ftp' else v.get('fingerprint') == 'SSH-2.0-' + marker)]
            attempt['observed_records'] = {'raw': raw, 'normalized': normalized}
            if len(raw) > 1 or len(normalized) > 1:
                raise ValueError('Ambiguous/duplicated unique probe records')
            last_missing = ['raw' if not raw else '', 'normalized' if not normalized else '']
            if raw and normalized:
                event = normalized[0]
                incident = demo.evidence_for(RUNTIME, event)
                central = None
                if incident:
                    path = Path(incident['evidence_path'])
                    before = preservation.regular(path)
                    if before.st_size > review.EVIDENCE_FILE_LIMIT:
                        raise ValueError('Probe evidence exceeds reviewed per-file allowance')
                    retained = records(path)
                    after = preservation.regular(path)
                    if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns):
                        raise ValueError('Probe evidence changed during classification read')
                    record = retained[event['event_id']]
                    if record['raw'] != raw[0] or record['normalized'] != event:
                        raise ValueError('Raw/normalized records differ from retained incident evidence')
                    rules_json = preservation.stable_bytes(RUNTIME / 'detections/correlation/rules.json', 1024**2).decode()
                    context = classification_context(retained, event, rules_json,
                                                     runtime['mounted_config_hashes']['detections/correlation/rules.json'])
                    attempt['classification'] = probe_classification(raw[0], event, context, protocol)
                    try:
                        central = loki_event(runtime, event)
                    except ValueError as exc:
                        if not str(exc).startswith('Exact unchanged normalized event absent'):
                            raise
                    if central:
                        packet = live_capture.packet_proof(RUNTIME, folder, marker, target, started, protocol=protocol)
                        if packet['ok']:
                            if time.monotonic() >= pending:
                                raise TimeoutError('Packet verification completed after the probe deadline')
                            attempt.update(status='PASS', event=event, incident=incident, loki=central, packet=packet,
                                           raw_artifact=save(folder / 'raw.json', raw[0]),
                                           normalized_artifact=save(folder / 'normalized.json', event),
                                           record_artifact=save(folder / 'incident-record.json', record),
                                           classification_artifact=save(folder / 'classification-context.json', context))
                            save(folder / 'probe.json', attempt)
                            return attempt
                        attempt['packet_attempt'] = packet
                last_missing = ['incident' if not incident else '', 'loki' if not central else '', 'packet']
            time.sleep(1)
        raise TimeoutError('Probe verification deadline exceeded: ' + ', '.join(x for x in last_missing if x))
    except (Exception, KeyboardInterrupt) as exc:
        failure = {'status': 'FAILED', 'error': type(exc).__name__ + ': ' + str(exc), 'missing': last_missing}
        try:
            failure['artifact'] = save(folder / 'failed-probe.json', {**attempt, **failure})
        except (Exception, KeyboardInterrupt) as retention_error:
            failure['retention_error'] = type(retention_error).__name__ + ': ' + str(retention_error)
        exc.probe_failure = failure
        raise


def postflight(row, expected=None):
    runtime = resources = None
    try:
        with deadline(60):
            runtime, resources = observe()
            comparison = strict_compare(expected, runtime) if expected is not None else {'status': 'NOT TESTED: no recovered anchor'}
            row['postflight'] = {'status': 'PASS', 'runtime': runtime, 'capture_resources': resources, 'comparison': comparison}
    except KeyboardInterrupt:
        row['interrupted'] = True
        row.setdefault('error', 'KeyboardInterrupt: operator interrupted qualification')
        row['postflight'] = {'status': 'FAILED', 'error': 'KeyboardInterrupt: postflight interrupted; current safety not established',
                             'runtime': runtime, 'capture_resources': resources}
    except Exception as exc:
        row['postflight'] = {'status': 'FAILED', 'error': type(exc).__name__ + ': ' + str(exc),
                             'runtime': runtime if runtime is not None else getattr(exc, 'runtime_observation', None),
                             'capture_resources': resources if resources is not None else getattr(exc, 'capture_observation', None)}


def acquire_preservation(folder, name):
    progress = {}
    try:
        return preservation.snapshot(RUNTIME, progress)
    finally:
        # Retain count/budget/current-path diagnostics even if acquisition blocks.
        save(folder / (name + '-progress.json'), progress)


def restart_row(name, anchor, base, folder, events, index):
    row = {'service': name, 'status': 'INCOMPLETE', 'started_utc': utc(), 'checks': {k: 'NOT TESTED' for k in REQUIRED}, 'probes': []}
    row['phase'] = 'pre-restart checks'
    recovered = None
    try:
        with deadline(240):
            before, resources = observe()
            strict_compare(anchor, before)
            config = execution_configuration(before)
            if (config != base['execution_configuration'] or routes_and_tty(before) != base['routes'] or
                    evidence_permissions() != base['evidence_permissions'] or quarantine_state() != base['quarantine']):
                raise ValueError('Configuration/routes changed immediately before restart')
            if source_revision() != base['source_commit'] or implementation() != base['implementation']:
                raise ValueError('Qualification implementation changed during matrix')
            preserved_before = acquire_preservation(folder, 'before-preservation')
            row['before'] = before
            row['capture_before'] = resources
            row['preservation_before'] = preserved_before
            # Re-observe after the potentially lengthy bounded evidence acquisition.
            immediate, _ = observe()
            strict_compare(before, immediate)
            cid = before['containers'][name]['id']
            row['phase'] = 'restart command'
            restart_existing(row, cid, folder)
            row['phase'] = 'health recovery'
            until = time.monotonic() + 150
            row['health_recovery_timeout_seconds'] = 150
            row['recovery_observations'] = []
            next_update = time.monotonic()
            while time.monotonic() < until:
                current = collect(RUNTIME, SOURCE, probe_readiness=False,
                                  recovery_target={'service': name, 'id': cid})
                problems = current.get('problems', [])
                target = current.get('containers', {}).get(name, {})
                row['recovery_observations'].append({'timestamp': current.get('timestamp'),
                    'ok': current.get('ok'), 'problems': problems, 'health': target.get('health'),
                    'started_at': target.get('started_at'), 'id': target.get('id')})
                profile = current.get('recovery_target', {})
                if (problems or profile.get('service') != name or profile.get('id') != cid or
                        profile.get('status') not in ('TARGET_STARTING', 'HEALTHY')):
                    raise ValueError('Safety failure during recovery: ' + str(problems))
                # Endpoint disappearance is transient, so only compare once the target is healthy.
                # Unrelated starts/images/health and containment/capture are checked every poll.
                for other in ORDER:
                    previous = copy.deepcopy(before['containers'][other])
                    actual = copy.deepcopy(current.get('containers', {}).get(other, {}))
                    for value in (previous, actual):
                        value['mounts'] = sorted(value.get('mounts', []), key=lambda m: m['Destination'])
                    if other != name and actual != previous:
                        raise ValueError('Unrelated container runtime changed during recovery: ' + other)
                if current.get('boot_id') != base['boot_id'] or current.get('guard_fingerprint') != before['guard_fingerprint'] or current.get('wan_enabled') is not False:
                    raise ValueError('Boot/containment/WAN changed during recovery')
                old_capture = {k: v for k, v in before['capture'].items() if k not in ('timestamp', 'problems')}
                new_capture = {k: v for k, v in current.get('capture', {}).items() if k not in ('timestamp', 'problems')}
                if new_capture != old_capture:
                    raise ValueError('PCAP identity/interface/ring changed during recovery')
                if not problems and current.get('ok') is True:
                    recovered, _ = observe()
                    row['runtime_comparison'] = strict_compare(before, recovered, name, config['dynamic_mac'][name])
                    break
                if time.monotonic() >= next_update:
                    print('WAIT: ' + name + ' health=' + str(target.get('health')) + '; bounded recovery in progress', flush=True)
                    next_update = time.monotonic() + 10
                time.sleep(2)
            if recovered is None:
                raise TimeoutError('Container health recovery exceeded 150 seconds')
            row['checks']['identity'] = 'PASS'
            row['checks']['runtime'] = 'PASS'
            if (execution_configuration(recovered) != config or evidence_permissions() != base['evidence_permissions'] or
                    quarantine_state() != base['quarantine']):
                raise ValueError('Container execution configuration changed')
            row['checks']['execution_configuration'] = 'PASS'
            marker = 'honeytrace-demo-stage7-' + hashlib.sha256(str(folder.parent).encode()).hexdigest()[:12] + '-' + name
            row['phase'] = 'synthetic probe verification'
            ftp = probe(recovered, folder / 'ftp', marker)
            row['probes'].append(ftp)
            if name == 'cowrie':
                row['probes'].append(probe(recovered, folder / 'ssh', marker + '-ssh', 'ssh_banner'))
            row['checks']['pipeline'] = 'PASS'
            row['checks']['capture'] = 'PASS'
            events.extend(p['event'] for p in row['probes'])
            row['existing_loki'] = [loki_event(recovered, event) for event in events]
            row['checks']['existing_loki'] = 'PASS'
            heartbeat = RUNTIME / 'state/incidentd/heartbeat'
            eve = RUNTIME / 'logs/suricata/eve.json'
            until = time.monotonic() + 45
            while time.monotonic() < until:
                heartbeat_ok = preservation.regular(heartbeat).st_mtime_ns > preserved_before['heartbeat_mtime_ns']
                eve_ok = preservation.regular(eve).st_size > preserved_before['logs'][str(eve)]['bytes']
                if heartbeat_ok and eve_ok:
                    break
                time.sleep(1)
            if not heartbeat_ok or not eve_ok:
                raise TimeoutError('Heartbeat or Suricata log advancement unverified')
            row['checks']['heartbeat'] = 'PASS'
            row['checks']['suricata_logging'] = 'PASS'
            row['heartbeat_mtime_ns'] = heartbeat.stat().st_mtime_ns
            row['suricata_bytes'] = eve.stat().st_size
            if routes_and_tty(recovered) != base['routes']:
                raise ValueError('Loaded routes/TTY changed after restart')
            row['checks']['routes'] = 'PASS'
            if name == 'incidentd':
                row['startup_protection'] = integrity_startup(row['restart_requested_utc'])
            acquired = acquire_preservation(folder, 'after-preservation')
            row['preservation_after'] = acquired
            row['preservation_comparison'] = preservation.compare(RUNTIME, preserved_before, acquired)
            preservation.compare(RUNTIME, base['preservation'], acquired)
            row['checks']['preservation'] = 'PASS'
    except KeyboardInterrupt as exc:
        row['interrupted'] = True
        row['error'] = 'KeyboardInterrupt: operator interrupted ' + row['phase'] + '; no further restart or probe'
        row['probe_failure'] = getattr(exc, 'probe_failure', None)
    except Exception as exc:
        row['error'] = type(exc).__name__ + ': ' + str(exc)
        row['failed_runtime_observation'] = getattr(exc, 'runtime_observation', None)
        row['probe_failure'] = getattr(exc, 'probe_failure', None)
    finally:
        postflight(row, recovered)
        # A healthy postflight after interrupted recovery still requires the
        # exact planned target lifecycle comparison; never waive identity drift.
        if recovered is None and row.get('restart_command') and row['postflight']['status'] == 'PASS':
            try:
                row['postflight']['comparison'] = strict_compare(row['before'], row['postflight']['runtime'],
                                                                  name, config['dynamic_mac'][name])
            except Exception as exc:
                row['postflight'].update(status='FAILED', error=type(exc).__name__ + ': ' + str(exc))
        row['checks']['postflight'] = row['postflight']['status']
        if 'recovery_observations' in row:
            row['recovery_observation_artifact'] = save(folder / 'recovery-observations.json', row['recovery_observations'])
    if not row.get('error') and all(row['checks'][k] == 'PASS' for k in REQUIRED):
        row['status'] = 'PASS'
    else:
        row['status'] = 'ABORTED' if row.get('interrupted') else 'FAILED'
    row['completed_utc'] = utc()
    row['index'] = index
    return row


def complete_rows(rows):
    if [r.get('service') for r in rows] != list(ORDER):
        raise ValueError('Exactly seven completed rows in approved order required')
    for row in rows:
        if (row.get('status') != 'PASS' or row.get('error') or row.get('restart_exit') != 0 or
                set(row.get('checks', {})) != set(REQUIRED) or
                any(row['checks'][k] != 'PASS' for k in REQUIRED) or not row.get('probes') or
                row.get('postflight', {}).get('status') != 'PASS'):
            raise ValueError('Mandatory completed checks absent: ' + row['service'])
        cid = row.get('before', {}).get('containers', {}).get(row['service'], {}).get('id', '')
        response = row.get('restart_response', {})
        if (not re.fullmatch(r'[0-9a-f]{64}', cid) or
                row.get('restart_command') != ['docker', 'restart', '--timeout', '15', cid] or
                response.get('status') != 'RETURNED' or response.get('exit_code') != 0 or
                response.get('truncated') is not False or response.get('stdout', '').strip() != cid):
            raise ValueError('Restart command/response proof incomplete: ' + row['service'])
        if row['service'] == 'cowrie' and {p.get('protocol') for p in row['probes']} != {'ftp', 'ssh_banner'}:
            raise ValueError('Cowrie operational probe absent')
        if row['service'] == 'incidentd' and row.get('startup_protection', {}).get('status') != 'PASS':
            raise ValueError('Incidentd protected startup check absent')


def verify_packet_marker(packet, marker, target_ip, target_port, started_epoch, protocol):
    """Strict offline reparse of an identical private copy; never reads live rings."""
    if (not isinstance(marker, str) or not re.fullmatch('[A-Za-z0-9_-]{1,128}', marker) or
            protocol not in ('ftp', 'ssh_banner') or type(target_port) is not int or
            not 1 <= target_port <= 65535 or type(started_epoch) not in (int, float) or
            not math.isfinite(started_epoch) or started_epoch <= 0):
        raise ValueError('Malformed independent packet matching input')
    address = ipaddress.ip_address(target_ip)
    if address.version != 4 or str(address) != target_ip:
        raise ValueError('Packet target must be a canonical IPv4 address')
    data = preservation.stable_bytes(Path(packet['snapshot']), 64 * 1024**2)
    if len(data) != packet['bytes'] or hashlib.sha256(data).hexdigest() != packet['sha256']:
        raise ValueError('Offline packet input hash or size differs')
    with tempfile.TemporaryDirectory(prefix='stage7-packet-verify-', dir='/tmp') as tmp:
        path = Path(tmp) / 'capture.pcapng'
        with path.open('xb') as out:
            out.write(data)
        path.chmod(0o600)
        prefix = 'USER ' if protocol == 'ftp' else 'SSH-2.0-'
        query = (f'ip.dst == {target_ip} && tcp.dstport == {target_port} && '
                 f'frame.time_epoch >= {started_epoch:.6f} && tcp contains {(prefix + marker).encode().hex(":")}')
        result = command(['tshark', '-n', '-r', str(path), '-Y', query, '-T', 'fields',
                          '-e', 'frame.time_epoch', '-e', 'ip.dst', '-e', 'tcp.dstport'],
                         root=SOURCE, timeout=15)
        matched = any(len(value := line.split('\t')) == 3 and float(value[0]) >= started_epoch and
                      value[1] == target_ip and value[2] == str(target_port) for line in result.splitlines())
        if not matched:
            raise ValueError('Independent retained packet marker recheck failed')
    return {'status': 'PASS', 'marker': marker, 'target_ip': target_ip,
            'target_port': target_port, 'started_epoch': started_epoch, 'protocol': protocol,
            'scope': 'Offline retained-packet reparse; no live collection or deployment claim'}


def verify_packets(rows, rules_hash):
    seen = set()
    evidence = []
    for row in rows:
        for probe_row in row['probes']:
            marker = probe_row['demo_run_id']
            if marker in seen or probe_row.get('status') != 'PASS' or probe_row.get('synthetic') is not True:
                raise ValueError('Duplicate/incomplete synthetic probe')
            seen.add(marker)
            packet = probe_row['packet']
            acquisition = None
            if CONTEXT is not None or 'acquisition' in packet:
                acquisition = verify_acquisition(packet)
            info = preservation.regular(Path(packet['snapshot']))
            if info.st_size > 64 * 1024**2 or info.st_size != packet['bytes']:
                raise ValueError('Retained packet size differs/exceeds finite limit')
            if preservation.prefix(packet['snapshot'], fixed=True)['sha256'] != packet['sha256']:
                raise ValueError('Retained packet hash differs')
            artifacts = {}
            for field in ('raw_artifact', 'normalized_artifact', 'record_artifact'):
                artifacts[field] = load_verified(Path(probe_row[field]['path']), probe_row[field]['sha256'])
            if (artifacts['normalized_artifact'] != probe_row['event'] or
                    artifacts['record_artifact']['normalized'] != probe_row['event'] or
                    artifacts['record_artifact']['raw'] != artifacts['raw_artifact']):
                raise ValueError('Independent raw/normalized/incident relationship differs')
            context = load_verified(Path(probe_row['classification_artifact']['path']), probe_row['classification_artifact']['sha256'])
            if context['rules_sha256'] != rules_hash:
                raise ValueError('Probe classification rules differ from baseline')
            if probe_classification(artifacts['raw_artifact'], probe_row['event'], context, probe_row['protocol']) != probe_row['classification']:
                raise ValueError('Independent probe classification differs')
            packet_match = verify_packet_marker(packet, marker, probe_row['target_ip'], probe_row['target_port'],
                                                probe_row['started_epoch'], probe_row['protocol'])
            evidence.append({'marker': marker, 'status': 'PASS', 'sha256': packet['sha256'],
                             'path': packet['snapshot'], 'packet_acquisition': acquisition,
                             'packet_match': packet_match})
    return {'status': 'PASS', 'verified_probe_count': len(evidence), 'artifacts': evidence,
            'scope': 'Stable capture process and exact retained probe packets; zero packet loss or host-reboot continuity NOT claimed'}


def execute_matrix(base, link, folder):
    result = {'STATUS': 'INCOMPLETE', 'STAGE7_GATE': 'BLOCKED', 'STAGE8_GATE': 'BLOCKED',
              'STAGE8_TESTED': False, 'WAN_AUTHORIZED': False, 'ROLLBACK_REQUIRED': 'NOT_ASSESSED',
              'baseline': link, 'boot_id': base['boot_id'], 'rows': [], 'started_utc': utc()}
    if CONTEXT is not None:
        result['qualification_identity'] = CONTEXT.identity()
        result['historical_closeout'] = 'UNKNOWN: original laptop evidence not qualified by this run'
        result['MATRIX_GATE'] = 'BLOCKED'
    anchor = base['runtime']
    events = [base['existing_event']]
    try:
        load_verified(Path(link['path']), link['sha256'])
        for index, name in enumerate(ORDER):
            row_folder = folder / f'{index + 1:02d}-{name}'
            row_folder.mkdir(mode=0o700)
            row = restart_row(name, anchor, base, row_folder, events, index)
            result['rows'].append(row)
            row['report'] = save(row_folder / 'row.json', row)
            print('ROW: ' + name + ' ' + row['status'], flush=True)
            if row.get('interrupted'):
                # Retain interruption even if the separate anchor check fails.
                result['interrupted'] = True
            if row.get('postflight', {}).get('status') == 'PASS':
                current = row['postflight']['runtime']
                cid = anchor.get('containers', {}).get(name, {}).get('id')
                intended = cid and row.get('restart_command') == ['docker', 'restart', '--timeout', '15', cid]
                started = intended and current['containers'][name]['started_at'] != anchor['containers'][name]['started_at']
                comparison = strict_compare(anchor, current, name if started else None,
                                            base['execution_configuration']['dynamic_mac'][name] if started else False)
                result['postflight_anchor'] = {'service': name, 'comparison': comparison,
                                              'scope': 'Verified current runtime only; failed row remains failed'}
                anchor = current
            if row.get('interrupted'):
                raise KeyboardInterrupt
            if row['status'] != 'PASS':
                raise ValueError('Restart matrix stopped at first failure: ' + name)
            anchor = row['postflight']['runtime']
        complete_rows(result['rows'])
        with deadline(120):
            final_prerequisites = review.inspect(RUNTIME, active=True)
            result['final_prerequisites'] = final_prerequisites
            prerequisite_passed(final_prerequisites)
            final, resources = observe()
            result['final_runtime'] = final
            result['final_capture_resources'] = resources
            result['final_runtime_comparison'] = strict_compare(anchor, final)
            if (execution_configuration(final) != base['execution_configuration'] or routes_and_tty(final) != base['routes'] or
                    evidence_permissions() != base['evidence_permissions'] or quarantine_state() != base['quarantine']):
                raise ValueError('Final configuration/routes differ')
            acquired = acquire_preservation(folder, 'final-preservation')
            result['final_preservation'] = acquired
            result['final_preservation_comparison'] = preservation.compare(RUNTIME, base['preservation'], acquired)
            result['final_existing_loki'] = [loki_event(final, event) for event in events]
            result['final_packets'] = verify_packets(result['rows'], base['runtime']['mounted_config_hashes']['detections/correlation/rules.json'])
            result['final_startup_protection'] = integrity_startup(result['rows'][-1]['restart_requested_utc'])
            if source_revision() != base['source_commit'] or implementation() != base['implementation']:
                raise ValueError('Tested implementation changed before final verification')
            for row in result['rows']:
                original = load_verified(Path(row['report']['path']), row['report']['sha256'])
                if original != {k: v for k, v in row.items() if k != 'report'}:
                    raise ValueError('Retained row report differs')
                strict_compare(original['before'], original['postflight']['runtime'],
                               row['service'], base['execution_configuration']['dynamic_mac'][row['service']])
                preservation.compare(RUNTIME, original['preservation_after'], acquired)
            complete_rows(result['rows'])
            end, _ = observe()
            strict_compare(final, end)
            result['stable_final_observation'] = end
        if CONTEXT is None:
            result.update(STATUS='PASS', STAGE7_GATE='PASS', STAGE8_GATE='READY_FOR_OPERATOR_DIRECTION')
        else:
            result.update(STATUS='PASS', MATRIX_GATE='PASS', STAGE7_GATE='BLOCKED', STAGE8_GATE='BLOCKED')
            result['qualification_disposition'] = (
                'Clean-room restart matrix only. Independent historical closeout and canonical '
                'release obligations, including B17 supported installation, remain unqualified; '
                'this result cannot clear Stage 7 or authorize Stage 8.')
    except KeyboardInterrupt:
        result.update(STATUS='ABORTED', interrupted=True, STAGE7_GATE='BLOCKED', STAGE8_GATE='BLOCKED')
        result['error'] = 'KeyboardInterrupt: qualification interrupted; no automatic retry'
    except Exception as exc:
        result['error'] = type(exc).__name__ + ': ' + str(exc)
        result['STATUS'] = 'FAILED' if result['rows'] else 'BLOCKED'
    finally:
        postflight(result, result.get('stable_final_observation', anchor))
        if result.get('interrupted'):
            result.update(STATUS='ABORTED', STAGE7_GATE='BLOCKED', STAGE8_GATE='BLOCKED')
        if result['postflight']['status'] != 'PASS':
            result.update(STATUS='ABORTED' if result.get('interrupted') else 'FAILED', STAGE7_GATE='BLOCKED', STAGE8_GATE='BLOCKED')
        if CONTEXT is not None and result['STATUS'] != 'PASS':
            result['MATRIX_GATE'] = 'BLOCKED'
        result['ROLLBACK_REQUIRED'] = False if result['postflight']['status'] == 'PASS' else 'UNKNOWN: operator review required; no automatic rollback'
        result['completed_utc'] = utc()
        result['limitations'] = base['historical_obligations'] + [
            'No host reboot, Docker/PCAP restart, recreation, deployment, boot-policy change or WAN exposure',
            'Process restart retention proved only by completed rows; power-loss durability and total packet-loss absence NOT TESTED']
    return result


def main():
    global CONTEXT, RUNTIME
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime-root', type=Path, required=True)
    parser.add_argument('--prerequisites', type=Path, required=True)
    parser.add_argument('--prerequisites-sha256', required=True)
    parser.add_argument('--validation', type=Path, required=True)
    parser.add_argument('--validation-sha256', required=True)
    parser.add_argument('--context', type=Path)
    parser.add_argument('--context-sha256')
    parser.add_argument('--execute-restarts', action='store_true', help='Explicit authorized seven-container matrix; no automatic retries')
    args = parser.parse_args()
    CONTEXT = qualification_context.load(args.context, args.context_sha256, SOURCE, args.runtime_root)
    review.CONTEXT = CONTEXT
    if CONTEXT is not None:
        RUNTIME = review.RUNTIME = CONTEXT.runtime
    os.umask(0o077)
    folder = Path(tempfile.mkdtemp(prefix='stage7-fresh-', dir=(
        SOURCE / 'work/live-qualification' if CONTEXT is None else CONTEXT.evidence_root)))
    report = {'STATUS': 'BLOCKED', 'STAGE7_GATE': 'BLOCKED', 'STAGE8_GATE': 'BLOCKED', 'WAN_AUTHORIZED': False}
    if CONTEXT is not None:
        report['qualification_identity'] = CONTEXT.identity()
        report['historical_closeout'] = 'UNKNOWN: independent clean-room execution only'
    try:
        if os.geteuid() != 0:
            raise PermissionError('Narrow operator sudo required; no permission changes')
        if args.runtime_root != RUNTIME or args.runtime_root.resolve() != RUNTIME:
            raise ValueError('Unexpected runtime root')
        with deadline(120):
            base = baseline(folder, args.prerequisites, args.prerequisites_sha256, args.validation, args.validation_sha256)
            link = save(folder / 'baseline.json', base)
        print('BASELINE: ' + link['path'], flush=True)
        print('BASELINE_SHA256: ' + link['sha256'], flush=True)
        report.update(baseline=link, boot_id=base['boot_id'])
        if args.execute_restarts:
            report = execute_matrix(base, link, folder)
        else:
            report.update(STATUS='BASELINE_READY', baseline=link, boot_id=base['boot_id'], traffic_generated=False)
    except KeyboardInterrupt:
        report.update(STATUS='ABORTED', interrupted=True, error='KeyboardInterrupt: qualification interrupted; no automatic retry')
        postflight(report)
    except Exception as exc:
        report['error'] = type(exc).__name__ + ': ' + str(exc)
        postflight(report)
    # Per-row full inventories remain immutable in linked, hashed row reports.
    # Avoid repeating those large inventories seven times in the handoff report.
    report['rows'] = [{k: v for k, v in row.items() if k not in (
        'preservation_before', 'preservation_after', 'before', 'capture_before')}
        for row in report.get('rows', [])]
    if report.get('interrupted'):
        report.update(STATUS='ABORTED', STAGE7_GATE='BLOCKED', STAGE8_GATE='BLOCKED')
    report['command_exit_code'] = 130 if report.get('interrupted') else (0 if report['STATUS'] in ('PASS', 'BASELINE_READY') else 1)
    link = save(folder / 'report.json', report)
    print(json.dumps({k: report.get(k) for k in ('STATUS', 'STAGE7_GATE', 'STAGE8_GATE', 'error', 'boot_id')}, indent=2))
    print('ROWS: ' + json.dumps([{'service': r['service'], 'status': r['status'], 'error': r.get('error')} for r in report.get('rows', [])]))
    print('REPORT: ' + link['path'])
    print('SHA256: ' + link['sha256'])
    return report['command_exit_code']


if __name__ == '__main__':
    raise SystemExit(main())
