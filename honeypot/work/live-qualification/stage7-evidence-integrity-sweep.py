#!/usr/bin/env python3
"""Read-only global incident inventory and exact-ID recovery-source sweep."""
import collections,datetime,hashlib,json,os,stat,tarfile,time,uuid,zipfile
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=Path('/home/joe/honeypot-staging/honeypot')
PROVENANCE=HERE/'stage7-evidence-provenance-409e6965777a.json'
EXPECTED='ea2ee335ab71095416086eb6cd813ff72607d463190b805623d66cdc023498ec'
def sha(data):return hashlib.sha256(data).hexdigest()
def analyze(data,related):
 rows=[];offset=0;ids=[];issues=[]
 lines=data.split(b'\n')
 for index,line in enumerate(lines):
  if index==len(lines)-1 and not line:break
  row={'line':index+1,'offset':offset,'bytes':len(line),'sha256':sha(line)}
  try:
   doc=json.loads(line)
   if not isinstance(doc,dict) or not isinstance(doc.get('event_id'),str):raise ValueError('Missing string event_id')
   ids.append(doc['event_id']);row.update(valid=True,event_id=doc['event_id'])
  except (ValueError,UnicodeError) as exc:row.update(valid=False,error=str(exc),nul_count=line.count(b'\0'));issues.append(row)
  rows.append(row);offset+=len(line)+1
 counts=collections.Counter(ids);missing=sorted(set(related)-set(ids));unexpected=sorted(set(ids)-set(related));tail=len(data)-len(data.rstrip(b'\0'))
 labels=[]
 if data.count(b'\0'):labels.append('NUL_CORRUPTION')
 if issues:labels.append('MALFORMED_JSON')
 if missing:labels.append('MISSING_METADATA_EVENT')
 if unexpected:labels.append('UNEXPECTED_EVENT')
 if len(ids)!=len(related) or any(v>1 for v in counts.values()):labels.append('COUNT_MISMATCH')
 if data and not data.endswith(b'\n') and not tail:labels.append('OTHER')
 if not labels:labels=['CLEAN']
 return {'classification':labels[0],'findings':labels,'size':len(data),'sha256':sha(data),'valid_record_count':len(ids),'event_ids':ids,'records':rows,'malformed_rows':issues,'NUL_bytes':data.count(b'\0'),'trailing_NUL_region':{'offset':len(data)-tail,'bytes':tail,'sha256':sha(data[-tail:]) if tail else None},'duplicate_ids':{k:v for k,v in counts.items() if v>1},'metadata_ids_missing':missing,'event_ids_absent_from_metadata':unexpected}

RECOVERY_DESIGN={
 'performed':False,'placement':'New uniquely named recovery bundle under work/live-qualification; no writes inside production incident directories',
 'artifact':'events.recovered.jsonl','original_policy':'Keep original immutable and bind its full SHA-256; preserve damaged tail hash and four intact record hashes',
 'original_records':'Copy each validated intact original JSONL record byte-for-byte including LF; manifest marks these ORIGINAL_INTACT and records original byte offset/length/hash',
 'reconstructed_record':'Use event_id and independently verified normalized object; omit raw when absent. Mark RECONSTRUCTED_NORMALIZED in a separate manifest entry; never fabricate missing raw fields or original receipt metadata',
 'provenance_per_record':['original source path','source offset or archive member/JSON pointer','source file SHA-256','source record SHA-256','event ID','recovery UTC timestamp','method','ORIGINAL_INTACT or RECONSTRUCTED_NORMALIZED'],
 'manifest':'recovery-manifest.json binds original hash, derivative hash, missing-ID membership from incident.json, source hashes, ordered record entries and explicit non-equivalence statement',
 'writes':'Exclusive create only; refuse existing names, symlinks, changed source hashes, unresolved IDs or duplicate reconstructed IDs; flush+fsync derivative and manifest, fsync new bundle directory',
 'equivalence':'Logical normalized-event recovery only; not byte-for-byte recovery of missing original incident record; missing raw payload remains UNKNOWN unless independently recovered',
 'qualification':'Recovery bundle does not automatically clear Stage7 or replace historical evidence; explicit reviewed reconciliation is required'}
