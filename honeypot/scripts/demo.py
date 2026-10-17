"""HoneyTrace demo: real pipeline replay, or one gated localhost FTP interaction."""
import hashlib
import html
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import uuid
from hp_common import atomic_json, config, runtime_path, sha256, utc
from runtime_inventory import collect
from live_capture import readiness as capture_readiness, packet_proof

SOURCE = Path(__file__).resolve().parents[1]
STEPS = ('safety', 'interaction', 'source_event', 'normalization', 'incident', 'severity', 'evidence', 'loki', 'capture')


def rows(path, limit=4*1024**2):
    """Bounded tail reading; never print arbitrary raw lines or execute their data."""
    if not path.exists(): return []
    if path.is_symlink() or not path.is_file(): raise ValueError('Refusing nonregular log: '+str(path))
    with path.open('rb') as stream:
        size=os.fstat(stream.fileno()).st_size
        offset=max(0,size-limit);stream.seek(offset)
        if offset: stream.readline(limit)
        data=stream.read(limit)
    result=[]
    for line in data.splitlines():
        try:
            value=json.loads(line)
            if isinstance(value,dict): result.append(value)
        except (ValueError,UnicodeError): continue
    return result


def evidence_for(root, event):
    paths=sorted(runtime_path('INCIDENT_PATH','incidents',root).glob('*/*/incident.json'))
    if len(paths)>4000: raise ValueError('Incident inventory exceeds demo budget')
    budget=32*1024**2
    for path in paths:
        if path.is_symlink(): raise ValueError('Incident metadata symlink refused')
        size=path.stat().st_size;budget-=size
        if budget<0 or size>1024**2: raise ValueError('Incident metadata read budget exceeded')
        incident=json.loads(path.read_text())
        if event['event_id'] not in incident['related_events']: continue
        evidence=path.parent/'events.jsonl'
        if evidence.stat().st_size>64*1024**2: raise ValueError('Incident evidence exceeds demo read budget')
        from evidence_store import records
        stored=records(evidence)
        if set(stored)!=set(incident['related_events']): raise ValueError('Incident metadata/evidence IDs differ; retry after writes finish')
        if stored[event['event_id']]['normalized']!=event: raise ValueError('Normalized event differs from retained evidence')
        serialized=json.dumps(stored[event['event_id']],sort_keys=True,separators=(',',':')).encode()
        return {'incident_id':incident['incident_id'],'incident_severity':incident['severity'],
                'event_severity':event['severity'],'source_ip':event['source_ip'],'service':event['service'],
                'timestamp':event['timestamp'],'event_id':event['event_id'],'incident_path':str(path),
                'evidence_path':str(evidence),'record_sha256':hashlib.sha256(serialized).hexdigest(),
                'hash_encoding':'canonical JSON record; original evidence retained unchanged',
                'incident_event_count':len(incident['related_events']),
                'scope':'Only the matching event is labeled synthetic; the incident may include other activity',
                'action':'Recorded and classified. No new containment action requested by this demo.'}
    return None


