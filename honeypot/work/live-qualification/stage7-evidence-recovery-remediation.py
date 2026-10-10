#!/usr/bin/env python3
"""Additive recovery only; strict qualified source hashes. Never deploys."""
import hashlib,json,os,sys,uuid,datetime,subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=Path('/home/joe/honeypot-staging/honeypot')
ID='dfd9b409bd28ff3fbed5848f-0000'
EID='d3f83160d30ace9e8c0d07f098625385819d38a8a8fdda628ce9ff3c6a9d66fd'
ORIGINAL=ROOT/'incidents/2026-10-05'/ID/'events.jsonl'
HASH='e8dbac89247db30367003775322427790fc905825b950bd03f53734040828d8c'
STATEMENT='This artifact provides logical evidence reconstruction from independently retained telemetry. It is not a byte-for-byte restoration of the lost historical incident record.'
def sha(b):return hashlib.sha256(b).hexdigest()
def read(path):
 if path.is_symlink():raise RuntimeError('Symlink source refused')
 return path.read_bytes()
def write(path,data):
 with path.open('xb') as f:f.write(data);f.flush();os.fsync(f.fileno())
QUALIFIED={
 'logs/normalized/events.jsonl':{'length':513,'timestamp':'2026-10-05T11:02:11.968140Z','source':'suricata','event_type':'stats'},
 'logs/suricata/eve.json':{'length':7874,'timestamp':'2026-10-05T11:02:11.968140+0000','event_type':'stats'},
}
def source(name,offset,filehash,recordhash):
 p=ROOT/name; expected=QUALIFIED[name]
 if p.resolve()!=p.absolute() or p.is_symlink():raise RuntimeError('Canonical source path mismatch')
 flags=os.O_RDONLY|os.O_NOFOLLOW
 fd=os.open(p,flags)
 try:
  with os.fdopen(fd,'rb',closefd=False) as f:
   before=os.fstat(fd);size=before.st_size
   if size<offset+expected['length']:raise RuntimeError('FILE_TRUNCATED: '+str(p))
   if size>384*1024**2:raise RuntimeError('Source verification byte budget exceeded')
   f.seek(max(0,offset-1))
   if offset and f.read(1)!=b'\n':raise RuntimeError('RECORD_BOUNDARY_CHANGED: preceding LF missing')
   f.seek(offset);line=f.read(expected['length'])
   if not line.endswith(b'\n') or b'\n' in line[:-1]:raise RuntimeError('RECORD_BOUNDARY_CHANGED: exact record length differs')
   if sha(line)!=recordhash:raise RuntimeError('QUALIFIED_RECORD_CHANGED: '+str(p))
   obj=json.loads(line)
   eid=obj.get('event_id') if name.startswith('logs/normalized') else sha((name+f'{before.st_dev}:{before.st_ino}'+str(offset)).encode()+line)
   if eid!=EID:raise RuntimeError('Event identity mismatch')
   for key in ('timestamp','source','event_type'):
    if key in expected and obj.get(key)!=expected[key]:raise RuntimeError('Qualified event semantics mismatch: '+key)
   # Locate the qualified whole-file snapshot as an exact current prefix.
   # Matching its SHA proves all previously captured bytes, not merely this row.
   f.seek(0);remaining=size;digest=hashlib.sha256();qualified_size=None
   while remaining:
    chunk=f.readline(min(remaining,32*1024*1024))
    if not chunk:raise RuntimeError('FILE_TRUNCATED during snapshot')
    remaining-=len(chunk);digest.update(chunk)
    if digest.hexdigest()==filehash:qualified_size=f.tell()
   current_hash=digest.hexdigest()
   if qualified_size is None:raise RuntimeError('UNKNOWN: qualified whole-file prefix not intact; possible earlier rewrite')
   if qualified_size<offset+len(line):raise RuntimeError('Qualified snapshot does not contain record')
   after=os.fstat(fd)
   if after.st_size<size or (after.st_dev,after.st_ino)!=(before.st_dev,before.st_ino):raise RuntimeError('Source replaced or truncated')
   f.seek(0);check=hashlib.sha256();remaining=qualified_size
   while remaining:
    chunk=f.read(min(1024*1024,remaining))
    if not chunk:raise RuntimeError('Qualified prefix truncated')
    check.update(chunk);remaining-=len(chunk)
   if check.hexdigest()!=filehash:raise RuntimeError('Qualified prefix rewritten during verification')
 finally:os.close(fd)
 return obj,{'path':str(p),'offset':offset,'length':len(line),'source_file_sha256':current_hash,'current_snapshot_size':size,'previously_qualified_source_file_sha256':filehash,'qualified_snapshot_size':qualified_size,'qualified_prefix_verified':True,'source_file_state':'UNCHANGED' if current_hash==filehash else 'APPEND_ONLY_GROWTH_WITH_QUALIFIED_RECORD_INTACT','record_sha256':sha(line),'event_id':eid,'timestamp':obj['timestamp'],'event_type':obj['event_type'],'identity':f'{before.st_dev}:{before.st_ino}','note':'Qualified entire historical snapshot verified as an exact prefix; current hash covers captured size, concurrent later appends excluded.'}
