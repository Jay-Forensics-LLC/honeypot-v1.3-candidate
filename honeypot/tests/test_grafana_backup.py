import copy
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import grafana_backup as backup
import ops
import image_approval


def restore_fixture(archive, destination):
    """Test-only extraction into a new private directory; never a runtime path."""
    receipt = backup.verify_snapshot(archive)
    destination = Path(destination)
    destination.mkdir(mode=0o700)
    with backup.tarfile.open(archive, 'r:gz') as contents:
        for member in contents.getmembers():
            target = destination / member.name
            if not target.resolve().is_relative_to(destination.resolve()):
                raise ValueError('Restore fixture path escapes its new directory')
            if member.isdir():
                target.mkdir(mode=0o700, parents=True, exist_ok=True)
            else:
                target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with contents.extractfile(member) as source, os.fdopen(fd, 'wb') as output:
                    shutil.copyfileobj(source, output)
    return receipt


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

    def test_restore_recovers_prechange_sqlite_rows_and_plugin_bytes(self):
        archive = backup.create_backup(self.root, self.inspection)
        expected = (self.state / 'grafana.db').read_bytes()
        with sqlite3.connect(self.state / 'grafana.db') as connection:
            connection.execute("INSERT INTO fixture VALUES ('after backup')")
        (self.state / 'plugins/example.txt').write_text('changed after backup')
        target = self.root / 'isolated-restore'
        receipt = restore_fixture(archive, target)
        restored = target / 'grafana-state'
        self.assertEqual((restored / 'grafana.db').read_bytes(), expected)
        with sqlite3.connect((restored / 'grafana.db').resolve().as_uri() + '?mode=ro&immutable=1', uri=True) as connection:
            self.assertEqual(connection.execute('PRAGMA integrity_check').fetchall(), [('ok',)])
            self.assertEqual(connection.execute('SELECT value FROM fixture').fetchall(),
                             [('synthetic rollback fixture',)])
        self.assertEqual((restored / 'plugins/example.txt').read_text(), 'synthetic plugin fixture')
        for name, record in receipt['files'].items():
            self.assertEqual(backup.sha256(restored / name), (record['sha256'], record['bytes']))

    def test_checksum_failure_prevents_restore_creation(self):
        archive = backup.create_backup(self.root, self.inspection)
        archive.write_bytes(archive.read_bytes() + b'corruption')
        target = self.root / 'rejected-restore'
        with self.assertRaisesRegex(ValueError, 'checksum differs'):
            restore_fixture(archive, target)
        self.assertFalse(target.exists())

    def test_restore_cannot_overwrite_an_existing_directory(self):
        archive = backup.create_backup(self.root, self.inspection)
        target = self.root / 'existing-restore'
        target.mkdir()
        marker = target / 'preserve.txt'
        marker.write_text('preserve existing fixture')
        with self.assertRaises(FileExistsError):
            restore_fixture(archive, target)
        self.assertEqual(marker.read_text(), 'preserve existing fixture')