def replay(folder, report):
    from incidentd import Engine
    fixture=folder/'sandbox';fixture.mkdir()
    shutil.copytree(SOURCE/'detections',fixture/'detections')
    # No .env, production mounts, network clients, or payload files in this sandbox.
    marker=report['demo_run_id'];stamp=utc()
    source=fixture/'logs/cowrie/cowrie.json';source.parent.mkdir(parents=True)
    events=[{'timestamp':stamp,'eventid':'cowrie.session.connect','src_ip':'192.0.2.10','src_port':41000,'dst_port':2222,'session':marker,'protocol':'ssh'},
            {'timestamp':stamp,'eventid':'cowrie.login.failed','src_ip':'192.0.2.10','session':marker,'username':marker,'password':'SYNTHETIC-NOT-A-REAL-PASSWORD'},
            {'timestamp':stamp,'eventid':'cowrie.command.input','session':marker,'input':'id # '+marker}]
    with source.open('x') as f:
        for event in events: f.write(json.dumps(event)+'\n')
    report['steps']['safety']='PASS: isolated workspace; no sockets, live logs, or service changes'
    report['steps']['interaction']='PASS: explicitly synthetic source-log replay (no decoy connection)'
    report['steps']['source_event']='PASS: three Cowrie-format source records created in sandbox'
    engine=Engine(fixture);engine.poll()
    normalized=rows(fixture/'logs/normalized/events.jsonl')
    if len(normalized)!=3 or {v['session_id'] for v in normalized}!={marker}:
        raise ValueError('Real engine did not normalize all three replay records')
    report['steps']['normalization']='PASS: real incidentd poll/normalizer processed all three records'
    result=evidence_for(fixture,normalized[-1])
    if not result or result['event_severity']!='HIGH': raise ValueError('Expected HIGH command-input classification missing')
    report['result']=result
    report['steps']['incident']='PASS: HIGH incident produced by real classification/correlation'
    report['steps']['severity']='PASS: HIGH command-input classification verified'
    evidence=Path(result['evidence_path']);before=sha256(evidence)[0]
    Engine(fixture).poll()
    if before!=sha256(evidence)[0] or len(rows(fixture/'logs/normalized/events.jsonl'))!=3:
        raise ValueError('Replay checkpoint/deduplication verification failed')
    if 'SYNTHETIC-NOT-A-REAL-PASSWORD' in (fixture/'logs/normalized/events.jsonl').read_text():
        raise ValueError('Searchable telemetry leaked a password')
    report['steps']['evidence']='PASS: metadata/records match; restart replay adds no duplicate evidence; searchable password redacted'
    report['steps']['loki']='NOT TESTED: replay does not run Alloy/Loki/Grafana'
    report['steps']['capture']='NOT TESTED: replay generates no packets'
    report['runtime']={'mode':'isolated source-log replay','services':'NOT TESTED','containment':'NOT TESTED: no live firewall inspection','pcap':'NOT TESTED'}


def ftp_interaction(port, marker):
    # Literal loopback only; no hostname, URL, proxy, redirect or external target option.
    with socket.create_connection(('127.0.0.1',port),timeout=5) as connection:
        connection.settimeout(5)
        def reply():
            data=b'';deadline=time.monotonic()+5
            while not data.endswith(b'\n'):
                remaining=deadline-time.monotonic()
                if remaining<=0 or len(data)>=1024: raise ValueError('FTP reply deadline/size exceeded')
                connection.settimeout(remaining)
                chunk=connection.recv(1024-len(data))
                if not chunk: raise ValueError('Truncated FTP reply')
                data+=chunk
            if len(data)<4 or data[3:4]!=b' ': raise ValueError('Unexpected FTP reply format')
            return data[:3]
        if reply()!=b'220': raise ValueError('Expected FTP decoy greeting')
        connection.sendall(('USER '+marker+'\r\n').encode('ascii'))
        if reply()!=b'331': raise ValueError('Expected FTP password prompt')
        connection.sendall(b'PASS SYNTHETIC-NOT-A-REAL-PASSWORD\r\n')
        if reply() not in (b'530',b'230'): raise ValueError('Unexpected FTP authentication response')


def loki_contains(root, container_id, event_id):
    # The address is fixed to the internal Loki service; no credentials or decoy strings are code.
    code='''import json,sys,urllib.request,urllib.parse
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None
query='{source="normalized"} |= '+json.dumps(sys.argv[1])
url='http://loki:3100/loki/api/v1/query_range?'+urllib.parse.urlencode({'query':query,'limit':20})
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
data=json.load(opener.open(url,timeout=5))
found=any(json.loads(value[1]).get('event_id')==sys.argv[1] for stream in data['data']['result'] for value in stream['values'])
print(json.dumps({'found':found}))
'''
    result=subprocess.run(['docker','exec',container_id,'python','-B','-c',code,event_id],cwd=root,text=True,capture_output=True,timeout=10,check=True)
    return json.loads(result.stdout).get('found') is True


