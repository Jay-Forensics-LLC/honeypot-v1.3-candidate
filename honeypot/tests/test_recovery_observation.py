"""Synthetic regressions for the observed restart metadata and fresh TTY gaps."""
import copy
from pathlib import Path
import shutil
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
import ops
import test_pr21_review as image_fixtures


class RecoveryObservation(unittest.TestCase):
    def setUp(self):
        self.fixture = image_fixtures.ImageTrust()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        target = self.fixture.containers['opencanary']
        previous = target['Id']; target['Id'] = 'a' * 64
        for network in self.fixture.networks:
            if previous in network['Containers']:
                network['Containers'][target['Id']] = network['Containers'].pop(previous)
        target['State']['Health']['Status'] = 'starting'
        self.profile = {'service':'opencanary','id':target['Id']}

    def collect(self):
        return self.fixture.collect(recovery_target=self.profile)

    def no_exec(self):
        self.assertFalse(any(argv[:2] == ['docker','exec'] for argv in self.fixture.commands))

    def test_expected_owned_target_starting_keeps_actual_safety_metadata_without_exec(self):
        row = self.collect()
        self.assertEqual(row['problems'], [])
        self.assertFalse(row['ok'])
        self.assertEqual(row['recovery_target']['status'], 'TARGET_STARTING')
        self.assertEqual(row['containers']['opencanary']['health'], 'starting')
        self.assertTrue(row['guard']['ok']); self.assertTrue(row['capture']['ok'])
        self.assertIn('mounted_config_hashes', row); self.assertEqual(len(row['containers']), 7)
        self.assertTrue(any(argv[0] == 'nft' for argv in self.fixture.commands))
        self.no_exec()

    def test_default_collection_still_rejects_starting_target(self):
        row = self.fixture.collect()
        self.assertFalse(row['ok'])
        self.assertIn('opencanary: not running and healthy', row['problems'])
        self.no_exec()

    def test_unrelated_or_target_unhealthy_and_stopped_target_stay_fatal(self):
        baseline = copy.deepcopy(self.fixture.containers)
        for name, state in [('alloy','starting'),('alloy','unhealthy'),('opencanary','unhealthy'),('opencanary','stopped')]:
            self.fixture.containers = copy.deepcopy(baseline)
            if state == 'stopped': self.fixture.containers[name]['State']['Running'] = False
            else: self.fixture.containers[name]['State']['Health']['Status'] = state
            with self.subTest(name=name,state=state):
                row = self.collect()
                self.assertFalse(row['ok']); self.assertTrue(row['problems'])
                self.assertTrue(row['guard']['ok']); self.no_exec()

    def test_unsafe_configuration_and_guard_loss_are_fatal_without_exec(self):
        self.fixture.containers['opencanary']['HostConfig']['Privileged'] = True
        row = self.collect()
        self.assertFalse(row['ok']); self.assertTrue(row['problems']); self.assertTrue(row['guard']['ok'])
        self.no_exec()
        self.fixture.containers['opencanary']['HostConfig']['Privileged'] = False
        self.fixture.guard_result = {'ok':False,'problems':['Synthetic policy missing'],'observed':{},'expected':{}}
        row = self.collect()
        self.assertFalse(row['ok']); self.assertFalse(row['guard']['ok']); self.no_exec()

    def test_missing_guard_and_wrong_target_identity_never_pass_or_execute(self):
        self.fixture.guard_missing = True
        row = self.collect()
        self.assertFalse(row['ok']); self.assertTrue(row['problems']); self.assertFalse(row['guard']['ok'])
        self.assertEqual(row['guard']['observed']['policy'], 'UNKNOWN'); self.assertTrue(row['capture']['ok'])
        self.no_exec()
        self.fixture.guard_missing = False
        self.profile['id'] = 'b' * 64
        row = self.collect()
        self.assertFalse(row['ok']); self.assertTrue(row['problems']); self.no_exec()

    def test_healthy_target_profile_still_runs_no_container_diagnostic(self):
        self.fixture.containers['opencanary']['State']['Health']['Status'] = 'healthy'
        row = self.collect()
        self.assertTrue(row['ok'], row['problems'])
        self.assertEqual(row['recovery_target']['status'], 'HEALTHY'); self.no_exec()


class FreshCowrieTty(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        shutil.copytree(ROOT/'configs', self.root/'configs')
        shutil.copyfile(ROOT/'.env.example', self.root/'.env')

    def bootstrap(self):
        def path(name, default): return self.root/default
        with patch.object(ops,'ROOT',self.root), patch.object(ops,'require_root'), \
             patch.object(ops,'runtime_path',side_effect=path), patch.object(ops,'config',return_value={'LOG_RETENTION_DAYS':'14'}), \
             patch.object(ops.os,'chown') as chown, patch.object(ops.os,'fchown') as fchown, \
             patch.object(ops,'secrets_generate'), patch('bait.ensure_inventory'):
            ops.bootstrap()
        return chown, fchown

    def test_fresh_bootstrap_creates_configured_tty_with_protected_numeric_ownership(self):
        path = self.root/'configs/cowrie/cowrie.cfg'
        path.write_text(path.read_text().replace('ttylog_path = var/lib/cowrie/tty', 'ttylog_path = var/lib/cowrie/sessions/tty'))
        chown, fchown = self.bootstrap()
        tty = self.root/'state/cowrie/sessions/tty'
        self.assertTrue(tty.is_dir()); self.assertEqual(stat.S_IMODE(tty.stat().st_mode),0o2750)
        self.assertEqual(stat.S_IMODE(tty.parent.stat().st_mode),0o2750)
        chown.assert_any_call(self.root/'state/cowrie',999,2000)
        self.assertEqual([call.args[1:] for call in fchown.call_args_list],[(999,2000),(999,2000)])

    def test_existing_nonempty_tty_is_preserved(self):
        tty = self.root/'state/cowrie/tty'; tty.mkdir(parents=True); tty.chmod(0o700)
        sample = tty/'synthetic-transcript'; sample.write_bytes(b'SYNTHETIC TTY BYTES')
        before = tty.stat(); original = sample.stat()
        _, fchown = self.bootstrap()
        after = tty.stat()
        self.assertEqual((before.st_ino,before.st_uid,before.st_gid,before.st_mode,before.st_mtime_ns),
                         (after.st_ino,after.st_uid,after.st_gid,after.st_mode,after.st_mtime_ns))
        self.assertEqual(sample.read_bytes(),b'SYNTHETIC TTY BYTES'); self.assertEqual(sample.stat(),original)
        fchown.assert_not_called()

    def test_configured_tty_cannot_escape_state_or_follow_symlinks(self):
        (self.root/'state/cowrie').mkdir(parents=True)
        outside = self.root/'outside'; outside.mkdir()
        (self.root/'state/cowrie/tty').symlink_to(outside, target_is_directory=True)
        with self.assertRaises(OSError): self.bootstrap()
        self.assertEqual(list(outside.iterdir()),[])
        config = self.root/'configs/cowrie/cowrie.cfg'
        config.write_text(config.read_text().replace('ttylog_path = var/lib/cowrie/tty', 'ttylog_path = ../outside'))
        with self.assertRaises(SystemExit): self.bootstrap()
