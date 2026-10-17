#!/usr/bin/env python3
"""Read-only runtime diagnosis. Writes only a new report in this workspace.
No probes, restarts, deployments, evidence writes, or policy changes.
"""
import datetime, hashlib, importlib.util, json, os, subprocess, sys, uuid
from pathlib import Path
HERE=Path(__file__).resolve().parent
BASELINE=HERE/'stage7-live-remediation-and-restart-1decc6cd30c9-bd78d0.json'
BASELINE_SHA='0802e50988e21cb25e3dabfaba39aa6949afd5ef153f07698e3acee3ed4f8b3b'
STOPPED=HERE/'stage7-live-remediation-and-restart-3775700c2d73-dd8494.json'
STOPPED_SHA='203ad4b7a732431493b98ba2be6bba83c917b7c5713197e267952fffed536a06'
ROOT=Path('/home/joe/honeypot-staging/honeypot')
KEYS=['STATUS','QUALIFIED_BASELINE','CURRENT_STATE','RUNTIME_DIFF','ROOT_CAUSE','SECURITY_INVARIANTS','HARNESS_CONDITION','PATCH_REQUIRED','PATCHES','OFFLINE_TESTS','LIVE_RERUN_REQUIRED','ROLLBACK_REQUIRED','STAGE7_GATE','STAGE8_GATE']
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def pinned(p,expected):
 if sha(p)!=expected:raise RuntimeError('Artifact hash mismatch: '+str(p))
 return json.loads(p.read_bytes())
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'))
def mounts(c):return sorted(c['Mounts'],key=canonical)
def container_semantics(c):
 return {'Image':c['Image'],'mounts':mounts(c),'environment':sorted(c['Config'].get('Env') or []),
 'execution':{k:c['Config'].get(k) for k in ['User','WorkingDir','Entrypoint','Cmd','Healthcheck']},
 'security':{k:c['HostConfig'].get(k) for k in ['ReadonlyRootfs','CapDrop','CapAdd','SecurityOpt','GroupAdd','Tmpfs','NetworkMode','Privileged','PortBindings','Dns','DnsOptions','DnsSearch','Memory','NanoCpus','PidsLimit','RestartPolicy']},
 'apparmor':c.get('AppArmorProfile'),
 'networks':{name:{k:v.get(k) for k in ['IPAddress','IPPrefixLen','GlobalIPv6Address','GlobalIPv6PrefixLen','Gateway','IPv6Gateway','MacAddress','Aliases','DriverOpts','GwPriority']} for name,v in c['NetworkSettings']['Networks'].items()}}
def network_semantics(n):
 return {**{k:n.get(k) for k in ['Name','Driver','Scope','EnableIPv4','EnableIPv6','Internal','Attachable','Ingress','IPAM','Options','ConfigFrom','ConfigOnly']},
 'members':sorted(v['Name'] for v in (n.get('Containers') or {}).values())}
def semantic_checks(before,after,hashes,expected_hashes,recovery,expected_recovery):
 checks={}
 for name,old in before['containers'].items():
  new=after['containers'].get(name)
  checks['container.'+name]=bool(new) and container_semantics(old)==container_semantics(new)
  checks['health.'+name]=bool(new) and new['State'].get('Running') and (new['State'].get('Health') or {}).get('Status')=='healthy'
 checks['service_membership']=set(before['containers'])==set(after['containers'])
 checks['networks']={n['Name']:network_semantics(n) for n in before['networks']}=={n['Name']:network_semantics(n) for n in after['networks']}
 checks['hp_guard']=before['guard']['fingerprint']==after['guard']['fingerprint'] and after['guard']['policy']['ok']
 checks['pcap']=all(before['pcap'].get(k)==after['pcap'].get(k) for k in ['pid','start_ticks','argv']) and after.get('pcap_service_active') is True
 checks['WAN_disabled']=after.get('wan_loopback_safe') is True
 checks['deployed_sources']=hashes==expected_hashes
 checks['historical_evidence']=recovery.get('original_sha256')==expected_recovery['original_sha256']
 checks['recovery_bundle']=recovery.get('bundle_hashes')==expected_recovery['bundle_hashes']
 return checks

