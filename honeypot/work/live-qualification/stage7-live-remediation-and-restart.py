#!/usr/bin/env python3
"""Approved incidentd-only deployment then sequential bounded restart matrix."""
import hashlib,importlib.util,json,os,sys,time,uuid,subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=Path('/home/joe/honeypot-staging/honeypot')
CANDIDATE=HERE.parents[1]
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(path,data):
 with path.open('xb') as f:f.write(data);f.flush();os.fsync(f.fileno())
def main():
 runid=uuid.uuid4().hex[:12];r={'STATUS':'INCOMPLETE','PRODUCTION_CHANGES':[],'ROLLBACK_REQUIRED':False,'STAGE7_GATE':'BLOCKED','STAGE8_GATE':'BLOCKED','WAN_AUTHORIZED':False,'RESTART_MATRIX':[]};b=None;pre=None;attempted=False
 def persist():
  p=HERE/('stage7-live-remediation-and-restart-'+runid+'-'+uuid.uuid4().hex[:6]+'.json');save(p,(json.dumps(r,indent=2)+'\n').encode());print('REPORT: '+str(p),flush=True);print('SHA256: '+digest(p),flush=True)
 def sweep():
  result=subprocess.run([sys.executable,'-B',str(HERE/'stage7-evidence-integrity-sweep.py')],capture_output=True,text=True,timeout=360)
  paths=[x[8:] for x in result.stdout.splitlines() if x.startswith('REPORT: ')]
  if result.returncode or len(paths)!=1:raise RuntimeError('Sweep execution failed: '+result.stderr[-1000:])
  doc=json.loads(Path(paths[0]).read_text());bad=doc.get('CORRUPTED_FILES',[])
  if doc.get('STATUS')!='SWEEP_COMPLETE_WITH_DEFECTS' or doc['FILES_SCANNED']<317 or len(bad)!=1 or bad[0]['path']!=str(recon.ORIGINAL) or bad[0]['sha256']!=recon.ORIGINAL_HASH or not doc['ORIGINAL_EVIDENCE_UNCHANGED']['hashes_unchanged_during_collection']:raise RuntimeError('Unexpected corpus integrity defect')
  return {'report':paths[0],'sha256':digest(paths[0]),'files_scanned':doc['FILES_SCANNED'],'known_historical_defect_only':True}
 def verify_recovery():
  if (ROOT/'state/wan-approval.json').exists() or os.environ.get('WAN_CRITERIA','false').lower()!='false':raise RuntimeError('WAN authorization/criteria state changed')
  v=recon.verify()
  if v['bundle_hashes']!=recovery['bundle_hashes']:raise RuntimeError('Recovery bundle changed')
  r['ORIGINAL_HISTORICAL_HASH']=v['original_sha256'];r['RECOVERY_BUNDLE_STATUS']={'status':'INTACT','path':v['recovery_bundle'],'hashes':v['bundle_hashes']}
 def startup():
  p=ROOT/'logs/system/evidence-integrity.jsonl'
  rows=[json.loads(x) for x in p.read_bytes()[diagnostic_offset:].splitlines()]
  expected='/hp/incidents/2026-10-05/dfd9b409bd28ff3fbed5848f-0000/events.jsonl'
  found=[x for x in rows if x.get('path')==expected and x.get('original_sha256')==recon.ORIGINAL_HASH and x.get('action')=='BLOCK_INCIDENT_WRITES']
  if not found or any(x.get('path')!=expected for x in rows):raise RuntimeError('Startup evidence reconciliation diagnostics missing or additional defect found')
  verify_recovery();return {'status':'PASS','diagnostics':rows,'known_incident_writes_blocked':True,'historical_original_unchanged':True}
 try:
  if os.geteuid()!=0:raise RuntimeError('Operator sudo required; no changes made')
  recon=load('live_reconciliation',HERE/'stage7-reconciled-evidence.py');recovery=recon.verify()
  b=load('live_deploy_helpers',HERE/'stage6-incidentd-rebuild.py');b.h.command=b.c.command
  if (ROOT/'state/wan-approval.json').exists() or os.environ.get('WAN_CRITERIA','false').lower()!='false':raise RuntimeError('WAN must remain unauthorized')
  r['WAN_STATE']={'authorization_file_present':False,'environment_WAN_CRITERIA':os.environ.get('WAN_CRITERIA','false')}
  pre=b.snapshot();diagnostic_path=ROOT/'logs/system/evidence-integrity.jsonl';diagnostic_offset=diagnostic_path.stat().st_size if diagnostic_path.exists() else 0
  if '--resume-deployed' in sys.argv:
   prior_path=HERE/'stage7-live-remediation-and-restart-1decc6cd30c9-bd78d0.json'
   if digest(prior_path)!='0802e50988e21cb25e3dabfaba39aa6949afd5ef153f07698e3acee3ed4f8b3b':raise RuntimeError('Qualified deployment report hash mismatch')
   prior=json.loads(prior_path.read_text())
   if prior['INCIDENTD_DEPLOYMENT']['status']!='PASS' or prior['RESTART_MATRIX']:raise RuntimeError('Resume requires deployed runtime with no matrix restarts')
   check=load('resume_invariants',HERE/'stage7-restart-resilience.py')
   r['RESUME_SNAPSHOT']=pre
   r['RESUME_INVARIANTS']=check.invariant_checks(prior['INCIDENTD_DEPLOYMENT']['post'],pre,mac_policy=check.configured_mac_policy(ROOT/'docker-compose.yml'))
   r['RESUME_FAILED_INVARIANTS']=[k for k,v in r['RESUME_INVARIANTS'].items() if not v]
   if r['RESUME_FAILED_INVARIANTS']:raise RuntimeError('Runtime changed since qualified deployment: '+', '.join(r['RESUME_FAILED_INVARIANTS']))
   r['candidate_hashes']={n:digest(CANDIDATE/'scripts'/n) for n in ['incidentd.py','evidence_store.py']}
   if r['candidate_hashes']!=prior['candidate_hashes']:raise RuntimeError('Candidate changed since deployment')
   rollback=prior['ROLLBACK_TARGET']
   if b.jsoncmd(['docker','image','inspect',rollback['tag']])[0]['Id']!=rollback['image_id']:raise RuntimeError('Rollback image drift')
   diagnostic_offset=0
   r.update(INCIDENTD_DEPLOYMENT=prior['INCIDENTD_DEPLOYMENT'],DEPLOYED_HASHES=prior['DEPLOYED_HASHES'],ROLLBACK_TARGET=rollback,RESUMED_FROM={'report':str(prior_path),'sha256':digest(prior_path)})
   r['PRE_RESUME']={'snapshot':pre,'integrity_sweep':sweep()}
   r['STARTUP_RECONCILIATION']=startup();persist()
  else:
   r['PRE_DEPLOYMENT']={'snapshot':pre,'recovery':recovery,'integrity_sweep':sweep(),'deployed_hashes':json.loads(b.command(['docker','exec','-i','honeypot-incidentd','python','-B','-'],stdin='import json,hashlib\nfrom pathlib import Path\nprint(json.dumps({n:hashlib.sha256(Path("/app",n).read_bytes()).hexdigest() if Path("/app",n).exists() else None for n in ["incidentd.py","evidence_store.py"]}))\n').stdout)}
   r['candidate_hashes']={n:digest(CANDIDATE/'scripts'/n) for n in ['incidentd.py','evidence_store.py']}
   b.preserve_rollback_image(pre);r['ROLLBACK_TARGET']=b.REPORT['rollback_artifact'];persist()
   # Stage only the two explicitly authorized incidentd implementation files.
   for name in ['incidentd.py','evidence_store.py']:
    target=ROOT/'scripts'/name
    if target.is_symlink():raise RuntimeError('Staging source symlink refused')
    if target.exists():save(HERE/('stage7-prior-source-'+runid+'-'+name),target.read_bytes())
    temporary=target.parent/('.stage7-'+runid+'-'+name);save(temporary,(CANDIDATE/'scripts'/name).read_bytes());os.chmod(temporary,0o644);os.replace(temporary,target)
   r['PRODUCTION_CHANGES'].append('Staged incidentd.py and evidence_store.py build inputs; no other sources/configuration changed')
   b.REQUIRED=b.REQUIRED+['evidence_store.py'];deployment_pre,service=b.prechange()
   if deployment_pre['states']!=pre['states'] or deployment_pre['guard']['fingerprint']!=pre['guard']['fingerprint'] or deployment_pre['pcap']['pid']!=pre['pcap']['pid']:raise RuntimeError('Pre-build runtime changed')
   b.command(b.BASE+['build','--pull=false','incidentd'],timeout=600)
   b.REPORT['new_image_id']=b.jsoncmd(['docker','image','inspect',service['image']])[0]['Id']
   if not b.unchanged_sources() or not b.verify_rollback_artifact()['verified']:raise RuntimeError('Build inputs/rollback changed')
   stable=b.snapshot()
   if stable['states']!=pre['states'] or stable['guard']['fingerprint']!=pre['guard']['fingerprint'] or stable['pcap']!=pre['pcap']:raise RuntimeError('Pre-recreate containment/identity changed')
   attempted=True;r['PRODUCTION_CHANGES'].append('Recreated incidentd only using --no-deps --no-build --pull never')
   b.command(b.BASE+['up','-d','--no-deps','--no-build','--pull','never','--force-recreate','incidentd'],timeout=120)
   b.postchange(deployment_pre);r['INCIDENTD_DEPLOYMENT']={'status':'PASS','checks':b.REPORT['post_checks'],'post':b.REPORT['post']};r['DEPLOYED_HASHES']=b.REPORT['hash_verification'];r['STARTUP_RECONCILIATION']=startup();persist()
  matrix=load('live_restart_matrix',HERE/'stage7-restart-resilience.py');matrix.RECONCILIATION=recon
  # A new event before restart becomes part of the deduplication baseline.
  if matrix.main(order=[],initial_telemetry=True):
   r['BOUNDED_EVENT_FAILURE']=matrix.LAST_REPORT;raise RuntimeError('Post-deployment bounded event verification failed')
  r['BOUNDED_EVENT_TEST']=matrix.LAST_REPORT['BOUNDED_EVENT_TEST'];verify_recovery();persist()
  if matrix.main(order=['incidentd']):
   r['INCIDENTD_RESTART_TEST']=matrix.LAST_REPORT;raise RuntimeError('incidentd restart failed')
  r['INCIDENTD_RESTART_TEST']=matrix.LAST_REPORT;r['RESTART_MATRIX']+=matrix.LAST_REPORT['RESTART_MATRIX'];startup();persist()
  if matrix.main(order=['opencanary','cowrie','suricata','alloy','loki','grafana']):
   r['RESTART_MATRIX']+=matrix.LAST_REPORT['RESTART_MATRIX'];raise RuntimeError('Restart continuation failed')
  r['RESTART_MATRIX']+=matrix.LAST_REPORT['RESTART_MATRIX']
  for key in ['NETWORK_INVARIANTS','FIREWALL_INVARIANTS','PCAP_CONTINUITY','LOG_CONTINUITY']:r[key]=matrix.LAST_REPORT[key]
  r['EVIDENCE_CONTINUITY']=matrix.LAST_REPORT['final_preservation'];r['HEALTH_AFTER']=b.snapshot();r['FINAL_INTEGRITY_SWEEP']=sweep();verify_recovery()
  r['STATUS']='PASS';r['STAGE7_GATE']='PASS';r['STAGE8_GATE']='READY_FOR_OPERATOR_DIRECTION'
 except Exception as exc:
  r['error']=type(exc).__name__+': '+str(exc);r['STATUS']='FAILED' if attempted else 'INCOMPLETE'
  # No further restarts after a live-test failure; retain the verified rollback.
  r['ROLLBACK_REQUIRED']=bool(attempted and 'INCIDENTD_DEPLOYMENT' not in r)
  if r['ROLLBACK_REQUIRED'] and b is not None:
   try:b.rollback(deployment_pre);r['ROLLBACK_RESULT']=b.REPORT['rollback']
   except Exception as rollback_error:r['ROLLBACK_RESULT']={'status':'FAILED','error':str(rollback_error)}
 finally:
  if b is not None:r['deployment_commands']=b.REPORT['commands']
  try:
   if 'recovery' in locals():verify_recovery()
  except Exception as exc:r['STATUS']='FAILED';r['STAGE7_GATE']='BLOCKED';r['STAGE8_GATE']='BLOCKED';r['preservation_error']=str(exc)
  for key in ['PRE_DEPLOYMENT','ROLLBACK_TARGET','INCIDENTD_DEPLOYMENT','DEPLOYED_HASHES','STARTUP_RECONCILIATION','BOUNDED_EVENT_TEST','INCIDENTD_RESTART_TEST','NETWORK_INVARIANTS','FIREWALL_INVARIANTS','PCAP_CONTINUITY','LOG_CONTINUITY','EVIDENCE_CONTINUITY','FINAL_INTEGRITY_SWEEP','ORIGINAL_HISTORICAL_HASH','RECOVERY_BUNDLE_STATUS','HEALTH_AFTER']:r.setdefault(key,'NOT_VERIFIED')
  persist()
  for key,value in r.items():
   if key in ['STATUS','error','STAGE7_GATE','STAGE8_GATE','ROLLBACK_REQUIRED']:print(key+': '+json.dumps(value),flush=True)
 return 0 if r['STATUS']=='PASS' else 2
if __name__=='__main__':raise SystemExit(main())
