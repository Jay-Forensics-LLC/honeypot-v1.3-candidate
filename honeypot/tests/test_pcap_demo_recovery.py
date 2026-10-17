import copy
from pathlib import Path
import sys
import shutil
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import pcap_demo_recovery as recovery


def runtime_fixture(active=False):
    from runtime_inventory import SERVICES
    row={key:'stable-'+key for key in recovery.SECURITY_FIELDS}
    row.update(ok=active,problems=[] if active else [recovery.ONLY_BLOCKER],wan_enabled=False,
               guard={'ok':True,'problems':[],'observed':{'chains':['forward','input','outbound']},
                      'expected':{'policy':'strict'},'counters':{'host_drop':1},'timestamp':'before'},
               containers={name:{'id':name+'-id','image_id':name+'-image','health':'healthy',
                                 'networks':{'net':{'IPAddress':'172.29.42.2'}},'ports':{},
                                 'mounts':[{'Destination':'/logs','Source':'/runtime/logs','RW':True},
                                           {'Destination':'/config','Source':'/runtime/config','RW':False}]}
                           for name in SERVICES},
               networks=[{'Name':'net','IPAM':{'Config':[{'Subnet':'172.29.42.0/24','Gateway':'172.29.42.1'}]}}],
               mounted_config_hashes={'config':'same'},deployed_source_hashes={'incidentd.py':'same'},
               candidate_source_hashes={'incidentd.py':'same'},
               capture={'ok':False,'service':{'ActiveState':'inactive','SubState':'dead','MainPID':'0','Result':'success'}})
    if active:
        row['capture']={'ok':True,'pid':123,'start_ticks':456,'start_epoch':1000,
                        'service':{'ActiveState':'active','SubState':'running','MainPID':'123','Result':'success'},
                        'argv':['dumpcap','-i','br-hp-cowrie','-i','br-hp-canary'],
                        'interfaces':['br-hp-cowrie','br-hp-canary'],'capture_directory':'/captures'}
    return row


class RecoveryGate(unittest.TestCase):
    def setUp(self):
        self.observed={'problems':[recovery.ONLY_BLOCKER],'guard':{'ok':True},'wan_enabled':False}
        self.service={'ActiveState':'inactive','SubState':'dead','MainPID':'0','Result':'success',
                      'ExecMainStatus':'0','ExecMainStartTimestamp':'','ActiveEnterTimestamp':''}
    def test_expected_unstarted_service(self):recovery.check_start_gate(self.observed,self.service)
    def test_additional_runtime_failure_blocks(self):
        self.observed['problems'].append('source mismatch')
        with self.assertRaises(ValueError):recovery.check_start_gate(self.observed,self.service)
    def test_active_failed_or_previously_started_service_blocks(self):
        for key,value in (('ActiveState','active'),('Result','exit-code'),('MainPID','123'),
                          ('ExecMainStartTimestamp','earlier'),('ActiveEnterTimestamp','earlier')):
            service=copy.deepcopy(self.service);service[key]=value
            with self.assertRaises(ValueError):recovery.check_start_gate(self.observed,service)
    def test_wan_and_guard_failure_block(self):
        for key,value in (('wan_enabled',True),('guard',{'ok':False})):
            observed=copy.deepcopy(self.observed);observed[key]=value
            with self.assertRaises(ValueError):recovery.check_start_gate(observed,self.service)
    def test_failed_runtime_gate_never_starts_service(self):
        from types import SimpleNamespace
        service='\n'.join(k+'='+v for k,v in self.service.items())
        with patch.object(recovery,'collect',return_value={'problems':['unexpected deployment']}), \
             patch.object(recovery,'command',return_value=SimpleNamespace(stdout=service)) as command:
            row=recovery.recover(Path('/test/runtime'),start=True)
        self.assertEqual(row['status'],'BLOCKED');self.assertFalse(row['service_started'])
        self.assertEqual(command.call_count,1)
        self.assertEqual(command.call_args.args[0][1],'show')
    def test_dry_run_and_explicit_start_wiring(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'scripts').mkdir();(root/'captures').mkdir()
            (root/'.env').write_text('PCAP_PATH=captures\n')
            for name in ('pcap.py','hp_common.py'):shutil.copyfile(recovery.SOURCE/'scripts'/name,root/'scripts'/name)
            expected=(recovery.SOURCE/'systemd/honeypot-pcap.service.in').read_text().replace('@ROOT@',str(root)).replace('@PCAP@',str(root/'captures')).replace('@EVIDENCE_GROUP@','honeypot-evidence')
            service={**self.service,'FragmentPath':'/etc/systemd/system/honeypot-pcap.service',
                     'DropInPaths':'','ExecStart':'{ argv[]=/usr/bin/python3 '+str(root/'scripts/pcap.py')+' ; }'}
            def command(argv):
                stdout='\n'.join(k+'='+v for k,v in service.items()) if argv[1]=='show' else expected if argv[1]=='cat' else ''
                return SimpleNamespace(stdout=stdout)
            for start,active in ((False,False),(True,False),(False,True),(True,True)):
                before=runtime_fixture(active);after=runtime_fixture(True)
                service.update(ActiveState='active' if active else 'inactive',SubState='running' if active else 'dead',MainPID='123' if active else '0')
                with patch.object(recovery,'collect',side_effect=[before,after]), \
                     patch.object(recovery,'command',side_effect=command) as run, \
                     patch.object(recovery,'storage_gate'),patch.object(recovery.os,'geteuid',return_value=0), \
                     patch.object(recovery,'inspect_capture',return_value={'ok':True}), \
                     patch.object(recovery,'readiness',return_value={'ok':True}):
                    row=recovery.recover(root,start=start)
                self.assertEqual(row['status'],'CAPTURE_READY_FOR_DEMO' if start or active else 'READY_FOR_EXPLICIT_START')
                starts=[call.args[0] for call in run.call_args_list if call.args[0][1]=='start']
                self.assertEqual(starts,[['systemctl','start','honeypot-pcap.service']] if start and not active else [])
                self.assertFalse(any(verb in call.args[0] for call in run.call_args_list
                                     for verb in ('restart','stop','enable','disable')))
                self.assertFalse(row['boot_policy_changed']);self.assertFalse(row['traffic_generated'])
    def test_critical_disk_never_bypassed(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'captures').mkdir()
            (root/'.env').write_text('PCAP_PATH=captures\nDISK_HIGH_PERCENT=90\nDISK_CRITICAL_PERCENT=95\n')
            with patch.object(recovery.shutil,'disk_usage',return_value=SimpleNamespace(total=100,used=96,free=4)):
                with self.assertRaisesRegex(ValueError,'Disk headroom'):recovery.storage_gate(root)


