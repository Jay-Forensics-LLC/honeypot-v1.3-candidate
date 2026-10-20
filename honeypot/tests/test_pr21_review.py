"""Qualification and custody regressions from the final PR #19 review."""
import copy
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
import evidence_store
import image_approval
import incidentd
import runtime_inventory as inventory
import stage7_preservation as custody
from pcap_demo_recovery import compare_runtime
import test_pr19_regressions as replay_fixtures
import test_stage7_preservation as custody_fixtures


class ImageTrust(unittest.TestCase):
    def setUp(self):
        self.fixture = replay_fixtures.StaticMountTrust()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.root, self.source = self.fixture.root, self.fixture.candidate
        self.rendered, self.containers, self.networks = self.fixture.rendered, self.fixture.containers, self.fixture.networks
        self.references = {name:spec['image'] for name,spec in self.rendered['services'].items()}
        self.document = {'version':1,'images':{name:{'reference':reference,'id':'sha256:'+f'{i+1:064x}'}
                                              for i,(name,reference) in enumerate(sorted(self.references.items()))}}
        for name,c in self.containers.items():
            c.update(Image=self.document['images'][name]['id'], Created='synthetic', RestartCount=0)
            c['State']['StartedAt'] = '2026-10-17T00:00:00Z'
        (self.root/'docker-compose.yml').write_text('synthetic compose')
        (self.source/'scripts').mkdir()
        self.module_hashes = {}
        for name in ('incidentd.py','evidence_store.py','hp_common.py','bait.py'):
            data = (ROOT/'scripts'/name).read_bytes()
            (self.source/'scripts'/name).write_bytes(data)
            self.module_hashes[name] = hashlib.sha256(data).hexdigest()
        self.approval_path = self.source/image_approval.APPROVAL_PATH
        self.write_approval()
        self.approval_pin = hashlib.sha256(self.approval_path.read_bytes()).hexdigest()
        self.source_dirty = False

    def write_approval(self):
        self.approval_path.write_text(json.dumps(self.document))

    def collect(self):
        def run(root, argv, **kwargs):
            if argv[:2] == ['docker','compose']: value = json.dumps(self.rendered)
            elif argv[:2] == ['docker','ps']: value = '\n'.join(c['Id'] for c in self.containers.values())
            elif argv[:2] == ['docker','inspect']: value = json.dumps(list(self.containers.values()))
            elif argv[:3] == ['docker','network','inspect']: value = json.dumps(self.networks)
            elif argv[0] == 'nft': value = '{}'
            elif argv[:2] == ['docker','exec']: value = json.dumps(self.module_hashes)
            elif argv == ['git','rev-parse','HEAD']: value = 'synthetic-reviewed-commit'
            elif argv == ['git','status','--porcelain']: value = ' M configs/images.approved.json' if self.source_dirty else ''
            else: self.fail('Unexpected command: '+repr(argv))
            return subprocess.CompletedProcess(argv, 0, value, '')
        with patch.dict(os.environ, {image_approval.PIN_ENV: self.approval_pin,
                                    image_approval.FILE_ENV: str(self.approval_path)}), \
             patch.object(inventory,'command',side_effect=run), \
             patch.object(inventory,'config',return_value={'DECOY_BIND':'127.0.0.1','MANAGEMENT_BIND':'127.0.0.1'}), \
             patch.object(inventory,'inspect_daemon',return_value={'ok':True}), \
             patch.object(inventory,'evaluate',return_value={'ok':True,'problems':[],'observed':{},'expected':{}}), \
             patch.object(inventory,'inspect_capture',return_value={'ok':True}):
            return inventory.collect(self.root,self.source,probe_readiness=False)

    def test_exact_reviewed_source_approval_passes_without_runtime_lock(self):
        result = self.collect()
        self.assertTrue(result['ok'], result['problems'])
        self.assertEqual(result['image_approval_sha256'], hashlib.sha256(self.approval_path.read_bytes()).hexdigest())

    def test_dirty_self_blessed_candidate_cannot_qualify(self):
        self.source_dirty = True
        self.document['images']['incidentd']['id'] = 'sha256:'+'f'*64
        self.containers['incidentd']['Image'] = self.document['images']['incidentd']['id']
        self.write_approval()
        self.approval_pin = hashlib.sha256(self.approval_path.read_bytes()).hexdigest()
        row = self.collect()
        self.assertFalse(row['ok'])
        self.assertTrue(any('Dirty candidate' in error for error in row['problems']))

    def test_clean_checkout_still_requires_separately_supplied_pin(self):
        self.approval_pin = ''
        row = self.collect()
        self.assertFalse(row['ok'])
        self.assertTrue(any('independently reviewed' in error for error in row['problems']))

    def test_source_approval_edits_cannot_replace_external_pin(self):
        self.document['images']['incidentd']['id'] = 'sha256:'+'f'*64
        self.containers['incidentd']['Image'] = self.document['images']['incidentd']['id']
        self.write_approval()
        self.assertFalse(self.collect()['ok'])

    def test_external_review_manifest_keeps_candidate_source_unchanged(self):
        external = self.root/'separate-reviewed-images.json'
        external.write_bytes(self.approval_path.read_bytes())
        self.approval_path.write_text('{"version":1,"images":{}}')
        with patch.dict(os.environ, {image_approval.FILE_ENV: str(external)}):
            approved = image_approval.load(self.source, self.references, self.approval_pin)
        self.assertEqual(approved['path'], str(external))
        self.assertEqual(approved['sha256'], self.approval_pin)

    def test_immutable_container_references_are_checked_against_same_approval(self):
        for name, row in self.containers.items():
            row['Config']['Image'] = self.document['images'][name]['id']
        result = self.collect()
        self.assertTrue(result['ok'], result['problems'])

    def test_runtime_receipts_cannot_bless_an_unreviewed_image(self):
        self.containers['incidentd']['Image'] = 'sha256:'+'f'*64
        (self.root/'state').mkdir()
        (self.root/'state/images.lock.json').write_text(json.dumps([
            {'Id':c['Image'],'RepoTags':[c['Config']['Image']]} for c in self.containers.values()]))
        runtime_approval = copy.deepcopy(self.document)
        runtime_approval['images']['incidentd']['id'] = self.containers['incidentd']['Image']
        (self.root/image_approval.APPROVAL_PATH).write_text(json.dumps(runtime_approval))
        result = self.collect()
        self.assertFalse(result['ok'])
        self.assertTrue(any('reviewed approval: incidentd' in error for error in result['problems']))

    def test_missing_empty_or_wrong_reference_approval_never_falls_back(self):
        self.approval_path.unlink()
        self.assertFalse(self.collect()['ok'])
        self.approval_path.write_text('{"version":1,"images":{}}')
        self.assertFalse(self.collect()['ok'])
        self.document['images']['incidentd']['reference'] = 'other:tag'
        self.write_approval()
        self.assertFalse(self.collect()['ok'])

    def test_approval_hash_is_an_independent_update_input(self):
        expected = hashlib.sha256(self.approval_path.read_bytes()).hexdigest()
        image_approval.load(self.source,self.references,expected)
        self.document['images']['incidentd']['id'] = 'sha256:'+'f'*64
        self.write_approval()
        with self.assertRaisesRegex(ValueError,'independently reviewed'):
            image_approval.load(self.source,self.references,expected)

    def test_approval_digest_drift_is_not_a_valid_runtime_transition(self):
        before = self.collect()
        after = copy.deepcopy(before); after['image_approval_sha256'] = 'f'*64
        self.assertFalse(compare_runtime(before,after)['ok'])
        del after['image_approval_sha256']
        self.assertFalse(compare_runtime(before,after)['ok'])

    def test_special_oversized_and_symlink_approvals_are_rejected_before_read(self):
        self.approval_path.unlink()
        os.mkfifo(self.approval_path)
        with self.assertRaisesRegex(ValueError,'Nonregular'):
            image_approval.load(self.source,self.references)
        self.approval_path.unlink()
        self.approval_path.symlink_to(self.root/'docker-compose.yml')
        with self.assertRaisesRegex(ValueError,'symlink'):
            image_approval.load(self.source,self.references)
        self.approval_path.unlink()
        with self.approval_path.open('wb') as stream: stream.truncate(1024**2+1)
        with patch.object(image_approval.os,'open',side_effect=AssertionError('Oversized input opened')):
            with self.assertRaisesRegex(ValueError,'finite read limit'):
                image_approval.load(self.source,self.references)


