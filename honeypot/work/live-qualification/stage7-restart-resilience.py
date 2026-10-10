#!/usr/bin/env python3
"""Operator-only, sequential existing-container restarts; no configuration writes."""
import hashlib,importlib.util,json,os,subprocess,time,uuid,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=Path('/home/joe/honeypot-staging/honeypot')
ORDER=['opencanary','cowrie','suricata','alloy','loki','grafana','incidentd']
STAGE6=HERE/'stage6-results-dd62a60d47f7.json'
SHA='8d6963b1adeff69647e8e4e5df39fb83d66ed111ae8af2c1e403c9400b1a8215'
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def configured_mac_policy(path):
 # Read only the Compose declaration. Unknown or explicitly configured MACs
 # remain strict; a false entry proves no MAC declaration for that service.
 import yaml
 doc=yaml.safe_load(Path(path).read_text())
 result={}
 for name,service in doc['services'].items():
  networks=service.get('networks') or {}
  entries=networks.values() if isinstance(networks,dict) else []
  result[name]=bool(service.get('mac_address')) or any(isinstance(v,dict) and bool(v.get('mac_address')) for v in entries)
 return result

def fixed_mac(container,endpoint,service,mac_policy):
 return (mac_policy is None or mac_policy.get(service,True) or
         bool(container.get('Config',{}).get('MacAddress')) or
         bool((endpoint.get('IPAMConfig') or {}).get('MacAddress')) or
         any('macaddress' in k.lower() or 'mac_address' in k.lower() for k in (endpoint.get('DriverOpts') or {})))

def restart_networks(container,service,mac_policy):
 result={}
 for name,endpoint in container['NetworkSettings']['Networks'].items():
  value={k:v for k,v in endpoint.items() if k!='EndpointID'}
  if not fixed_mac(container,endpoint,service,mac_policy):value.pop('MacAddress',None)
  result[name]=value
 return result

def restart_network_inventory(snapshot,mac_policy):
 owners={c['Id']:(name,c) for name,c in snapshot['containers'].items()}
 result={}
 for network in snapshot['networks']:
  value={k:v for k,v in network.items() if k!='Containers'};members={}
  for cid,endpoint in (network.get('Containers') or {}).items():
   member={k:v for k,v in endpoint.items() if k!='EndpointID'}
   if cid in owners:
    service,container=owners[cid]
    attachment=container['NetworkSettings']['Networks'].get(network['Name'],{})
    if not fixed_mac(container,attachment,service,mac_policy):member.pop('MacAddress',None)
   members[cid]=member
  value['Containers']=members;result[network['Name']]=value
 return result

def invariant_checks(pre,post,target=None,mac_policy=None):
 checks={'networks':True,'bindings':True,'mounts':True,'unrelated_identity':True,'unrelated_health':True}
 for name,old in pre['containers'].items():
  new=post['containers'][name]
  checks['networks'] &= restart_networks(old,name,mac_policy)==restart_networks(new,name,mac_policy)
  checks['bindings'] &= old['HostConfig'].get('PortBindings')==new['HostConfig'].get('PortBindings')
  # Docker inspect may enumerate identical mounts in a different order.
  # Retain every field and duplicate; normalize only list ordering.
  checks['mounts'] &= sorted(old['Mounts'],key=lambda v:json.dumps(v,sort_keys=True))==sorted(new['Mounts'],key=lambda v:json.dumps(v,sort_keys=True))
  if name!=target:
   checks['unrelated_identity'] &= all(old.get(k)==new.get(k) for k in ['Id','Image','RestartCount']) and old['State']['StartedAt']==new['State']['StartedAt']
   checks['unrelated_health'] &= new['State'].get('Running') and new['State'].get('Health',{}).get('Status')=='healthy'
 if 'networks' in pre or 'networks' in post:
  checks['networks'] &= 'networks' in pre and 'networks' in post and restart_network_inventory(pre,mac_policy)==restart_network_inventory(post,mac_policy)
 checks.update(hp_guard=pre['guard']['fingerprint']==post['guard']['fingerprint'],PCAP=all(pre['pcap'][k]==post['pcap'][k] for k in ['pid','start_ticks']),WAN=post['wan_loopback_safe'])
 return checks

def command(argv,input=None):
 r=subprocess.run(argv,input=input,text=True,capture_output=True,timeout=35)
 if r.returncode:raise RuntimeError(str(argv)+': '+r.stderr[-2000:])
 return r.stdout