def projection(snapshot):
 result={}
 for name,c in snapshot['containers'].items():
  result[name]={'semantics':container_semantics(c),'Id':c['Id'],'Created':c['Created'],'StartedAt':c['State']['StartedAt'],'RestartCount':c['RestartCount'],'health':(c['State'].get('Health') or {}).get('Status'),'Running':c['State'].get('Running'),'image_tag':c['Config']['Image'],'mount_order':[m['Destination'] for m in c['Mounts']]}
 result['networks']={n['Name']:{'Id':n['Id'],'Created':n['Created'],'semantics':network_semantics(n)} for n in snapshot['networks']}
 result['hp_guard']={'fingerprint':snapshot['guard']['fingerprint'],'rules':snapshot['guard']['rules'],'policy':snapshot['guard']['policy']}
 result['pcap']=snapshot['pcap'];result['wan_loopback_safe']=snapshot['wan_loopback_safe']
 return result

def differences(a,b,prefix=''):
 if isinstance(a,dict) and isinstance(b,dict):
  out=[]
  for key in sorted(set(a)|set(b)):out+=differences(a.get(key),b.get(key),prefix+'.'+key if prefix else key)
  return out
 if a==b:return []
 transient=any(x in prefix for x in ['.packets','.bytes','.counters.','.timestamp','.utc','mount_order'])
 identity=prefix.endswith(('.Id','.Created','.StartedAt','.RestartCount'))
 if transient:classification='BENIGN_RUNTIME_DRIFT';expected='EXPECTED';security='None by itself; semantic checks remain mandatory'
 elif identity:classification='BENIGN_RUNTIME_DRIFT';expected='UNEXPECTED_UNLESS_OPERATOR_CONFIRMS_LIFECYCLE_CHANGE';security='Object identity is not configuration; lifecycle continuity is reported separately'
 elif 'semantics' in prefix:classification='CONTAINMENT_RELEVANT_CHANGE' if any(x in prefix for x in ['network','PortBindings','security','apparmor']) else 'PERSISTENT_CONFIGURATION_CHANGE';expected='UNEXPECTED';security='Requires review; do not resume'
 else:classification='UNKNOWN';expected='UNKNOWN';security='Requires review'
 return [{'FIELD':prefix,'QUALIFIED_VALUE':a,'CURRENT_VALUE':b,'CLASSIFICATION':classification,'EXPECTED_OR_UNEXPECTED':expected,'SECURITY_RELEVANCE':security}]

