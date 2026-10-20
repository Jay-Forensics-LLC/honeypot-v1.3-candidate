"""Mock-only lifecycle tests: no Docker command or process is actually started."""
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'scripts'))
import image_approval
import ops
import test_demo
from guard_policy import DNS


class StartupFixture(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(); self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        for name in ('state', 'configs', 'secrets'):
            (self.root/name).mkdir()
        (self.root/'secrets/grafana_admin_password').write_text('synthetic-only')
        self.rendered,self.containers,self.networks,old_root=test_demo.fixture()
        self.rendered['name']='honeypot'
        for name,spec in self.rendered['services'].items():
            spec.update(image='local:'+name,build={'context':'/synthetic'},environment={'LITERAL':'keep-$$VALUE'})
            for volume in spec.get('volumes',[]):volume['source']=volume['source'].replace(str(old_root),str(self.root),1)
        self.document = {'version': 1, 'images': {name: {'reference': spec['image'],
            'id': 'sha256:'+f'{index:064x}'} for index, (name, spec) in enumerate(self.rendered['services'].items(), 1)}}
        self.path = self.root/image_approval.APPROVAL_PATH
        self.path.write_text(json.dumps(self.document))
        self.pin = hashlib.sha256(self.path.read_bytes()).hexdigest()
        for index,(name,expected) in enumerate(self.document['images'].items()):
            row=self.containers[name];row.update(Id=f'{index+100:064x}',Image=expected['id'])
            row['Config'].update(Image=expected['id'],Cmd=[],Entrypoint=[],Env=['LITERAL=keep-$VALUE'])
            row['Config']['Labels']['com.docker.compose.project.working_dir']=str(self.root)
            row['State'].update(Running=False,Status='created',Pid=0,ExitCode=0,Error='')
            row['NetworkSettings']['Ports']={}
            for mount in row['Mounts']:mount['Source']=mount['Source'].replace(str(old_root),str(self.root),1)
        for network in self.networks:network['Containers']={}
        self.image_configs={row['id']:{'Cmd':[],'Entrypoint':[],'Env':[]} for row in self.document['images'].values()}
        self.events = []; self.snapshots = []

    def exercise(self, *, pin=True, build=False, boot=False, drift=None, dns=True, boot_error=False, input_env=None):
        def run(argv, **kwargs):
            self.events.append(tuple(argv))
            value = ''
            if argv[:3] == ['docker', 'compose', 'config']:
                value = json.dumps(self.rendered)
            elif argv[:3] == ['docker', 'image', 'inspect']:
                if drift == 'tag':
                    # Mutable references/config are changed after render/check.
                    # The create request must still use only the frozen IDs.
                    self.rendered['services']['incidentd']['image'] = 'evil:retargeted'
                    os.environ['VALUE'] = 'changed'
                value = json.dumps([{'Id':identity,'Config':self.image_configs[identity]} for identity in argv[3:]])
            elif argv[:3] == ['docker', 'ps', '-aq']:
                value = '\n'.join(row['Id'] for row in self.containers.values())
            elif argv[:2] == ['docker', 'inspect']:
                rows = [copy.deepcopy(row) for row in self.containers.values() if row['Id'] in argv[2:]]
                if drift == 'image': rows[0]['Image'] = 'sha256:'+'f'*64
                if drift == 'identity': rows[0]['Id'] = 'e'*64
                if drift == 'owner': rows[0]['Config']['Labels']['com.docker.compose.project.working_dir'] = '/foreign'
                if boot_error and len(argv) == 3: raise ValueError('synthetic health inspection failure')
                value = json.dumps(rows)
            elif argv[:3]==['docker','network','inspect']:value=json.dumps(self.networks)
            elif argv[:2]==['docker','start']:
                for row in self.containers.values():
                    if row['Id'] in argv[2:]:row['State'].update(Running=True,Status='running')
            elif argv[:2] not in (['docker', 'start'], ['docker', 'stop']) and argv[0] != 'systemctl':
                self.fail('Unexpected external operation: '+repr(argv))
            return subprocess.CompletedProcess(argv, 0, value, '')

        def compose(*args, **kwargs):
            self.events.append(('compose', *args))
            if args[0] == 'config':
                return subprocess.CompletedProcess(args, 0, json.dumps(self.rendered), '')
            self.assertIn('create', args)
            snapshot = Path(kwargs['file'])
            self.snapshots.append(json.loads(snapshot.read_text()))
            self.assertEqual(snapshot.stat().st_mode & 0o777, 0o600)
            return subprocess.CompletedProcess(args, 0, '', '')

        env = {image_approval.PIN_ENV: self.pin} if pin else {}
        env.update(input_env or {})
        with patch.object(ops, 'ROOT', self.root), patch.object(ops, 'require_root'), \
             patch.object(ops, 'require_local_daemon'), patch.object(ops, 'require_guard'), \
             patch.object(ops, 'config', return_value={'MANAGEMENT_BIND':'127.0.0.1','DECOY_BIND':'127.0.0.1'}), \
             patch.object(ops, 'rendered_start_gate'), patch.object(ops, 'run', side_effect=run), \
             patch.object(ops, 'compose', side_effect=compose), \
             patch.object(ops, 'inspect_dns', return_value={'cowrie':dns,'opencanary':True}), \
             patch.object(sys, 'argv', ['ops.py']), patch.dict(os.environ, env, clear=True):
            if boot: ops.boot_start.__wrapped__()
            else: ops.start.__wrapped__(build=build)

    def starts(self):
        return [event for event in self.events if event[:2] == ('docker', 'start')]


class ImageStartup(StartupFixture):
    def test_build_flag_is_rejected_even_with_valid_approval(self):
        with self.assertRaisesRegex(ValueError, 'cannot build'): self.exercise(build=True)
        self.assertEqual(self.events, [])

    def test_direct_start_and_build_cannot_bypass_external_pin(self):
        for build in (False, True):
            with self.subTest(build=build), self.assertRaises(ValueError):
                self.exercise(pin=False, build=build)
            self.assertEqual(self.starts(), [])
            self.assertEqual(self.snapshots, [])

    def test_self_edited_approval_rejected_before_create(self):
        self.document['images']['incidentd']['id'] = 'sha256:'+'f'*64
        self.path.write_text(json.dumps(self.document))
        with self.assertRaisesRegex(ValueError, 'independently reviewed'): self.exercise()
        self.assertEqual(self.starts(), []); self.assertEqual(self.snapshots, [])

    def test_create_and_verify_all_ids_precedes_execution(self):
        self.exercise()
        inspect = next(i for i, event in enumerate(self.events) if event[:2] == ('docker','inspect'))
        start = next(i for i, event in enumerate(self.events) if event[:2] == ('docker','start'))
        self.assertLess(inspect, start)
        self.assertEqual({item for event in self.starts() for item in event[2:]},
                         {row['Id'] for row in self.containers.values()})
        self.assertEqual(self.starts()[-1][2:], (self.containers['suricata']['Id'],))
        for name, spec in self.snapshots[0]['services'].items():
            self.assertEqual(spec['image'], self.document['images'][name]['id'])
            self.assertNotIn('build', spec); self.assertEqual(spec['pull_policy'], 'never')

    def test_mutable_tags_and_environment_are_not_resolved_for_start(self):
        self.exercise(drift='tag')
        self.assertEqual(len(self.starts()), 2)
        self.assertEqual(self.snapshots[0]['services']['incidentd']['image'], self.document['images']['incidentd']['id'])
        self.assertEqual(self.snapshots[0]['services']['incidentd']['environment']['LITERAL'], 'keep-$$VALUE')

    def test_canonical_config_escapes_are_retained_without_second_escaping(self):
        environment={'DOLLAR':'keep-$$VALUE','BRACED':'keep-$${VALUE}','DOUBLE':'literal-$$$$'}
        for spec in self.rendered['services'].values():spec['environment']=environment.copy()
        for row in self.containers.values():row['Config']['Env']=[key+'='+value.replace('$$','$') for key,value in environment.items()]
        self.exercise()
        for spec in self.snapshots[0]['services'].values():self.assertEqual(spec['environment'],environment)

    def test_unapproved_created_image_never_executes(self):
        with self.assertRaisesRegex(ValueError, 'reviewed approval'): self.exercise(drift='image')
        self.assertEqual(self.starts(), [])

    def test_replaced_container_identity_never_executes(self):
        with self.assertRaisesRegex(ValueError, 'identities changed'): self.exercise(drift='identity')
        self.assertEqual(self.starts(), [])

    def test_foreign_working_directory_never_executes(self):
        with self.assertRaisesRegex(ValueError, 'ownership differs'): self.exercise(drift='owner')
        self.assertEqual(self.starts(), [])

    def test_dns_failure_stops_verified_ids_before_sensor_start(self):
        with self.assertRaisesRegex(SystemExit, 'Runtime DNS'): self.exercise(dns=False)
        self.assertEqual(len(self.starts()), 1)
        self.assertEqual(set(self.events[-1][2:]), {row['Id'] for row in self.containers.values()})
        self.assertEqual(self.events[-1][:2], ('docker','stop'))

    def test_existing_boot_path_requires_external_pin_without_creation(self):
        with self.assertRaisesRegex(ValueError, 'independently reviewed'): self.exercise(boot=True, pin=False)
        self.assertEqual(self.starts(), []); self.assertEqual(self.snapshots, [])

    def test_existing_boot_path_starts_only_exact_approved_decoy_ids(self):
        self.exercise(boot=True)
        self.assertEqual(self.starts(), [('docker','start', self.containers['cowrie']['Id'], self.containers['opencanary']['Id'])])
        self.assertEqual(self.snapshots, [])

    def test_boot_inspection_failure_stops_only_verified_decoy_ids(self):
        with self.assertRaisesRegex(ValueError, 'health inspection'): self.exercise(boot=True, boot_error=True)
        self.assertEqual(self.events[-1], ('docker','stop', self.containers['cowrie']['Id'], self.containers['opencanary']['Id']))
        self.assertEqual(self.snapshots, [])


if __name__ == '__main__': unittest.main()