def _live_verification(root, folder, report, timeout):
    root=Path(root).resolve()
    before=collect(root,SOURCE);report['runtime']=before
    atomic_json(folder/'runtime-before.json',before)
    if not before['ok']:
        report['steps']['safety']='FAIL: runtime safety could not be established'
        raise ValueError('Live safety gate failed: '+'; '.join(before['problems']))
    resources=capture_readiness(root);report['capture_preflight']=resources
    if not resources['ok']:
        report['steps']['capture']='FAIL: '+'; '.join(resources['problems'])
        raise ValueError('Capture readiness gate failed; no interaction sent')
    cfg=config(root)
    for path in (root,runtime_path('PCAP_PATH','captures',root),runtime_path('INCIDENT_PATH','incidents',root)):
        usage=shutil.disk_usage(path)
        if usage.used/usage.total*100>=int(cfg['DISK_HIGH_PERCENT']): raise ValueError('Disk high watermark: demo refused')
    report['steps']['safety']='PASS: fresh health, containment, loopback bindings, mounts, source hashes and PCAP identity'
    report['steps']['capture']='NOT TESTED: process verified; awaiting matching packet evidence'
    bindings=before['containers']['opencanary']['ports']['2121/tcp']
    if len(bindings)!=1 or bindings[0]['HostIp']!='127.0.0.1': raise ValueError('Expected one literal loopback FTP binding')
    port=int(bindings[0]['HostPort'])
    if not 1<=port<=65535: raise ValueError('Invalid FTP port')
    target_ip=before['containers']['opencanary']['networks']['honeypot-canary-net']['IPAddress']
    import ipaddress
    if ipaddress.ip_address(target_ip) not in ipaddress.ip_network('172.29.41.0/24'):
        raise ValueError('Inspected Canary address outside expected subnet')
    started=time.time()
    ftp_interaction(port,report['demo_run_id'])
    report['steps']['interaction']='PASS: one localhost FTP attempt with synthetic credentials'
    deadline=time.monotonic()+timeout;event=None;raw=None;incident=None;central=False;captured=False
    while time.monotonic()<deadline:
        raw=next((v for v in rows(root/'logs/opencanary/opencanary.json') if v.get('logdata',{}).get('USERNAME')==report['demo_run_id']),None)
        event=next((v for v in rows(root/'logs/normalized/events.jsonl') if v.get('source')=='opencanary' and v.get('username')==report['demo_run_id']),None)
        if raw: report['steps']['source_event']='PASS: matching OpenCanary source event observed'
        if event:
            report['steps']['normalization']='PASS: same unique marker in normalized telemetry'
            incident=evidence_for(root,event)
            if incident:
                if incident['event_severity'] not in ('LOW','MEDIUM','HIGH','CRITICAL'):
                    raise ValueError('Unrecognized event classification')
                report['result']=incident
                report['steps']['incident']='PASS: matching event linked to classified incident'
                report['steps']['severity']='PASS: actual event severity '+incident['event_severity']
                report['steps']['evidence']='PASS: normalized event equals retained record and metadata IDs match'
            report['steps']['loki']='CHECKING: exact event ID in Loki'
            central=loki_contains(root,before['containers']['incidentd']['id'],event['event_id'])
            if central: report['steps']['loki']='PASS: exact event ID returned by internal Loki query'
        if raw and incident and central:
            proof=packet_proof(root,folder,report['demo_run_id'],target_ip,started)
            captured=proof['ok'];report['capture_evidence']=proof
            if captured:
                report['steps']['capture']='PASS: unique FTP username marker in packet to inspected Canary IP/port; hashed snapshot retained'
                break
        time.sleep(1)
    if not (raw and incident and central and captured):
        for step,found in [('source_event',raw),('normalization',event),('incident',incident),('loki',central),('capture',captured)]:
            if not found: report['steps'][step]='FAIL: matching record not observed within deadline'
        raise ValueError('Timed out waiting for source → normalized event → incident → Loki → packet proof; inspect report steps')