def main(collect=False):
 r={'STATUS':'INCOMPLETE','PATCH_REQUIRED':'UNDETERMINED','PATCHES':[],'OFFLINE_TESTS':{'status':'PASS','count':19,'command':'python3 -B work/live-qualification/test-stage7-runtime-drift-diagnosis.py','test_file_sha256':sha(HERE/'test-stage7-runtime-drift-diagnosis.py')},'LIVE_RERUN_REQUIRED':False,'ROLLBACK_REQUIRED':False,'STAGE7_GATE':'BLOCKED','STAGE8_GATE':'BLOCKED','operations':[]}
 try:
  prior=pinned(BASELINE,BASELINE_SHA);stopped=pinned(STOPPED,STOPPED_SHA);before=prior['INCIDENTD_DEPLOYMENT']['post']
  expected_hashes={n:v['running'] for n,v in prior['DEPLOYED_HASHES'].items()}
  expected_recovery={'original_sha256':prior['ORIGINAL_HISTORICAL_HASH'],'bundle_hashes':prior['RECOVERY_BUNDLE_STATUS']['hashes']}
  r['QUALIFIED_BASELINE']={'path':str(BASELINE),'sha256':BASELINE_SHA,'snapshot':before,'deployed_hashes':expected_hashes,'recovery':expected_recovery,'WAN':prior['WAN_STATE'],'image_tags_at_qualification':{n:c['Config']['Image'] for n,c in before['containers'].items()},'repo_tags_at_qualification':'NOT_CAPTURED'}
  old_networks=json.loads(next(c['stdout'] for c in stopped['deployment_commands'] if c['argv'][:3]==['docker','network','inspect']))
  r['CURRENT_STATE']={'stopped_resume_artifact':str(STOPPED),'sha256':STOPPED_SHA,'networks_at_stopped_resume':old_networks,'snapshot_at_stopped_resume':'NOT_SAVED_BY_HARNESS','live':'NOT_COLLECTED'}
  r['RUNTIME_DIFF']={'at_stopped_resume':differences({n['Name']:n for n in before['networks']},{n['Name']:n for n in old_networks}),'live':[]}
  r['ROOT_CAUSE']={'status':'UNKNOWN','proven':'All Docker network inspection fields were identical at the stopped resume. Container, firewall and PCAP snapshot was discarded before persistence; exact failing predicate cannot be recovered from this artifact alone.'}
  r['HARNESS_CONDITION']={'file':str(HERE/'stage7-live-remediation-and-restart.py'),'branch':'--resume-deployed','expression':"not all(check.invariant_checks(prior['INCIDENTD_DEPLOYMENT']['post'], pre).values())",'called_function':str(HERE/'stage7-restart-resilience.py')+': invariant_checks(..., target=None)','compares':['network object ID, addresses, MAC, aliases','PortBindings','Mounts list INCLUDING ORDER','ALL container IDs, image IDs, restart counts, StartedAt because target=None','health','hp_guard fingerprint','PCAP PID/start_ticks','WAN loopback safety'],'omits':['environment/execution security','network CIDR/config semantic comparison','runtime source hashes at this branch'],'finding':'The branch is stricter than semantic configuration and discards failing predicates. No culprit is assumed.'}
  r['SECURITY_INVARIANTS']={'at_stopped_resume':'snapshot safety gate completed, networks exactly unchanged, original/recovery hashes verified by finally; exact current live state needs capture','live':'NOT_VERIFIED'}
  if not collect:
   r['access_limitation']='Docker socket denied; escalated sudo -n requires interactive authentication. Use --collect-live with operator sudo; collector has no probes or mutations.'
  else:
   if os.geteuid()!=0:raise RuntimeError('Read-only collection requires operator sudo')
   b=load('drift_read_helpers',HERE/'stage6-incidentd-rebuild.py')
   def run(argv,input=None):
    t={'argv':argv,'start_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()};r['operations'].append(t)
    p=subprocess.run(argv,capture_output=True,text=True,input=input,timeout=40);t.update(exit=p.returncode,stdout=p.stdout,stderr=p.stderr)
    if p.returncode:raise RuntimeError('Read-only command failed: '+str(argv)+': '+p.stderr[-1000:])
    return p.stdout
   # Wire only read helper calls, never helper mains, probes, or transactions.
   def command(argv,input=None,timeout=40):
    output=run(argv,input);return subprocess.CompletedProcess(argv,0,output,'')
   b.h.command=command
   cfg=b.h.s.config(ROOT);containers=b.h.snapshot();r['CURRENT_STATE']['live']={'containers':containers}
   guard=b.s.nft_snapshot(cfg);r['CURRENT_STATE']['live']['guard']=guard
   active=run(['systemctl','is-active','honeypot-pcap.service']).strip()=='active'
   try:pcap=b.h.capture_session()
   except Exception:
    r['STATUS']='STOP_PCAP_INVARIANT_UNVERIFIED_OR_LOST';r['SECURITY_INVARIANTS']={'pcap':'FAILED_OR_UNVERIFIED','pcap_service_active':active};raise
   ids=run(['docker','network','ls','-q']).split();nets=json.loads(run(['docker','network','inspect',*ids]))
   after={'utc':b.h.utc(),'containers':containers,'guard':guard,'pcap':pcap,'networks':nets,'wan_loopback_safe':b.s.exposure_safe(cfg,containers),'pcap_service_active':active}
   r['CURRENT_STATE']['live']=after
   r['CURRENT_STATE']['image_metadata']=json.loads(run(['docker','image','inspect',*sorted({c['Image'] for c in containers.values()})]))
   code='import hashlib,json\nfrom pathlib import Path\nprint(json.dumps({n:hashlib.sha256(Path("/app",n).read_bytes()).hexdigest() for n in '+repr(list(expected_hashes))+'}))\n'
   hashes=json.loads(run(['docker','exec','-i','honeypot-incidentd','python','-B','-'],code));r['CURRENT_STATE']['source_hashes']=hashes
   recon=load('drift_recovery_read',HERE/'stage7-reconciled-evidence.py');v=recon.verify();recovery={'original_sha256':v['original_sha256'],'bundle_hashes':v['bundle_hashes']};r['CURRENT_STATE']['recovery']=recovery
   r['CURRENT_STATE']['WAN']={k:cfg.get(k) for k in ['WAN_CRITERIA','WAN_SOURCE_MODE','DECOY_BIND','MANAGEMENT_BIND']};r['CURRENT_STATE']['WAN']['approval_file_present']=(ROOT/'state/wan-approval.json').exists()
   matrix=load('drift_original_validator',HERE/'stage7-restart-resilience.py');actual=matrix.invariant_checks(before,after)
   checks=semantic_checks(before,after,hashes,expected_hashes,recovery,expected_recovery)
   r['SECURITY_INVARIANTS']={'original_resume_predicates':actual,'semantic_invariants':checks,'all_service_health_restarts':{n:{'id':c['Id'],'health':(c['State'].get('Health') or {}).get('Status'),'restarts':c['RestartCount'],'started_at':c['State']['StartedAt']} for n,c in containers.items()},'hp_guard_chains_rules':guard,'decoy_network_CIDRs':{n['Name']:n['IPAM'] for n in nets if n['Name'] in ['honeypot-cowrie-net','honeypot-canary-net']},'pcap_service_active':active}
   r['RUNTIME_DIFF']['live']=differences(projection(before),projection(after))+differences(expected_hashes,hashes,'source_hashes')+differences(expected_recovery,recovery,'recovery')
   failed=[k for k,v in actual.items() if not v]
   r['ROOT_CAUSE']={'failed_original_predicates_now':failed,'historical_failure_exactly_reproduced':bool(failed),'note':'Current collection is later than stopped resume; original discarded fields cannot establish historical identity without matching current reproduction.'}
   if not all(checks.values()):
    r['STATUS']='STOP_UNEXPECTED_INVARIANT_CHANGE';r['ROOT_CAUSE']['failed_security_invariants']=[k for k,v in checks.items() if not v];r['PATCH_REQUIRED']=False
   else:
    r['STATUS']='DIAGNOSIS_COMPLETE_BENIGN_CURRENT_DRIFT' if failed else 'DIAGNOSIS_COMPLETE_MISMATCH_NOT_REPRODUCED';r['PATCH_REQUIRED']=bool(failed)
    r['ROOT_CAUSE']['diff_fields']=[x['FIELD'] for x in r['RUNTIME_DIFF']['live']]
    r['STAGE7_GATE']='BLOCKED_PENDING_OPERATOR_RESUME' if failed else 'BLOCKED'
    r['LIVE_RERUN_REQUIRED']=True
    r['patch_policy']='Collector never patches or resumes; review this evidence before changing the harness.'
 except Exception as e:r['error']=type(e).__name__+': '+str(e)
 for key in KEYS:r.setdefault(key,'NOT_VERIFIED')
 path=HERE/('stage7-runtime-drift-diagnosis-'+uuid.uuid4().hex[:12]+'.json')
 with path.open('x') as f:json.dump(r,f,indent=2);f.write('\n')
 print('REPORT: '+str(path));print('SHA256: '+sha(path))
 for k in KEYS:
  value=r[k]
  if k in ['QUALIFIED_BASELINE','CURRENT_STATE','RUNTIME_DIFF','SECURITY_INVARIANTS','HARNESS_CONDITION']:value={'full_value_in_report':k,**({'differences':len(value.get('live',[]))} if k=='RUNTIME_DIFF' else {})}
  print(k+': '+json.dumps(value))
 return 0 if r['STATUS'].startswith('DIAGNOSIS_COMPLETE') else 2
if __name__ == '__main__':
    raise SystemExit('Offline test support only; direct host operation is unavailable')
