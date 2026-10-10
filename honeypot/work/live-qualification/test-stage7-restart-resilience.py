import ast,copy,importlib.util,subprocess,unittest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from synthetic_stage7 import loki_report, mount_order_pair
from unittest.mock import patch
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('stage7',HERE/'stage7-restart-resilience.py');m=importlib.util.module_from_spec(spec)
with patch('subprocess.run',side_effect=AssertionError('Inert import')),patch('socket.socket',side_effect=AssertionError('Inert import')):spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def base(self):
  c={'Id':'id','Image':'img','RestartCount':0,'State':{'StartedAt':'before','Running':True,'Health':{'Status':'healthy'}},'HostConfig':{'PortBindings':{'x':[{'HostIp':'127.0.0.1','HostPort':'2222'}]}},'Mounts':[{'Source':'state','Destination':'/state'}],'NetworkSettings':{'Networks':{'hp':{'NetworkID':'net','IPAddress':'172.29.40.2'}}}}
  return {'containers':{'cowrie':copy.deepcopy(c),'alloy':copy.deepcopy(c)},'guard':{'fingerprint':'guard'},'pcap':{'pid':5,'start_ticks':6},'wan_loopback_safe':True}
 def test_syntax(self):ast.parse((HERE/'stage7-restart-resilience.py').read_text())
 def test_target_only_restart(self):
  a=self.base();b=copy.deepcopy(a);b['containers']['cowrie']['State']['StartedAt']='after';self.assertTrue(all(m.invariant_checks(a,b,'cowrie').values()))
 def test_unrelated_restart_stops(self):
  a=self.base();b=copy.deepcopy(a);b['containers']['alloy']['State']['StartedAt']='after';self.assertFalse(m.invariant_checks(a,b,'cowrie')['unrelated_identity'])
 def test_unrelated_unhealthy_stops(self):
  a=self.base();b=copy.deepcopy(a);b['containers']['alloy']['State']['Health']['Status']='unhealthy';self.assertFalse(m.invariant_checks(a,b,'cowrie')['unrelated_health'])
 def test_network_drift_stops(self):
  a=self.base();b=copy.deepcopy(a);b['containers']['cowrie']['NetworkSettings']['Networks']['external']={};self.assertFalse(m.invariant_checks(a,b,'cowrie')['networks'])
 def test_external_bind_stops(self):
  a=self.base();b=copy.deepcopy(a);b['containers']['cowrie']['HostConfig']['PortBindings']['x'][0]['HostIp']='0.0.0.0';self.assertFalse(m.invariant_checks(a,b,'cowrie')['bindings'])
 def test_mount_drift_stops(self):
  a=self.base();b=copy.deepcopy(a);b['containers']['cowrie']['Mounts']=[];self.assertFalse(m.invariant_checks(a,b,'cowrie')['mounts'])
 def test_guard_pcap_wan_stops(self):
  a=self.base();b=copy.deepcopy(a);b['guard']['fingerprint']='new';b['pcap']['pid']=9;b['wan_loopback_safe']=False
  checks=m.invariant_checks(a,b,'cowrie');self.assertFalse(checks['hp_guard']);self.assertFalse(checks['PCAP']);self.assertFalse(checks['WAN'])
 def test_command_timeout(self):
  with patch('subprocess.run',side_effect=subprocess.TimeoutExpired('docker',35)) as call:
   with self.assertRaises(subprocess.TimeoutExpired):m.command(['docker','restart','--time','15','honeypot-cowrie'])
   self.assertEqual(call.call_args.kwargs['timeout'],35)
 def test_command_error(self):
  with patch('subprocess.run',return_value=subprocess.CompletedProcess('docker',1,'','failed')):
   with self.assertRaises(RuntimeError):m.command(['docker','restart','--time','15','honeypot-cowrie'])
 def test_narrow_order(self):self.assertEqual(m.ORDER,['opencanary','cowrie','suricata','alloy','loki','grafana','incidentd'])
 def test_partial_empty_duplicate_and_failed_matrices_cannot_qualify(self):
  complete=[{'service':n,'status':'PASS'} for n in m.ORDER]
  for rows in [[],complete[:1],complete[:-1],complete+[complete[0]],
               [{**r,'status':'FAILED' if i==0 else 'PASS'} for i,r in enumerate(complete)]]:
   self.assertEqual(m.matrix_disposition(rows),('PARTIAL_PASS','BLOCKED'))
  self.assertEqual(m.matrix_disposition(complete),('MATRIX_ROWS_PASS','BLOCKED'))
