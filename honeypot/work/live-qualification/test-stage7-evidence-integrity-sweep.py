"""Detector regressions and deterministic durability design model (not production implementation)."""
import ast,copy,importlib.util,json,unittest
from pathlib import Path
from unittest.mock import patch
HERE=Path(__file__).resolve().parent
p=HERE/'stage7-evidence-integrity-sweep.py';ast.parse(p.read_text());s=importlib.util.spec_from_file_location('sweep_tests',p);m=importlib.util.module_from_spec(s)
with patch('subprocess.run',side_effect=AssertionError('Inert import')),patch('socket.socket',side_effect=AssertionError('Inert import')):s.loader.exec_module(m)
class DurabilityModel:
 def __init__(self):self.durable=b'';self.buffer=b'';self.metadata=[]
 def append(self,eid,stop):
  data=(json.dumps({'event_id':eid})+'\n').encode();self.buffer=data
  if stop=='during_append':self.buffer=data[:5];return
  if stop=='before_fsync':return
  self.durable+=data;self.buffer=b''
  if stop=='after_fsync':return
  self.metadata.append(eid)
 def crash(self):self.buffer=b''
class Tests(unittest.TestCase):
 def test_interruption_during_append(self):
  x=DurabilityModel();x.append('one','during_append');x.crash();self.assertEqual(x.metadata,[]);self.assertEqual(x.durable,b'')
 def test_metadata_never_precedes_durable_record(self):
  for stop in ['during_append','before_fsync','after_fsync','committed']:
   x=DurabilityModel();x.append('one',stop);x.crash();rows=m.analyze(x.durable,x.metadata);self.assertEqual(rows['metadata_ids_missing'],[])
 def test_partial_append_detection(self):
  r=m.analyze(b'{"event_id":',[ 'one']);self.assertEqual(r['classification'],'MALFORMED_JSON');self.assertEqual(r['metadata_ids_missing'],['one'])
 def test_nul_tail(self):
  data=b''.join((json.dumps({'event_id':str(i)})+'\n').encode() for i in range(4))+b'\0'*2920
  r=m.analyze(data,[str(i) for i in range(5)]);self.assertEqual(r['valid_record_count'],4);self.assertEqual(r['NUL_bytes'],2920);self.assertEqual(r['classification'],'NUL_CORRUPTION')
 def test_restart_retains_durable_uncommitted_event(self):
  x=DurabilityModel();x.append('one','after_fsync');x.crash();r=m.analyze(x.durable,x.metadata);self.assertEqual(r['event_ids_absent_from_metadata'],['one']);self.assertNotEqual(r['classification'],'CLEAN')
 def test_exact_id_reconciliation(self):
  r=m.analyze(b'{"event_id":"one"}\n',['one','two']);self.assertEqual(r['metadata_ids_missing'],['two']);self.assertNotIn('nearby',r['event_ids'])
 def test_derivative_provenance_requirements(self):
  design=m.RECOVERY_DESIGN;self.assertFalse(design['performed']);self.assertIn('source record SHA-256',design['provenance_per_record']);self.assertIn('not byte-for-byte',design['equivalence'])
 def test_original_immutability_and_duplicates(self):
  data=b'{"event_id":"one"}\n'*2;old=m.sha(data);r=m.analyze(data,['one']);self.assertEqual(m.sha(data),old);self.assertEqual(r['duplicate_ids'],{'one':2});self.assertIn('COUNT_MISMATCH',r['findings'])
if __name__=='__main__':unittest.main()
