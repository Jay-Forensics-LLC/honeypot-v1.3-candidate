import importlib.util,json,os,shutil,sys,tempfile,unittest,contextlib,io
from pathlib import Path
from unittest.mock import patch
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from incidentd import Engine
from evidence_store import EvidenceIntegrityError

def load(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
class LivePreparation(unittest.TestCase):
 def test_startup_blocks_corruption_preserves_healthy_processing(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);shutil.copytree(ROOT/'detections',root/'detections')
   bad=root/'incidents/2026-10-05/historical';bad.mkdir(parents=True);data=b'{"event_id":"old","normalized":{"event_id":"old"}}\n'+b'\0'*2920
   (bad/'events.jsonl').write_bytes(data);(bad/'incident.json').write_text(json.dumps({'related_events':['old','missing']}))
   engine=Engine(root)
   self.assertIn(str(bad),engine.blocked_incidents)
   diagnostic=json.loads((root/'logs/system/evidence-integrity.jsonl').read_text())
   self.assertEqual(diagnostic['action'],'BLOCK_INCIDENT_WRITES')
   engine.process('suricata',{'event_type':'stats','timestamp':'2026-10-06T00:00:00Z'},'new')
   healthy=[p for p in (root/'incidents').rglob('incident.json') if p.parent!=bad]
   self.assertEqual(len(healthy),1);self.assertEqual(json.loads(healthy[0].read_text())['related_events'],['new'])
   self.assertEqual(data,(bad/'events.jsonl').read_bytes())
 def test_unreviewed_corruption_still_fails_harness(self):
  m=load('restart_fixture',HERE/'stage7-restart-resilience.py')
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'events.jsonl';p.write_bytes(b'\0'*2920)
   with patch.object(m.time,'sleep'):
    with self.assertRaises(RuntimeError):m.read_evidence_json(p,True,[])
 def test_operator_root_required_before_any_mutation(self):
  m=load('deployment_fixture',HERE/'stage7-live-remediation-and-restart.py')
  with tempfile.TemporaryDirectory() as d,patch.object(m,'HERE',Path(d)),patch.object(m.os,'geteuid',return_value=1000),patch.object(m.subprocess,'run') as run,contextlib.redirect_stdout(io.StringIO()):
   self.assertEqual(m.main(),2);run.assert_not_called()
   report=json.loads(next(Path(d).glob('stage7-live-remediation-and-restart-*.json')).read_text())
   self.assertEqual(report['PRODUCTION_CHANGES'],[]);self.assertEqual(report['STAGE7_GATE'],'BLOCKED')
 def test_reviewed_reconciliation_inert_import(self):
  m=load('reconciliation_fixture',HERE/'stage7-reconciled-evidence.py');self.assertTrue(callable(m.verify))
 def test_docker_plan_only_incidentd_recreation(self):
  text=(HERE/'stage7-live-remediation-and-restart.py').read_text()
  self.assertIn("['build','--pull=false','incidentd']",text)
  self.assertIn("['up','-d','--no-deps','--no-build','--pull','never','--force-recreate','incidentd']",text)
  self.assertNotIn("['down'",text);self.assertNotIn('reboot',text)
if __name__=='__main__':unittest.main()