class UpdateBackupOrdering(GrafanaFixture):
    def exercise(self, failure=None, after_running=False, image_drift=None, bad_approval=False):
        events = []
        inspections = 0
        references = {name: 'synthetic-'+name+':reviewed' for name in image_approval.SERVICES}
        references['grafana'] = self.inspection['Config']['Image']
        approved = {'version':1, 'images':{name:{'reference':references[name], 'id':'sha256:'+f'{i+1:064x}'}
                                         for i,name in enumerate(sorted(references))}}
        approval_path = self.root/image_approval.APPROVAL_PATH
        approval_path.parent.mkdir(parents=True, exist_ok=True)
        approval_path.write_text(json.dumps(approved))
        approval_hash = hashlib.sha256(approval_path.read_bytes()).hexdigest()
        container_ids = {name:('a'*64 if name=='grafana' else f'{i+1:064x}') for i,name in enumerate(sorted(references))}
        old_lock = self.root/'state/images.lock.json'
        old_lock.write_text('Preserved old observation, not an approval')
        def run(argv, **kwargs):
            nonlocal inspections
            if argv[:3] == ['docker', 'image', 'inspect']:
                events.append('inspect-image')
                name = next(name for name,reference in references.items() if reference == argv[3])
                image_id = approved['images'][name]['id']
                if image_drift == 'before' and name == 'incidentd': image_id = 'sha256:'+'f'*64
                return subprocess.CompletedProcess(argv, 0, json.dumps([{'Id':image_id}]), '')
            if argv[:2] == ['docker', 'inspect'] and len(argv) > 3:
                rows = [{'Id':container_ids[name], 'Image':expected['id'],
                         'Config':{'Image':expected['reference'],'Labels':{'com.docker.compose.service':name}}}
                        for name,expected in approved['images'].items()]
                if image_drift == 'after': rows[0]['Image'] = 'sha256:'+'f'*64
                return subprocess.CompletedProcess(argv, 0, json.dumps(rows), '')
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
            output = ''
            if args[0] == 'config': output = json.dumps({'services':{name:{'image':ref} for name,ref in references.items()}})
            elif args[0] == 'ps': output = 'a'*64 if args[-1]=='grafana' else '\n'.join(container_ids.values())
            return subprocess.CompletedProcess(args, 0, output, '')
        def snapshot(*args):
            events.append('snapshot-verified')
            if failure:
                raise failure
            return self.root / 'backups/synthetic-snapshot.tar.gz'
        cfg = {name: 'synthetic-image' for name in ('COWRIE_IMAGE', 'LOKI_IMAGE', 'GRAFANA_IMAGE', 'ALLOY_IMAGE')}
        with patch.object(ops, 'ROOT', self.root), patch.object(ops, 'require_root'), \
             patch.object(ops, 'require_local_daemon', side_effect=lambda *a, **kw: events.append('daemon-owned')), \
             patch.object(ops, 'run', side_effect=run), patch.object(ops, 'compose', side_effect=compose), \
             patch.object(ops, 'stop', side_effect=lambda: events.append('stop')), \
             patch.object(ops, 'start', side_effect=lambda **kwargs: events.append('start' if kwargs == {'build':False} else 'unsafe-start')), \
             patch.object(ops, 'config', return_value=cfg), \
             patch.object(ops, 'atomic_json', side_effect=lambda path,doc: events.append('observation-write') if path.name=='images.observed.json' else self.fail('Approval/old lock was overwritten')), \
             patch.object(backup, 'create_backup', side_effect=snapshot), \
             patch.object(sys, 'argv', ['ops.py', 'update', '--apply', '--image-approval-sha256',
                                      '0'*64 if bad_approval else approval_hash]):
            try:
                ops.update()
            except (OSError, ValueError):
                if failure is None and not after_running and not image_drift and not bad_approval:
                    raise
        self.assertEqual(hashlib.sha256(approval_path.read_bytes()).hexdigest(), approval_hash)
        self.assertEqual(old_lock.read_text(), 'Preserved old observation, not an approval')
        return events

    def test_verified_snapshot_precedes_pull_build_and_start(self):
        events = self.exercise()
        self.assertLess(events.index('daemon-owned'), events.index('ps'))
        self.assertLess(events.index('stop'), events.index('snapshot-verified'))
        for command in ('pull', 'build', 'start'):
            self.assertLess(events.index('snapshot-verified'), events.index(command))

    def test_snapshot_failure_stops_update_before_pull_build_or_restart(self):
        events = self.exercise(failure=OSError('synthetic disk full'))
        self.assertIn('stop', events)
        self.assertNotIn('pull', events)
        self.assertNotIn('build', events)
        self.assertNotIn('start', events)

    def test_unapproved_built_image_cannot_start_or_self_approve(self):
        events = self.exercise(image_drift='before')
        self.assertIn('build', events)
        self.assertNotIn('start', events)
        self.assertNotIn('observation-write', events)

    def test_post_start_drift_stops_stack_without_an_approval_receipt(self):
        events = self.exercise(image_drift='after')
        self.assertIn('start', events)
        self.assertEqual(events[-1], 'stop')
        self.assertNotIn('observation-write', events)

    def test_wrong_approval_hash_prevents_backup_stop_pull_build_and_start(self):
        events = self.exercise(bad_approval=True)
        for operation in ('stop','snapshot-verified','pull','build','start'):
            self.assertNotIn(operation, events)

    def test_success_retains_approval_and_writes_observations_only(self):
        events = self.exercise()
        self.assertNotIn('unsafe-start', events)
        self.assertLess(events.index('inspect-image'), events.index('start'))
        self.assertLess(events.index('start'), events.index('observation-write'))

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
             patch.object(ops, 'require_local_daemon'), \
             patch.object(sys, 'argv', ['ops.py', 'update', '--apply']), \
             patch.object(ops, 'compose', return_value=subprocess.CompletedProcess([], 0, 'a' * 64, '')), \
             patch.object(ops, 'run', return_value=subprocess.CompletedProcess([], 0, json.dumps([self.inspection]), '')) as run, \
             patch.object(ops, 'stop') as stop:
            with self.assertRaisesRegex(ValueError, 'working directory'):
                ops.update()
            stop.assert_not_called()
            self.assertEqual(run.call_count, 1)

    def test_daemon_ownership_failure_prevents_update_commands(self):
        with patch.object(ops, 'require_root'), patch.object(sys, 'argv', ['ops.py', 'update', '--apply']), \
             patch.object(ops, 'require_local_daemon', side_effect=SystemExit('daemon ownership unconfirmed')), \
             patch.object(ops, 'compose') as compose, patch.object(ops, 'run') as run, \
             patch.object(ops, 'stop') as stop:
            with self.assertRaisesRegex(SystemExit, 'ownership unconfirmed'):
                ops.update()
            compose.assert_not_called()
            run.assert_not_called()
            stop.assert_not_called()