class MetadataGrowth(unittest.TestCase):
    def setUp(self):
        self.fixture = custody_fixtures.Preservation(); self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.root, self.incident = self.fixture.root, self.fixture.incident
        self.before = custody.snapshot(self.root)
        path = self.incident/'incident.json'
        metadata = json.loads(path.read_text())
        metadata.update(related_events=['one','two'],timestamp_end='2026-10-10T00:01:00Z',auth_attempt_count=2)
        with (self.incident/'events.jsonl').open('a') as stream: stream.write('{"event_id":"two"}\n')
        path.write_text(json.dumps(metadata))
        self.after = custody.snapshot(self.root)

    def test_actual_growth_control_passes(self):
        self.assertEqual(custody.compare(self.root,self.before,self.after)['status'],'PASS')

    def test_invalid_numbers_types_and_times_cannot_qualify_growth(self):
        mutations = [('confidence',x) for x in (float('nan'),float('inf'),-0.1,1.1,True,None,'0.9')]
        mutations += [('auth_attempt_count',x) for x in (True,-1,2.5,float('nan'),None,'2')]
        mutations += [('timestamp_end',x) for x in ('not-a-timestamp','2026-10-10T00:01:00',None,[], '2026-10-09T00:00:00Z')]
        mutations += [('severity',x) for x in ('UNKNOWN',[],None)]
        for field,value in mutations:
            with self.subTest(field=field,value=value):
                after=copy.deepcopy(self.after)
                after['incidents'][str(self.incident)]['metadata_at_acquisition'][field]=value
                with self.assertRaises(ValueError): custody.compare(self.root,self.before,after)

    def test_snapshot_itself_rejects_nan_and_invalid_time(self):
        path=self.incident/'incident.json'; doc=json.loads(path.read_text())
        doc.update(confidence=float('nan'),timestamp_end='not-a-timestamp')
        path.write_text(json.dumps(doc))
        with self.assertRaises(ValueError): custody.snapshot(self.root)

    def test_timestamps_compare_actual_instants(self):
        after=copy.deepcopy(self.after)
        # The spelling sorts earlier; the actual instant is one minute later.
        after['incidents'][str(self.incident)]['metadata_at_acquisition']['timestamp_end']='2026-10-09T23:01:00-01:00'
        self.assertEqual(custody.compare(self.root,self.before,after)['status'],'PASS')
        after['incidents'][str(self.incident)]['metadata_at_acquisition']['timestamp_end']='2026-10-10T01:00:00+02:00'
        with self.assertRaises(ValueError): custody.compare(self.root,self.before,after)

    def test_missing_growth_field_does_not_default_to_zero(self):
        for field in ('confidence','auth_attempt_count','timestamp_end','severity'):
            after=copy.deepcopy(self.after)
            del after['incidents'][str(self.incident)]['metadata_at_acquisition'][field]
            with self.subTest(field=field), self.assertRaises(ValueError):
                custody.compare(self.root,self.before,after)


