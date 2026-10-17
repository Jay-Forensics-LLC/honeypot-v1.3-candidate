#!/usr/bin/env python3
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time
from hp_common import ROOT, config, disk_severity, atomic_json, append_json, runtime_path, run, utc
from guard_policy import inspect_guard, inspect_dns
from pipeline_health import snapshot, drop_rate
from capture_status import inspect_capture
from health_snapshot import boot_id

def check():
    cfg=config();problems=[];warnings=[];containers={};now=time.time()
    try: previous=json.loads((ROOT/'state/health.json').read_text())
    except (OSError,ValueError): previous={}
    guard=inspect_guard(cfg);dns=inspect_dns()
    if not guard['ok']: problems.append('hp_guard policy missing or changed: '+'; '.join(guard['problems']))
    for name,ok in dns.items():
        if not ok: problems.append(name+' runtime DNS blackhole missing or additional resolver configured')
    sources,parser_errors=snapshot(ROOT,now)
    evidence=runtime_path('INCIDENT_PATH','incidents')
    disks={str(p):round(shutil.disk_usage(p).used/shutil.disk_usage(p).total*100,2) for p in {ROOT,evidence,runtime_path('PCAP_PATH','captures'),runtime_path('ARTIFACT_PATH','artifacts')} if p.exists()}
    disk=max(disks.values());severity=disk_severity(disk,cfg)
    def cmd(argv):
        try:
            r=run(argv,timeout=20,check=False);return r.returncode==0,r.stdout.strip()
        except (OSError,subprocess.TimeoutExpired): return False,''
    ok,text=cmd(['docker','compose','ps','--all','--format','json'])
    if ok:
        try:
            rows=json.loads(text) if text.startswith('[') else [json.loads(x) for x in text.splitlines()]
            for r in rows: containers[r.get('Service',r.get('Name','unknown'))]={'state':r.get('State'),'health':r.get('Health','unknown')}
        except ValueError: problems.append('Invalid Compose status JSON')
    else: problems.append('Docker/Compose status unavailable')
    for name in ('cowrie','opencanary','suricata','loki','alloy','grafana','incidentd'):
        if containers.get(name,{}).get('state')!='running' or containers.get(name,{}).get('health') not in ('healthy',): problems.append(name+' not running and healthy')
    http={}
    for name,url in [('loki','http://loki:3100/ready'),('grafana','http://grafana:3000/api/health'),('alloy','http://alloy:12345/-/ready')]:
        code='import urllib.request; print(urllib.request.urlopen('+repr(url)+', timeout=5).status)'
        passed,_=cmd(['docker','compose','exec','-T','incidentd','python','-c',code]);http[name]=passed
        if not passed: problems.append(name+' HTTP readiness failed')
    query='http://loki:3100/loki/api/v1/query_range?query=%7Bsource%3D%22normalized%22%7D&limit=1'
    code='import urllib.request,json; r=json.load(urllib.request.urlopen('+repr(query)+',timeout=5)); assert r["data"]["result"]'
    forwarding,_=cmd(['docker','compose','exec','-T','incidentd','python','-c',code])
    if not forwarding: problems.append('No recent normalized logs queryable in Loki')
    activity={}
    for name,p in [('cowrie',ROOT/'logs/cowrie/cowrie.json'),('opencanary',ROOT/'logs/opencanary/opencanary.json'),('suricata',ROOT/'logs/suricata/eve.json')]:
        age=round(time.time()-p.stat().st_mtime) if p.exists() else None
        activity[name]=age
        # Cowrie/OpenCanary are event-driven; quiet decoys legitimately have old logs.
        if not p.exists() or p.stat().st_size == 0:
            problems.append(name+' log missing or empty')
        elif name == 'suricata' and age > 600:
            problems.append('suricata log stale; expected periodic EVE activity')
    drops=None
    eve=ROOT/'logs/suricata/eve.json'
    if eve.exists():
        with eve.open('rb') as f:
            f.seek(max(0,eve.stat().st_size-2*1024**2));lines=f.read().splitlines()
        for line in reversed(lines):
            try:
                r=json.loads(line)
                if r.get('event_type')=='stats':
                    capture=r.get('stats',{}).get('capture',{});drops=capture.get('kernel_drops');break
            except ValueError: continue
    if drops is None: problems.append('Suricata packet-drop statistics unavailable')
    rate=drop_rate(previous,drops,now)
    if rate is not None and rate>0: warnings.append('MEDIUM: Suricata kernel drops increased at %.3f packets/second'%rate)
    capture=inspect_capture(ROOT)
    pcap=capture['ok']
    if not pcap: problems.append('PCAP verification failed: '+'; '.join(capture['problems']))
    clock,clocktext=cmd(['timedatectl','show','-p','NTPSynchronized','--value'])
    clock=clock and clocktext=='yes'
    if not clock: problems.append('Clock synchronization not confirmed')
    permissions=True
    for p in (evidence,runtime_path('ARTIFACT_PATH','artifacts'),ROOT/'secrets'):
        if not p.exists() or p.stat().st_mode & 0o007: permissions=False
    if not permissions: problems.append('Evidence/secrets permissions allow others or path absent')
    writable=os.access(evidence,os.W_OK)
    if not writable: problems.append('Evidence not writable by this health-check identity')
    backups=list((ROOT/'backups').glob('honeypot-*.tar.gz'))
    backup_age=(time.time()-max(p.stat().st_mtime for p in backups))/3600 if backups else None
    if backup_age is None or backup_age>48:
        message='MEDIUM: Backup missing or older than 48 hours'
        (problems if cfg.get('BACKUP_REQUIRED','false').lower()=='true' else warnings).append(message)
    mem={}
    if Path('/proc/meminfo').exists(): mem=dict((x.split(':')[0],int(x.split()[1])) for x in Path('/proc/meminfo').read_text().splitlines())
    if mem and mem['MemAvailable']/mem['MemTotal']<0.1: problems.append('Less than 10% RAM available')
    interfaces=sorted(p.name for p in Path('/sys/class/net').iterdir()) if Path('/sys/class/net').exists() else []
    capture_interfaces=[x.strip() for x in cfg.get('PCAP_INTERFACES',cfg['HONEYPOT_INTERFACE']).split(',') if x.strip()]
    missing_capture_interfaces=[x for x in capture_interfaces if x not in interfaces]
    if missing_capture_interfaces:
        problems.append('Capture interface absent: '+','.join(missing_capture_interfaces))
    try:
        import alert_bus
        note=alert_bus.health_note(ROOT)
        if note: problems.append(note)
    except Exception:
        pass
    if (problems or warnings) and severity=='LOW': severity='MEDIUM'
    row={'timestamp':utc(),'boot_id':boot_id(),'checked_epoch':now,'severity':severity,'disk_percent':disk,'filesystems':disks,'ram_available_kb':mem.get('MemAvailable'),
         'warnings':warnings,'pipeline_sources':sources,'parser_errors_last_hour':parser_errors,
         'guard':guard,'guard_counters':guard['counters'],'dns_blackholes':dns,'suricata_kernel_drop_rate':rate,
         'load_average':list(os.getloadavg()) if hasattr(os,'getloadavg') else None,'interfaces':interfaces,'containers':containers,
         'http':http,'log_age_seconds':activity,'suricata_kernel_drops':drops,'pcap_running':pcap,'capture':capture,'clock_synchronized':clock,
         'permissions_ok':permissions,'evidence_writable':writable,'log_forwarding':forwarding,'backup_age_hours':backup_age,'problems':problems}
    if disk>=int(cfg['DISK_CRITICAL_PERCENT']) and os.geteuid()==0:
        stopped,_=cmd(['systemctl','stop','honeypot-pcap.service']);row['pcap_stopped_for_disk']=stopped
        if stopped:
            row['pcap_running']=False
            row['capture']['ok']=False
            row['capture']['problems'].append('Capture stopped at critical disk watermark; manual recovery required')
    atomic_json(ROOT/'state/health.json',row);append_json(ROOT/'logs/system/health.jsonl',row,rotate=True)
    return row

if __name__=='__main__':
    os.umask(0o027);result=check();print(json.dumps(result,indent=2));raise SystemExit(0 if not result['problems'] and result['severity'] not in ('HIGH','CRITICAL') else 1)
