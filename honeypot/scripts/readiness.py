#!/usr/bin/env python3
"""Fail-closed exposure checklist. Missing or stale evidence is FAIL, never assumed PASS."""
import json
import os
import subprocess
import time
from hp_common import ROOT, atomic_json, config, run, utc

REQUIRED=['cowrie_session','canary_probe','suricata_syntax','suricata_eve','pcap_rotation','artifact_hash','incident_report','loki_logs','grafana_query','backup_restore','firewall_isolation','firewall_rollback']
WAN_REQUIRED=['wan_management_isolation','wan_port_matrix','wan_egress_still_denied','wan_source_fidelity','wan_pcap_coverage','wan_approval_record']

def wan_names(cfg):
    flag=os.environ.get('WAN_CRITERIA', cfg.get('WAN_CRITERIA','false')).lower()=='true'
    if flag or (ROOT/'state/wan-approval.json').exists():
        return REQUIRED+WAN_REQUIRED
    return list(REQUIRED)

def evidence_passes(name, row, now=None):
    """PASS means fresh evidence. Source fidelity also needs a real observation."""
    now = time.time() if now is None else now
    try:
        age = now - float(row.get('epoch', 0))
    except (TypeError, ValueError):
        return False
    if row.get('status') != 'PASS' or not 0 <= age < 86400:
        return False
    if name == 'wan_source_fidelity':
        return row.get('scope') in ('netns', 'observation') and row.get('live') is True
    return True

def main():
    try: cfg=config()
    except (OSError, ValueError): cfg={}
    checks=[]
    for name in wan_names(cfg):
        p=ROOT/'state/test-results'/f'{name}.json'
        try:
            r=json.loads(p.read_text());passed=evidence_passes(name, r)
            if passed:
                detail=r.get('detail','')
            elif name=='wan_source_fidelity':
                detail='Source fidelity requires fresh netns or observation evidence with live=true; configuration intent is not PASS'
            else:
                detail='Missing PASS or older than 24 hours; rerun corresponding target test'
        except (FileNotFoundError,ValueError):passed=False;detail='No target test evidence'
        checks.append({'name':name,'status':'PASS' if passed else 'FAIL','detail':detail})
    for name,cmd in [('container_and_health',['python3','scripts/healthcheck.py']),('outbound_containment',['nft','list','chain','inet','hp_guard','outbound'])]:
        try:
            r=run(cmd,timeout=180,check=False);passed=r.returncode==0
        except (OSError,subprocess.TimeoutExpired):passed=False
        checks.append({'name':name,'status':'PASS' if passed else 'FAIL','detail':'Live target check'})
    for name,path in [('cowrie_logs',ROOT/'logs/cowrie/cowrie.json'),('canary_logs',ROOT/'logs/opencanary/opencanary.json'),('eve_logs',ROOT/'logs/suricata/eve.json')]:
        if name == 'eve_logs':
            passed=path.exists() and path.stat().st_size>0 and time.time()-path.stat().st_mtime<600
            detail='Nonempty Suricata EVE log updated in last 10 minutes'
        else:
            passed=path.exists() and path.stat().st_size>0
            detail='Nonempty event-driven source log present; liveness verified separately'
        checks.append({'name':name,'status':'PASS' if passed else 'FAIL','detail':detail})
    result={'timestamp':utc(),'checked_epoch':time.time(),'ready':all(x['status']=='PASS' for x in checks),'checks':checks,'wan_required':len(wan_names(cfg))>len(REQUIRED)}
    atomic_json(ROOT/'state/readiness.json',result)
    for item in checks:print(f"{item['status']:4} {item['name']}: {item['detail']}")
    print('Readiness PASS is technical evidence only. Internet exposure still requires explicit approval and router configuration.')
    print('No router rules were changed.')
    return 0 if result['ready'] else 1

if __name__=='__main__':raise SystemExit(main())