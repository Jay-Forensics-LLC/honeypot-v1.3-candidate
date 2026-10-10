import copy,importlib.util,json,unittest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from synthetic_stage7 import snapshot
HERE=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('diagnosis',HERE/'stage7-runtime-drift-diagnosis.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class SemanticRegression(unittest.TestCase):
 def setUp(self):
  self.old=snapshot();self.now=copy.deepcopy(self.old)
  self.hashes={'incidentd.py':'unit-source','evidence_store.py':'unit-evidence-store'};self.expected=copy.deepcopy(self.hashes)
  self.recovery={'original_sha256':'unit-original','bundle_hashes':{'README.txt':'unit-provenance'}};self.expected_recovery=copy.deepcopy(self.recovery)
 def checks(self):return m.semantic_checks(self.old,self.now,self.hashes,self.expected,self.recovery,self.expected_recovery)
 def test_qualified_state(self):self.assertTrue(all(self.checks().values()))
 def test_expected_recreation_same_semantics(self):
  c=self.now['containers']['incidentd'];c['Id']='expected-new-id';c['Created']='new';c['State']['StartedAt']='new';self.assertTrue(all(self.checks().values()))
 def test_mount_list_permutation(self):
  self.now['containers']['incidentd']['Mounts'].reverse();self.assertTrue(all(self.checks().values()))
 def test_changed_image_rejected(self):
  self.now['containers']['incidentd']['Image']='different-content';self.assertFalse(self.checks()['container.incidentd'])
 def test_changed_source_rejected(self):
  self.hashes['incidentd.py']='different';self.assertFalse(self.checks()['deployed_sources'])
 def test_network_object_ids_only(self):
  for net in self.now['networks']:net['Id']='new-'+net['Id']
  for c in self.now['containers'].values():
   for v in c['NetworkSettings']['Networks'].values():v['NetworkID']='new-'+v['NetworkID']
  self.assertTrue(all(self.checks().values()))
 def test_network_membership_rejected(self):
  self.now['containers']['incidentd']['NetworkSettings']['Networks']['unexpected']={};self.assertFalse(self.checks()['container.incidentd'])
 def test_network_cidr_rejected(self):
  next(n for n in self.now['networks'] if n['Name']=='honeypot-cowrie-net')['IPAM']['Config'][0]['Subnet']='10.0.0.0/24';self.assertFalse(self.checks()['networks'])
 def test_unknown_network_member_rejected(self):
  next(n for n in self.now['networks'] if n['Name']=='honeypot-cowrie-net')['Containers']['new']={'Name':'intruder'};self.assertFalse(self.checks()['networks'])
 def test_guard_fingerprint_rejected(self):
  self.now['guard']['fingerprint']='new';self.assertFalse(self.checks()['hp_guard'])
 def test_guard_counter_growth_accepted(self):
  self.now['guard']['rules'][0]['packets']+=1;self.assertTrue(all(self.checks().values()))
 def test_pcap_loss_rejected(self):
  self.now['pcap_service_active']=False;self.assertFalse(self.checks()['pcap'])
 def test_pcap_identity_change_rejected(self):
  self.now['pcap']['pid']+=1;self.assertFalse(self.checks()['pcap'])
 def test_wan_enablement_rejected(self):
  self.now['wan_loopback_safe']=False;self.assertFalse(self.checks()['WAN_disabled'])
 def test_historical_evidence_rejected(self):
  self.recovery['original_sha256']='different';self.assertFalse(self.checks()['historical_evidence'])
 def test_recovery_bundle_rejected(self):
  self.recovery['bundle_hashes']['README.txt']='different';self.assertFalse(self.checks()['recovery_bundle'])
 def test_binding_change_rejected(self):
  self.now['containers']['grafana']['HostConfig']['PortBindings']['3000/tcp'][0]['HostIp']='0.0.0.0';self.assertFalse(self.checks()['container.grafana'])
 def test_mount_definition_change_rejected(self):
  self.now['containers']['incidentd']['Mounts'][0]['RW']=False;self.assertFalse(self.checks()['container.incidentd'])
 def test_environment_change_rejected(self):
  self.now['containers']['incidentd']['Config']['Env'].append('NEW=1');self.assertFalse(self.checks()['container.incidentd'])
if __name__=='__main__':unittest.main()
