#!/usr/bin/env python3
"""Localhost probes and internal observability queries only. Run on target after startup."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from hp_common import atomic_json, config, runtime_path, run, utc

def record(name,ok,detail):
    atomic_json(ROOT/'state/test-results'/f'{name}.json',{'status':'PASS' if ok else 'FAIL','epoch':time.time(),'timestamp':utc(),'detail':detail})
    print(('PASS ' if ok else 'FAIL ')+name+': '+detail)
    return ok

def recent_text(path,offset=0):
    if not path.exists():return ''
    with path.open('rb') as f:f.seek(offset);return f.read(4*1024**2).decode('utf-8',errors='replace')

if __name__=='__main__':
    os.umask(0o027);cfg=config();ok=[]
    if cfg['DECOY_BIND']!='127.0.0.1':raise SystemExit('Integration tests require loopback-only DECOY_BIND=127.0.0.1')
    cp=ROOT/'logs/cowrie/cowrie.json';op=ROOT/'logs/opencanary/opencanary.json'
    offsets={p:p.stat().st_size if p.exists() else 0 for p in (cp,op)}
    try:
        with socket.create_connection(('127.0.0.1',int(cfg['COWRIE_SSH_PORT'])),5) as s:banner=s.recv(256)
        run(['ssh','-p',cfg['COWRIE_SSH_PORT'],'-o','ConnectTimeout=5','-o','StrictHostKeyChecking=no','-o','UserKnownHostsFile=/dev/null','-o','BatchMode=yes','-o','PreferredAuthentications=none','synthetic-test@127.0.0.1','true'],check=False)
        time.sleep(2);ok.append(record('cowrie_session',banner.startswith(b'SSH-') and 'cowrie.session' in recent_text(cp,offsets[cp]),'SSH banner plus new session log; no real credentials'))
    except Exception as e:ok.append(record('cowrie_session',False,str(e)))
    try:
        with socket.create_connection(('127.0.0.1',int(cfg['CANARY_FTP_PORT'])),5) as s:
            s.recv(1024)
            s.sendall(b'USER synthetic-test\r\n')
            s.recv(1024)
            s.sendall(b'PASS synthetic-not-a-password\r\n')
            try:
                s.recv(1024)
            except socket.timeout:
                pass
        time.sleep(2)
        text=recent_text(op,offsets[op])
        passed='synthetic-test' in text or 'synthetic-not-a-password' in text
        ok.append(record('canary_probe',passed,'Synthetic localhost FTP authentication attempt produced an OpenCanary structured event'))
    except Exception as e:ok.append(record('canary_probe',False,str(e)))
    r=run(['docker','compose','exec','-T','suricata','suricata','-T','-c','/etc/suricata/suricata.yaml'],timeout=120,check=False)
    ok.append(record('suricata_syntax',r.returncode==0,(r.stdout+r.stderr)[-1000:]))
    eve=ROOT/'logs/suricata/eve.json';ok.append(record('suricata_eve',eve.exists() and eve.stat().st_size>0,'EVE JSON exists and is nonempty; inspect flows to verify interface coverage'))
    art=runtime_path('ARTIFACT_PATH','artifacts');sample=art/('benign-validation-'+str(int(time.time()))+'.txt');sample.write_text('BENIGN SYNTHETIC ARTIFACT FOR LOCAL VALIDATION\n')
    os.chmod(sample,0o640)
    if hasattr(os,'geteuid') and os.geteuid()==0:os.chown(sample,10001,2000)
    time.sleep(12)
    manifest=art/'sha256-manifest.jsonl';ok.append(record('artifact_hash',sample.name in recent_text(manifest),'Benign artifact discovered and hashed by incidentd'))
    incidents=runtime_path('INCIDENT_PATH','incidents');found=any(sample.name in p.read_text() for p in incidents.rglob('events.jsonl'))
    ok.append(record('incident_report',found,'Incident evidence references benign artifact; see incidents/ for report'))
    q='http://loki:3100/loki/api/v1/query_range?query=%7Bsource%3D%22normalized%22%7D&limit=1'
    code='import urllib.request,json; r=json.load(urllib.request.urlopen('+repr(q)+',timeout=8)); assert r["data"]["result"]'
    r=run(['docker','compose','exec','-T','incidentd','python','-c',code],check=False)
    ok.append(record('loki_logs',r.returncode==0,'Loki returns normalized events via internal service network'))
    # Grafana datasource proxy validates authentication AND a real Loki query.
    import urllib.request,base64
    password=(ROOT/'secrets/grafana_admin_password').read_text().strip()
    req=urllib.request.Request('http://127.0.0.1:'+cfg['GRAFANA_PORT']+'/api/datasources/proxy/uid/loki/loki/api/v1/query_range?query=%7Bsource%3D%22normalized%22%7D&limit=1')
    req.add_header('Authorization','Basic '+base64.b64encode(('admin:'+password).encode()).decode())
    try:
        result=json.load(urllib.request.urlopen(req,timeout=10));passed=bool(result.get('data',{}).get('result'))
        ok.append(record('grafana_query',passed,'Authenticated Grafana datasource query returned data'))
    except Exception as exc:ok.append(record('grafana_query',False,str(exc)))
    r=run(['python3','scripts/backup.py'],timeout=300,check=False)
    backups=sorted((ROOT/'backups').glob('honeypot-*.tar.gz'))
    v=run(['python3','scripts/backup.py','--verify',str(backups[-1])],check=False) if backups else None
    ok.append(record('backup_restore',r.returncode==0 and v is not None and v.returncode==0,'Metadata archive checksum and safe member read verified; does not overwrite running data'))
    raise SystemExit(0 if all(ok) else 1)
