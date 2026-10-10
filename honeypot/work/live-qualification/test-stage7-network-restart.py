import copy,hashlib,importlib.util,json,unittest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from synthetic_stage7 import snapshot
HERE=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('restart_network_test',HERE/'stage7-restart-resilience.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class NetworkRestart(unittest.TestCase):
 def setUp(self):
  self.old=snapshot();self.now=copy.deepcopy(self.old)
  self.policy=m.configured_mac_policy(HERE.parents[1]/'docker-compose.yml')
  self.endpoint=self.now['containers']['incidentd']['NetworkSettings']['Networks']['honeypot-observability']
  self.member=next(n for n in self.now['networks'] if n['Name']=='honeypot-observability')['Containers'][self.now['containers']['incidentd']['Id']]
 def checks(self):return m.invariant_checks(self.old,self.now,'incidentd',self.policy)
 def test_endpoint_only(self):
  self.endpoint['EndpointID']='regenerated';self.member['EndpointID']='regenerated';self.assertTrue(all(self.checks().values()))
 def test_dynamic_mac_only(self):
  self.endpoint['MacAddress']='02:00:00:00:00:01';self.member['MacAddress']='02:00:00:00:00:01';self.assertTrue(all(self.checks().values()))
 def test_synthetic_endpoint_lifecycle(self):
  self.endpoint.update(EndpointID='regenerated',MacAddress='02:00:00:00:00:01');self.member.update(EndpointID='regenerated',MacAddress='02:00:00:00:00:01')
  self.now['containers']['incidentd']['State']['StartedAt']='after'
  self.assertTrue(all(self.checks().values()))
 def test_network_id(self):
  self.endpoint['NetworkID']='changed';self.assertFalse(self.checks()['networks'])
 def test_membership(self):
  self.now['containers']['incidentd']['NetworkSettings']['Networks']['unexpected']={};self.assertFalse(self.checks()['networks'])
 def test_ip(self):
  self.endpoint['IPAddress']='172.29.42.9';self.assertFalse(self.checks()['networks'])
 def test_prefix(self):
  self.endpoint['IPPrefixLen']=16;self.assertFalse(self.checks()['networks'])
 def test_alias_loss(self):
  self.endpoint['Aliases'].pop();self.assertFalse(self.checks()['networks'])
 def test_alias_addition(self):
  self.endpoint['Aliases'].append('unexpected');self.assertFalse(self.checks()['networks'])
 def test_gateway(self):
  self.endpoint['Gateway']='172.29.42.99';self.assertFalse(self.checks()['networks'])
 def test_network_config(self):
  for key,value in [('Internal',False),('Driver','changed')]:
   with self.subTest(key=key):
    net=next(n for n in self.now['networks'] if n['Name']=='honeypot-observability');original=net[key];net[key]=value;self.assertFalse(self.checks()['networks']);net[key]=original
 def test_cidr(self):
  next(n for n in self.now['networks'] if n['Name']=='honeypot-observability')['IPAM']['Config'][0]['Subnet']='10.0.0.0/8';self.assertFalse(self.checks()['networks'])
 def test_network_inspect_membership(self):
  next(n for n in self.now['networks'] if n['Name']=='honeypot-observability')['Containers']['unknown']={'Name':'intruder'};self.assertFalse(self.checks()['networks'])
 def test_network_inspect_ip(self):
  self.member['IPv4Address']='172.29.42.99/24';self.assertFalse(self.checks()['networks'])
 def test_explicit_compose_mac(self):
  self.policy['incidentd']=True;self.endpoint['MacAddress']='changed';self.assertFalse(self.checks()['networks'])
 def test_explicit_runtime_mac(self):
  self.old['containers']['incidentd']['Config']['MacAddress']='explicit';self.now['containers']['incidentd']['Config']['MacAddress']='explicit';self.endpoint['MacAddress']='changed';self.assertFalse(self.checks()['networks'])
 def test_explicit_endpoint_option(self):
  for snapshot in [self.old,self.now]:snapshot['containers']['incidentd']['NetworkSettings']['Networks']['honeypot-observability']['DriverOpts']={'com.docker.network.endpoint.macaddress':'explicit'}
  self.endpoint['MacAddress']='changed';self.assertFalse(self.checks()['networks'])
 def test_unknown_mac_policy_strict(self):
  self.endpoint['MacAddress']='changed';self.assertFalse(m.invariant_checks(self.old,self.now,'incidentd')['networks'])
 def test_bindings(self):
  self.now['containers']['grafana']['HostConfig']['PortBindings']['3000/tcp'][0]['HostIp']='0.0.0.0';self.assertFalse(self.checks()['bindings'])
 def test_immutable_inputs(self):
  before=copy.deepcopy(self.old);after=copy.deepcopy(self.now);self.checks();self.assertEqual(before,self.old);self.assertEqual(after,self.now)
if __name__=='__main__':unittest.main()