def existing_loki_checks(stage6,query,output):
 # The shared Loki matcher requires the normalized source per query.
 # Preserve diagnostics before asserting, including errors from failed reads.
 rows=[]
 output.append(rows)
 for previous in stage6['tests']:
  if not previous.get('normalized'):continue
  event=previous['normalized'][0]
  test={'id':previous['id'],'source':event['source'],'start_epoch':previous['start_epoch']}
  rows.append(test)
  query(test,{event['event_id']})
 if not rows or not all(t.get('loki_event_checks',{}).get(previous['normalized'][0]['event_id'],{}).get('status')=='PASS' for t,previous in zip(rows,[x for x in stage6['tests'] if x.get('normalized')])):
  raise RuntimeError('Existing events not queryable; retained per-source Loki diagnostics')
 return rows

RECONCILIATION=None
LAST_REPORT=None
def matrix_disposition(rows,preflight_only=False):
 if preflight_only:return 'PREFLIGHT_PASS','BLOCKED'
 names=[row.get('service') for row in rows]
 if names==ORDER and all(row.get('status')=='PASS' for row in rows):
  # This legacy helper lacks a fresh baseline/final independent sweep. Its
  # completed rows are evidence, never the new qualification authority.
  return 'MATRIX_ROWS_PASS','BLOCKED'
 return 'PARTIAL_PASS','BLOCKED'
def read_evidence_json(path,jsonl=False,diagnostics=None):
 path=Path(path)
 if jsonl and RECONCILIATION is not None and path==RECONCILIATION.ORIGINAL:
  return RECONCILIATION.reconciled(path,diagnostics)
 for attempt in range(3):
  before=path.stat();data=path.read_bytes();after=path.stat()
  line_number=None
  try:
   if jsonl:
    value=[]
    for line_number,line in enumerate(data.splitlines(),1):value.append(json.loads(line))
   else:value=json.loads(data)
   if (before.st_ino,before.st_size,before.st_mtime_ns)!=(after.st_ino,after.st_size,after.st_mtime_ns):
    raise ValueError('File changed during evidence read')
   return data,value
  except (json.JSONDecodeError,ValueError) as exc:
   record={'path':str(path),'line':line_number,'attempt':attempt+1,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'error':str(exc)}
   if diagnostics is not None:diagnostics.append(record)
   if attempt==2:raise RuntimeError('Evidence JSON verification failed: '+json.dumps(record)) from exc
   time.sleep(.2)