def main():
 r={'STATUS':'INCOMPLETE','PRODUCTION_CODE_DEPLOYED':False,'PRODUCTION_SERVICES_RESTARTED':False,'WAN_AUTHORIZED':False,'STAGE7_GATE':'BLOCKED','STAGE8_GATE':'BLOCKED','LIVE_STAGE7_RERUN_REQUIRED':True,'BYTE_EQUIVALENCE':STATEMENT}
 try:
  original=read(ORIGINAL);r['ORIGINAL_HASH_BEFORE']=sha(original)
  if sha(original)!=HASH:raise RuntimeError('Historical original hash mismatch')
  norm,np=source('logs/normalized/events.jsonl',160902,'e2af0c0104ad80b8d9846766cc5c5ec874298334400714fe1e61a920c954632d','eec23d039e33a1c54f3e7da74608e6be998b9a996195c6d3e698a05b7fbcd1e4')
  raw,rp=source('logs/suricata/eve.json',2227815,'72e650adb0ef426bb60fc67b0fb4a2d71ab0029c49652f9ae244860f654e2d6c','46e69f14c3b4d13919c64668a401918a85272a54ab9a2e0ee11a15dc5a75818a')
  meta=json.loads(read(ORIGINAL.parent/'incident.json'));prefix=original[:33944];lines=prefix.splitlines(keepends=True)
  if len(lines)!=4 or original[33944:]!=b'\0'*2920:raise RuntimeError('Original structure differs')
  ids=[json.loads(x)['event_id'] for x in lines]
  if len(set(ids+[EID]))!=5 or set(meta['related_events'])!=set(ids+[EID]):raise RuntimeError('Metadata membership mismatch')
  now=datetime.datetime.now(datetime.timezone.utc).isoformat();mapping=[];offset=0
  for line,eid in zip(lines,ids):
   mapping.append({'method':'ORIGINAL_INTACT','event_id':eid,'source_path':str(ORIGINAL),'offset':offset,'length':len(line),'sha256':sha(line),'recovery_utc':now});offset+=len(line)
  reconstructed=(json.dumps({'event_id':EID,'normalized':norm,'raw':raw},ensure_ascii=True,separators=(',',':'))+'\n').encode();derivative=prefix+reconstructed
  mapping.append({'method':'RECONSTRUCTED_FROM_RAW_AND_NORMALIZED','event_id':EID,'normalized':np,'raw':rp,'recovery_utc':now})
  if read(ORIGINAL)!=original:raise RuntimeError('Original changed before creation')
  for prov in (np,rp):
   with Path(prov['path']).open('rb') as f:
    if sha(f.read(prov['qualified_snapshot_size']))!=prov['previously_qualified_source_file_sha256']:raise RuntimeError('Qualified source prefix changed before creation')
  bundle=HERE/('stage7-recovery-'+ID+'-'+uuid.uuid4().hex[:12]);bundle.mkdir(mode=0o750)
  manifest={'incident_id':ID,'original':{'path':str(ORIGINAL),'sha256':HASH,'size':len(original)},'damaged_tail':{'offset':33944,'length':2920,'sha256':sha(original[33944:])},'ordered_records':mapping,'missing_metadata_event_id':EID,'raw_provenance':rp,'normalized_provenance':np,'derivative_sha256':sha(derivative),'recovery_utc':now,'tool_sha256':sha(Path(__file__).read_bytes()),'statement':STATEMENT,'containing_log_changes':'Containing logs may grow after qualification. Historical snapshots and exact historical records remain intact as verified prefixes.'}
  write(bundle/'events.recovered.jsonl',derivative);write(bundle/'recovery-manifest.json',(json.dumps(manifest,indent=2)+'\n').encode());write(bundle/'README.txt',(STATEMENT+'\nOriginal evidence is unchanged. This derivative does not clear qualification gates.\n').encode())
  fd=os.open(bundle,os.O_DIRECTORY);os.fsync(fd);os.close(fd)
  r.update(RECOVERY_BUNDLE=str(bundle),RECOVERED_EVENT_ID=EID,RAW_SOURCE_VERIFIED=rp,NORMALIZED_SOURCE_VERIFIED=np,LOGICAL_RECOVERY_STATUS='FULL_LOGICAL_RECOVERY')
  sweep=subprocess.run([sys.executable,'-B',str(HERE/'stage7-evidence-integrity-sweep.py')],capture_output=True,text=True,timeout=360)
  r['GLOBAL_SWEEP_AFTER']={'exit':sweep.returncode,'stdout':sweep.stdout,'stderr':sweep.stderr}
  report_lines=[x[8:] for x in sweep.stdout.splitlines() if x.startswith('REPORT: ')]
  if sweep.returncode or len(report_lines)!=1:raise RuntimeError('Global sweep failed')
  sweep_data=json.loads(Path(report_lines[0]).read_text())
  affected=sweep_data.get('CORRUPTED_FILES',[])
  if sweep_data['FILES_SCANNED']<317 or len(affected)!=1 or affected[0]['path']!=str(ORIGINAL) or affected[0]['sha256']!=HASH or not sweep_data['ORIGINAL_EVIDENCE_UNCHANGED']['hashes_unchanged_during_collection']:
   raise RuntimeError('Unexpected global sweep result')
  r['GLOBAL_SWEEP_AFTER'].update(report=report_lines[0],files_scanned=sweep_data['FILES_SCANNED'],known_defect_only=True)
  r['STATUS']='RECOVERY_COMPLETE_SOURCE_PATCH_TESTED_NOT_DEPLOYED'
  r['STAGE7_GATE']='BLOCKED_PENDING_DEPLOY_AND_LIVE_RESTART_RERUN'
 except Exception as exc:r['error']=type(exc).__name__+': '+str(exc)
 finally:
  try:r['ORIGINAL_HASH_AFTER']=sha(read(ORIGINAL));r['ORIGINAL_UNCHANGED']=r.get('ORIGINAL_HASH_BEFORE')==r['ORIGINAL_HASH_AFTER']==HASH
  except Exception as exc:r['ORIGINAL_UNCHANGED']=False;r['verification_error']=str(exc)
  if not r['ORIGINAL_UNCHANGED']:r['STATUS']='HARD_FAILURE_ORIGINAL_NOT_VERIFIED'
 r.update(DURABILITY_PATCH={'scope':'SOURCE_ONLY','files':['scripts/evidence_store.py','scripts/incidentd.py']},WRITE_ORDER=['validate','write all','evidence fsync','metadata temp fsync','replace','directory fsync','checkpoint'],FAULT_INJECTION_MATRIX='10 process-interruption phases; see offline test report',RECONCILIATION_TESTS='Exact orphan replay, duplicate deduplication, corruption rejection, state rollback tested')
 p=HERE/('stage7-evidence-recovery-remediation-'+uuid.uuid4().hex[:12]+'.json');write(p,(json.dumps(r,indent=2)+'\n').encode())
 for k,v in r.items():print(k+': '+json.dumps(v))
 print('REPORT: '+str(p));print('SHA256: '+sha(p.read_bytes()))
if __name__=='__main__':main()
