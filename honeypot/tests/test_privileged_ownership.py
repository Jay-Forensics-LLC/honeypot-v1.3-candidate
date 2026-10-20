"""No Docker/nft calls: host containment actions require exact workload ownership."""
import copy
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
import firewall
import guard_policy
import quarantine


class QuarantineOwnership(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.cid = 'a' * 64
        self.info = {'Id': self.cid, 'Config': {'Labels': {'com.docker.compose.project': 'honeypot',
            'com.docker.compose.service': 'cowrie', 'com.docker.compose.project.working_dir': str(self.root)}},
            'State': {'Running': True, 'Paused': False}, 'Mounts': [
                {'Type': 'bind', 'Source': str(self.root/relative), 'Destination': target, 'RW': writable}
                for target, relative, writable in [
                    ('/cowrie/cowrie-git/etc/cowrie.cfg', 'configs/cowrie/cowrie.cfg', False),
                    ('/cowrie/cowrie-git/var/lib/cowrie', 'state/cowrie', True),
                    ('/cowrie/cowrie-git/var/log/cowrie', 'logs/cowrie', True),
                    ('/evidence', 'artifacts/cowrie', True)]]}
        self.commands = []

    def fake_run(self, argv, **kwargs):
        self.commands.append(argv)
        return SimpleNamespace(returncode=0, stderr='', stdout=json.dumps([self.info]) if argv[1] == 'inspect' else '')

    def invoke(self, undo=False, owner_error=None, guard_error=None):
        with patch.object(quarantine, 'ROOT', self.root), patch.object(quarantine, 'require_root'), \
             patch.object(quarantine, 'require_local_daemon', side_effect=owner_error) as owner, \
             patch.object(quarantine, 'run', side_effect=self.fake_run), patch.object(quarantine, 'audit'), \
             patch.object(guard_policy, 'require_guard', side_effect=guard_error):
            quarantine.quarantine('honeypot-cowrie', undo)
            owner.assert_called_once_with(self.root)

    def test_quarantine_and_unquarantine_use_inspected_id(self):
        self.invoke()
        self.assertIn(['docker', 'pause', self.cid], self.commands)
        self.assertIn(['docker', 'logs', '--tail', '2000', self.cid], self.commands)
        self.assertNotIn(['docker', 'pause', 'honeypot-cowrie'], self.commands)
        self.assertEqual(json.loads((self.root/'state/quarantine/honeypot-cowrie.json').read_text())['container_id'], self.cid)
        self.info['State']['Paused'] = True; self.commands.clear()
        self.invoke(undo=True)
        self.assertIn(['docker', 'unpause', self.cid], self.commands)

    def test_unreviewed_daemon_blocks_before_inspect_or_action(self):
        with self.assertRaises(SystemExit): self.invoke(owner_error=SystemExit('wrong endpoint'))
        self.assertEqual(self.commands, [])

    def test_wrong_project_service_working_dir_or_container_id_blocks(self):
        for field, value in [('com.docker.compose.project', 'other'), ('com.docker.compose.service', 'other'),
                             ('com.docker.compose.project.working_dir', '/different-runtime')]:
            original = copy.deepcopy(self.info)
            self.info['Config']['Labels'][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError): self.invoke()
            self.assertFalse(any(argv[1] in ('logs', 'pause', 'unpause') for argv in self.commands))
            self.info = original; self.commands.clear()
        self.info['Id'] = 'short'
        with self.assertRaises(ValueError): self.invoke()

    def test_wrong_mount_source_mode_or_duplicate_destination_blocks(self):
        for field, value in [('Source', '/foreign-runtime/logs'), ('RW', True), ('Type', 'volume')]:
            original = copy.deepcopy(self.info)
            self.info['Mounts'][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError): self.invoke()
            self.info = original
        self.info['Mounts'].append(copy.deepcopy(self.info['Mounts'][0]))
        with self.assertRaises(ValueError): self.invoke()

    def test_unpause_requires_containment_before_action(self):
        self.info['State']['Paused'] = True
        with self.assertRaises(SystemExit): self.invoke(undo=True, guard_error=SystemExit('guard absent'))
        self.assertFalse(any(argv[1] == 'unpause' for argv in self.commands))


class FirewallOwnership(unittest.TestCase):
    def test_wrong_endpoint_blocks_before_empty_api_can_clear_gate(self):
        with patch.object(firewall, 'require_local_daemon', side_effect=SystemExit('unreviewed store')), \
             patch.object(firewall, 'run') as run:
            with self.assertRaises(SystemExit): firewall.stop_gate()
            run.assert_not_called()

    def test_reviewed_empty_api_allows_gate_but_running_or_unreadable_blocks(self):
        for code, stdout, should_block in [(0, '', False), (0, 'honeypot-cowrie\n', True),
                                          (0, 'honeypot-opencanary\n', True), (1, '', True)]:
            with self.subTest(code=code, stdout=stdout), \
                 patch.object(firewall, 'require_local_daemon') as owner, \
                 patch.object(firewall, 'run', return_value=SimpleNamespace(returncode=code, stdout=stdout)):
                if should_block:
                    with self.assertRaises(SystemExit): firewall.stop_gate()
                else: firewall.stop_gate()
                owner.assert_called_once_with(firewall.ROOT)


if __name__ == '__main__':
    unittest.main()
