"""Independent final-review reproductions; all processes and capture data are fixtures."""
import copy
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch
from types import SimpleNamespace
import time

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import live_capture
import compose_input
import ops
import packet_snapshot
import test_image_startup as startup
import test_pr21_review as images
import test_live_capture as packets
import test_packet_snapshot as snapshots


class FinalReview(unittest.TestCase):
    def startup_fixture(self):
        fixture=startup.StartupFixture();fixture.setUp();self.addCleanup(fixture.doCleanups)
        return fixture

    def image_fixture(self):
        fixture=images.ImageTrust();fixture.setUp();self.addCleanup(fixture.doCleanups)
        return fixture

    def test_active_owned_services_are_refused_before_create_or_start(self):
        fixture=self.startup_fixture()
        fixture.containers['suricata']['State']['Running']=True
        with self.assertRaisesRegex(ValueError,'already active'):fixture.exercise()
        self.assertEqual(fixture.starts(),[]);self.assertEqual(fixture.snapshots,[])
        self.assertTrue(any(event[:2]==('docker','stop') for event in fixture.events))

    def test_override_file_or_compose_file_environment_cannot_qualify(self):
        for mode in ('file','environment'):
            fixture=self.image_fixture()
            if mode=='file':(fixture.root/'docker-compose.override.yml').write_text('services: {}')
            with self.subTest(mode=mode),patch.dict(os.environ,{'COMPOSE_FILE':'unreviewed.yml'} if mode=='environment' else {}):
                result=fixture.collect();self.assertFalse(result['ok'])
                self.assertTrue(any('Compose' in message for message in result['problems']))

    def test_effective_execution_drift_is_rejected_without_an_override_file(self):
        changes={'Cmd':['unreviewed-command'],'Entrypoint':['/unreviewed'],
                 'Env':['UNREVIEWED=true'],'Healthcheck':{'Test':['CMD','true']},'WorkingDir':'/unreviewed'}
        for field,value in changes.items():
            fixture=self.image_fixture();fixture.containers['incidentd']['Config'][field]=value
            with self.subTest(field=field):self.assertFalse(fixture.collect()['ok'])

    def test_stopped_container_extra_network_is_rejected_before_execution(self):
        fixture=self.startup_fixture()
        for container in fixture.containers.values():container['State']['Running']=False
        fixture.containers['cowrie'].setdefault('NetworkSettings',{}).setdefault('Networks',{})['unexpected']={}
        with self.assertRaisesRegex(ValueError,'configuration'):fixture.exercise()
        self.assertEqual(fixture.starts(),[])

    def test_packet_ring_replacement_between_selection_and_open_is_rejected(self):
        fixture=packets.CaptureProof();fixture.setUp();self.addCleanup(fixture.doCleanups)
        raw,_=fixture.pcapng(partial_tail=False);fixture.path.write_bytes(raw)
        path_open=Path.open;os_open=os.open;replaced=False
        def replace(path):
            nonlocal replaced
            if not isinstance(path,int) and Path(path)==fixture.path and not replaced:
                replaced=True;fixture.path.rename(fixture.folder/'original-ring.pcapng')
                with path_open(fixture.path,'wb') as output:output.write(raw)
        def file_open(path,*args,**kwargs):
            replace(path);return path_open(path,*args,**kwargs)
        def descriptor_open(path,*args,**kwargs):
            replace(path);return os_open(path,*args,**kwargs)
        parser=Mock(return_value=SimpleNamespace(returncode=0,stdout=f'{time.time()}\t172.29.41.2\t2121\n',stderr=''))
        with patch.object(Path,'open',file_open),patch.object(live_capture.os,'open',descriptor_open):
            with self.assertRaisesRegex(ValueError,'Capture.*(changed|replaced|identity)'):fixture.proof(parser)
        self.assertTrue(replaced);parser.assert_not_called()

    def test_all_override_files_and_input_environment_block_start_and_boot(self):
        for boot in (False,True):
            for name in compose_input.OVERRIDES:
                fixture=self.startup_fixture();(fixture.root/name).symlink_to('missing-override')
                with self.subTest(boot=boot,name=name),self.assertRaisesRegex(ValueError,'Compose'):
                    fixture.exercise(boot=boot)
                self.assertEqual(fixture.events,[])
            for name in compose_input.INPUT_ENV:
                fixture=self.startup_fixture()
                with self.subTest(boot=boot,name=name),self.assertRaisesRegex(ValueError,'Compose'):
                    fixture.exercise(boot=boot,input_env={name:'unreviewed'})
                self.assertEqual(fixture.events,[])

    def test_supported_compose_calls_bind_one_explicit_file_and_project(self):
        fixture=self.startup_fixture()
        with patch.object(ops,'ROOT',fixture.root),patch.object(ops,'run',return_value=SimpleNamespace(stdout='',stderr='')) as run:
            for filename in (None,fixture.root/'state/frozen.json'):
                ops.compose('config','--format','json',file=filename)
                argv=run.call_args.args[0]
                self.assertEqual(argv.count('-f'),1)
                self.assertEqual(argv[argv.index('-f')+1],str(filename or fixture.root/'docker-compose.yml'))
                self.assertEqual(argv[argv.index('--project-name')+1],'honeypot')

    def test_missing_approved_image_execution_metadata_blocks_before_create(self):
        fixture=self.startup_fixture();fixture.image_configs[next(iter(fixture.image_configs))]=None
        with self.assertRaisesRegex(ValueError,'execution metadata'):fixture.exercise()
        self.assertEqual(fixture.starts(),[]);self.assertEqual(fixture.snapshots,[])

    def test_stopped_old_autorestart_policy_blocks_before_create(self):
        fixture=self.startup_fixture()
        fixture.containers['suricata']['HostConfig']['RestartPolicy']={'Name':'unless-stopped','MaximumRetryCount':0}
        with self.assertRaisesRegex(ValueError,'restart policy'):fixture.exercise()
        self.assertEqual(fixture.starts(),[]);self.assertEqual(fixture.snapshots,[])

    def test_unsafe_mount_cannot_reach_diagnostic_container_execution(self):
        fixture=self.image_fixture()
        fixture.containers['incidentd']['Mounts'].append({'Type':'bind','Source':'/unreviewed',
            'Destination':'/app','RW':True})
        self.assertFalse(fixture.collect()['ok'])
        self.assertFalse(any(argv[:2]==['docker','exec'] for argv in fixture.commands))

    def test_source_identity_receipts_are_required_and_independently_checked(self):
        fixture=snapshots.AcquisitionVerification();fixture.setUp();self.addCleanup(fixture.doCleanups)
        packet=fixture.packet();self.assertEqual(packet_snapshot.verify_acquisition(packet)['status'],'PASS')
        for field,value in (('inode',0),('inode',True),('bytes',1),('mode',0)):
            bad=copy.deepcopy(packet);bad['acquisition']['source_segment']['after_fd'][field]=value
            with self.subTest(field=field,value=value),self.assertRaisesRegex(ValueError,'source identity'):
                packet_snapshot.verify_acquisition(bad)
        bad=copy.deepcopy(packet);del bad['acquisition']['source_segment']
        with self.assertRaises(ValueError):packet_snapshot.verify_acquisition(bad)
        bad=copy.deepcopy(packet);bad['source_segment']=bad['snapshot']
        bad['acquisition']['source_segment']['path']=bad['snapshot']
        with self.assertRaisesRegex(ValueError,'source segment'):packet_snapshot.verify_acquisition(bad)
        for path in (packet['snapshot'].replace('/','//',1),packet['source_segment']+'/../other'):
            bad=copy.deepcopy(packet);bad['source_segment']=path
            bad['acquisition']['source_segment']['path']=path
            with self.subTest(path=path),self.assertRaisesRegex(ValueError,'source segment'):
                packet_snapshot.verify_acquisition(bad)

    def test_same_inode_rewrite_during_copy_is_rejected_before_parser(self):
        fixture=packets.CaptureProof();fixture.setUp();self.addCleanup(fixture.doCleanups)
        raw,_=fixture.pcapng(partial_tail=False);fixture.path.write_bytes(raw)
        original=live_capture.os.fstat;count=0
        def changed(fd):
            nonlocal count
            count+=1
            if count==2:
                before=fixture.path.stat();fixture.path.write_bytes(raw)
                os.utime(fixture.path,ns=(before.st_atime_ns,before.st_mtime_ns+1000000))
            return original(fd)
        parser=Mock()
        with patch.object(live_capture.os,'fstat',changed),self.assertRaisesRegex(ValueError,'Capture source identity changed'):
            fixture.proof(parser)
        parser.assert_not_called()

    def test_nonmatching_capture_names_also_consume_inventory_budget(self):
        entries=Mock();entries.__enter__=Mock(return_value=iter(SimpleNamespace(name='other-'+str(i)) for i in range(6)))
        entries.__exit__=Mock(return_value=False)
        with patch.object(live_capture.os,'scandir',return_value=entries),patch.object(live_capture,'CAPTURE_ENTRY_LIMIT',5):
            with self.assertRaisesRegex(ValueError,'inventory exceeds bound'):live_capture.capture_segments('/fixture')


