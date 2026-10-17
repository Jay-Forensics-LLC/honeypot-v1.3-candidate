import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import demo
import runtime_inventory as inventory


def fixture():
    root=Path('/test/runtime')
    containers={};services={};networks=[]
    ports={'cowrie':[(2222,2222),(2223,2223)],'opencanary':[(8080,8080),(2121,2121),(16379,16379)],'grafana':[(3000,3000)]}
    for name in inventory.SERVICES:
        mappings={str(target)+'/tcp':[{'HostIp':'127.0.0.1','HostPort':str(host)}] for target,host in ports.get(name,[])}
        services[name]={'image':'expected:'+name,'ports':[{'target':t,'published':str(h),'host_ip':'127.0.0.1'} for t,h in ports.get(name,[])]}
        containers[name]={'Id':name+'-id','State':{'Running':True,'Health':{'Status':'healthy'}},
            'Config':{'Image':'expected:'+name,'Labels':{'com.docker.compose.project.working_dir':str(root),'com.docker.compose.project':'honeypot','com.docker.compose.service':name}},
            'HostConfig':{'Privileged':False,'ReadonlyRootfs':True,'CapDrop':['ALL'],'SecurityOpt':['no-new-privileges:true'],
                          'CapAdd':['NET_RAW','NET_ADMIN','SETUID','SETGID'] if name=='suricata' else [],
                          'Dns':[inventory.DNS[name]] if name in inventory.DNS else [],'PortBindings':copy.deepcopy(mappings)},
            'NetworkSettings':{'Networks':{n:{} for n in inventory.PLACEMENT[name]},'Ports':copy.deepcopy(mappings)},'Mounts':[]}
    containers['grafana']['Mounts']=[{'Destination':'/run/secrets/grafana_admin_password','Source':str(root/'secrets/grafana_admin_password'),'RW':False}]
    for name, spec in inventory.static_mount_policy(root)['services'].items():
        services[name]['volumes'] = spec['volumes']
        containers[name]['Mounts'].extend({'Destination':v['target'], 'Source':v['source'], 'RW':False, 'Type':'bind'}
                                        for v in spec['volumes'])
    for suffix,subnet in [('cowrie-net','40'),('canary-net','41'),('observability','42'),('management','43')]:
        name='honeypot-'+suffix
        networks.append({'Name':name,'IPAM':{'Config':[{'Subnet':'172.29.'+subnet+'.0/24','Gateway':'172.29.'+subnet+'.1'}]},'Internal':suffix=='observability',
                         'EnableIPv6':False,'Driver':'bridge','Options':{'com.docker.network.bridge.name':'br-hp-'+('cowrie' if suffix=='cowrie-net' else 'canary')} if suffix in ('cowrie-net','canary-net') else {},'Containers':{c['Id']:{} for n,c in containers.items() if name in inventory.PLACEMENT[n]}})
    rendered={'services':services,'networks':{n['Name']:{'name':n['Name']} for n in networks}}
    return rendered,containers,networks,root


