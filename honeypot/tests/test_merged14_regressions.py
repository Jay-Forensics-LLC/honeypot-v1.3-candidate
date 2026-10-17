"""Synthetic crash, corruption and trust fixtures from merged PR #14 review."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
import evidence_store as evidence
from incidentd import Engine
import runtime_inventory as runtime
import stage7_preservation as custody
from test_demo import fixture
import test_capture_status as capture_tests
import test_stage7_preservation as preservation_tests


class IngestionRecovery(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copytree(ROOT/'detections', self.root/'detections')
        self.raw = {'src_ip':'192.0.2.10','session':'synthetic','eventid':'cowrie.login.failed'}
        self.engine = Engine(self.root)

    def seed(self):
        self.engine.process('cowrie', self.raw, 'first')
        return next((self.root/'incidents').rglob('incident.json'))

    def test_missing_metadata_orphan_replays_exact_bytes(self):
        metadata = self.seed(); path = metadata.parent/'events.jsonl'; original = path.read_bytes()
        metadata.unlink()
        restarted = Engine(self.root)
        restarted.process('cowrie', self.raw, 'first')
        self.assertEqual(path.read_bytes(), original)
        self.assertEqual(json.loads(metadata.read_text())['related_events'], ['first'])

    def test_metadata_only_incident_is_detected(self):
        metadata = self.seed(); (metadata.parent/'events.jsonl').unlink()
        restarted = Engine(self.root)
        self.assertIn(str(metadata.parent), restarted.blocked_incidents)
        restarted.process('cowrie', self.raw, 'second')
        self.assertEqual(json.loads(metadata.read_text())['related_events'], ['first'])
        self.assertEqual(len(list((self.root/'incidents').rglob('incident.json'))), 2)

    def test_blocked_and_malformed_metadata_roll_over_without_event_loss(self):
        metadata = self.seed(); metadata.write_text('{malformed')
        old = (metadata.parent/'events.jsonl').read_bytes()
        restarted = Engine(self.root)
        restarted.process('cowrie', self.raw, 'second')
        self.assertEqual(metadata.read_text(), '{malformed')
        self.assertEqual((metadata.parent/'events.jsonl').read_bytes(), old)
        new = [p for p in (self.root/'incidents').rglob('incident.json') if p != metadata][0]
        self.assertEqual(json.loads(new.read_text())['related_events'], ['second'])

    def test_blocked_evidence_rolls_over_with_original_unchanged(self):
        metadata = self.seed(); path = metadata.parent/'events.jsonl'
        path.write_bytes(path.read_bytes()+b'\0damaged')
        old = path.read_bytes(); restarted = Engine(self.root)
        restarted.process('cowrie', self.raw, 'second')
        self.assertEqual(path.read_bytes(), old)
        self.assertEqual(len(list((self.root/'incidents').rglob('incident.json'))), 2)

    def test_new_orphan_event_does_not_overwrite_existing_orphan(self):
        metadata = self.seed();path=metadata.parent/'events.jsonl';old=path.read_bytes();metadata.unlink()
        Engine(self.root).process('cowrie', self.raw, 'second')
        self.assertEqual(path.read_bytes(),old);self.assertFalse(metadata.exists())
        self.assertEqual(len(list((self.root/'incidents').rglob('incident.json'))),1)

    def test_more_than_4000_incidents_does_not_abort_or_scan_every_file(self):
        day = self.root/'incidents/2026-01-01'; day.mkdir(parents=True)
        for i in range(4001):
            folder=day/str(i);folder.mkdir();(folder/'events.jsonl').write_text('')
        with patch('incidentd.evidence_records', wraps=evidence.records) as scanned:
            restarted=Engine(self.root)
            self.assertLessEqual(scanned.call_count,32)
        restarted.process('cowrie', self.raw, 'new')
        self.assertEqual(len(list((self.root/'incidents').rglob('incident.json'))),1)

    def test_metadata_only_incident_beyond_first_scan_is_checked_before_use(self):
        metadata=self.seed();(metadata.parent/'events.jsonl').unlink()
        self.engine.blocked_incidents.clear()
        self.engine.process('cowrie',self.raw,'second')
        self.assertEqual(json.loads(metadata.read_text())['related_events'],['first'])

    def test_append_does_not_redecode_prior_raw_payloads(self):
        metadata=self.seed();path=metadata.parent/'events.jsonl';row=evidence.records(path)['first']
        with patch.object(evidence.json,'loads',wraps=json.loads) as decoded:
            for i in range(40):
                record=copy.deepcopy(row);record['event_id']=str(i);record['normalized']['event_id']=str(i)
                evidence.append(path,record)
            self.assertLess(decoded.call_count,3)
        self.assertEqual(len(evidence.records(path)),41)

    def test_index_invalidates_after_external_corruption(self):
        metadata=self.seed();path=metadata.parent/'events.jsonl';evidence.records(path)
        path.write_bytes(path.read_bytes()+b'\0')
        with self.assertRaises(evidence.EvidenceIntegrityError): evidence.records(path)

    def test_index_checks_record_hash_on_demand(self):
        metadata=self.seed();path=metadata.parent/'events.jsonl';index=evidence.records(path)
        path.write_bytes(path.read_bytes().replace(b'first',b'other'))
        with self.assertRaises(evidence.EvidenceIntegrityError): index['first']

    def test_aggregate_budget_rolls_into_new_segment(self):
        metadata=self.seed();first_size=(metadata.parent/'events.jsonl').stat().st_size
        with patch('incidentd.MAX_INCIDENT_BYTES',first_size+20):
            self.engine.process('cowrie',self.raw,'second')
        self.assertEqual(len(list((self.root/'incidents').rglob('incident.json'))),2)

    def test_metadata_commit_replay_republishes_normalized_event(self):
        self.seed()
        (self.root/'logs/normalized/events.jsonl').unlink()
        self.engine.process('cowrie',self.raw,'first')
        rows=[json.loads(line) for line in (self.root/'logs/normalized/events.jsonl').read_text().splitlines()]
        self.assertEqual([row['event_id'] for row in rows],['first'])

    def test_malformed_metadata_shape_rolls_over(self):
        metadata=self.seed();metadata.write_text('[]')
        Engine(self.root).process('cowrie',self.raw,'second')
        self.assertEqual(metadata.read_text(),'[]')
        self.assertEqual(len(list((self.root/'incidents').rglob('incident.json'))),2)


class RuntimeTrust(unittest.TestCase):
    def test_tmpfs_missing_flags_values_and_extra_target_are_rejected(self):
        rendered,containers,networks,root=fixture()
        rendered['services']['loki']['tmpfs']=['/tmp:rw,nosuid,nodev,noexec,size=128m,mode=1777']
        containers['loki']['HostConfig']['Tmpfs']={'/tmp':'rw,nosuid,nodev,noexec,size=134217728,mode=01777'}
        self.assertFalse(runtime.validate_runtime(rendered,containers,networks,root))
        for value in ['rw,nosuid,nodev,size=128m,mode=1777','rw,nosuid,nodev,noexec,size=256m,mode=1777','rw,nosuid,nodev,noexec,size=128m,mode=0777']:
            containers['loki']['HostConfig']['Tmpfs']['/tmp']=value
            self.assertTrue(runtime.validate_runtime(rendered,containers,networks,root))
        containers['loki']['HostConfig']['Tmpfs']={}
        self.assertTrue(runtime.validate_runtime(rendered,containers,networks,root))

    def test_tmpfs_unexpected_target_rejected(self):
        r,c,n,root=fixture();c['loki']['HostConfig']['Tmpfs']={'/unexpected':'rw'}
        self.assertTrue(runtime.validate_runtime(r,c,n,root))

    def test_reviewed_image_id_required_even_with_unchanged_tag(self):
        containers={'service':{'Config':{'Image':'local:reviewed'},'Image':'sha256:'+'a'*64}}
        lock=[{'Id':'sha256:'+'a'*64,'RepoTags':['local:reviewed']}]
        self.assertEqual(runtime.validate_image_ids(containers,lock),[])
        containers['service']['Image']='sha256:'+'b'*64
        self.assertTrue(runtime.validate_image_ids(containers,lock))
        self.assertTrue(runtime.validate_image_ids(containers,[]))

    def test_tagged_digest_matches_reviewed_docker_repo_digest(self):
        reference='registry.example:5000/team/image:reviewed@sha256:'+'c'*64
        containers={'service':{'Config':{'Image':reference},'Image':'sha256:'+'a'*64}}
        lock=[{'Id':'sha256:'+'a'*64,'RepoDigests':['registry.example:5000/team/image@sha256:'+'c'*64]}]
        self.assertEqual(runtime.validate_image_ids(containers,lock),[])
        containers['service']['Config']['Image']=reference.replace('c'*64,'d'*64)
        self.assertTrue(runtime.validate_image_ids(containers,lock))

    def test_conflicting_image_lock_rejected(self):
        with self.assertRaisesRegex(ValueError,'Ambiguous'):
            runtime.validate_image_ids({},[{'Id':'sha256:'+x*64,'RepoTags':['local:same']} for x in ['a','b']])

    def test_static_configuration_exact_content_and_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'runtime';source=Path(tmp)/'source'
            for folder in [root,source]:
                (folder/'configs/alloy').mkdir(parents=True);(folder/'configs/alloy/config').write_text('reviewed')
            rendered={'services':{'alloy':{'volumes':[{'source':str(root/'configs/alloy')}]}}}
            self.assertTrue(runtime.verify_static_configuration(rendered,root,source))
            (root/'configs/alloy/config').write_text('altered')
            with self.assertRaisesRegex(ValueError,'differs'):runtime.verify_static_configuration(rendered,root,source)
            (root/'configs/alloy/config').write_text('reviewed');(root/'configs/alloy/extra').write_text('extra')
            with self.assertRaisesRegex(ValueError,'differs'):runtime.verify_static_configuration(rendered,root,source)
            (root/'configs/alloy/extra').unlink();(root/'configs/alloy/config').unlink()
            with self.assertRaisesRegex(ValueError,'differs'):runtime.verify_static_configuration(rendered,root,source)

    def test_static_configuration_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'configs').mkdir();(root/'configs/link').symlink_to(root/'target')
            with self.assertRaisesRegex(ValueError,'symlink'):
                runtime.static_configuration_hashes({'services':{'x':{'volumes':[{'source':str(root/'configs')}]}}},root)


class ExecutableTrust(capture_tests.CaptureStatus):
    def setUp(self):
        super().setUp()
        self.executable=self.root/'dumpcap';self.executable.write_bytes(b'synthetic executable')
        link=self.proc/'123/exe'
        if link.is_symlink():link.unlink()
        link.symlink_to(self.executable)

    def check(self):
        import inspect
        from types import SimpleNamespace
        (self.proc/'123/cmdline').write_bytes(('\0'.join(self.argv)+'\0').encode())
        kwargs={'runner':lambda *a,**k:SimpleNamespace(stdout=self.state),'proc':self.proc}
        if 'expected_executable' in inspect.signature(capture_tests.inspect_capture).parameters:
            kwargs['expected_executable']=self.executable
        return capture_tests.inspect_capture(self.root,**kwargs)

    def test_forged_dumpcap_argv_rejected(self):
        fake=self.root/'different';fake.write_bytes(b'other executable')
        (self.proc/'123/exe').unlink();(self.proc/'123/exe').symlink_to(fake)
        self.assertFalse(self.check()['ok'])

    def test_deleted_executable_rejected(self):
        self.executable.unlink();self.assertFalse(self.check()['ok'])


class MetadataAndRotation(preservation_tests.Preservation):
    def test_same_event_ids_cannot_hide_metadata_tampering(self):
        for field,value in [('source_ip','other'),('severity','CRITICAL'),('evidence_paths',['elsewhere'])]:
            metadata=self.incident/'incident.json';old=metadata.read_bytes();before=custody.snapshot(self.root)
            doc=json.loads(old);doc[field]=value;metadata.write_text(json.dumps(doc))
            with self.assertRaisesRegex(ValueError,'metadata changed'):custody.compare(self.root,before,custody.snapshot(self.root))
            metadata.write_bytes(old)

    def test_unread_tail_cannot_pass_rotation(self):
        self.write_state(0);before=custody.snapshot(self.root)
        self.log.rename(str(self.log)+'.1');self.log.write_text('{"event_id":"two"}\n');self.write_state()
        with self.assertRaisesRegex(ValueError,'unread'):custody.compare(self.root,before,custody.snapshot(self.root))

    def test_growth_after_snapshot_cannot_strand_new_old_inode_bytes(self):
        before=custody.snapshot(self.root)
        with self.log.open('a') as stream:stream.write('{"event_id":"unread"}\n')
        self.log.rename(str(self.log)+'.1');self.log.write_text('{"event_id":"two"}\n');self.write_state()
        with self.assertRaisesRegex(ValueError,'unread'):custody.compare(self.root,before,custody.snapshot(self.root))

    def test_new_events_allow_monotonic_metadata_growth(self):
        metadata=self.incident/'incident.json';doc=json.loads(metadata.read_text())
        doc.update(severity='LOW',source_ip='192.0.2.1',timestamp_start='a',timestamp_end='a',
                   confidence=0.6,auth_attempt_count=1,evidence_paths=['events.jsonl'])
        metadata.write_text(json.dumps(doc));before=custody.snapshot(self.root)
        with (self.incident/'events.jsonl').open('a') as stream:stream.write('{"event_id":"two"}\n')
        doc.update(related_events=['one','two'],severity='MEDIUM',timestamp_end='b',auth_attempt_count=2)
        metadata.write_text(json.dumps(doc));after=custody.snapshot(self.root)
        self.assertEqual(custody.compare(self.root,before,after)['status'],'PASS')
        after['incidents'][str(self.incident)]['metadata_at_acquisition']['source_ip']='changed'
        with self.assertRaisesRegex(ValueError,'identity changed'):custody.compare(self.root,before,after)


class OptimizedReconciliation(unittest.TestCase):
    def test_wrong_report_hash_rejected_under_optimized_python(self):
        path=ROOT/'work/live-qualification/stage7-reconciled-evidence.py'
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp)/'stage7-evidence-recovery-remediation-cc48cdb7f95b.json').write_text('{}')
            code="import importlib.util,pathlib; s=importlib.util.spec_from_file_location('review',%r); m=importlib.util.module_from_spec(s);s.loader.exec_module(m);m.REPORT=pathlib.Path(%r);m.verify()"%(str(path),str(Path(tmp)/'stage7-evidence-recovery-remediation-cc48cdb7f95b.json'))
            result=subprocess.run([sys.executable,'-O','-B','-c',code],capture_output=True,text=True,timeout=10)
            self.assertNotEqual(result.returncode,0);self.assertIn('Recovery report hash drift',result.stderr)