class RuntimeComparison(unittest.TestCase):
    def setUp(self):
        self.before=runtime_fixture(False);self.after=runtime_fixture(True)
    def compare(self):return recovery.compare_runtime(self.before,self.after,starting=True)
    def assert_blocked(self,field):
        result=self.compare();self.assertFalse(result['ok'])
        self.assertTrue(any(field in item['field'] and item['classification']=='UNEXPECTED_RUNTIME_DRIFT' for item in result['differences']))
    def test_inactive_to_active_capture_only_passes(self):
        result=self.compare();self.assertTrue(result['ok'])
        self.assertTrue(all(c['classification']=='EXPECTED_PCAP_TRANSITION' for c in result['differences']))
    def test_legitimate_new_mainpid_passes(self):
        self.after['capture']['pid']=59227;self.after['capture']['service']['MainPID']='59227'
        self.assertTrue(self.compare()['ok'])
    def test_new_capture_segment_passes(self):
        self.after['capture_segments']=[{'path':'ring_new.pcapng','size':300,'mtime':1001}]
        self.assertTrue(self.compare()['ok'])
    def test_guard_fingerprint_change_blocks(self):
        self.after['guard_fingerprint']='changed';self.assert_blocked('guard_fingerprint')
    def test_wan_enable_blocks(self):
        self.after['wan_enabled']=True;self.assert_blocked('wan_enabled')
    def test_container_identity_change_blocks(self):
        self.after['containers']['cowrie']['id']='changed';self.assert_blocked('containers.cowrie.id')
    def test_container_image_change_blocks(self):
        self.after['containers']['cowrie']['image_id']='changed';self.assert_blocked('image_id')
    def test_container_health_regression_blocks(self):
        self.after['containers']['cowrie']['health']='unhealthy';self.assert_blocked('health')
    def test_subnet_and_gateway_changes_block(self):
        for key in ('Subnet','Gateway'):
            self.after=runtime_fixture(True);self.after['networks'][0]['IPAM']['Config'][0][key]='changed'
            self.assert_blocked('networks.net.IPAM')
    def test_mounted_configuration_change_blocks(self):
        self.after['mounted_config_hashes']['config']='changed';self.assert_blocked('mounted_config_hashes')
    def test_unrelated_source_hash_change_blocks(self):
        self.after['deployed_source_hashes']['bait.py']='changed';self.assert_blocked('deployed_source_hashes')
    def test_management_binding_change_blocks(self):
        self.after['containers']['grafana']['ports']={'3000/tcp':[{'HostIp':'0.0.0.0','HostPort':'3000'}]}
        self.assert_blocked('containers.grafana.ports')
    def test_expected_capture_changes_do_not_hide_network_drift(self):
        self.after['capture_segments']=[{'path':'new'}]
        self.after['containers']['cowrie']['networks']['unexpected']={}
        result=self.compare();self.assert_blocked('containers.cowrie.networks')
        self.assertTrue(any(c['classification']=='EXPECTED_PCAP_TRANSITION' for c in result['differences']))
    def test_config_compose_network_and_boot_fingerprints_stay_strict(self):
        for field in ('config_hash','compose_hash','rendered_config_hash','network_fingerprint','boot_id'):
            self.after=runtime_fixture(True);self.after[field]='changed';self.assert_blocked(field)
    def test_guard_semantics_remain_strict_even_if_fingerprint_unchanged(self):
        self.after['guard']['expected']['policy']='allow-all';self.assert_blocked('guard.expected.policy')
    def test_mount_order_and_counters_are_not_security_changes(self):
        self.after['containers']['cowrie']['mounts'].reverse()
        self.after['guard']['counters']['host_drop']=50;self.after['guard']['timestamp']='later'
        legacy_blocked=any(self.before.get(k)!=self.after.get(k) for k in ('boot_id','observation_fingerprint','containers'))
        self.assertTrue(legacy_blocked)  # reproduces the old raw-container comparison defect
        self.assertTrue(self.compare()['ok'])
    def test_already_active_process_identity_must_remain_stable(self):
        before=runtime_fixture(True);after=runtime_fixture(True)
        self.assertTrue(recovery.compare_runtime(before,after)['ok'])
        after['capture']['pid']=999;after['capture']['service']['MainPID']='999'
        self.assertFalse(recovery.compare_runtime(before,after)['ok'])
    def test_unknown_capture_changes_are_not_whitelisted(self):
        self.after['capture']['unexpected']='changed';self.assert_blocked('capture.unexpected')
    def test_incomplete_security_inventory_blocks(self):
        del self.before['mounted_config_hashes']
        with self.assertRaises(ValueError):self.compare()


if __name__=='__main__':unittest.main()