class RuntimeGate(unittest.TestCase):
    def setUp(self): self.r,self.c,self.n,self.root=fixture()
    def checks(self): return inventory.validate_runtime(self.r,self.c,self.n,self.root)
    def test_expected_runtime(self): self.assertEqual(self.checks(),[])
    def test_unhealthy(self):
        self.c['alloy']['State']['Health']['Status']='unhealthy';self.assertTrue(self.checks())
    def test_extra_service(self):
        self.c['other']={};self.assertTrue(self.checks())
    def test_wan_binding_even_if_rendered_matches(self):
        self.r['services']['grafana']['ports'][0]['host_ip']='0.0.0.0'
        for m in (self.c['grafana']['HostConfig']['PortBindings'],self.c['grafana']['NetworkSettings']['Ports']):m['3000/tcp'][0]['HostIp']='0.0.0.0'
        self.assertTrue(self.checks())
    def test_different_loopback_address_refused(self):
        self.r['services']['opencanary']['ports'][0]['host_ip']='127.0.0.2';self.assertTrue(self.checks())
    def test_extra_published_port(self):
        self.c['incidentd']['NetworkSettings']['Ports']['9000/tcp']=[{'HostIp':'127.0.0.1','HostPort':'9000'}];self.assertTrue(self.checks())
    def test_wrong_dns(self):
        self.c['cowrie']['HostConfig']['Dns']=['8.8.8.8'];self.assertTrue(self.checks())
    def test_extra_capability(self):
        self.c['cowrie']['HostConfig']['CapAdd']=['NET_ADMIN'];self.assertTrue(self.checks())
    def test_wrong_tree(self):
        self.c['incidentd']['Config']['Labels']['com.docker.compose.project.working_dir']='/other';self.assertTrue(self.checks())
    def test_extra_member(self):
        self.n[0]['Containers']['unexpected']={};self.assertTrue(self.checks())
    def test_changed_cidr(self):
        self.n[0]['IPAM']['Config'][0]['Subnet']='10.0.0.0/24';self.assertTrue(self.checks())
    def test_decoy_observability_membership(self):
        self.c['cowrie']['NetworkSettings']['Networks']['honeypot-observability']={};self.assertTrue(self.checks())
    def test_extra_mount(self):
        self.c['cowrie']['Mounts'].append({'Destination':'/host','Source':'/','RW':True});self.assertTrue(self.checks())
    def test_missing_bind(self):
        self.r['services']['incidentd']['volumes']=[{'target':'/hp/logs','source':'/test/runtime/logs','type':'bind'}];self.assertTrue(self.checks())
    def test_reallocation_not_configuration_failure(self):
        for c in self.c.values():
            for n in c['NetworkSettings']['Networks'].values():n.update(IPAddress='172.29.42.200',EndpointID='new')
        self.assertEqual(self.checks(),[])
    def test_expected_cowrie_image_volume(self):
        target='/cowrie/cowrie-git/etc'
        self.c['cowrie']['Config']['Volumes']={target:{}}
        self.c['cowrie']['Mounts'].append({'Destination':target,'Type':'volume','Driver':'local','Name':'volumeid','Source':'/var/lib/docker/volumes/volumeid/_data','RW':True})
        self.assertEqual(self.checks(),[])
        self.c['cowrie']['Mounts'][-1]['Source']='/host'
        self.assertTrue(self.checks())
    def test_unexpected_image_volume(self):
        self.c['cowrie']['Config']['Volumes']={'/other':{}};self.assertTrue(self.checks())
    def test_changed_image_reference(self):
        self.c['cowrie']['Config']['Image']='unexpected:latest';self.assertTrue(self.checks())
    def test_wrong_compose_project(self):
        self.c['cowrie']['Config']['Labels']['com.docker.compose.project']='other';self.assertTrue(self.checks())
    def test_wrong_sensor_bridge(self):
        self.n[0]['Options']['com.docker.network.bridge.name']='other';self.assertTrue(self.checks())
    def test_paused_runtime(self):
        self.c['cowrie']['State']['Paused']=True;self.assertTrue(self.checks())
    def test_changed_gateway(self):
        self.n[0]['IPAM']['Config'][0]['Gateway']='172.29.40.2';self.assertTrue(self.checks())


