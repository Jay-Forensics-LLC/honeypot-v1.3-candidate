import importlib.util,json,os,subprocess,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts'))
import evidence_store as e
ROW={'event_id':'fixture','normalized':{'event_id':'fixture'},'raw':{'event_type':'stats'}}
class Durability(unittest.TestCase):
 def test_corrupt_tails_preserved(self):
  for tail in [b'{',b'\0'*2920,b'{}']:
   with tempfile.TemporaryDirectory() as d:
    p=Path(d)/'events.jsonl';data=(json.dumps(ROW)+'\n').encode()+tail;p.write_bytes(data)
    with self.assertRaises(e.EvidenceIntegrityError):e.append(p,ROW)
    self.assertEqual(p.read_bytes(),data)
 def test_sync_failure_no_metadata(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'events.jsonl'
   with patch.object(e.os,'fsync',side_effect=OSError('injected')):
    with self.assertRaises(OSError):e.append(p,ROW);e.commit(Path(d)/'incident.json',{'related_events':['fixture']})
   self.assertFalse((Path(d)/'incident.json').exists())
   self.assertFalse(e.append(p,ROW));self.assertEqual(len(e.records(p)),1)
 def test_partial_write_loop(self):
  with tempfile.TemporaryDirectory() as d:
   real=os.write
   with patch.object(e.os,'write',side_effect=lambda fd,b:real(fd,b[:7])):e.append(Path(d)/'events.jsonl',ROW)
   self.assertEqual(len(e.records(Path(d)/'events.jsonl')),1)
 def test_symlink(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'events';target=Path(d)/'target';target.write_bytes(b'');p.symlink_to(target)
   with self.assertRaises(e.EvidenceIntegrityError):e.append(p,ROW)
 def test_real_process_interruptions(self):
  worker='''import os,sys,json
from pathlib import Path
import evidence_store as e
p=Path(sys.argv[1]);phase=sys.argv[2];row=json.loads(sys.argv[3]);realwrite=os.write;realsync=os.fsync;realreplace=os.replace;realdump=json.dump
calls=0
if phase=='before_append':os._exit(91)
def write(fd,data):
 if phase=='partial_append':realwrite(fd,data[:7]);os._exit(91)
 return realwrite(fd,data)
def sync(fd):
 global calls
 calls+=1
 if calls==4 and phase=='after_metadata_replace':os._exit(91)
 if calls==1 and phase=='before_evidence_fsync':os._exit(91)
 if calls==1 and phase=='evidence_fsync_failure':raise OSError('injected')
 realsync(fd)
 if calls==1 and phase=='after_evidence_fsync':os._exit(91)

def replace(a,b):
 if phase=='before_metadata_replace':os._exit(91)
 realreplace(a,b)
def dump(data,f,**kw):
 if phase=='metadata_temp':f.write('{');f.flush();os._exit(91)
 return realdump(data,f,**kw)
json.dump=dump
os.write=write;os.fsync=sync;os.replace=replace
e.append(p/'events.jsonl',row);e.commit(p/'incident.json',{'related_events':[row['event_id']]})
if phase=='before_checkpoint':os._exit(91)
e.commit(p/'checkpoint.json',{'offset':1})
if phase=='after_checkpoint':os._exit(91)
'''
  for phase in ['before_append','partial_append','before_evidence_fsync','evidence_fsync_failure','after_evidence_fsync','metadata_temp','before_metadata_replace','after_metadata_replace','before_checkpoint','after_checkpoint']:
   with self.subTest(phase=phase),tempfile.TemporaryDirectory() as d:
    result=subprocess.run([sys.executable,'-B','-c',worker,d,phase,json.dumps(ROW)],env={**os.environ,'PYTHONPATH':str(ROOT/'scripts')},capture_output=True,timeout=10)
    self.assertNotEqual(result.returncode,0)
    p=Path(d)
    if (p/'incident.json').exists():self.assertIn('fixture',e.records(p/'events.jsonl'))
    if phase in ['before_append','partial_append','before_evidence_fsync','evidence_fsync_failure','after_evidence_fsync','metadata_temp','before_metadata_replace','after_metadata_replace','before_checkpoint']:self.assertFalse((p/'checkpoint.json').exists())
    if phase=='partial_append':
     old=(p/'events.jsonl').read_bytes()
     with self.assertRaises(e.EvidenceIntegrityError):e.append(p/'events.jsonl',ROW)
     self.assertEqual(old,(p/'events.jsonl').read_bytes())
    elif (p/'events.jsonl').exists():self.assertFalse(e.append(p/'events.jsonl',ROW))
class EngineReconciliation(unittest.TestCase):
 def test_durable_orphan_and_replay(self):
  import shutil
  from incidentd import Engine
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);shutil.copytree(ROOT/'detections',root/'detections')
   engine=Engine(root);raw={'event_type':'stats','timestamp':'2026-10-05T11:02:11Z'}
   engine.process('suricata',raw,'fixture')
   ip=next((root/'incidents').rglob('incident.json'));ep=ip.parent/'events.jsonl';before=ep.read_bytes()
   meta=json.loads(ip.read_text());meta['related_events']=[];ip.write_text(json.dumps(meta))
   Engine(root).process('suricata',raw,'fixture')
   self.assertEqual(json.loads(ip.read_text())['related_events'],['fixture']);self.assertEqual(before,ep.read_bytes())
   Engine(root).process('suricata',raw,'fixture');self.assertEqual(before,ep.read_bytes())
 def test_checkpoint_state_rollback(self):
  from incidentd import Engine
  import shutil
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);shutil.copytree(ROOT/'detections',root/'detections');engine=Engine(root)
   before=json.loads(json.dumps(engine.state))
   def fail():engine.state['offsets']['fixture']=99;raise OSError('injected')
   engine._poll=fail
   with self.assertRaises(OSError):engine.poll()
   self.assertEqual(engine.state,before)
