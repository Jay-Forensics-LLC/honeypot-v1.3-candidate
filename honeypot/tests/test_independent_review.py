"""Reproductions of the independent integration review, no live Docker actions."""
from pathlib import Path
import copy
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import yaml
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import incidentd
import evidence_store
import ops
import runtime_inventory as inventory
import stage7_qualification as qualification
import test_pr21_review as image_fixtures
import test_privileged_ownership as ownership_fixtures
import test_image_startup as startup_fixtures

class IndependentReview(unittest.TestCase):
    def image_fixture(self):
        fixture=image_fixtures.ImageTrust();fixture.setUp();self.addCleanup(fixture.doCleanups)
        (fixture.source/'docker-compose.yml').write_bytes((fixture.root/'docker-compose.yml').read_bytes())
        return fixture

    def test_source_defaults_cannot_autostart_any_of_the_seven_images(self):
        document=yaml.safe_load((ROOT/'docker-compose.yml').read_text())
        self.assertEqual(set(document['services']),inventory.SERVICES)
        self.assertEqual({name:spec['restart'] for name,spec in document['services'].items()},
                         {name:'no' for name in inventory.SERVICES})

    def test_runtime_daemon_restart_policy_is_an_acceptance_failure(self):
        fixture=self.image_fixture()
        fixture.rendered['services']['suricata']['restart']='no'
        fixture.containers['suricata']['HostConfig']['RestartPolicy']={'Name':'unless-stopped','MaximumRetryCount':0}
        row=fixture.collect()
        self.assertFalse(row['ok'])
        self.assertTrue(any('restart' in problem.lower() for problem in row['problems']))

    def test_start_and_boot_refuse_actual_autorestart_before_starting_any_id(self):
        for boot in (False, True):
            for service in inventory.SERVICES:
                fixture=startup_fixtures.StartupFixture();fixture.setUp();self.addCleanup(fixture.doCleanups)
                fixture.containers[service]['HostConfig']['RestartPolicy']={'Name':'on-failure','MaximumRetryCount':5}
                with self.subTest(boot=boot,service=service),self.assertRaisesRegex(ValueError,'restart'):
                    fixture.exercise(boot=boot)
                self.assertEqual(fixture.starts(),[])

    def test_declared_automatic_restart_blocks_before_creation(self):
        with self.assertRaisesRegex(SystemExit,'restart'):
            ops.rendered_start_gate({'services':{'alloy':{'restart':'unless-stopped'}}})

    def test_changed_runtime_compose_cannot_qualify_as_clean_candidate_head(self):
        fixture=self.image_fixture();self.assertTrue(fixture.collect()['ok'])
        (fixture.root/'docker-compose.yml').write_text('unreviewed command/environment/restart change')
        row=fixture.collect();self.assertFalse(row['ok'])
        self.assertTrue(any('Compose' in problem for problem in row['problems']))

    def test_runtime_compose_drift_during_collection_is_rejected(self):
        fixture=self.image_fixture()
        original=inventory.verify_static_configuration
        def change(*args):
            result=original(*args)
            (fixture.root/'docker-compose.yml').write_text('changed during collection')
            return result
        with patch.object(inventory,'verify_static_configuration',side_effect=change):row=fixture.collect()
        self.assertFalse(row['ok'])
        self.assertTrue(any('Compose file changed' in problem for problem in row['problems']))

    def test_special_runtime_compose_is_rejected_without_opening_a_stream(self):
        import os
        fixture=self.image_fixture();path=fixture.root/'docker-compose.yml'
        path.unlink();os.mkfifo(path)
        row=fixture.collect();self.assertFalse(row['ok'])
        self.assertTrue(any('Nonregular' in problem for problem in row['problems']))

    def test_source_revision_cannot_hide_untracked_files_using_git_configuration(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            def git(*args):return subprocess.run(['git',*args],cwd=root,check=True,capture_output=True,text=True)
            git('init','-q');(root/'reviewed.txt').write_text('reviewed')
            git('add','reviewed.txt');git('-c','user.name=Fixture','-c','user.email=fixture@localhost','commit','-qm','fixture')
            git('config','status.showUntrackedFiles','no');(root/'unreviewed.py').write_text('unreviewed = True')
            self.assertEqual(git('status','--porcelain').stdout,'')
            with patch.object(qualification,'SOURCE',root):
                with self.assertRaisesRegex(ValueError,'checkpointed'):qualification.source_revision()

    def test_startup_uses_streaming_entries_and_stops_at_bound(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            for number in range(6):(root/str(number)).mkdir()
            engine=incidentd.Engine.__new__(incidentd.Engine);engine.incidents=root
            with patch.object(incidentd,'STARTUP_INVENTORY_LIMIT',5,create=True), \
                 patch.object(Path,'iterdir',side_effect=AssertionError('Unbounded materializing iterator used')):
                with self.assertRaisesRegex(incidentd.EvidenceIntegrityError,'bound'):list(engine.startup_inventory())

    def test_migration_inventory_also_streams_and_retains_unfinished_state(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);incidents=root/'incidents';incidents.mkdir()
            for number in range(6):(incidents/str(number)).mkdir()
            locations=evidence_store.EventLocations(root/'locator.sqlite3',incidents)
            with patch.object(evidence_store,'MAX_MIGRATION_ENTRIES',5), \
                 patch.object(Path,'iterdir',side_effect=AssertionError('Unbounded materializing iterator used')):
                with self.assertRaisesRegex(evidence_store.EvidenceIntegrityError,'bound'):locations.prepare_backfill()
            with locations.database() as db:
                self.assertIsNone(db.execute("SELECT value FROM settings WHERE key='inventory'").fetchone())

    def test_extra_host_or_socket_mount_blocks_quarantine_and_unpause(self):
        for undo in (False,True):
            for source in ('/','/var/run/docker.sock'):
                fixture=ownership_fixtures.QuarantineOwnership();fixture.setUp();self.addCleanup(fixture.doCleanups)
                fixture.info['State']['Paused']=True
                fixture.info['Mounts'].append({'Type':'bind','Source':source,'Destination':'/unsafe','RW':True})
                with self.subTest(undo=undo,source=source),self.assertRaises(ValueError):fixture.invoke(undo=undo)
                self.assertFalse(any(argv[1] in ('logs','pause','unpause') for argv in fixture.commands))

    def test_only_known_cowrie_image_volumes_are_allowed(self):
        fixture=ownership_fixtures.QuarantineOwnership();fixture.setUp();self.addCleanup(fixture.doCleanups)
        target='/cowrie/cowrie-git/etc';volume='a'*64
        fixture.info['Config']['Volumes']={target:{}}
        fixture.info['Mounts'].append({'Type':'volume','Name':volume,'Driver':'local',
            'Source':'/var/lib/docker/volumes/'+volume+'/_data','Destination':target,'RW':True})
        fixture.invoke()
        fixture.commands.clear();fixture.info['Config']['Volumes']['/unexpected']={}
        with self.assertRaises(ValueError):fixture.invoke()

    def test_unpause_rejects_extra_volume_tmpfs_and_invalid_known_volume(self):
        fixture=ownership_fixtures.QuarantineOwnership();fixture.setUp();self.addCleanup(fixture.doCleanups)
        clean=copy.deepcopy(fixture.info);fixture.info['State']['Paused']=True
        for mount in ({'Type':'volume','Destination':'/unexpected','Name':'other','RW':True},
                      {'Type':'tmpfs','Destination':'/unexpected','RW':True},
                      {'Type':'bind','Destination':'/tmp','Source':'/','RW':True}):
            fixture.info=copy.deepcopy(clean);fixture.info['State']['Paused']=True
            fixture.info['Mounts'].append(mount)
            with self.subTest(mount=mount),self.assertRaises(ValueError):fixture.invoke(undo=True)
            self.assertFalse(any(argv[1]=='unpause' for argv in fixture.commands));fixture.commands.clear()
        fixture.info=copy.deepcopy(clean)
        fixture.info['HostConfig']['Tmpfs']['/tmp']='rw,size=128m'
        with self.assertRaisesRegex(ValueError,'tmpfs'):fixture.invoke(undo=True)


if __name__=='__main__':unittest.main(verbosity=2)