class DurableLateConflicts(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name); shutil.copytree(ROOT/'detections',self.root/'detections')
        self.engine=incidentd.Engine(self.root)
        self.engine.process('cowrie',replay_fixtures.RAW,'stable')
        self.original=next((self.root/'incidents').glob('*/*'))
        self.duplicate=self.root/'incidents/2026-10-17/restored-copy'
        shutil.copytree(self.original,self.duplicate)
        self.originals={p:p.read_bytes() for d in (self.original,self.duplicate) for p in d.iterdir() if p.is_file()}

    def assert_fenced(self, engine):
        for directory in (self.original,self.duplicate): self.assertTrue(engine.locations.blocked(directory))
        with self.assertRaisesRegex(evidence_store.EvidenceIntegrityError,'Ambiguous'):
            engine.process('cowrie',replay_fixtures.RAW,'stable')
        for path,data in self.originals.items(): self.assertEqual(path.read_bytes(),data)

    def test_detected_post_backfill_duplicates_fence_both_locations_after_restart(self):
        self.engine.inspect_existing_evidence()
        self.assert_fenced(self.engine)
        self.assert_fenced(incidentd.Engine(self.root))
        with self.engine.locations.database() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM conflicts WHERE event_id=?',('stable',)).fetchone()[0],2)
        self.engine.process('cowrie',{**replay_fixtures.RAW,'src_ip':'192.0.2.11'},'unrelated')

    def test_fence_commits_before_diagnostic_failure(self):
        with patch.object(self.engine,'block_incident',side_effect=OSError('synthetic diagnostic failure')):
            with self.assertRaises(OSError): self.engine.inspect_existing_evidence()
        self.assert_fenced(incidentd.Engine(self.root))

    def test_a_third_copy_is_also_fenced_without_changing_prior_locations(self):
        self.engine.inspect_existing_evidence()
        third=self.duplicate.with_name('third-copy'); shutil.copytree(self.original,third)
        with self.assertRaises(evidence_store.EvidenceIntegrityError):
            self.engine.locations.remember(third,['stable'],evidenced=True)
        self.assertTrue(self.engine.locations.blocked(third)); self.assert_fenced(self.engine)


class SpecialStaticEntries(unittest.TestCase):
    def setUp(self):
        self.fixture=replay_fixtures.StaticMountTrust(); self.fixture.setUp(); self.addCleanup(self.fixture.doCleanups)

    def verify(self):
        return inventory.verify_static_configuration(self.fixture.rendered,self.fixture.root,self.fixture.candidate)

    def test_fifo_is_rejected_instead_of_omitted(self):
        self.assertTrue(self.verify())
        os.mkfifo(self.fixture.root/'detections/suricata/injected.rules')
        with self.assertRaisesRegex(ValueError,'Special/nonregular'): self.verify()

    def test_unix_socket_is_rejected_instead_of_omitted(self):
        path=self.fixture.root/'detections/suricata/injected.sock'
        with socket.socket(socket.AF_UNIX) as sock:
            sock.bind(str(path))
            with self.assertRaisesRegex(ValueError,'Special/nonregular'): self.verify()

    def test_static_inventory_stops_at_its_finite_entry_allowance(self):
        path=self.fixture.root/'detections/suricata'
        for number in range(501): (path/f'empty-{number}').mkdir()
        with self.assertRaisesRegex(ValueError,'inventory budget'): self.verify()


if __name__ == '__main__': unittest.main()