class RecoverySafety(unittest.TestCase):
 def load(self):
  spec=importlib.util.spec_from_file_location('recovery',Path(__file__).with_name('stage7-evidence-recovery-remediation.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
 def test_source_hash_and_identity(self):
  m=self.load()
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);p=root/'logs/normalized/events.jsonl';p.parent.mkdir(parents=True);line=(json.dumps({'event_id':m.EID,'timestamp':'fixture','event_type':'stats','source':'suricata'})+'\n').encode();p.write_bytes(line)
   with patch.object(m,'ROOT',root),patch.object(m,'QUALIFIED',{'logs/normalized/events.jsonl':{'length':len(line),'timestamp':'fixture','event_type':'stats','source':'suricata'}}):
    obj,provenance=m.source('logs/normalized/events.jsonl',0,m.sha(line),m.sha(line));self.assertEqual(provenance['event_id'],m.EID)
    with self.assertRaises(RuntimeError):m.source('logs/normalized/events.jsonl',0,'wrong',m.sha(line))
    p.write_bytes(line.replace(m.EID.encode(),b'wrong'))
    with self.assertRaises(RuntimeError):m.source('logs/normalized/events.jsonl',0,m.sha(p.read_bytes()),m.sha(p.read_bytes()))
 def test_bundle_provenance(self):
  m=self.load()
  import contextlib,io
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);p=root/'original';ids=['a','b','c','d'];rows=[]
   for eid in ids:
    base=json.dumps({'event_id':eid,'normalized':{'event_id':eid},'padding':''},separators=(',',':'))
    rows.append((base[:-2]+'x'*(8485-len(base))+base[-2:]+'\n').encode())
   original=b''.join(rows)+b'\0'*2920;p.write_bytes(original);(root/'incident.json').write_text(json.dumps({'related_events':ids+[m.EID]}))
   norm={'event_id':m.EID,'timestamp':'fixture','event_type':'stats','source':'suricata'};prov={'event_id':m.EID,'source_file_sha256':m.sha(original),'record_sha256':'fixture','offset':1,'path':str(p),'timestamp':'fixture','qualified_snapshot_size':len(original),'previously_qualified_source_file_sha256':m.sha(original)}
   sweep=type('Result',(),{'returncode':0,'stdout':'fixture','stderr':''})()
   with patch.object(m,'ORIGINAL',p),patch.object(m,'HASH',m.sha(original)),patch.object(m,'HERE',root),patch.object(m,'source',side_effect=[(norm,prov),({'timestamp':'fixture'},prov)]),patch.object(m.subprocess,'run',return_value=sweep),contextlib.redirect_stdout(io.StringIO()):m.main()
   bundle=next(root.glob('stage7-recovery-*'));manifest=json.loads((bundle/'recovery-manifest.json').read_text())
   derivative=(bundle/'events.recovered.jsonl').read_bytes()
   self.assertEqual(derivative[:33944],original[:33944]);self.assertEqual(manifest['derivative_sha256'],m.sha(derivative));self.assertEqual(manifest['ordered_records'][-1]['method'],'RECONSTRUCTED_FROM_RAW_AND_NORMALIZED');self.assertEqual(original,p.read_bytes())
 def test_exclusive_and_immutable(self):
  m=self.load()
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'original';p.write_bytes(b'original');before=p.read_bytes()
   with self.assertRaises(FileExistsError):m.write(p,b'replacement')
   link=Path(d)/'link';link.symlink_to(p)
   with self.assertRaises(FileExistsError):m.write(link,b'replacement')
   self.assertEqual(p.read_bytes(),before)

if __name__=='__main__':unittest.main()