class StoppedConfiguration(unittest.TestCase):
    def setUp(self):
        self.r,self.c,self.n,self.root=fixture()
        for name in ('cowrie','opencanary'):
            self.c[name]['State'].update(Status='exited',Running=False,Pid=0,ExitCode=0,Error='')
            self.c[name]['State']['Health']['Status']='unhealthy'
            self.c[name]['NetworkSettings']['Ports']={}
            for network in self.n:
                network['Containers'].pop(self.c[name]['Id'],None)
    def assess(self):
        return inventory.stopped_decoy_configuration(self.r,self.c,self.n,self.root)
    def test_stopped_configuration_does_not_clear_live_gate(self):
        result=self.assess()
        self.assertEqual(result['status'],'CONFIGURATION_CHECKS_PASSED')
        self.assertFalse(result['ready_for_demo']);self.assertFalse(result['startup_authorized'])
        failures=inventory.validate_runtime(self.r,self.c,self.n,self.root)
        self.assertIn('cowrie: not running and healthy',failures)
        self.assertIn('honeypot-cowrie-net: active membership differs',failures)
        self.assertFalse(any('CIDR differs' in problem for problem in failures))
    def test_missing_or_abnormal_stop_state_rejected(self):
        for key,value in [('Status','created'),('Pid',10),('ExitCode',1),('Error','failure'),
                          ('Paused',True),('OOMKilled',True)]:
            with self.subTest(key=key):
                original=copy.deepcopy(self.c['cowrie']['State'])
                self.c['cowrie']['State'][key]=value
                self.assertEqual(self.assess()['status'],'BLOCKED')
                self.c['cowrie']['State']=original
        del self.c['cowrie']['State']['ExitCode']
        self.assertEqual(self.assess()['status'],'BLOCKED')
    def test_active_endpoint_or_binding_rejected(self):
        self.c['cowrie']['NetworkSettings']['Networks']['honeypot-cowrie-net']['EndpointID']='active'
        self.assertEqual(self.assess()['status'],'BLOCKED')
        self.c['cowrie']['NetworkSettings']['Networks']['honeypot-cowrie-net']={}
        self.c['cowrie']['NetworkSettings']['Ports']={'2222/tcp':[{'HostIp':'127.0.0.1','HostPort':'2222'}]}
        self.assertEqual(self.assess()['status'],'BLOCKED')
    def test_cidr_and_unexpected_member_still_rejected(self):
        self.n[0]['IPAM']['Config'][0]['Subnet']='10.0.0.0/24'
        self.assertIn('honeypot-cowrie-net: CIDR differs',self.assess()['problems'])
        self.n[0]['IPAM']['Config'][0]['Subnet']='172.29.40.0/24'
        self.n[0]['Containers']['unexpected']={}
        self.assertEqual(self.assess()['status'],'BLOCKED')
    def test_persistent_security_change_rejected(self):
        original=copy.deepcopy(self.c['cowrie'])
        for change in ('binding','image','dns','capability','mount','membership'):
            with self.subTest(change=change):
                self.c['cowrie']=copy.deepcopy(original)
                c=self.c['cowrie']
                if change=='binding':c['HostConfig']['PortBindings']['2222/tcp'][0]['HostIp']='0.0.0.0'
                elif change=='image':c['Config']['Image']='unexpected:latest'
                elif change=='dns':c['HostConfig']['Dns']=['8.8.8.8']
                elif change=='capability':c['HostConfig']['CapAdd']=['NET_ADMIN']
                elif change=='mount':c['Mounts'].append({'Destination':'/host','Source':'/','RW':True})
                else:c['NetworkSettings']['Networks']['honeypot-observability']={}
                self.assertEqual(self.assess()['status'],'BLOCKED')
    def test_unrelated_unhealthy_service_rejected(self):
        self.c['loki']['State']['Health']['Status']='unhealthy'
        self.assertEqual(self.assess()['status'],'BLOCKED')
    def test_assessment_preserves_inputs(self):
        before=copy.deepcopy((self.r,self.c,self.n))
        self.assess()
        self.assertEqual(before,(self.r,self.c,self.n))