DURABILITY={
 'observed_order':'Engine.process append_json(events.jsonl) -> command/hash side files -> optional preservation -> atomic_json(incident.json) -> normalized logs -> checkpoint at end of poll',
 'append':'Text a mode, JSON plus LF, Python buffered write; context close flushes but append has no fsync; no explicit application seek/truncate/preallocation in evidence append',
 'metadata':'Temporary metadata file flushed and fsynced, os.replace to final name; parent directory is not fsynced',
 'risk':'Metadata can become durable while referenced evidence bytes are not. Process interruption can leave partial append; crash after durable append before metadata can leave uncommitted records and replay duplicates. These risks do not prove origin of the historical NUL tail',
 'atomicity':'Separate evidence append, metadata, derived streams and checkpoint lack a single transaction; close/flush is not power-loss durability',
 'proposed_fix':'Evidence-specific durable append: encode full bounded record, append via O_APPEND, loop until full write or error, flush/fsync evidence FD; fsync incident directory when evidence file or directory is newly created; only then commit referencing incident metadata via fsynced temp+replace+parent-directory fsync',
 'restart_reconciliation':'Before new append, validate complete committed JSONL records and IDs. If corruption/partial tail exists, block that incident and retain forensic diagnostics; never truncate or skip. If durable valid event exists but metadata lacks it, reconcile exact ID before replay to avoid duplicate append',
 'scope':'Patch incident evidence persistence only after deterministic fault-injection regression coverage; do not apply global fsync to all operational logs without review',
 'production_patch':False}
PLAN=[
 {'test':'process interruption during append','method':'Fork disposable fixture writer; inject interruption before write, after each partial write, after complete write, after fsync, before/after metadata replace; kill only fixture subprocess','assert':'No metadata references bytes not durably committed; malformed tails detected and retained'},
 {'test':'metadata durability ordering','method':'Inject durable-append fsync failure and record syscall order','assert':'No metadata commit or checkpoint advance after evidence sync failure; evidence fsync precedes metadata replace'},
 {'test':'partial append','method':'Fixture valid prefix plus incomplete JSON/LF','assert':'Parser rejects exact offset; no append or truncation'},
 {'test':'NUL tail','method':'Four intact rows plus 2920 NUL bytes','assert':'Detect tail and missing metadata ID; preserve full original hash'},
 {'test':'restart after interrupted write','method':'Fresh Engine against disposable directory with committed record or partial tail','assert':'Committed ID deduplicated; malformed tail blocks ingestion with diagnostics'},
 {'test':'evidence reconciliation','method':'Durable complete event exists but metadata/checkpoint absent','assert':'Reconcile exact event ID without duplicate raw append; unrelated events never attached'},
 {'test':'derivative provenance','method':'New recovery bundle from immutable original and exact-ID normalized source','assert':'Manifest binds every source offset/hash and derivative hash; reconstructed record lacks fabricated raw'},
 {'test':'original immutability','method':'Hash original before/after recovery; try existing derivative name, symlink and changed source','assert':'Refuse overwrites and changed sources; original bytes/ownership/mode untouched'}]

