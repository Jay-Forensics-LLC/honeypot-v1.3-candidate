#!/usr/bin/env python3
"""Read-only prerequisites for recovery review. Never starts services or qualifies Stage 7."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import stat
import tempfile

from hp_common import atomic_json, runtime_path, sha256, utc
from pcap_demo_recovery import command, compare_runtime, storage_gate
from live_capture import readiness
from runtime_inventory import collect
from evidence_store import scan_directory
import qualification_context

SOURCE = Path(__file__).resolve().parents[1]
RUNTIME = Path('/home/joe/honeypot-staging/honeypot')
CONTEXT = None
RETAINED = SOURCE / 'work/live-qualification'
# The observed 1,046-incident collection exceeded the former 256 MiB cap.
# Keep a finite aggregate allowance, unchanged per-file/count limits and the
# 120-second whole-review deadline. This is a read budget, never a PASS bypass.
EVIDENCE_READ_BUDGET = 512 * 1024**2
EVIDENCE_FILE_LIMIT = 16 * 1024**2
EVIDENCE_METADATA_LIMIT = 1024**2
EVIDENCE_COUNT_LIMIT = 4000
EVIDENCE_EVENT_ID_LIMIT = 250000
STOPPED_PROBLEMS = {
    'cowrie: not running and healthy', 'opencanary: not running and healthy',
    'cowrie: active published ports differ', 'opencanary: active published ports differ',
    'honeypot-cowrie-net: active membership differs',
    'honeypot-canary-net: active membership differs',
    'PCAP identity/interface verification failed',
}


def stopped_gate(runtime):
    if runtime.get('ok') is True:
        raise ValueError('Runtime is already active; use --active for read-only prerequisite review')
    if runtime.get('stopped_decoy_configuration', {}).get('status') != 'CONFIGURATION_CHECKS_PASSED':
        raise ValueError('Stopped decoy configuration has not passed inspection')
    if runtime.get('guard', {}).get('ok') is not True or runtime.get('wan_enabled') is not False:
        raise ValueError('Containment or disabled WAN state unverified')
    problems = runtime.get('problems')
    if not isinstance(problems, list) or set(problems) != STOPPED_PROBLEMS:
        raise ValueError('Runtime has unexpected failures or is not the reviewed stopped state')


def active_gate(runtime):
    if (runtime.get('ok') is not True or runtime.get('problems') != [] or
            runtime.get('guard', {}).get('ok') is not True or
            runtime.get('wan_enabled') is not False or
            runtime.get('capture', {}).get('ok') is not True):
        raise ValueError('Active runtime, containment, disabled WAN and capture must all pass')


def capture_setup(root, active=False):
    text = command(['systemctl', 'show', 'honeypot-pcap.service', '-p', 'ActiveState',
                    '-p', 'SubState', '-p', 'MainPID', '-p', 'Result', '-p', 'ExecMainStatus',
                    '-p', 'ExecMainStartTimestamp', '-p', 'ActiveEnterTimestamp',
                    '-p', 'FragmentPath', '-p', 'DropInPaths', '-p', 'ExecStart']).stdout
    service = dict(line.split('=', 1) for line in text.splitlines() if '=' in line)
    if active:
        if (tuple(service.get(k) for k in ('ActiveState', 'SubState', 'Result', 'ExecMainStatus')) !=
                ('active', 'running', 'success', '0') or int(service.get('MainPID', '0')) <= 0 or
                not service.get('ExecMainStartTimestamp') or not service.get('ActiveEnterTimestamp')):
            raise ValueError('Active PCAP service identity not established')
    else:
        if tuple(service.get(k) for k in ('ActiveState', 'SubState', 'MainPID', 'Result', 'ExecMainStatus')) != (
                'inactive', 'dead', '0', 'success', '0'):
            raise ValueError('PCAP state requires separate diagnosis; no restart proposed')
        if service.get('ExecMainStartTimestamp') or service.get('ActiveEnterTimestamp'):
            raise ValueError('PCAP has current-boot activation history; investigate its stop first')
    if service.get('FragmentPath') != '/etc/systemd/system/honeypot-pcap.service' or service.get('DropInPaths'):
        raise ValueError('Unexpected capture unit path or overrides')
    loaded = service.get('ExecStart', '')
    if loaded.count('argv[]=') != 1 or 'argv[]=/usr/bin/python3 ' + str(root / 'scripts/pcap.py') + ' ;' not in loaded:
        raise ValueError('Loaded capture command differs')
    template = (SOURCE / 'systemd/honeypot-pcap.service.in').read_text()
    if CONTEXT is not None:
        from evidence_group import evidence_group_name, render_unit_template
        expected = render_unit_template(template, root,
            runtime_path('PCAP_PATH', 'captures', root), evidence_group=evidence_group_name())
    else:
        expected = template.replace('@ROOT@', str(root)).replace(
            '@PCAP@', str(runtime_path('PCAP_PATH', 'captures', root))).replace(
            '@EVIDENCE_GROUP@', 'honeypot-evidence')
    actual = command(['systemctl', 'cat', 'honeypot-pcap.service']).stdout
    clean = lambda value: '\n'.join(line.strip() for line in value.splitlines()
                                  if line.strip() and not line.lstrip().startswith('#'))
    if clean(actual) != clean(expected): raise ValueError('Capture unit differs from reviewed source')
    journal = command(['journalctl', '-b', '-u', 'honeypot-pcap.service', '-o', 'json',
                       '--no-pager', '-n', '80']).stdout.strip()
    if not active and journal not in ('', '-- No entries --'):
        raise ValueError('Current boot records PCAP activity')
    hashes = {}
    for name in ('pcap.py', 'hp_common.py', 'ops.py'):
        deployed = sha256(root / 'scripts' / name)[0]
        if deployed != sha256(SOURCE / 'scripts' / name)[0]:
            raise ValueError('Deployed recovery implementation differs: ' + name)
        hashes[name] = deployed
    storage_gate(root)
    return {'status': 'SETUP_CHECKS_PASSED', 'service': service, 'source_hashes': hashes,
            'capture_continuity': 'UNKNOWN', 'current_capture_active': active,
            'journal_json': journal, 'start_provenance': 'UNKNOWN; activity does not identify requester'}


def retained_module(name):
    path = RETAINED / (name + '.py')
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def incident_inventory(folder):
    # Path.glob can suppress directory access failures. An unreadable branch
    # must block a global integrity claim rather than silently disappear.
    if not stat.S_ISDIR(folder.lstat().st_mode) or folder.resolve() != folder.absolute():
        raise ValueError('Incident root must be a canonical directory')
    paths = set()
    entries = 0
    with scan_directory(folder) as days:
        for day_entry in days:
            entries += 1
            if entries > 2 * EVIDENCE_COUNT_LIMIT: raise ValueError('Incident directory inventory exceeds bound')
            info = day_entry.stat(follow_symlinks=False)
            if stat.S_ISLNK(info.st_mode): raise ValueError('Incident day symlink requires review')
            if not stat.S_ISDIR(info.st_mode): continue
            day = folder/day_entry.name
            with scan_directory(day) as incidents:
                for incident_entry in incidents:
                    entries += 1
                    if entries > 2 * EVIDENCE_COUNT_LIMIT: raise ValueError('Incident directory inventory exceeds bound')
                    info = incident_entry.stat(follow_symlinks=False)
                    if stat.S_ISLNK(info.st_mode): raise ValueError('Incident directory symlink requires review')
                    if not stat.S_ISDIR(info.st_mode): continue
                    incident = day/incident_entry.name
                    names = set()
                    with scan_directory(incident) as candidates:
                        for candidate in candidates:
                            names.add(candidate.name)
                            if len(names) > 128: raise ValueError('Individual incident directory inventory exceeds bound')
                    if names & {'events.jsonl', 'incident.json'}:
                        paths.add(incident / 'events.jsonl')
                    if len(paths) > EVIDENCE_COUNT_LIMIT: raise ValueError('Incident inventory exceeds bound')
    return paths


def read_evidence(path, before):
    identity = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns)
    if path.resolve() != path.absolute(): raise ValueError('Incident source path is not canonical')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        opened = os.fstat(fd)
        if not stat.S_ISREG(opened.st_mode) or identity(opened) != identity(before):
            raise ValueError('Evidence replaced or changed before read')
        data = os.pread(fd, before.st_size + 1, 0)
        after = os.fstat(fd); current = path.lstat()
        if (len(data) != before.st_size or identity(after) != identity(before) or
                identity(current) != identity(before) or not stat.S_ISREG(current.st_mode) or
                path.resolve() != path.absolute()):
            raise ValueError('Evidence changed during bounded read; retain observation as incomplete')
        return data
    finally:
        os.close(fd)


def evidence_integrity(root, progress=None, on_incident=None):
    progress = {} if progress is None else progress
    progress.update(status='INCOMPLETE', files_scanned=0, bytes_read=0,
                    read_budget_bytes=EVIDENCE_READ_BUDGET,
                    per_file_limit_bytes=EVIDENCE_FILE_LIMIT,
                    metadata_limit_bytes=EVIDENCE_METADATA_LIMIT,
                    file_count_limit=EVIDENCE_COUNT_LIMIT)
    reconciliation = None
    verified = {}
    if CONTEXT is None:
        reconciliation = retained_module('stage7-reconciled-evidence')
        verified = reconciliation.verify()
        progress['historical_reconciliation'] = {'status': 'VERIFIED',
            'original_sha256': verified['original_sha256'], 'bundle_hashes': verified['bundle_hashes'],
            'source_provenance': {'normalized': verified['normalized_source'], 'raw': verified['raw_source']}}
    else:
        CONTEXT.validate_current()
        if root.resolve() != CONTEXT.runtime:
            raise ValueError('Integrity runtime differs from explicit context')
        progress['historical_reconciliation'] = {'status': 'UNKNOWN',
            'scope': 'Independent clean-room store; original laptop evidence not acquired or qualified'}
    sweep = retained_module('stage7-evidence-integrity-sweep')
    folder = root / 'incidents'
    paths = incident_inventory(folder)
    if not paths: raise ValueError('Incident inventory absent')
    progress['files_in_inventory'] = len(paths)
    total = 0
    planned = {}
    for path in sorted(paths):
        for candidate, limit in ((path, EVIDENCE_FILE_LIMIT), (path.parent / 'incident.json', EVIDENCE_METADATA_LIMIT)):
            info = candidate.lstat()
            if not stat.S_ISREG(info.st_mode): raise ValueError('Incident evidence must be regular and non-symlink')
            if info.st_size > limit: raise ValueError('Individual evidence read budget exceeded: ' + str(candidate))
            planned[candidate] = info.st_size
            total += info.st_size
    progress['planned_total_bytes'] = total
    if total > EVIDENCE_READ_BUDGET:
        raise ValueError(f'Total evidence read budget exceeded: inventory {total} bytes, '
                         f'limit {EVIDENCE_READ_BUDGET}; no incident files scanned')
    budget = EVIDENCE_READ_BUDGET
    bad = []
    progress['additional_defects'] = bad
    accounting = []
    progress['read_accounting'] = accounting
    locations = {}
    seals = {}
    signature = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
    uniqueness = {'status': 'INCOMPLETE', 'unique_event_ids': 0, 'limit': EVIDENCE_EVENT_ID_LIMIT}
    if CONTEXT is not None:
        progress['event_id_uniqueness'] = uniqueness
    for path in sorted(paths):
        progress['current_path'] = str(path)
        metadata = path.parent / 'incident.json'
        if any(p.is_symlink() for p in (folder, path.parent.parent, path.parent, path, metadata)):
            raise ValueError('Incident evidence symlink requires review')
        before = path.stat(); meta_before = metadata.stat()
        if before.st_size > EVIDENCE_FILE_LIMIT or meta_before.st_size > EVIDENCE_METADATA_LIMIT:
            raise ValueError('Individual evidence read budget exceeded')
        budget -= before.st_size + meta_before.st_size
        if budget < 0: raise ValueError('Total evidence read budget exceeded during sweep; collection grew')
        data = read_evidence(path, before)
        meta = read_evidence(metadata, meta_before)
        after = path.stat(); meta_after = metadata.stat()
        identity = lambda s: (s.st_ino, s.st_size, s.st_mtime_ns)
        if identity(before) != identity(after) or identity(meta_before) != identity(meta_after):
            raise ValueError('Evidence changed during read; retain observation as incomplete')
        if CONTEXT is not None:
            seals[path] = signature(before)
            seals[metadata] = signature(meta_before)
        ids = json.loads(meta)['related_events']
        if not isinstance(ids, list) or not all(isinstance(value, str) for value in ids):
            raise ValueError('Invalid incident metadata event IDs')
        analysis = sweep.analyze(data, ids)
        known = reconciliation is not None and path == reconciliation.ORIGINAL and analysis['sha256'] == reconciliation.ORIGINAL_HASH
        progress['files_scanned'] += 1
        progress['bytes_read'] += len(data) + len(meta)
        accounting.append({'path': str(path), 'planned_event_bytes': planned[path],
                           'planned_metadata_bytes': planned[metadata],
                           'event_bytes': len(data), 'metadata_bytes': len(meta)})
        if analysis['findings'] != ['CLEAN'] and not known:
            bad.append({'path': str(path), 'sha256': analysis['sha256'], 'findings': analysis['findings']})
            raise ValueError('Additional evidence defects: ' + json.dumps(bad))
        if CONTEXT is not None:
            for event_id in analysis['event_ids']:
                if event_id in locations:
                    uniqueness.update(status='AMBIGUOUS', event_id=event_id,
                                      locations=[locations[event_id], str(path)])
                    raise ValueError('Ambiguous event ID across incidents: ' + event_id)
                if len(locations) >= EVIDENCE_EVENT_ID_LIMIT:
                    uniqueness['status'] = 'LIMIT_EXCEEDED'
                    raise ValueError('Global event ID inventory exceeds bound')
                locations[event_id] = str(path)
                uniqueness['unique_event_ids'] = len(locations)
        if on_incident is not None:
            # Qualification can retain preservation inventory from these exact
            # bounded stable reads. Callback failures keep the sweep incomplete.
            on_incident(path, data, meta, analysis, known, verified)
    if incident_inventory(folder) != paths: raise ValueError('Incident inventory changed during inspection')
    progress.pop('current_path', None)
    if CONTEXT is not None:
        if not locations:
            raise ValueError('Clean-room event inventory absent')
        for path, expected in seals.items():
            current = path.lstat()
            if not stat.S_ISREG(current.st_mode) or signature(current) != expected:
                raise ValueError('Evidence changed after read; global integrity observation incomplete')
        uniqueness['status'] = 'VERIFIED_UNIQUE'
        progress['status'] = 'VERIFIED_CLEAN'
        return {'status': 'VERIFIED_CLEAN', 'files_scanned': len(paths),
                'files_in_inventory': len(paths), 'planned_total_bytes': total,
                'bytes_read': progress['bytes_read'], 'read_budget_bytes': EVIDENCE_READ_BUDGET,
                'read_accounting': accounting, 'inventory_size_delta_bytes': progress['bytes_read'] - total,
                'historical_reconciliation': progress['historical_reconciliation'],
                'event_id_uniqueness': uniqueness,
                'qualification_identity': CONTEXT.identity(),
                'scope': 'Complete clean-room inventory; no historical laptop closeout or power-loss claim'}
    progress['status'] = 'VERIFIED_KNOWN_DEFECT_ONLY'
    return {'status': 'VERIFIED_KNOWN_DEFECT_ONLY', 'files_scanned': len(paths),
            'original_sha256': verified['original_sha256'], 'bundle_hashes': verified['bundle_hashes'],
            'bundle': verified['recovery_bundle'], 'recorded_bundle': verified['recorded_recovery_bundle'],
            'source_provenance': {'normalized': verified['normalized_source'], 'raw': verified['raw_source']},
            'files_in_inventory': len(paths), 'planned_total_bytes': total,
            'bytes_read': progress['bytes_read'], 'read_budget_bytes': EVIDENCE_READ_BUDGET,
            'read_accounting': accounting,
            'inventory_size_delta_bytes': progress['bytes_read'] - total,
            'scope': 'Incident event counts, malformed/NUL records, historical original and recovery provenance; '
                     'restart custody/continuity checks remain required'}


def inspect(root, active=False):
    row = {'timestamp': utc(), 'STATUS': 'BLOCKED', 'STAGE7_GATE': 'BLOCKED', 'STAGE8_GATE': 'BLOCKED',
           'traffic_generated': False, 'runtime_mutated': False, 'WAN_AUTHORIZED': False,
           'NEW_STAGE7_BASELINE_READY': False, 'PREVIOUS_STAGE7_DISPOSITION': 'INVALIDATED_BY_HOST_REBOOT',
           'mode': 'active' if active else 'stopped'}
    try:
        expected_root = RUNTIME if CONTEXT is None else CONTEXT.runtime
        if root.resolve() != expected_root: raise ValueError('Unexpected runtime root')
        if CONTEXT is not None:
            CONTEXT.validate_current()
            row['qualification_identity'] = CONTEXT.identity()
            row['historical_closeout'] = 'UNKNOWN: original laptop evidence remains independently unqualified'
        if os.geteuid() != 0: raise PermissionError('Operator sudo required for read-only reconciliation')
        runtime = collect(root, SOURCE, probe_readiness=False)
        if CONTEXT is not None: CONTEXT.check_runtime(runtime)
        row['runtime'] = runtime
        gate = active_gate if active else stopped_gate
        gate(runtime)
        if (root / 'state/wan-approval.json').exists(): raise ValueError('WAN approval state requires review')
        quarantine = root / 'state/quarantine'
        if quarantine.is_symlink(): raise ValueError('Quarantine directory symlink')
        paths = list(quarantine.glob('*.json'))
        if len(paths) > 100: raise ValueError('Quarantine inventory exceeds bound')
        for path in paths:
            if path.is_symlink() or path.stat().st_size > 64 * 1024: raise ValueError('Invalid quarantine record')
            record = json.loads(path.read_bytes())
            if record.get('active') is not False: raise ValueError('Active or unverified quarantine; no recovery proposed')
        row['capture_setup'] = capture_setup(root, active=active)
        if active:
            if row['capture_setup']['service']['MainPID'] != str(runtime['capture']['pid']):
                raise ValueError('PCAP process changed between runtime and unit inspection')
            row['capture_resources'] = readiness(root)
            if row['capture_resources'].get('ok') is not True:
                raise ValueError('Active capture output/resources failed: ' +
                                 '; '.join(row['capture_resources'].get('problems', [])))
        row['evidence_integrity'] = {'status': 'INCOMPLETE'}
        row['evidence_integrity'].update(evidence_integrity(root, row['evidence_integrity']))
        if active:
            after = collect(root, SOURCE, probe_readiness=False)
            if CONTEXT is not None: CONTEXT.check_runtime(after)
            row['runtime_after'] = after
            active_gate(after)
            row['runtime_comparison'] = compare_runtime(runtime, after)
            if row['runtime_comparison']['ok'] is not True:
                raise ValueError('Runtime changed during read-only active prerequisite review')
            row['STATUS'] = 'ACTIVE_PREREQUISITES_PASSED'
            row['next'] = 'Review fresh post-reboot baseline and guarded live demo before the Stage 7 restart matrix'
        else:
            row['STATUS'] = 'READY_FOR_GUARDED_RECOVERY_REVIEW'
            row['next'] = 'Review explicit capture-first start of existing decoys; then require full active preflight'
    except Exception as exc:
        row['error'] = type(exc).__name__ + ': ' + str(exc)
    return row


def main():
    global CONTEXT, RUNTIME
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime-root', type=Path, required=True)
    parser.add_argument('--active', action='store_true',
                        help='Inspect an already active stack and evidence; never start or restart anything')
    parser.add_argument('--context', type=Path)
    parser.add_argument('--context-sha256')
    args = parser.parse_args()
    CONTEXT = qualification_context.load(args.context, args.context_sha256, SOURCE, args.runtime_root,
                                         purpose='prerequisites')
    if CONTEXT is not None: RUNTIME = CONTEXT.runtime
    os.umask(0o077)
    def expired(signum, frame): raise TimeoutError('Read-only recovery inspection exceeded 120 seconds')
    signal.signal(signal.SIGALRM, expired)
    signal.alarm(120)
    try: row = inspect(args.runtime_root, active=args.active)
    finally: signal.alarm(0)
    folder = Path(tempfile.mkdtemp(prefix='stage7-recovery-review-', dir=(
        RETAINED if CONTEXT is None else CONTEXT.evidence_root)))
    path = folder / 'report.json'
    atomic_json(path, row)
    # Restrict the new report to the invoking operator; never change an original artifact's permissions.
    if os.geteuid() == 0 and os.environ.get('SUDO_UID'):
        owner = int(os.environ['SUDO_UID'])
        os.chown(path, owner, -1); os.chown(folder, owner, -1)
    summary = {k: row.get(k) for k in ('STATUS', 'error', 'STAGE7_GATE', 'STAGE8_GATE', 'next')}
    if row.get('evidence_integrity'):
        summary['EVIDENCE_SWEEP'] = {k: row['evidence_integrity'].get(k) for k in (
            'status', 'files_in_inventory', 'files_scanned', 'planned_total_bytes', 'bytes_read', 'read_budget_bytes')}
    print(json.dumps(summary, indent=2))
    print('REPORT: ' + str(path))
    print('SHA256: ' + hashlib.sha256(path.read_bytes()).hexdigest())
    return 0 if row['STATUS'] in ('READY_FOR_GUARDED_RECOVERY_REVIEW', 'ACTIVE_PREREQUISITES_PASSED') else 1


if __name__ == '__main__': raise SystemExit(main())
