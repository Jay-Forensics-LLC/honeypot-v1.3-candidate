import importlib.util,json,tempfile,unittest,hashlib,os,contextlib,io
from pathlib import Path
from unittest.mock import patch
P=Path(__file__).with_name('stage7-evidence-recovery-remediation.py')
spec=importlib.util.spec_from_file_location('recovery',P);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Verifier(unittest.TestCase):
 def setup_source(self,root,raw=False):
  name='logs/suricata/eve.json' if raw else 'logs/normalized/events.jsonl';p=root/name;p.parent.mkdir(parents=True,exist_ok=True)
  prefix=b'{"earlier":1}\n';obj={'timestamp':'fixture','event_type':'stats','source':'suricata','event_id':m.EID}
  line=(json.dumps(obj)+'\n').encode();original=prefix+line;p.write_bytes(original)
  eid=m.sha((name+f'{p.stat().st_dev}:{p.stat().st_ino}'+str(len(prefix))).encode()+line) if raw else m.EID
  qualified={name:{'length':len(line),'timestamp':'fixture','event_type':'stats'}}
  return name,p,prefix,line,original,eid,qualified
 def test_mutations(self):
  for raw in (False,True):
   for change in ['append','prefix','record','truncate','different_event','boundary']:
    with self.subTest(raw=raw,change=change),tempfile.TemporaryDirectory() as d:
     root=Path(d);name,p,prefix,line,original,eid,q=self.setup_source(root,raw)
     modified={'append':original+b'{"later":1}\n','prefix':original.replace(b'earlier',b'EARLIER'),'record':original.replace(b'stats',b'STATS'),'truncate':original[:-2],'different_event':original.replace(m.EID.encode(),b'f'*64),'boundary':original[:len(prefix)-1]+b' '+original[len(prefix):]}[change];p.write_bytes(modified)
     with patch.object(m,'ROOT',root),patch.object(m,'QUALIFIED',q),patch.object(m,'EID',eid):
      if change=='append':
       obj,prov=m.source(name,len(prefix),m.sha(original),m.sha(line));self.assertEqual(prov['source_file_state'],'APPEND_ONLY_GROWTH_WITH_QUALIFIED_RECORD_INTACT');self.assertTrue(prov['qualified_prefix_verified'])
      else:
       with self.assertRaises(RuntimeError):m.source(name,len(prefix),m.sha(original),m.sha(line))
 def test_either_source_failure_stops_bundle(self):
  for failure in (0,1):
   with tempfile.TemporaryDirectory() as d:
    root=Path(d);original=root/'original';original.write_bytes(b'fixture')
    side=[RuntimeError('normalized failed')] if failure==0 else [({},{}),RuntimeError('raw failed')]
    with patch.object(m,'HERE',root),patch.object(m,'ORIGINAL',original),patch.object(m,'HASH',m.sha(b'fixture')),patch.object(m,'source',side_effect=side),contextlib.redirect_stdout(io.StringIO()):m.main()
    self.assertFalse(list(root.glob('stage7-recovery-*')));self.assertEqual(original.read_bytes(),b'fixture')
 def test_inert_import(self):self.assertTrue(callable(m.main))
if __name__=='__main__':unittest.main()