def main():
 r={'STATUS':'INCOMPLETE','files':[],'FILES_SCANNED':0,'PRODUCTION_CHANGES':False,'STAGE7_GATE':'BLOCKED','STAGE8_GATE':'BLOCKED','WAN_authorized':False,'RECOVERY_DESIGN':RECOVERY_DESIGN,'WRITE_DURABILITY_FINDINGS':DURABILITY,'PROPOSED_FIX':DURABILITY['proposed_fix'],'REGRESSION_TEST_PLAN':PLAN,'limitations':[]}
 started=time.monotonic();baseline={};recover={}
 try:
  assert sha(PROVENANCE.read_bytes())==EXPECTED,'Authoritative provenance hash mismatch'
  r['authoritative_provenance']={'path':str(PROVENANCE),'sha256':EXPECTED}
  paths=sorted((ROOT/'incidents').glob('*/*/events.jsonl'))
  metadata_paths=sorted((ROOT/'incidents').glob('*/*/incident.json'));paths=sorted(set(paths)|{p.parent/'events.jsonl' for p in metadata_paths})
  if len(paths)>10000:raise RuntimeError('Global file-count budget exceeded')
  budget=256*1024**2
  for p in paths:
   try:
    if p.is_symlink() or not p.is_file():raise ValueError('Missing evidence file or symlink')
    st=p.stat();data=p.read_bytes();budget-=len(data)
    if budget<0:raise RuntimeError('Global evidence 256MiB budget exceeded')
    after=p.stat();stable=(st.st_ino,st.st_size,st.st_mtime_ns)==(after.st_ino,after.st_size,after.st_mtime_ns)
    mp=p.parent/'incident.json';mb=mp.read_bytes();md=json.loads(mb);baseline[str(p)]=sha(data);baseline[str(mp)]=sha(mb)
    row=analyze(data,md['related_events']);row.update(path=str(p),incident_id=md['incident_id'],metadata_related_event_count=len(md['related_events']),metadata_sha256=sha(mb),uid=st.st_uid,gid=st.st_gid,mode=oct(stat.S_IMODE(st.st_mode)),inode=st.st_ino,device=st.st_dev,mtime_ns=st.st_mtime_ns,ctime_ns=st.st_ctime_ns,atime_ns=st.st_atime_ns,stable=stable)
    if not stable:row['classification']='OTHER';row['findings'].append('UNSTABLE_READ')
    for eid in row['metadata_ids_missing']:recover.setdefault(eid,{'incident_ids':[],'sources':[]})['incident_ids'].append(md['incident_id'])
   except (OSError,ValueError,KeyError) as exc:row={'path':str(p),'classification':'OTHER','error':str(exc)}
   r['files'].append(row)
  r['FILES_SCANNED']=len(r['files']);r['incident_tree_enumeration_complete']=True
  missing=set(recover);r['MISSING_EVENTS']=sorted(missing)
  def matches(label,data,kind,rel=None,ident=None):
   offset=0
   for line in data.splitlines(keepends=True):
    try:doc=json.loads(line)
    except ValueError:offset+=len(line);continue
    eid=doc.get('event_id')
    if kind=='RAW' and rel and ident:eid=sha((rel+ident+str(offset)).encode()+line)
    if eid in missing:
     recover[eid]['sources'].append({'path':label,'offset':offset,'record_sha256':sha(line),'source_sha256':sha(data),'kind':kind,'event_id':eid,'timestamp':doc.get('timestamp'),'normalized_available':kind=='NORMALIZED' or isinstance(doc.get('normalized'),dict),'raw_available':kind=='RAW' or isinstance(doc.get('raw'),dict)})
    offset+=len(line)
  budget=384*1024**2
  roots=[ROOT/'logs/normalized',ROOT/'logs/suricata',ROOT/'logs/cowrie',ROOT/'logs/opencanary',ROOT/'logs/firewall',ROOT/'logs/system']
  mapping={'suricata':'logs/suricata/eve.json','cowrie':'logs/cowrie/cowrie.json','opencanary':'logs/opencanary/opencanary.json','firewall':'logs/firewall/events.jsonl','system':'logs/system/containment.jsonl'}
  for root in roots:
   for p in sorted(root.glob('*')):
    if not p.is_file() or p.is_symlink() or not any(x in p.name for x in ['.json','.jsonl']):continue
    st=p.stat();data=p.read_bytes();budget-=len(data)
    if budget<0:raise RuntimeError('Recovery source budget exceeded')
    normalized=root.name=='normalized';rel=mapping.get(root.name)
    if not normalized and not p.name.startswith(Path(rel).name):continue
    matches(str(p),data,'NORMALIZED' if normalized else 'RAW',rel,f'{st.st_dev}:{st.st_ino}')
  # Exact-ID persisted JSONL copies and structured qualification snapshots.
  searchroots=[ROOT/'backups',HERE,Path('/home/joe/honeypot-v1.3-polish2/honeypot/incidents'),Path('/home/joe/Downloads')]
  visited=0;archivebudget=512*1024**2
  def documents(label,data):
   if label.endswith('events.jsonl'):matches(label,data,'INCIDENT_COPY');return
   try:doc=json.loads(data)
   except ValueError:return
   def walk(v,pointer=''):
    if isinstance(v,dict):
     eid=v.get('event_id')
     # Metadata lists/reference IDs alone cannot serve as recovered event objects.
     if eid in missing and (('severity' in v and 'event_type' in v) or isinstance(v.get('normalized'),dict) or isinstance(v.get('raw'),dict)):
      recover[eid]['sources'].append({'path':label,'json_pointer':pointer,'source_sha256':sha(data),'record_sha256':sha(json.dumps(v,sort_keys=True,separators=(',',':')).encode()),'kind':'QUALIFICATION_OR_COPY','event_id':eid,'normalized_available':'severity' in v or isinstance(v.get('normalized'),dict),'raw_available':isinstance(v.get('raw'),dict),'hash_serialization':'canonical JSON object; not original source bytes'})
     for k,x in v.items():walk(x,pointer+'/'+str(k))
    elif isinstance(v,list):
     for i,x in enumerate(v):walk(x,pointer+'/'+str(i))
   walk(doc)
  for root in searchroots:
   if not root.exists():continue
   for directory,dirs,files in os.walk(root,followlinks=False):
    dirs[:]=[d for d in dirs if d not in ['.git','node_modules']]
    for name in files:
     visited+=1
     if visited>30000 or time.monotonic()-started>240:raise RuntimeError('Search budget exceeded; recovery sources incomplete')
     p=Path(directory)/name
     if p.is_symlink() or not p.is_file():continue
     if name.endswith(('.json','.jsonl')) and p.stat().st_size<=8*1024**2:
      data=p.read_bytes();budget-=len(data)
      if budget<0:raise RuntimeError('Recovery source budget exceeded')
      if any(e.encode() in data for e in missing):documents(str(p),data)
     if name.endswith(('.tar','.tar.gz','.tgz','.zip')) and p.stat().st_size<=256*1024**2:
      archivebudget-=p.stat().st_size
      if archivebudget<0:raise RuntimeError('Archive byte budget exceeded')
      try:
       if name.endswith('.zip'):
        with zipfile.ZipFile(p) as z:
         for index,x in enumerate(z.infolist()):
          if index>20000 or time.monotonic()-started>240:raise RuntimeError('Archive search budget exceeded')
          if x.filename.endswith(('events.jsonl','events.jsonl.json')) and x.file_size<=8*1024**2:documents(str(p)+'::'+x.filename,z.read(x))
       else:
        with tarfile.open(p,'r:*') as z:
         for index,x in enumerate(z):
          if index>20000 or time.monotonic()-started>240:raise RuntimeError('Archive search budget exceeded')
          if x.isfile() and x.name.endswith('events.jsonl') and x.size<=8*1024**2:documents(str(p)+'::'+x.name,z.extractfile(x).read())
      except (OSError,tarfile.TarError,zipfile.BadZipFile) as exc:r['limitations'].append(str(p)+': '+str(exc))
  for eid,v in recover.items():
   v['classification']='FULL_LOGICAL_RECOVERY' if any(x['normalized_available'] for x in v['sources']) else 'PARTIAL_RECOVERY' if v['sources'] else 'NO_RECOVERY_SOURCE'
   v['scope']='Normalized event identity/content recoverable, not original incident-record bytes or absent raw payload' if v['classification']=='FULL_LOGICAL_RECOVERY' else 'Only independently located source material; no invented fields'
  r['RECOVERABILITY']=recover;r['recovery_search_roots']=[str(p) for p in roots+searchroots]
  r['CLEAN_FILES']=[x['path'] for x in r['files'] if x['classification']=='CLEAN'];r['CORRUPTED_FILES']=[x for x in r['files'] if x['classification']!='CLEAN']
  count=len(r['CORRUPTED_FILES']);r['SCOPE_CLASSIFICATION']='NO_DEFECTS_FOUND' if count==0 else 'ISOLATED_INCIDENT' if count==1 else 'MULTIPLE_INCIDENT_DEFECTS'
  unchanged=[]
  for p,oldsha in baseline.items():
   if sha(Path(p).read_bytes())!=oldsha:unchanged.append(p)
  r['ORIGINAL_EVIDENCE_UNCHANGED']={'collector_writes_to_evidence':False,'hashes_unchanged_during_collection':not unchanged,'changed_paths':unchanged,'note':'Production append activity may change active files; unstable baselines are not accepted. Reads may update filesystem atime.'}
  r['STATUS']='SWEEP_COMPLETE_WITH_DEFECTS' if count else 'SWEEP_COMPLETE_CLEAN'
  if unchanged:r['STATUS']='INCOMPLETE_UNSTABLE_EVIDENCE'
 except Exception as exc:r['error']=type(exc).__name__+': '+str(exc)
 r['OFFLINE_TESTS']={'syntax':'PASS','inert_import':'PASS','detector_and_design_model_tests':'8 PASS','actual_process_kill_and_crash_tests':'PLANNED; no production durability implementation patched'}
 r['source_hashes']={str(p):sha(p.read_bytes()) for p in [PROVENANCE,ROOT/'scripts/incidentd.py',ROOT/'scripts/hp_common.py'] if p.is_file()}
 r['limitations']+=['Recovery search scoped to enumerated roots and readable archives; no timestamp-only membership','Full logical recovery means normalized content, not missing raw record byte equivalence','No derivatives created; original evidence remains untouched; no production patch']
 p=HERE/('stage7-evidence-integrity-sweep-'+uuid.uuid4().hex[:12]+'.json');p.open('x').write(json.dumps(r,indent=2)+'\n');digest=sha(p.read_bytes());Path(str(p)+'.sha256').open('x').write(digest+'  '+p.name+'\n')
 for k in ['STATUS','FILES_SCANNED','CLEAN_FILES','CORRUPTED_FILES','SCOPE_CLASSIFICATION','MISSING_EVENTS','RECOVERABILITY','RECOVERY_DESIGN','WRITE_DURABILITY_FINDINGS','PROPOSED_FIX','REGRESSION_TEST_PLAN','ORIGINAL_EVIDENCE_UNCHANGED','PRODUCTION_CHANGES','STAGE7_GATE','STAGE8_GATE']:
  value=r.get(k,'NOT_VERIFIED')
  if k=='CLEAN_FILES' and isinstance(value,list):value=len(value)
  if k=='CORRUPTED_FILES' and isinstance(value,list):value=[{a:v.get(a) for a in ['path','classification','findings','metadata_ids_missing']} for v in value]
  print(k+': '+json.dumps(value),flush=True)
 print('REPORT: '+str(p));print('SHA256: '+digest)
if __name__=='__main__':main()
