#!/usr/bin/env python3
"""One operator entrypoint; legacy scripts use the same implementation functions."""
import argparse
from collections import deque
import json
import os
import subprocess
import sys
from guard_policy import inspect_guard
from hp_common import ROOT, redact, run, runtime_path
from pipeline_health import source_paths

def read_json(path):
    try: return json.loads(path.read_text())
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
    for group in ('problems','warnings'):
        print(group.upper()+':')
        for value in row.get(group,[]): print('  '+value)
        if not row.get(group): print('  none')
    print('JSON: '+str(path));return int(bool(row.get('problems')))

def status():
    row=read_json(ROOT/'state/health.json')
    print('Snapshot: '+row.get('timestamp','UNKNOWN (run healthcheck.py on target)'))
    print('Health: '+row.get('severity','UNKNOWN'))
    print('hp_guard: '+('PASS' if row.get('guard',{}).get('ok') else 'UNKNOWN/FAIL'))
    print('PCAP: '+str(row.get('pcap_running','UNKNOWN')))
    for name in ('loki','alloy','grafana','incidentd','cowrie','opencanary','suricata'):
        c=row.get('containers',{}).get(name,{})
        print(name+': '+str(c.get('state','UNKNOWN'))+' / '+str(c.get('health','UNKNOWN')))
    print('Problems: '+str(len(row.get('problems',[])))+'; warnings: '+str(len(row.get('warnings',[]))))
    print('Grafana: local-only; WAN and automatic decoy boot default OFF')
    print('JSON: '+str(ROOT/'state/health.json'))
    return 0 if row else 1

def logs(source, count):
    if not 1<=count<=1000: raise ValueError('Line count must be 1..1000')
    path=source_paths()[source]
    if not path.exists(): print('No log file for '+source);return 1
    with path.open(encoding='utf-8',errors='replace') as f:
        for line in deque(f,maxlen=count):
            try: print(json.dumps(redact(json.loads(line)),ensure_ascii=True))
            except ValueError: print('[malformed line withheld]')
    return 0

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    sub=ap.add_subparsers(dest='command',required=True)
    for name in ('status','health','boot-start','stop','readiness'): sub.add_parser(name)
    start=sub.add_parser('start');start.add_argument('--exposure-approved',action='store_true')
    guard=sub.add_parser('guard');guard.add_argument('action',choices=['status','apply']);guard.add_argument('--apply',action='store_true')
    pcap=sub.add_parser('pcap');pcap.add_argument('action',choices=['status'])
    wan=sub.add_parser('wan');wan.add_argument('action',choices=['status','check','matrix'])
    intel=sub.add_parser('intel');intel.add_argument('action',choices=['pack']);intel.add_argument('--since',default='7d')
    bait=sub.add_parser('bait');bait.add_argument('action',choices=['status','render'])
    incident=sub.add_parser('incident');incident.add_argument('action',choices=['list'])
    log=sub.add_parser('logs');log.add_argument('--source',choices=sorted(source_paths()),required=True)
    log.add_argument('--lines','-n',type=int,default=20);log.add_argument('last',nargs='?',choices=['last']);log.add_argument('count',nargs='?',type=int)
    a=ap.parse_args()
    if a.command in ('start','boot-start','stop'):
        import ops
        texts={'start':('Explicit first deploy/rebuild after containment and exposure gates','Enable automatic boot or alter firewall'),
               'boot-start':('Start existing healthy loopback decoys after gates','Build, pull, create, or enable boot'),
               'stop':('Stop the Compose stack','Delete evidence, containers, or firewall rules')}
        describe(*texts[a.command],approval='--exposure-approved plus fresh readiness PASS, approval record, and source-fidelity evidence for non-loopback decoys' if a.command=='start' else 'Explicit command')
        return getattr(ops,a.command.replace('-','_'))() or 0
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

if __name__=='__main__':
    os.umask(0o027)
    try: raise SystemExit(main())
    except (OSError,ValueError,subprocess.SubprocessError) as exc: raise SystemExit(str(exc))
