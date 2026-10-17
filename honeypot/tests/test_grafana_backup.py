import copy
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import grafana_backup as backup
import ops


class GrafanaFixture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.state = self.root / 'state/grafana'
        self.state.mkdir(parents=True)
        with sqlite3.connect(self.state / 'grafana.db') as connection:
            connection.execute('CREATE TABLE fixture (value TEXT)')
            connection.execute("INSERT INTO fixture VALUES ('synthetic rollback fixture')")
        (self.state / 'plugins').mkdir()
        (self.state / 'plugins/example.txt').write_text('synthetic plugin fixture')
        self.inspection = {'Id': 'a' * 64, 'Image': 'sha256:' + 'b' * 64,
                           'State': {'Running': False, 'Paused': False, 'Pid': 0, 'Status': 'exited'},
                           'Config': {'Image': 'grafana/grafana:12.4.1',
                                      'Labels': {'com.docker.compose.service': 'grafana',
                                                 'com.docker.compose.project.working_dir': str(self.root)}},
                           'Mounts': [{'Type': 'bind', 'Destination': '/var/lib/grafana',
                                       'Source': str(self.state)}]}


class GrafanaSnapshot(GrafanaFixture):
    def test_stopped_state_is_complete_verified_private_and_source_unchanged(self):
        before = (self.state / 'grafana.db').read_bytes()
        archive = backup.create_backup(self.root, self.inspection)
        receipt = backup.verify(archive)
        self.assertEqual(receipt['identity']['container_id'], 'a' * 64)
        self.assertTrue(receipt['database_present'])
        self.assertEqual(set(receipt['files']), {'grafana.db', 'plugins/example.txt'})
        self.assertEqual(receipt['qualification'], 'ARCHIVE_VERIFIED; RESTORE_NOT_TESTED')
        checksum = archive.with_name(archive.name + '.sha256')
        self.assertEqual(checksum.read_text().split()[0], hashlib.sha256(archive.read_bytes()).hexdigest())
        self.assertEqual(archive.stat().st_mode & 0o777, 0o600)
        self.assertEqual(checksum.stat().st_mode & 0o777, 0o600)
        self.assertEqual((self.state / 'grafana.db').read_bytes(), before)

    def test_running_unknown_and_paused_states_are_rejected_before_backup(self):
        for changes in ({'Running': True}, {'Pid': 99}, {'Paused': True}, {'Status': 'running'}, {'Running': None}):
            with self.subTest(changes=changes):
                row = copy.deepcopy(self.inspection)
                row['State'].update(changes)
                with self.assertRaisesRegex(ValueError, 'confirmed stopped'):
                    backup.create_backup(self.root, row)
        self.assertFalse((self.root / 'backups').exists())

    def test_wrong_mount_or_service_is_rejected(self):
        for field in ('mount', 'service', 'working-directory'):
            row = copy.deepcopy(self.inspection)
            if field == 'mount':
                row['Mounts'][0]['Source'] = '/unrelated-state'
            elif field == 'service':
                row['Config']['Labels']['com.docker.compose.service'] = 'cowrie'
            else:
                row['Config']['Labels']['com.docker.compose.project.working_dir'] = '/another-checkout'
            with self.assertRaises(ValueError):
                backup.create_backup(self.root, row)

    def test_nonempty_wal_requires_manual_review(self):
        for suffix in ('-wal', '-journal'):
            path = self.state / ('grafana.db' + suffix)
            path.write_bytes(b'pending synthetic journal')
            with self.assertRaisesRegex(ValueError, 'WAL/journal'):
                backup.create_backup(self.root, self.inspection)
            path.unlink()

    def test_symlink_is_rejected(self):
        (self.state / 'plugins/linked').symlink_to(self.state / 'grafana.db')
        with self.assertRaisesRegex(ValueError, 'Symlinks'):
            backup.create_backup(self.root, self.inspection)

    def test_invalid_database_fails_before_archive_creation(self):
        (self.state / 'grafana.db').write_bytes(b'invalid synthetic database')
        with self.assertRaises(sqlite3.DatabaseError):
            backup.create_backup(self.root, self.inspection)
        self.assertFalse((self.root / 'backups').exists())

    def test_backup_failure_propagates(self):
        with patch.object(backup.tarfile, 'open', side_effect=OSError('synthetic disk full')):
            with self.assertRaises(OSError):
                backup.create_backup(self.root, self.inspection)

    def test_archive_tampering_cannot_verify(self):
        archive = backup.create_backup(self.root, self.inspection)
        archive.write_bytes(b'not a valid archive')
        with self.assertRaises(backup.tarfile.ReadError):
            backup.verify(archive)