class Demonstration(unittest.TestCase):
    def test_oversized_line_tail_retains_complete_records(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'events.jsonl'
            path.write_bytes(b'x'*1024+b'\n'+b'{"event_id":"test"}\n')
            self.assertEqual(demo.rows(path,limit=64),[{'event_id':'test'}])
    def test_real_engine_replay_no_network_and_durable_evidence(self):
        with tempfile.TemporaryDirectory() as tmp, patch('socket.create_connection',side_effect=AssertionError('Network forbidden')):
            report={'demo_run_id':'honeytrace-demo-test','steps':{k:'NOT TESTED' for k in demo.STEPS}}
            demo.replay(Path(tmp),report)
            self.assertEqual(report['result']['event_severity'],'HIGH')
            self.assertTrue(report['steps']['evidence'].startswith('PASS'))
            self.assertTrue(report['steps']['loki'].startswith('NOT TESTED'))
            self.assertTrue(Path(report['result']['evidence_path']).exists())
    def test_refuses_traffic_before_safety_pass(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(demo,'collect',return_value={'ok':False,'problems':['guard missing']}), patch.object(demo,'ftp_interaction') as send:
            with self.assertRaisesRegex(ValueError,'safety gate'):
                demo.live(Path(tmp),Path(tmp),{'steps':{}},5)
            send.assert_not_called()
    def test_html_escapes_untrusted_fields(self):
        r={'mode':'replay','timestamp':'now','status':'FAILED','demo_run_id':'test','steps':{},'result':{'source_ip':'<script>alert(1)</script>'},'error':'<img src=x onerror=bad>'}
        text=demo.render(r)
        self.assertNotIn('<script>',text);self.assertNotIn('<img',text)
        self.assertIn('&lt;script&gt;',text);self.assertIn('Content-Security-Policy',text)
    def test_ftp_can_only_use_literal_loopback(self):
        with patch('socket.create_connection') as connect:
            sock=connect.return_value.__enter__.return_value
            sock.recv.side_effect=[b'220 FTP\r\n',b'331 Password\r\n',b'530 Denied\r\n']
            demo.ftp_interaction(2121,'honeytrace-demo-test')
            connect.assert_called_once_with(('127.0.0.1',2121),timeout=5)
            self.assertEqual(sock.sendall.call_count,2)
    def test_fragmented_ftp_greeting(self):
        with patch('socket.create_connection') as connect:
            sock=connect.return_value.__enter__.return_value
            sock.recv.side_effect=[b'22',b'0 FTP\r\n',b'331 Password\r\n',b'530 Denied\r\n']
            demo.ftp_interaction(2121,'honeytrace-demo-test')
            self.assertEqual(sock.sendall.call_count,2)
    def test_ftp_rejects_nondecoy_greeting(self):
        with patch('socket.create_connection') as connect:
            sock=connect.return_value.__enter__.return_value;sock.recv.return_value=b'HTTP/1.1 200 OK\r\n'
            with self.assertRaises(ValueError):demo.ftp_interaction(2121,'honeytrace-demo-test')
            sock.sendall.assert_not_called()
    def test_corrupt_evidence_rejected_and_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            report={'demo_run_id':'honeytrace-demo-test','steps':{}}
            demo.replay(Path(tmp),report)
            path=Path(report['result']['evidence_path']);path.write_bytes(path.read_bytes()+b'\0')
            before=path.read_bytes()
            event=demo.rows(Path(tmp)/'sandbox/logs/normalized/events.jsonl')[-1]
            with self.assertRaises(RuntimeError):demo.evidence_for(Path(tmp)/'sandbox',event)
            self.assertEqual(path.read_bytes(),before)
    def test_invalid_deadline_and_missing_root(self):
        for kwargs in ({'timeout':0},{'mode':'live'},{'mode':'invalid'}):
            with self.assertRaises(ValueError):demo.main(**kwargs)


class LiveWorkflowWiring(unittest.TestCase):
    """Real local engine; mocked runtime/transport/Loki, not a live qualification."""
    def setUp(self):
        import shutil
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);shutil.copytree(ROOT/'detections',self.root/'detections')
        for name in ('incidents','captures','output'): (self.root/name).mkdir()
        (self.root/'.env').write_text('DISK_HIGH_PERCENT=90\n')
        self.report={'demo_run_id':'honeytrace-demo-wiring','steps':{k:'NOT TESTED' for k in demo.STEPS}}
        self.runtime={'ok':True,'problems':[],'boot_id':'boot1','observation_fingerprint':'same',
                      'capture':{'pid':123,'start_ticks':456,'argv':['dumpcap']},
                      'containers':{n:{'id':n,'image_id':'image','started_at':'now','restart_count':0} for n in inventory.SERVICES}}
        self.runtime['containers']['opencanary']['ports']={'2121/tcp':[{'HostIp':'127.0.0.1','HostPort':'2121'}]}
        self.runtime['containers']['opencanary']['networks']={'honeypot-canary-net':{'IPAddress':'172.29.41.2'}}
    def synthetic_transport(self,port,marker):
        from incidentd import Engine
        p=self.root/'logs/opencanary/opencanary.json';p.parent.mkdir(parents=True)
        p.write_text(json.dumps({'utc_time':demo.utc(),'src_host':'127.0.0.1','src_port':43210,'dst_port':2121,'logtype':2000,'logdata':{'USERNAME':marker,'PASSWORD':'SYNTHETIC-NOT-A-REAL-PASSWORD'}})+'\n')
        Engine(self.root).poll()
    def execute(self,after=None,loki=True,clock=None,capture=True):
        from contextlib import ExitStack
        from types import SimpleNamespace
        with ExitStack() as stack:
            stack.enter_context(patch.object(demo,'collect',side_effect=[self.runtime,after or self.runtime]))
            stack.enter_context(patch.object(demo,'ftp_interaction',side_effect=self.synthetic_transport))
            stack.enter_context(patch.object(demo,'loki_contains',return_value=loki))
            stack.enter_context(patch.object(demo,'capture_readiness',return_value={'ok':True}))
            stack.enter_context(patch.object(demo,'packet_proof',return_value={'ok':capture}))
            stack.enter_context(patch.object(demo.shutil,'disk_usage',return_value=SimpleNamespace(total=100,used=10)))
            stack.enter_context(patch.object(demo.time,'sleep'))
            if clock: stack.enter_context(patch.object(demo.time,'monotonic',side_effect=clock))
            demo.live(self.root,self.root/'output',self.report,5)
    def test_connected_path_and_low_classification(self):
        self.execute()
        self.assertEqual(self.report['result']['event_severity'],'LOW')
        self.assertTrue(all(v.startswith('PASS') for v in self.report['steps'].values()))
        self.assertTrue((self.root/'output/runtime-after.json').exists())
    def test_postflight_drift_rejected(self):
        after=copy.deepcopy(self.runtime);after['boot_id']='rebooted'
        with self.assertRaisesRegex(ValueError,'Runtime changed'):self.execute(after)
        self.assertTrue(Path(self.report['result']['evidence_path']).exists())
    def test_missing_loki_event_never_passes(self):
        with self.assertRaisesRegex(ValueError,'Timed out'):self.execute(loki=False,clock=[0,0,10])
        self.assertTrue(self.report['steps']['loki'].startswith('FAIL'))
    def test_missing_packet_never_passes(self):
        with self.assertRaisesRegex(ValueError,'Timed out'): self.execute(capture=False,clock=[0,0,10])
        self.assertTrue(self.report['steps']['capture'].startswith('FAIL'))
        self.assertEqual(self.report['postflight']['status'],'PASS')
        self.assertTrue((self.root/'output/runtime-after.json').exists())
    def test_packet_timeout_preserved_when_postflight_also_fails(self):
        after=copy.deepcopy(self.runtime);after['boot_id']='changed'
        with self.assertRaisesRegex(ValueError,'Timed out'):
            self.execute(after=after,capture=False,clock=[0,0,10])
        self.assertIn('Timed out',self.report['verification_error'])
        self.assertEqual(self.report['postflight']['status'],'FAILED')
        self.assertIn('Runtime changed',self.report['postflight']['problems'][0])
    def test_postflight_exception_does_not_replace_primary_failure(self):
        with patch.object(demo,'_live_verification',side_effect=ValueError('original failure')), \
             patch.object(demo,'collect',side_effect=PermissionError('postflight denied')) as observe:
            with self.assertRaisesRegex(ValueError,'original failure'):
                demo.live(self.root,self.root/'output',self.report,5)
        self.assertEqual(observe.call_args.kwargs,{'probe_readiness':False})
        self.assertEqual(self.report['postflight']['status'],'FAILED')
        self.assertIn('postflight denied',self.report['postflight']['problems'][0])
    def test_success_cannot_pass_if_postflight_raises(self):
        with patch.object(demo,'_live_verification'), \
             patch.object(demo,'collect',side_effect=TimeoutError('observation timed out')):
            with self.assertRaisesRegex(ValueError,'Postflight failed'):
                demo.live(self.root,self.root/'output',self.report,5)
    def test_capture_readiness_failure_prevents_traffic(self):
        with patch.object(demo,'collect',return_value=self.runtime), \
             patch.object(demo,'capture_readiness',return_value={'ok':False,'problems':['stale output']}), \
             patch.object(demo,'ftp_interaction') as send:
            with self.assertRaisesRegex(ValueError,'Capture readiness'):demo.live(self.root,self.root/'output',self.report,5)
            send.assert_not_called()
            self.assertEqual(self.report['postflight']['status'],'PASS')

if __name__=='__main__': unittest.main()
