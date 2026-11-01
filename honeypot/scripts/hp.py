#!/usr/bin/env python3
"""One operator entrypoint; legacy scripts use the same implementation functions."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from operational_log import COMMANDS, SuiteLog, correlation
from guard_policy import inspect_guard
from hp_common import ROOT, redact, run, runtime_path
from pipeline_health import source_paths
from health_snapshot import boot_id, problems as snapshot_problems

def read_json(path):
    try:
        value=json.loads(path.read_text())
        return value if isinstance(value,dict) else {}
    except (OSError, ValueError): return {}

def describe(does, will_not, approval='No'):
    print('WHAT IT DOES: '+does)
    print('WHAT IT WILL NOT DO: '+will_not)
    print('APPROVAL NEEDED? '+approval)

def health():
    path=ROOT/'state/health.json';row=read_json(path)
    if not row:
        print('UNKNOWN: health.json unavailable; run scripts/healthcheck.py on target.');return 1
    print('Health: '+row.get('severity','UNKNOWN')+' at '+row.get('timestamp','UNKNOWN'))
    row['problems'] = snapshot_problems(row, boot_id())
    for group in ('problems','warnings'):
        print(group.upper()+':')
        for value in row.get(group) or []: print('  '+str(value))
        if not row.get(group): print('  none')
    print('JSON: '+str(path));return int(bool(row.get('problems')))

def status():
    row=read_json(ROOT/'state/health.json')
    issues=snapshot_problems(row, boot_id())
    print('Saved observation: '+('PASS_SNAPSHOT' if not issues else 'UNKNOWN/FAIL')+' (not a fresh runtime check)')
    print('Snapshot: '+row.get('timestamp','UNKNOWN (run healthcheck.py on target)'))
    print('Health: '+row.get('severity','UNKNOWN'))
    guard=row.get('guard');guard=guard if isinstance(guard,dict) else {}
    print('hp_guard: '+('PASS' if guard.get('ok') is True else 'UNKNOWN/FAIL'))
    print('PCAP: '+str(row.get('pcap_running','UNKNOWN')))
    for name in ('loki','alloy','grafana','incidentd','cowrie','opencanary','suricata'):
        containers=row.get('containers');containers=containers if isinstance(containers,dict) else {}
        c=containers.get(name);c=c if isinstance(c,dict) else {}
        print(name+': '+str(c.get('state','UNKNOWN'))+' / '+str(c.get('health','UNKNOWN')))
    print('Problems: '+str(len(issues))+'; warnings: '+str(len(row.get('warnings') or [])))
    print('Source defaults: loopback Grafana; WAN and automatic decoy boot OFF. Current exposure requires live validation.')
    print('JSON: '+str(ROOT/'state/health.json'))
    for issue in issues: print('PROBLEM: '+issue)
    return int(bool(issues))

def logs(source, count):
    if not 1<=count<=1000: raise ValueError('Line count must be 1..1000')
    path=source_paths()[source]
    from log_tail import read_tail
    try: tail=read_tail(path,count)
    except (OSError,ValueError):
        print('Telemetry unavailable: '+source+' log could not be read safely.');return 1
    if tail['empty']:
        print('No activity recorded: '+source+' log is readable and empty.');return 0
    if not tail['lines']:
        print('Telemetry unavailable: no complete records within the bounded tail.');return 1
    if tail['bounded'] or tail['partial_records_withheld']:
        print('Bounded tail; older or partial records omitted. This is not complete history.')
    valid=0
    for line in tail['lines']:
        try:
            row=json.loads(line)
            if not isinstance(row,dict): raise ValueError('Expected a structured log record')
            print(json.dumps(redact(row),ensure_ascii=True));valid+=1
        except (ValueError,UnicodeError): print('[malformed or unstructured record withheld]')
    if not valid: return 1
    return 0

def _main():
    ap=argparse.ArgumentParser(description=__doc__)
    sub=ap.add_subparsers(dest='command',required=True)
    from phase10.cli import configure_parser
    configure_parser(sub)
    dashboard=sub.add_parser('dashboard',help='Open the local HoneyTrace Security Suite workspace')
    dashboard.add_argument('--port',type=int,default=8765)
    dashboard.add_argument('--policy',type=Path)
    dashboard.add_argument('--store',type=Path)
    dashboard.add_argument('--sentinel-root',type=Path)
    dashboard.add_argument('--log-root',type=Path,help='Private operator workspace for suite diagnostics')
    dashboard.add_argument('--telemetry-root',type=Path,help='Read saved sensor observations from this honeypot directory')
    for name in ('status','health','stop','readiness'): sub.add_parser(name)
    boot=sub.add_parser('boot-start');boot.add_argument('--image-approval-sha256')
    doctor=sub.add_parser('doctor',help='Read local Docker daemon and existing project ownership; no recovery actions')
    doctor.add_argument('--runtime-root',type=Path,required=True)
    start=sub.add_parser('start');start.add_argument('--exposure-approved',action='store_true')
    start.add_argument('--image-approval-sha256')
    guard=sub.add_parser('guard');guard.add_argument('action',choices=['status','apply']);guard.add_argument('--apply',action='store_true')
    pcap=sub.add_parser('pcap');pcap.add_argument('action',choices=['status'])
    wan=sub.add_parser('wan');wan.add_argument('action',choices=['status','check','matrix'])
    intel=sub.add_parser('intel');intel.add_argument('action',choices=['pack']);intel.add_argument('--since',default='7d')
    bait=sub.add_parser('bait');bait.add_argument('action',choices=['status','render'])
    incident=sub.add_parser('incident');incident.add_argument('action',choices=['list'])
    demo=sub.add_parser('demo',help='Run isolated real-engine replay or a gated local live demonstration')
    demo.add_argument('--mode',choices=['replay','live'],default='replay')
    demo.add_argument('--runtime-root',type=Path)
    demo.add_argument('--output-root',type=Path,help='Existing private evidence directory outside source')
    demo.add_argument('--timeout',type=int,default=60)
    log=sub.add_parser('logs');log.add_argument('--source',choices=sorted(source_paths()),required=True)
    log.add_argument('--lines','-n',type=int,default=20);log.add_argument('last',nargs='?',choices=['last']);log.add_argument('count',nargs='?',type=int)
    a=ap.parse_args()
    if a.command=='dashboard':
        from dashboard import serve
        options = {'log_root': a.log_root} if a.log_root is not None else {}
        if a.telemetry_root is not None:
            options['telemetry_root'] = a.telemetry_root
        return serve(ROOT,a.port,a.policy,a.store,a.sentinel_root,**options)
    if a.command=='integrations':
        from phase10.cli import dispatch
        return dispatch(a,ROOT)
    if a.command=='doctor':
        from daemon_check import inspect
        row=inspect(a.runtime_root,require_existing=True)
        print(json.dumps(row,indent=2))
        return int(not row['ok'])
    if a.command=='demo':
        import demo
        return demo.main(a.mode,a.runtime_root,a.timeout,a.output_root)
    if a.command in ('start','boot-start','stop'):
        import ops
        texts={'start':('Create/start reviewed immutable images after strict loopback and containment gates','Build, pull, enable automatic boot or alter firewall'),
               'boot-start':('Start existing healthy loopback decoys after gates','Build, pull, create, or enable boot'),
               'stop':('Stop the Compose stack','Delete evidence, containers, or firewall rules')}
        describe(*texts[a.command],approval='Independent image approval hash; non-loopback startup remains blocked by runtime validation' if a.command=='start' else 'Explicit command')
        kwargs={'approval_sha256':a.image_approval_sha256} if a.command in ('start','boot-start') else {}
        return getattr(ops,a.command.replace('-','_'))(**kwargs) or 0
    if a.command=='wan':
        import wan_criteria
        if a.action=='matrix':
            describe('Print the WAN port matrix','Bind ports or change the router')
            for row in wan_criteria.load_matrix():
                print(json.dumps(row,ensure_ascii=True))
            print('No router rules were changed.')
            return 0
        if a.action=='status':
            describe('Show WAN criteria posture','Bind decoys or change the router')
            cfg=__import__('hp_common').config()
            print('DECOY_BIND='+cfg.get('DECOY_BIND','UNKNOWN'))
            print('MANAGEMENT_BIND='+cfg.get('MANAGEMENT_BIND','UNKNOWN'))
            print('WAN mode asserted='+str(wan_criteria.wan_mode_asserted(cfg)))
            print('Eligible ports='+','.join(str(port) for port in sorted(wan_criteria.eligible_ports())))
            print('No router rules were changed.')
            return 0
        describe('Write WAN criteria test-result JSON','Bind decoys, enable boot, or change the router')
        return wan_criteria.main()
    if a.command=='intel':
        import intel_pack
        describe('Build a sanitized intel pack from incident evidence','Read raw passwords, TTY, secrets, or send data off-box')
        out,_combined=intel_pack.build_pack(ROOT,a.since)
        print(str(out))
        return 0
    if a.command=='bait':
        import bait
        describe('Show or render per-deployment tripwires','Install bait into a live image or transmit tokens')
        if a.action=='status':
            print(bait.status_text(ROOT));return 0
        print(str(bait.render(ROOT)));return 0
    if a.command=='guard':
        describe('Inspect live owned policy' if a.action=='status' else 'Render and validate owned policy; apply only with --apply',
                 'Flush the ruleset or persist firewall policy','--apply for changes' if a.action=='apply' else 'No')
        if a.action=='status':
            row=inspect_guard();print(json.dumps(row,indent=2));return int(not row['ok'])
        result=run([sys.executable,str(ROOT/'scripts/firewall.py'),'apply']+(['--apply'] if a.apply else []),check=False)
        print(result.stdout,end='');print(result.stderr,end='',file=sys.stderr);return result.returncode
    if a.command=='pcap':
        describe('Read PCAP service state','Start capture or delete recordings')
        result=run(['systemctl','is-active','honeypot-pcap.service'],check=False)
        print(result.stdout.strip() or 'UNKNOWN');return result.returncode
    if a.command=='incident':
        describe('List incident IDs, severity, and timestamps','Display raw credentials or modify evidence')
        for path in sorted(runtime_path('INCIDENT_PATH','incidents').rglob('incident.json')):
            row=read_json(path)
            print(json.dumps({k:row.get(k) for k in ('incident_id','severity','timestamp_start')},ensure_ascii=True))
        return 0
    if a.command=='logs':
        describe('Show bounded recent searchable log lines with structured secret redaction','Read TTY, PCAP, secrets, or raw evidence')
        return logs(a.source,a.count if a.count is not None else a.lines)
    if a.command=='readiness':
        describe('Run target readiness checks and write readiness.json','Authorize WAN exposure or enable boot')
        import readiness
        return readiness.main()
    describe('Show last saved '+a.command+' snapshot and JSON location','Refresh target checks or change services')
    return health() if a.command=='health' else status()


def main():
    log = SuiteLog(ROOT, 'cli')
    command = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] in COMMANDS else 'unknown'
    started = time.monotonic()
    with log.bind(), correlation():
        log.event('cli.started', command=command)
        try:
            result = _main()
        except BaseException as exc:
            event = ('cli.completed' if isinstance(exc, SystemExit) and exc.code in (None, 0) else
                     'cli.rejected' if isinstance(exc, SystemExit) else
                     'cli.interrupted' if isinstance(exc, KeyboardInterrupt) else 'cli.failed')
            log.event(event,
                      level='INFO' if event == 'cli.completed' else 'WARNING' if isinstance(exc, (KeyboardInterrupt, SystemExit)) else 'ERROR',
                      command=command, error_type=type(exc).__name__,
                      duration_ms=(time.monotonic() - started) * 1000)
            raise
        log.event('cli.completed', level='INFO' if not result else 'WARNING', command=command,
                  returncode=result if type(result) is int else 0,
                  duration_ms=(time.monotonic() - started) * 1000)
        return result

if __name__=='__main__':
    os.umask(0o027)
    try: raise SystemExit(main())
    except (OSError,ValueError,subprocess.SubprocessError) as exc: raise SystemExit(str(exc))