def main(preflight_only=False,order=None,initial_telemetry=False):
 runid=uuid.uuid4().hex[:12];report={'run_id':runid,'STATUS':'INCOMPLETE','RESTART_MATRIX':[],'restart_order':ORDER,'STAGE8_GATE':'BLOCKED','WAN_authorized':False,'automatic_stage8':False}
 try:
  if hashlib.sha256(STAGE6.read_bytes()).hexdigest()!=SHA:raise RuntimeError('Stage6 source hash mismatch')
  stage6=json.loads(STAGE6.read_text());assert stage6['status']=='PASS','Stage6 must be authoritative PASS'
  report['stage6_evidence']={'path':str(STAGE6),'sha256':SHA}
  if os.geteuid()!=0:raise RuntimeError('Operator sudo required; no restarts performed')
  b=load('restart_helpers',HERE/'stage6-incidentd-rebuild.py');m=load('restart_pipeline',HERE/'stage6-incident-pipeline.py');h=m.h
  h.command=m.c.command
  baseline=b.snapshot();live,current=m.health();m.verify_routes(current)
  if not all(m.REPORT['routes'][k] for k in ['alloy_verified','grafana_datasource_verified']):raise RuntimeError('Pipeline routing gate failed')
  h.deployed_http_semantics()
  report['BASELINE']=baseline;report['pipeline_routes_before']=m.REPORT['routes'];h.CAPTURE_SESSION=baseline['pcap']
  config_files=list((ROOT/'configs').rglob('*'))+list((ROOT/'detections').rglob('*'))+[ROOT/'docker-compose.yml']
  hashes={str(p):b.hashfile(p) for p in config_files if p.is_file() and not p.is_symlink()}
  report['configuration_hashes']=hashes
  mac_policy=configured_mac_policy(ROOT/'docker-compose.yml');report['configured_mac_policy']=mac_policy
  report['evidence_read_diagnostics']=[]
  def read_doc(p):return read_evidence_json(p,diagnostics=report['evidence_read_diagnostics'])[1]
  def evidence():
   with b.s.deadline('bounded restart evidence inventory',90):
    logs=b.manifest(ROOT/'logs');incidents=[]
    paths=sorted((ROOT/'incidents').glob('*/*/incident.json'))
    if len(paths)>4000:raise RuntimeError('Incident inventory budget exhausted')
    for metadata in paths:
     p=metadata.parent;d=read_doc(metadata)
     data,rows=read_evidence_json(p/'events.jsonl',True,report['evidence_read_diagnostics']);records=[row['event_id'] for row in rows]
     incidents.append({'path':str(p),'id':d['incident_id'],'related_events':d['related_events'],'event_counts':{k:records.count(k) for k in set(records)},'events_bytes':len(data),'events_prefix_sha256':hashlib.sha256(data).hexdigest(), 'custody':read_doc(p/'metadata.json').get('copies',[])})
    state=read_doc(ROOT/'state/incidentd/state.json')
    return {'logs':logs,'incidents':incidents,'incidentd_offsets':state['offsets'],'heartbeat':h.stat(ROOT/'state/incidentd/heartbeat'),'alloy_state':b.manifest(ROOT/'state/alloy')}
  def preserved(old):
   with b.s.deadline('bounded restart evidence preservation',90):
    new=b.manifest(ROOT/'logs');byinode={(v['device'],v['inode']):p for p,v in new['files'].items()}
    for rel,v in old['logs']['files'].items():
     name=byinode.get((v['device'],v['inode']),rel);p=ROOT/'logs'/name
     if not p.is_file() or p.stat().st_size<v['bytes'] or b.hashfile(p,v['bytes'])!=v['sha256']:raise RuntimeError('Log evidence lost/overwritten: '+rel)
    for i in old['incidents']:
     p=Path(i['path']);d=read_doc(p/'incident.json');assert d['incident_id']==i['id'] and set(i['related_events'])<=set(d['related_events']),'Incident history lost'
     events=p/'events.jsonl';assert b.hashfile(events,i['events_bytes'])==i['events_prefix_sha256'],'Incident raw/normalized evidence overwritten'
     ids=[x['event_id'] for x in read_evidence_json(events,True,report['evidence_read_diagnostics'])[1]]
     for eid,count in i['event_counts'].items():assert ids.count(eid)==count,'Restart duplicated existing event'
     meta=read_doc(p/'metadata.json')
     for copy in i['custody']:
      assert copy in meta['copies'],'Custody record lost'
      destination=copy['destination'];candidates=[p/'pcap'/destination,p/'artifacts'/destination];target=next((x for x in candidates if x.is_file()),None)
      assert target and b.hashfile(target)==copy['sha256'],'Preserved custody hash mismatch'
    state=read_doc(ROOT/'state/incidentd/state.json')
    for src,v in old['incidentd_offsets'].items():
     now=state['offsets'].get(src);assert now is not None,'Ingestion offset lost'
     if now.get('inode')==v.get('inode'):assert now['offset']>=v['offset'],'Ingestion offset regressed'
    return {'log_prefixes':'PASS','incident_history':'PASS','existing_event_deduplication':'PASS','custody_hashes':'PASS','offsets':'PASS'}
  def runtime_hashes():
   paths=b.REQUIRED+(['evidence_store.py'] if RECONCILIATION is not None else []);data=json.loads(command(['docker','exec','-i','honeypot-incidentd','python','-B','-'], 'import hashlib,json\nfrom pathlib import Path\nprint(json.dumps({n:hashlib.sha256(Path("/app",n).read_bytes()).hexdigest() for n in '+repr(paths)+'}))\n'))
   assert all(data[n]==b.hashfile(ROOT/'scripts'/n) for n in paths),'Running engine drift';return data
  def tty():
   return json.loads(command(['docker','exec','-i','honeypot-cowrie','/cowrie/cowrie-env/bin/python3','-B','-'],'import json,os,stat\np="/cowrie/cowrie-git/var/lib/cowrie/tty"\ns=os.stat(p);assert stat.S_ISDIR(s.st_mode)\nprint(json.dumps({"path":os.path.realpath(p),"uid":s.st_uid,"gid":s.st_gid,"mode":stat.S_IMODE(s.st_mode)}))\n'))
  tty_before=tty();report['tty_before']=tty_before;report['runtime_hashes_before']=runtime_hashes()
  report['existing_loki_attempts']=[]
  def loki_existing():
   return existing_loki_checks(stage6,h.loki,report['existing_loki_attempts'])
  report['loki_before']=loki_existing();report['evidence_before']=evidence()
  tails={src:h.Tail('logs/'+src+'/'+src+'.json') for src in ['cowrie','opencanary']};normalized=h.Tail('logs/normalized/events.jsonl')
  def telemetry(name):
   service='ssh' if name=='cowrie' else 'http';src='cowrie' if name=='cowrie' else 'opencanary'
   t={'id':'STAGE7_'+name,'marker':'STAGE7_'+runid+'_'+name,'service':service,'source':src,'port':2222 if service=='ssh' else 8080,'start_epoch':time.time()};t['start_utc']=h.utc(t['start_epoch']);report.setdefault('telemetry_attempts',[]).append(t);beforetime=(ROOT/'state/incidentd/heartbeat').stat().st_mtime_ns
   if service=='ssh':m.protocol_ssh(t)
   else:m.protocol_http(t)
   t['end_epoch']=time.time();t['end_utc']=h.utc(t['end_epoch']);until=time.monotonic()+60
   while True:
    tails[src].poll();normalized.poll();raw=m.select_raw(t,tails[src].records);events=m.exact_events(raw,normalized.records)
    if raw and len(events)==len(raw):break
    if time.monotonic()>=until:raise RuntimeError('New raw/normalized telemetry deadline exceeded')
    time.sleep(1)
   t.update(raw=raw,normalized=events)
   assert not m.false_critical(events,[]),'Unexpected CRITICAL';incidents=m.incident_evidence(events);t['incidents']=incidents;ids={e['event_id'] for e in events}
   assert ids=={eid for i in incidents if i['exact_event_records'] for eid in i['event_ids']},'New incident attachment missing'
   until=time.monotonic()+45
   while True:
    h.loki(t,ids)
    if all(t.get('loki_event_checks',{}).get(e,{}).get('status')=='PASS' for e in ids):break
    if time.monotonic()>=until:raise RuntimeError('New Loki ingestion deadline exceeded')
    time.sleep(2)
   until=time.monotonic()+30
   while (ROOT/'state/incidentd/heartbeat').stat().st_mtime_ns<=beforetime:
    if time.monotonic()>=until:raise RuntimeError('Heartbeat did not resume')
    time.sleep(1)
   tuples=h.tuple_evidence(t,raw);t['pcap']=h.pcap(t,tuples);assert t['pcap'],'New tuple absent from PCAP'
   t.update(raw=raw,normalized=events,incidents=incidents,heartbeat_resumed=True)
   return t
  if initial_telemetry:report['BOUNDED_EVENT_TEST']=telemetry('incidentd_initial')
  for name in ([] if preflight_only else ORDER if order is None else order):
   pre=b.snapshot();row={'service':name,'status':'INCOMPLETE','pre':pre,'start_utc':h.utc()};report['RESTART_MATRIX'].append(row)
   old=evidence();suricata_before=h.stat(ROOT/'logs/suricata/eve.json');row['evidence_before']=old
   print('RESTART: '+json.dumps({'service':name,'command':['docker','restart','--time','15','honeypot-'+name]}),flush=True)
   command(['docker','restart','--time','15','honeypot-'+name]);until=time.monotonic()+150
   while True:
    containers=h.snapshot();guard=b.s.nft_snapshot(h.s.config(ROOT));partial={'containers':containers,'guard':guard,'pcap':h.capture_session(),'wan_loopback_safe':b.s.exposure_safe(h.s.config(ROOT),containers),'networks':b.networks()}
    checks=invariant_checks(pre,partial,name,mac_policy)
    row['restart_snapshot']=partial;row['restart_invariants']=checks
    if not all(checks.values()):raise RuntimeError('Restart invariant loss: '+str(checks))
    if h.healthy(containers[name]):break
    if time.monotonic()>=until:raise RuntimeError('Unrecovered service: '+name)
    time.sleep(2)
   post=b.snapshot();new=post['containers'][name];oldcontainer=pre['containers'][name]
   assert new['Id']==oldcontainer['Id'] and new['Image']==oldcontainer['Image'] and new['State']['StartedAt']!=oldcontainer['State']['StartedAt'],'Expected restart identity not demonstrated'
   row['restart_count_change']={'before':oldcontainer['RestartCount'],'after':new['RestartCount'],'note':'Manual Docker restart need not increment RestartCount'}
   assert all(b.hashfile(Path(p))==sha for p,sha in hashes.items()),'Config/rules modified'
   assert tty()==tty_before,'Cowrie TTY state changed'
   row['telemetry']=telemetry(name);row['existing_loki']=loki_existing();row['runtime_hashes']=runtime_hashes();row['preservation']=preserved(old)
   if name=='suricata':
    until=time.monotonic()+45
    while True:
     now=h.stat(ROOT/'logs/suricata/eve.json')
     if now and now['size']>suricata_before['size']:break
     if time.monotonic()>=until:raise RuntimeError('Suricata EVE logging did not resume')
     time.sleep(2)
    row['suricata_logging']='PASS'
   m.verify_routes(post['containers']);assert all(m.REPORT['routes'][k] for k in ['alloy_verified','grafana_datasource_verified']),'Datasource/Alloy drift'
   final=b.snapshot();assert all(invariant_checks(pre,final,name,mac_policy).values()),'Post-telemetry invariant loss'
   row.update(status='PASS',post=final,end_utc=h.utc());print('SERVICE_RECOVERY: '+json.dumps({'service':name,'status':'PASS'}),flush=True)
  report['HEALTH_AFTER']=b.snapshot();report['final_preservation']=preserved(report['evidence_before']);report['STATUS'],report['STAGE8_GATE']=matrix_disposition(report['RESTART_MATRIX'],preflight_only)
  for key in ['SERVICE_RECOVERY','NETWORK_INVARIANTS','FIREWALL_INVARIANTS','PCAP_CONTINUITY','LOG_CONTINUITY','INCIDENT_CONTINUITY','LOKI_CONTINUITY','DECOY_RECOVERY']:report[key]='PASS' if report['STATUS']=='MATRIX_ROWS_PASS' else 'NOT_TESTED: incomplete matrix'
 except Exception as exc:
  report['error']=type(exc).__name__+': '+str(exc);report['STATUS']='FAILED' if report['RESTART_MATRIX'] else 'INCOMPLETE'
  if report['RESTART_MATRIX'] and report['RESTART_MATRIX'][-1]['status']!='PASS':report['RESTART_MATRIX'][-1]['status']='FAILED'
 report['validation']={'offline_tests':'NOT RUN by this helper; use retained test output'}
 report.update(OBSERVED='No restart performed' if not report['RESTART_MATRIX'] else 'Per-step identities, exact events, invariant checks and evidence recorded; see completed rows',INFERRED='Restart resilience supported only for completed PASS rows; no inference for unexecuted steps',UNKNOWN=['Host reboot behavior; Stage8 not performed'],LIMITATIONS=['No host reboot, service recreation, host-network outage, disk failure, or outbound testing','SSH banner and HTTP GET are the only explicit interactions; Cowrie TTY directory persistence verified read-only; no successful shell activity generated','Automatic container health checks continue during the sequence','Failure stops further restarts; no automatic rollback or production configuration changes'])
 p=HERE/('stage7-restart-resilience-'+runid+'.json');data=(json.dumps(report,indent=2)+'\n').encode();p.open('xb').write(data);sha=hashlib.sha256(data).hexdigest();Path(str(p)+'.sha256').open('x').write(sha+'  '+p.name+'\n')
 for k in ['STATUS','BASELINE','RESTART_MATRIX','SERVICE_RECOVERY','NETWORK_INVARIANTS','FIREWALL_INVARIANTS','PCAP_CONTINUITY','LOG_CONTINUITY','INCIDENT_CONTINUITY','LOKI_CONTINUITY','DECOY_RECOVERY','HEALTH_AFTER','OBSERVED','INFERRED','UNKNOWN','LIMITATIONS','STAGE8_GATE']:
  value=report.get(k,'NOT_VERIFIED')
  if k=='RESTART_MATRIX':value=[{'service':r['service'],'status':r['status']} for r in value]
  if k in ['BASELINE','HEALTH_AFTER'] and isinstance(value,dict):value={a:value[a] for a in ['states','guard','pcap','wan_loopback_safe']}
  print(k+': '+json.dumps(value),flush=True)
 print('REPORT: '+str(p));print('SHA256: '+sha)
 global LAST_REPORT
 LAST_REPORT=report
 return 0 if report['STATUS'] in ['MATRIX_ROWS_PASS','PARTIAL_PASS','PREFLIGHT_PASS'] else 2
if __name__=='__main__':
 if sys.argv[1:] not in [[],['--preflight-only']]:raise SystemExit('Usage: stage7-restart-resilience.py [--preflight-only]')
 raise SystemExit(main(preflight_only=bool(sys.argv[1:])))
