import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import daemon_check as daemon
import ops
import runtime_inventory


class DockerOwnership(unittest.TestCase):
    def setUp(self):
        self.root = Path('/reviewed/honeypot')
        self.commands = []
        self.pids = '123\n'
        self.store = '/var/lib/docker'
        self.ids = []
        self.containers = []
        self.failed_operation = None
        self.snap = 'inactive'
        self.context = daemon.ENDPOINT
        self.unit_overrides = {}

    def runner(self, argv, root):
        self.commands.append(argv)
        self.assertEqual(root, self.root)
        if argv[0] == 'ps': text = self.pids
        elif argv[0] == 'systemctl':
            system = argv[2] == 'docker.service'
            values = {'LoadState': 'loaded', 'ActiveState': 'active' if system else self.snap,
                      'SubState': 'running' if system else 'dead', 'MainPID': '123' if system else '0',
                      'NeedDaemonReload': 'no'}
            values.update(self.unit_overrides.get(argv[2], {}))
            text = ''.join(key+'='+value+'\n' for key, value in values.items() if value is not None)
        elif argv[1:3] == ['context', 'inspect']: text = json.dumps(self.context)
        else:
            self.assertEqual(argv[1:3], ['--host', daemon.ENDPOINT])
            operation = argv[3]
            if self.failed_operation == operation:
                return {'exit': 1, 'stdout': 'CONTAINERS=0', 'error_category': 'PERMISSION_DENIED'}
            if operation == 'info': text = json.dumps({'id': 'system-daemon', 'data_root': self.store, 'containers': len(self.ids), 'driver': 'overlayfs'})
            elif operation == 'version': text = json.dumps({'Client': {'Version': '29.1.3', 'ApiVersion': '1.52'}, 'Server': {'Version': '28.0', 'ApiVersion': '1.48'}})
            elif operation == 'ps': text = '\n'.join(self.ids)
            elif operation == 'inspect': text = json.dumps(self.containers)
            else: self.fail('Unexpected command: '+str(argv))
        return {'exit': 0, 'stdout': text}

    def inspect(self, existing=False, environ=None):
        return daemon.inspect(self.root, existing, self.runner, {} if environ is None else environ)

    def owned(self):
        self.ids = [format(i, '064x') for i in range(1, 8)]
        self.containers = [{'Id': identity, 'Image': 'sha256:image',
                            'Config': {'Env': ['PASSWORD=DO-NOT-DISPLAY'], 'Labels': {
                                'com.docker.compose.project': 'honeypot',
                                'com.docker.compose.service': name,
                                'com.docker.compose.project.working_dir': str(self.root)}}}
                           for identity, name in zip(self.ids, sorted(daemon.SERVICES))]

    def test_empty_success_is_not_connection_failure_or_existing_stack_pass(self):
        row = self.inspect()
        self.assertTrue(row['ok']); self.assertEqual(row['api']['containers'], 0)
        self.assertEqual(row['qualification'], 'Docker ownership only; health, containment and packet evidence NOT TESTED')
        self.assertFalse(self.inspect(existing=True)['ok'])

    def test_permission_denied_blank_count_is_never_inventory(self):
        self.failed_operation = 'info'; row = self.inspect()
        self.assertFalse(row['ok']); self.assertNotIn('api', row)
        self.assertEqual(row['checks']['local_api']['error_category'], 'PERMISSION_DENIED')

    def test_two_daemons_block_even_if_api_returns_owned_stack(self):
        self.owned(); self.pids = '123\n456\n'; self.snap = 'active'
        self.assertFalse(self.inspect(existing=True)['ok'])

    def test_wrong_snap_store_blocks_successful_empty_response(self):
        self.store = '/var/snap/docker/common/var-lib-docker'
        row = self.inspect(); self.assertFalse(row['ok'])
        self.assertEqual(row['api']['containers'], 0)

    def test_unit_reload_flag_blocks_healthy_identity_without_claiming_restart(self):
        self.owned()
        self.unit_overrides['docker.service'] = {'NeedDaemonReload': 'yes'}
        row = self.inspect(existing=True)
        self.assertFalse(row['ok'])
        self.assertEqual(row['units']['docker.service']['MainPID'], '123')
        self.assertEqual(row['units']['docker.service']['NeedDaemonReload'], 'yes')
        self.assertTrue(any('does not establish a daemon restart' in v for v in row['problems']))
        self.assertEqual(row['project_container_count'], 7)
        self.assertFalse(any('daemon-reload' in call for call in self.commands))

    def test_loaded_unit_missing_or_unknown_reload_flag_cannot_clear_startup(self):
        for unit in ('docker.service', 'snap.docker.dockerd.service'):
            for flag in (None, '', 'unexpected'):
                with self.subTest(unit=unit, flag=flag):
                    self.unit_overrides = {unit: {'NeedDaemonReload': flag}}
                    row = self.inspect()
                    self.assertFalse(row['ok'])
                    self.assertTrue(any('freshness is unverified' in v for v in row['problems']))
                    if flag == 'unexpected':
                        self.assertNotIn('unexpected', json.dumps(row))

    def test_absent_snap_unit_does_not_require_a_reload_flag(self):
        self.unit_overrides['snap.docker.dockerd.service'] = {
            'LoadState': 'not-found', 'NeedDaemonReload': None}
        row = self.inspect()
        self.assertTrue(row['ok'])
        self.assertIsNone(row['units']['snap.docker.dockerd.service']['NeedDaemonReload'])

    def test_loaded_inactive_snap_unit_with_reload_flag_remains_blocked(self):
        self.unit_overrides['snap.docker.dockerd.service'] = {'NeedDaemonReload': 'yes'}
        row = self.inspect()
        self.assertFalse(row['ok'])
        self.assertTrue(any('snap.docker.dockerd.service: systemd unit definitions require review' in v
                            for v in row['problems']))

    def test_default_remote_context_refused_before_api_connection(self):
        self.context = 'tcp://unreviewed:2375'
        self.assertFalse(self.inspect()['ok'])
        self.assertFalse(any('--host' in c for c in self.commands))

    def test_context_precedence_cannot_hide_remote_endpoint_behind_local_host(self):
        self.context='tcp://unreviewed:2375'
        row=self.inspect(environ={'DOCKER_CONTEXT':'default','DOCKER_HOST':daemon.ENDPOINT})
        self.assertFalse(row['ok'])
        self.assertFalse(any('--host' in c for c in self.commands))

    def test_endpoint_and_context_overrides_withheld_and_no_connection(self):
        for env in ({'DOCKER_HOST': 'tcp://secret-user:secret@remote:2375'}, {'DOCKER_CONTEXT': 'private-secret'}):
            self.commands.clear(); row = self.inspect(environ=env)
            self.assertFalse(row['ok']); self.assertEqual(self.commands, [])
            self.assertNotIn('secret', json.dumps(row))

    def test_compatible_negotiated_version_difference_is_not_error(self):
        row = self.inspect()
        self.assertTrue(row['ok']); self.assertNotEqual(row['versions']['client']['ApiVersion'], row['versions']['server']['ApiVersion'])

    def test_owned_containers_allowlist_omits_environment(self):
        self.owned(); row = self.inspect(existing=True)
        self.assertTrue(row['ok']); self.assertEqual(len(row['containers']), 7)
        self.assertNotIn('DO-NOT-DISPLAY', json.dumps(row))

    def test_other_checkout_and_duplicate_service_rejected(self):
        for kind in ('checkout', 'duplicate'):
            self.owned()
            labels = self.containers[0]['Config']['Labels']
            key = 'com.docker.compose.project.working_dir' if kind == 'checkout' else 'com.docker.compose.service'
            labels[key] = '/another/tree' if kind == 'checkout' else self.containers[1]['Config']['Labels'][key]
            self.assertFalse(self.inspect(existing=True)['ok'])

    def test_malformed_process_output_never_leaks_value(self):
        self.pids = 'malformed-private-value'
        row = self.inspect(); self.assertFalse(row['ok'])
        self.assertNotIn('malformed-private-value', json.dumps(row))

    def test_error_categories(self):
        messages = {'permission denied': 'PERMISSION_DENIED', 'no such file or directory': 'MISSING_SOCKET_OR_CLIENT_PATH',
                    'connect: connection refused': 'CONNECTION_REFUSED', 'context deadline exceeded': 'TIMEOUT',
                    'client version 1.24 is too old': 'API_INCOMPATIBLE', 'error response from daemon: unknown': 'API_OPERATION_ERROR'}
        for text, expected in messages.items(): self.assertEqual(daemon.classify_error(text), expected)

    def test_native_timeout_is_recorded_and_stderr_not_returned(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(daemon.subprocess, 'run', side_effect=subprocess.TimeoutExpired(['docker'], 15)):
            row = daemon.command(['docker'], tmp)
        self.assertEqual(row['error_category'], 'TIMEOUT'); self.assertEqual(row['stdout'], '')

    def test_malformed_api_and_failed_server_exchange_cannot_pass(self):
        for bad in ('info', 'version', 'inspect'):
            self.owned()
            def broken(argv, root):
                if len(argv)>3 and argv[3]==bad: return {'exit':0,'stdout':'{}'}
                return self.runner(argv, root)
            row=daemon.inspect(self.root,True,broken,{})
            self.assertFalse(row['ok'])

    def test_start_and_boot_start_fail_before_compose(self):
        with tempfile.TemporaryDirectory() as directory, patch('hp_common.ROOT', Path(directory)):
            for method in (ops.start, ops.boot_start):
                with patch.object(ops, 'require_root'), patch.object(ops, 'require_local_daemon', side_effect=SystemExit('unverified ownership')), \
                     patch.object(ops, 'compose') as compose:
                    with self.assertRaises(SystemExit): method()
                    compose.assert_not_called()
            rows = [json.loads(line) for line in (Path(directory)/'logs/system/audit.jsonl').read_text().splitlines()]
            self.assertEqual([row['action'] for row in rows], ['start.attempt','start','boot-start.attempt','boot-start'])
            self.assertFalse(any(row['success'] for row in rows))

    def test_runtime_gate_refuses_downstream_operations(self):
        cfg = {'DECOY_BIND':'127.0.0.1', 'MANAGEMENT_BIND':'127.0.0.1'}
        with patch.object(runtime_inventory, 'config', return_value=cfg), \
             patch.object(runtime_inventory, 'inspect_daemon', return_value={'ok':False,'problems':['ownership unverified']}), \
             patch.object(runtime_inventory, 'command') as command:
            row = runtime_inventory.collect(self.root, self.root)
        self.assertFalse(row['ok']); command.assert_not_called()


if __name__ == '__main__': unittest.main()