def live(root, folder, report, timeout):
    """Always observe postflight; never replace a primary verification failure."""
    primary_failure = None
    try:
        _live_verification(root, folder, report, timeout)
    except BaseException as exc:
        primary_failure = exc
        report['verification_error'] = str(exc)
        raise
    finally:
        post = {'timestamp': utc(), 'status': 'FAILED', 'read_only': True,
                'problems': [], 'historical_postflight_replacement': False}
        report['postflight'] = post
        try:
            # No HTTP probes or synthetic interactions. Each collector subprocess
            # has a finite deadline, including when earlier verification failed.
            after = collect(Path(root).resolve(), SOURCE, probe_readiness=False)
            atomic_json(folder/'runtime-after.json', after)
            report['runtime_after_manifest'] = 'runtime-after.json'
            before = report.get('runtime', {})
            if not after.get('ok'):
                post['problems'].append('Postflight runtime/containment observation failed')
                post['problems'].extend(after.get('problems', []))
            if not before.get('ok'):
                post['problems'].append('Successful preflight baseline unavailable; stability unverified')
            if before.get('ok') and after.get('ok'):
                stable = lambda r: {k:r.get(k) for k in ('boot_id','observation_fingerprint')}
                identity = lambda r: {n:{k:c[k] for k in ('id','image_id','started_at','restart_count')}
                                      for n,c in r['containers'].items()}
                capture = lambda r: {k:r['capture'].get(k) for k in ('pid','start_ticks','argv')}
                if stable(before)!=stable(after) or identity(before)!=identity(after) or capture(before)!=capture(after):
                    post['problems'].append('Runtime changed during demo; result cannot be marked PASS')
            if not post['problems']:
                post['status'] = 'PASS'
        except Exception as exc:
            post['problems'].append(type(exc).__name__+': '+str(exc))
        post['completed_utc'] = utc()
        report['steps']['postflight'] = post['status']+': '+('; '.join(post['problems']) or 'read-only runtime and containment checks passed')
        if primary_failure is None and post['status'] != 'PASS':
            raise ValueError('Postflight failed: '+'; '.join(post['problems']))


def render(report):
    esc=lambda value:html.escape(str(value),quote=True)
    result=report.get('result',{})
    steps=''.join('<li><b>'+esc(k.replace('_',' ').title())+'</b><span>'+esc(v)+'</span></li>' for k,v in report['steps'].items())
    facts=''.join('<dt>'+esc(k.replace('_',' ').title())+'</dt><dd>'+esc(result.get(k,'Not observed'))+'</dd>' for k in ('incident_id','event_severity','incident_severity','source_ip','service','timestamp','event_id','record_sha256','action'))
    runtime=report.get('runtime',{})
    services=''.join('<li><b>'+esc(name)+'</b><span>'+esc(value.get('health','UNKNOWN'))+'</span></li>' for name,value in runtime.get('containers',{}).items())
    if not services: services='<li>Live service health, firewall containment and PCAP: NOT TESTED in this report.</li>'
    return '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>HoneyTrace demonstration</title><style>