class ExecutionModel(unittest.TestCase):
    def fixture(self):
        image={'Cmd':['image-default'],'Entrypoint':['/image-entry'],
               'Env':['BASE=yes','OVERRIDE=old'],'WorkingDir':'/image-work','StopSignal':'SIGTERM',
               'Healthcheck':{'Test':['CMD','image-health'],'Interval':1000000000,'StartPeriod':7000000000}}
        spec={'environment':{'OVERRIDE':'new','LITERAL':'keep-$$VALUE'},'command':['run','$$VALUE'],
              'working_dir':'/approved','stop_signal':'SIGINT',
              'healthcheck':{'test':['CMD-SHELL','test "$$VALUE"'],'interval':'1m30s','timeout':'5s',
                             'retries':3,'start_interval':'500ms'}}
        actual={'Cmd':['run','$VALUE'],'Entrypoint':['/image-entry'],
                'Env':['BASE=yes','OVERRIDE=new','LITERAL=keep-$VALUE'],'WorkingDir':'/approved','StopSignal':'SIGINT',
                'Healthcheck':{'Test':['CMD-SHELL','test "$VALUE"'],'Interval':90000000000,'Timeout':5000000000,
                               'Retries':3,'StartPeriod':7000000000,'StartInterval':500000000}}
        return {'services':{'incidentd':spec}},{'incidentd':{'Image':'approved','Config':actual}},{'approved':image}

    def test_approved_image_defaults_and_reviewed_literals_remain_exact(self):
        rendered,containers,images=self.fixture()
        with patch.dict(os.environ,{'VALUE':'must-not-expand'}):
            self.assertEqual(compose_input.execution_problems(rendered,containers,images),[])
        for field in ('Cmd','Entrypoint','Env','Healthcheck','WorkingDir','StopSignal'):
            changed=copy.deepcopy(containers);changed['incidentd']['Config'][field]=None
            with self.subTest(field=field):self.assertTrue(compose_input.execution_problems(rendered,changed,images))

    def test_explicit_entrypoint_clears_default_image_command(self):
        rendered,containers,images=self.fixture();spec=rendered['services']['incidentd']
        spec['entrypoint']=['/reviewed-entry'];spec.pop('command')
        containers['incidentd']['Config'].update(Entrypoint=['/reviewed-entry'],Cmd=[])
        self.assertEqual(compose_input.execution_problems(rendered,containers,images),[])
        containers['incidentd']['Config']['Cmd']=['image-default']
        self.assertTrue(compose_input.execution_problems(rendered,containers,images))


if __name__=='__main__':unittest.main(verbosity=2)