class UpdateBackupOrdering(GrafanaFixture):
    def exercise(self, failure=None, after_running=False):
        events = []
        inspections = 0
        def run(argv, **kwargs):
            nonlocal inspections
            if argv[:2] == ['docker', 'inspect']:
                inspections += 1
                row = copy.deepcopy(self.inspection)
                if inspections == 3 and after_running:
                    row['State']['Running'] = True
                return subprocess.CompletedProcess(argv, 0, json.dumps([row]), '')
            events.append(argv[1] if argv[0] == 'bash' else 'image-lock')
            return subprocess.CompletedProcess(argv, 0, '[]', '')
        def compose(*args, **kwargs):
            events.append(args[0])
            return subprocess.CompletedProcess(args, 0, 'a' * 64 + '\n' if args[0] == 'ps' else '', '')
        def snapshot(*args):
            events.append('snapshot-verified')
            if failure:
                raise failure
            return self.root / 'backups/synthetic-snapshot.tar.gz'
        cfg = {name: 'synthetic-image' for name in ('COWRIE_IMAGE', 'LOKI_IMAGE', 'GRAFANA_IMAGE', 'ALLOY_IMAGE')}
        with patch.object(ops, 'ROOT', self.root), patch.object(ops, 'require_root'), \
             patch.object(ops, 'run', side_effect=run), patch.object(ops, 'compose', side_effect=compose), \
             patch.object(ops, 'stop', side_effect=lambda: events.append('stop')), \
             patch.object(ops, 'start', side_effect=lambda: events.append('start')), \
             patch.object(ops, 'config', return_value=cfg), patch.object(ops, 'atomic_json'), \
             patch.object(backup, 'create_backup', side_effect=snapshot), \
             patch.object(sys, 'argv', ['ops.py', 'update', '--apply']):
            try:
                ops.update()
            except (OSError, ValueError):
                if failure is None and not after_running:
                    raise
        return events

    def test_verified_snapshot_precedes_pull_build_and_start(self):
        events = self.exercise()
        self.assertLess(events.index('stop'), events.index('snapshot-verified'))
        for command in ('pull', 'build', 'start'):
            self.assertLess(events.index('snapshot-verified'), events.index(command))

    def test_snapshot_failure_stops_update_before_pull_build_or_restart(self):
        events = self.exercise(failure=OSError('synthetic disk full'))
        self.assertIn('stop', events)
        self.assertNotIn('pull', events)
        self.assertNotIn('build', events)
        self.assertNotIn('start', events)

    def test_resumed_container_stops_update_before_pull_or_restart(self):
        events = self.exercise(after_running=True)
        self.assertNotIn('pull', events)
        self.assertNotIn('start', events)

    def test_update_requires_existing_explicit_apply_approval(self):
        with patch.object(ops, 'require_root'), patch.object(sys, 'argv', ['ops.py', 'update']), \
             patch.object(ops, 'stop') as stop, patch.object(ops, 'run') as run:
            with self.assertRaises(SystemExit):
                ops.update()
            stop.assert_not_called()
            run.assert_not_called()

    def test_another_checkout_cannot_stop_the_running_project(self):
        self.inspection['Config']['Labels']['com.docker.compose.project.working_dir'] = '/another-checkout'
        with patch.object(ops, 'ROOT', self.root), patch.object(ops, 'require_root'), \
             patch.object(sys, 'argv', ['ops.py', 'update', '--apply']), \
             patch.object(ops, 'compose', return_value=subprocess.CompletedProcess([], 0, 'a' * 64, '')), \
             patch.object(ops, 'run', return_value=subprocess.CompletedProcess([], 0, json.dumps([self.inspection]), '')) as run, \
             patch.object(ops, 'stop') as stop:
            with self.assertRaisesRegex(ValueError, 'working directory'):
                ops.update()
            stop.assert_not_called()
            self.assertEqual(run.call_count, 1)