body{font:16px/1.5 system-ui,sans-serif;background:#101827;color:#e6edf7;margin:0}main{max-width:1000px;margin:auto;padding:40px 24px}h1{font-size:42px;margin:0}h2{margin-top:32px}header p{color:#abc2d9}strong{color:#ffc966}.badge{display:inline-block;padding:8px 14px;border:1px solid #70829e;border-radius:8px}ul{padding:0;list-style:none}li{padding:14px 18px;margin:6px 0;background:#1b2940;border-radius:6px}li b{display:inline-block;min-width:160px}li span{display:block;color:#bfd0e5}dl{display:grid;grid-template-columns:180px 1fr;gap:12px;background:#1b2940;padding:20px}dd{margin:0;overflow-wrap:anywhere}dt{color:#abc2d9}footer{color:#abc2d9;margin-top:30px}a{color:#a5d7ff}@media(max-width:600px){dl{grid-template-columns:1fr}main{padding:22px}}
</style><main><header><p>HONEYTRACE / DEFENSIVE DECEPTION</p><h1>From activity to evidence</h1><p>''' + esc(report['mode']) + ''' · ''' + esc(report['timestamp']) + '''</p></header>
<p class="badge">''' + esc(report['status']) + '''</p><p><strong>SYNTHETIC DEMONSTRATION</strong> — '''+esc(report['demo_run_id'])+'''</p>
<p>Decoy telemetry is normalized, classified and linked to retained evidence. This report shows the checks that actually ran.</p>
<h2>Demonstration flow</h2><ul>'''+steps+'''</ul><h2>Services at preflight</h2><ul>'''+services+'''</ul><h2>Observed result</h2><dl>'''+facts+'''</dl>
<p>'''+esc(report.get('error',''))+'''</p><p>'''+esc(result.get('scope',''))+'''</p>
<footer>Replay uses synthetic source records and the real incident engine. It does not prove live sensors, packet capture, containment or centralized logging. A live demo does not qualify Stage 7, Stage 8 or WAN exposure.<p><a href="report.json">Machine-readable report</a></p></footer></main></html>'''


def main(mode='replay', runtime_root=None, timeout=60):
    if not 5<=timeout<=120: raise ValueError('Demo timeout must be 5..120 seconds')
    if mode=='live' and runtime_root is None: raise ValueError('--runtime-root is required for live mode')
    if mode not in ('replay','live'): raise ValueError('Unknown demo mode')
    base=SOURCE/'work/demo'
    base.resolve().relative_to(SOURCE)
    base.mkdir(parents=True,exist_ok=True)
    folder=Path(tempfile.mkdtemp(prefix='run-',dir=base))
    report={'demo_run_id':'honeytrace-demo-'+uuid.uuid4().hex,'synthetic':True,'source':'test',
            'timestamp':utc(),'mode':mode,'status':'INCOMPLETE',
            'steps':{k:'NOT TESTED' for k in STEPS},'stage7':'NOT QUALIFIED','stage8':'BLOCKED','wan_authorized':False}
    try:
        if mode=='replay': replay(folder,report)
        else: live(runtime_root,folder,report,timeout)
        report['status']='PASS_REPLAY' if mode=='replay' else 'PASS_LIVE'
    except (OSError,ValueError,KeyError,TypeError,RuntimeError,subprocess.SubprocessError) as exc:
        report['status']='FAILED';report['error']=str(exc)
    report['implementation']={name:sha256(SOURCE/'scripts'/name)[0] for name in (
        'demo.py','incidentd.py','evidence_store.py','runtime_inventory.py',
        'capture_status.py','live_capture.py','daemon_check.py','hp_common.py',
        'guard_policy.py','health_snapshot.py')}
    atomic_json(folder/'report.json',report)
    with (folder/'index.html').open('x') as stream: stream.write(render(report))
    # Make only this newly created summary bundle readable by the invoking operator.
    # Never change ownership of the referenced live logs, credentials or evidence.
    if os.geteuid()==0 and os.environ.get('SUDO_UID','').isdigit() and int(os.environ['SUDO_UID'])>0:
        import pwd
        uid=int(os.environ['SUDO_UID']);gid=pwd.getpwuid(uid).pw_gid
        for name in ('report.json','index.html','runtime-before.json','runtime-after.json'):
            path=folder/name
            if path.exists(): os.chown(path,uid,gid)
        os.chown(folder,uid,gid)
    print('HoneyTrace — '+report['status']+' ('+mode+')')
    for step,value in report['steps'].items(): print(step+': '+value)
    if report.get('error'): print('ERROR: '+report['error'])
    print('REPORT: '+str(folder/'report.json'))
    print('OPEN IN BROWSER: '+str(folder/'index.html'))
    return 0 if report['status'].startswith('PASS_') else 1