class LokiRegression(unittest.TestCase):
 def source(self):
  return loki_report()
 def test_authoritative_sources_and_ids(self):
  r=self.source();seen=[];saved=[]
  def query(t,ids):
   seen.append(t['source']);eid=next(iter(ids))
   expected=next(p for p in r['tests'] if p['id']==t['id'])
   self.assertEqual(t['source'],expected['normalized'][0]['source']);self.assertEqual(ids,{expected['normalized'][0]['event_id']})
   t['loki_event_checks']={eid:{'status':'PASS'}}
  rows=m.existing_loki_checks(r,query,saved)
  self.assertEqual(seen,['opencanary','cowrie','opencanary','cowrie']);self.assertEqual(len(rows),4)
 def test_failed_query_diagnostics_preserved(self):
  saved=[]
  def query(t,ids):t['loki_event_checks']={next(iter(ids)):{'status':'NOT TESTED','error':'connection refused'}}
  with self.assertRaises(RuntimeError):m.existing_loki_checks(self.source(),query,saved)
  self.assertEqual(len(saved[0]),4);self.assertIn('error',next(iter(saved[0][0]['loki_event_checks'].values())))
 def test_wrong_id_not_accepted(self):
  def query(t,ids):t['loki_event_checks']={'wrong':{'status':'PASS'}}
  with self.assertRaises(RuntimeError):m.existing_loki_checks(self.source(),query,[])
class EvidenceReaders(unittest.TestCase):
 def test_valid_records(self):
  import tempfile
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/'events.jsonl';p.write_text('{"event_id":"one"}\n');data,rows=m.read_evidence_json(p,True);self.assertEqual(rows,[{'event_id':'one'}])
 def test_persistent_invalid_fails_with_path_line(self):
  import tempfile
  with tempfile.TemporaryDirectory() as t,patch.object(m.time,'sleep'):
   p=Path(t)/'events.jsonl';p.write_text('{"event_id":"one"}\ninvalid\n');diagnostics=[]
   with self.assertRaisesRegex(RuntimeError,'events.jsonl'):m.read_evidence_json(p,True,diagnostics)
   self.assertEqual(len(diagnostics),3);self.assertEqual(diagnostics[-1]['line'],2)
 def test_in_progress_write_bounded_retry(self):
  import tempfile
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/'state.json';p.write_text('');diagnostics=[]
   with patch.object(m.time,'sleep',side_effect=lambda _:p.write_text('{"offsets":{}}')):
    _,row=m.read_evidence_json(p,diagnostics=diagnostics)
   self.assertEqual(row,{'offsets':{}});self.assertEqual(len(diagnostics),1)
class MountOrderRegression(unittest.TestCase):
 def fixture(self):
  return mount_order_pair()
 def test_synthetic_mount_permutation_passes(self):
  old,current=self.fixture();self.assertTrue(all(m.invariant_checks(old,current).values()))
 def test_mount_mutations_still_rejected(self):
  for key,value in [('Source','/unexpected'),('Destination','/unexpected'),('RW',False),('Type','volume'),('Propagation','shared')]:
   with self.subTest(key=key):
    old,current=self.fixture();current['containers']['incidentd']['Mounts'][0][key]=value
    self.assertFalse(m.invariant_checks(old,current)['mounts'])
 def test_missing_duplicate_or_extra_mount_rejected(self):
  for mode in ['missing','duplicate','extra_field']:
   with self.subTest(mode=mode):
    old,current=self.fixture();mounts=current['containers']['incidentd']['Mounts']
    if mode=='missing':mounts.pop()
    elif mode=='duplicate':mounts.append(copy.deepcopy(mounts[0]))
    else:mounts[0]['UnexpectedOption']=True
    self.assertFalse(m.invariant_checks(old,current)['mounts'])
 def test_unexpected_container_identity_still_rejected(self):
  old,current=self.fixture();current['containers']['incidentd']['Id']='unqualified'
  self.assertFalse(m.invariant_checks(old,current)['unrelated_identity'])

if __name__=='__main__':unittest.main()
