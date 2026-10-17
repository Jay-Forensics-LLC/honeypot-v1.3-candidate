"""Migration and trust regressions from the independent local PR #19 review."""
import copy
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
import evidence_store as store
import incidentd as m
import runtime_inventory as inventory
from test_pr19_regressions import RAW, rows
import test_pr19_regressions as fixtures


class Migration(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copytree(ROOT/'detections', self.root/'detections')
        (self.root/'captures').mkdir()

    def legacy(self, eid, folder, raw=RAW):
        directory = self.root/'incidents/2026-10-17'/folder
        directory.mkdir(parents=True)
        normalized = m.normalize('cowrie', raw); normalized['event_id'] = eid
        store.append(directory/'events.jsonl', {'event_id':eid, 'normalized':normalized, 'raw':raw})
        return directory

    def damaged(self, tail=b'\0'*32, metadata=True):
        directory = self.legacy('old', 'historical')
        with (directory/'events.jsonl').open('ab') as stream: stream.write(tail)
        if metadata:
            (directory/'incident.json').write_text(json.dumps({'related_events':['old','missing']}))
        return directory

    def hashes(self, directory):
        return {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in directory.iterdir() if p.is_file()}

    def source(self):
        source = self.root/'logs/cowrie/cowrie.json'; source.parent.mkdir(parents=True, exist_ok=True)
        source.write_text(json.dumps(RAW)+'\n')
        return source

    def test_zero_tail_pins_original_and_metadata_and_fences_all_referenced_ids(self):
        directory = self.damaged(); original = self.hashes(directory)
        engine = m.Engine(self.root)
        self.assertTrue(engine.locations_ready)
        status = engine.locations.status()
        self.assertEqual(status['counts'], {'quarantined':1})
        self.assertEqual(status['details'][0]['evidence_sha256'], original['events.jsonl'])
        self.assertEqual(status['details'][0]['metadata_sha256'], original['incident.json'])
        for eid in ('old', 'missing'):
            with self.subTest(eid=eid), self.assertRaises(store.EvidenceIntegrityError):
                engine.process('cowrie', RAW, eid)
        engine.process('cowrie', RAW, 'healthy')
        self.assertEqual(self.hashes(directory), original)
        self.assertEqual(len(list((self.root/'incidents').rglob('events.jsonl'))), 2)

    def test_zero_tail_disposition_and_replay_fences_survive_restart(self):
        directory = self.damaged(); original = self.hashes(directory)
        m.Engine(self.root)
        restarted = m.Engine(self.root)
        self.assertTrue(restarted.locations_ready)
        for eid in ('old', 'missing'):
            with self.assertRaises(store.EvidenceIntegrityError): restarted.process('cowrie', RAW, eid)
        source = self.source(); restarted.poll()
        self.assertEqual(restarted.state['offsets']['logs/cowrie/cowrie.json']['offset'], source.stat().st_size)
        self.assertEqual(self.hashes(directory), original)

    def test_nonzero_damage_is_not_automatically_quarantined(self):
        directory = self.damaged(tail=b'\0not-zero\n'); original = self.hashes(directory)
        self.source(); engine = m.Engine(self.root); engine.poll()
        self.assertFalse(engine.locations_ready); self.assertTrue(engine.location_backfill_failed)
        self.assertEqual(engine.state['offsets'], {})
        self.assertEqual(self.hashes(directory), original)

    def test_content_after_zero_tail_is_not_silently_skipped(self):
        directory = self.damaged(tail=b'\0'*32+b'\n'+b'{"event_id":"hidden"}\n')
        original = self.hashes(directory)
        engine = m.Engine(self.root)
        self.assertFalse(engine.locations_ready)
        self.assertEqual(self.hashes(directory), original)

    def test_zero_tail_requires_consistent_metadata(self):
        directory = self.damaged()
        for value in ({'related_events':['different']}, {'related_events':['old','old']}, {'related_events':[[]]}):
            with self.subTest(metadata=value):
                (directory/'incident.json').write_text(json.dumps(value))
                with self.assertRaises((store.EvidenceIntegrityError, ValueError)): store.zero_tail_ids(directory)

    def test_zero_tail_without_metadata_blocks(self):
        directory = self.damaged(metadata=False); original = self.hashes(directory)
        engine = m.Engine(self.root)
        self.assertFalse(engine.locations_ready)
        self.assertEqual(self.hashes(directory), original)

    def test_metadata_only_history_remains_blocked(self):
        directory = self.root/'incidents/2026-10-17/metadata-only'; directory.mkdir(parents=True)
        metadata = directory/'incident.json'; metadata.write_text(json.dumps({'related_events':['missing']}))
        original = metadata.read_bytes(); engine = m.Engine(self.root); engine.poll()
        self.assertFalse(engine.locations_ready); self.assertTrue(engine.location_backfill_failed)
        self.assertEqual(metadata.read_bytes(), original)

    def test_legacy_duplicates_block_ambiguous_ids_and_preserve_both_locations(self):
        first = self.legacy('duplicate', 'first')
        second = self.legacy('duplicate', 'second', {**RAW, 'username':'different-content'})
        before = {first:self.hashes(first), second:self.hashes(second)}
        engine = m.Engine(self.root)
        self.assertTrue(engine.locations_ready)
        self.assertEqual(engine.locations.status()['counts'], {'quarantined':2})
        for active in (engine, m.Engine(self.root)):
            with self.assertRaisesRegex(store.EvidenceIntegrityError, 'Ambiguous'):
                active.process('cowrie', RAW, 'duplicate')
        engine.process('cowrie', RAW, 'healthy')
        for directory, original in before.items(): self.assertEqual(self.hashes(directory), original)
        copies = sum(row['event_id']=='duplicate' for path in (self.root/'incidents').rglob('events.jsonl') for row in rows(path))
        self.assertEqual(copies, 2)

    def test_backfill_resumes_remaining_payloads_after_interruption(self):
        directories = [self.legacy(str(i), f'legacy-{i:04}') for i in range(65)]
        original = {d:self.hashes(d) for d in directories}
        engine = m.Engine(self.root); engine.poll()
        self.assertFalse(engine.locations_ready)
        with patch.object(m, 'evidence_records', wraps=store.records) as scanned:
            restarted = m.Engine(self.root)
        self.assertTrue(restarted.locations_ready)
        self.assertEqual(scanned.call_count, 1)
        self.assertEqual(restarted.locations.status()['counts'], {'indexed':65})
        for directory, digest in original.items(): self.assertEqual(self.hashes(directory), digest)

    def test_changed_processed_file_blocks_migration_completion(self):
        directories = [self.legacy(str(i), f'legacy-{i:04}') for i in range(33)]
        engine = m.Engine(self.root)
        with (directories[0]/'events.jsonl').open('ab') as stream: stream.write(b'\0')
        changed = self.hashes(directories[0])
        self.source(); engine.poll()
        self.assertFalse(engine.locations_ready); self.assertTrue(engine.location_backfill_failed)
        self.assertEqual(engine.state['offsets'], {})
        self.assertEqual(self.hashes(directories[0]), changed)

    def test_new_directory_during_migration_blocks_completion(self):
        for i in range(33): self.legacy(str(i), f'legacy-{i:04}')
        engine = m.Engine(self.root)
        self.legacy('late', 'late-import'); self.source(); engine.poll()
        self.assertFalse(engine.locations_ready)
        self.assertIn('inventory changed', engine.locations.status()['inventory_error'])
        self.assertEqual(engine.state['offsets'], {})

    def test_changed_pending_file_is_not_accepted_as_the_inventory_snapshot(self):
        directories = [self.legacy(str(i), f'legacy-{i:04}') for i in range(33)]
        engine = m.Engine(self.root)
        path = directories[-1]/'events.jsonl'
        row = rows(path)[0]; row['raw']['username'] = 'changed-after-discovery'
        path.write_text(json.dumps(row)+'\n'); changed = path.read_bytes()
        self.source(); engine.poll()
        self.assertFalse(engine.locations_ready); self.assertTrue(engine.location_backfill_failed)
        self.assertEqual(engine.state['offsets'], {})
        self.assertEqual(path.read_bytes(), changed)

    def test_migration_name_inventory_has_a_finite_bound(self):
        self.legacy('one', 'first'); self.legacy('two', 'second')
        with patch.object(store, 'MAX_MIGRATION_ENTRIES', 2):
            with self.assertRaisesRegex(store.EvidenceIntegrityError, 'inventory exceeds bound'): m.Engine(self.root)

    def test_stray_file_is_not_silently_indexed_as_an_empty_incident(self):
        day = self.root/'incidents/2026-10-17'; day.mkdir(parents=True)
        path = day/'stray'; path.write_bytes(b'preserve unknown bytes')
        engine = m.Engine(self.root)
        self.assertFalse(engine.locations_ready)
        self.assertEqual(path.read_bytes(), b'preserve unknown bytes')

    def test_evidence_fifo_blocks_without_opening_a_stream(self):
        directory = self.root/'incidents/2026-10-17/fifo'; directory.mkdir(parents=True)
        os.mkfifo(directory/'events.jsonl')
        engine = m.Engine(self.root)
        self.assertFalse(engine.locations_ready)
        self.assertEqual(engine.locations.status()['counts'], {'blocked':1})

    def test_metadata_fifo_blocks_without_opening_a_stream(self):
        directory = self.legacy('old', 'fifo')
        os.mkfifo(directory/'incident.json')
        engine = m.Engine(self.root)
        self.assertFalse(engine.locations_ready)
        self.assertEqual(engine.locations.status()['counts'], {'blocked':1})

    def test_oversized_evidence_is_not_hashed_after_the_read_bound_rejects_it(self):
        directory = self.legacy('old', 'oversized')
        path = directory/'events.jsonl'
        with path.open('r+b') as stream: stream.truncate(store.MAX_INCIDENT_BYTES+1)
        with patch.object(store, 'sha256', side_effect=AssertionError('Oversized digest read')), \
                patch.object(m, 'sha256', side_effect=AssertionError('Oversized diagnostic read')):
            engine = m.Engine(self.root)
        self.assertFalse(engine.locations_ready)
        diagnostic = rows(self.root/'logs/system/evidence-integrity.jsonl')[-1]
        self.assertNotIn('original_sha256', diagnostic)
        self.assertIn('read bound', diagnostic['original_sha256_unavailable'])
        self.assertIsNone(engine.locations.status()['details'][0]['evidence_sha256'])

    def test_oversized_metadata_is_not_hashed_by_migration_recording(self):
        directory = self.legacy('old', 'oversized-meta')
        metadata = directory/'incident.json'
        with metadata.open('wb') as stream: stream.truncate(1024**2+1)
        original_hash = store.sha256
        def bounded_hash(path):
            if Path(path) == metadata: raise AssertionError('Oversized metadata read')
            return original_hash(path)
        with patch.object(store, 'sha256', side_effect=bounded_hash): engine = m.Engine(self.root)
        self.assertFalse(engine.locations_ready)
        self.assertIsNone(engine.locations.status()['details'][0]['metadata_sha256'])

    def prepare_unpublished_replay(self):
        engine = m.Engine(self.root); self.source()
        append = m.append_json
        def fail_summary(path, *args, **kwargs):
            if Path(path) == self.root/'logs/normalized/incidents.jsonl': raise OSError('synthetic crash')
            return append(path, *args, **kwargs)
        with patch.object(m, 'append_json', side_effect=fail_summary):
            with self.assertRaises(OSError): engine.poll()
        return engine

    def test_invalid_locator_paths_hold_checkpoint_and_emit_integrity_diagnostic(self):
        engine = self.prepare_unpublished_replay()
        for invalid in ('/outside/old', '../old', '/hp/incidents/old', 'day/./old', 'day//old', sqlite3.Binary(b'day/old')):
            with self.subTest(location=invalid):
                with engine.locations.database() as db: db.execute('UPDATE locations SET incident=?', (invalid,))
                with self.assertRaises(store.EvidenceIntegrityError): engine.poll()
                self.assertEqual(engine.state['offsets'], {})
                self.assertFalse(rows(self.root/'logs/system/parser-errors.jsonl'))
                self.assertFalse(rows(self.root/'logs/normalized/incidents.jsonl'))
                self.assertEqual(rows(self.root/'logs/system/event-locator-integrity.jsonl')[-1]['action'], 'HOLD_CHECKPOINT')

    def test_wrong_locator_root_stops_before_source_ingestion(self):
        engine = self.prepare_unpublished_replay()
        with engine.locations.database() as db: db.execute('UPDATE settings SET value=? WHERE key=?', ('/wrong-root', 'scope'))
        with self.assertRaises(store.EvidenceIntegrityError): m.Engine(self.root)
        self.assertFalse(engine.statepath.exists())
        self.assertEqual(rows(self.root/'logs/system/event-locator-integrity.jsonl')[-1]['action'], 'HOLD_CHECKPOINT')


class TmpfsTrust(unittest.TestCase):
    setUp = fixtures.StaticMountTrust.setUp
    reject = fixtures.StaticMountTrust.reject
    def test_agreeing_tmpfs_cannot_mask_exact_parent_or_child_static_paths(self):
        rendered, containers = copy.deepcopy(self.rendered), copy.deepcopy(self.containers)
        for target in ('/hp/detections', '/hp', '/hp/detections/iocs',
                       '/hp/other/../detections/iocs', '//hp/detections/iocs', '/hp/detections/./iocs'):
            with self.subTest(target=target):
                self.rendered, self.containers = copy.deepcopy(rendered), copy.deepcopy(containers)
                options = 'rw,nosuid,nodev,noexec,size=1m,mode=1777'
                self.rendered['services']['incidentd']['tmpfs'] = [target+':'+options]
                self.containers['incidentd']['HostConfig']['Tmpfs'] = {target:options}
                self.containers['incidentd']['Mounts'].append({'Type':'tmpfs','Source':'','Destination':target,'RW':True})
                self.reject()

    def test_legitimate_tmp_directory_remains_allowed(self):
        target = '/tmp'; options = 'rw,nosuid,nodev,noexec,size=128m,mode=1777'
        self.rendered['services']['incidentd']['tmpfs'] = [target+':'+options]
        self.containers['incidentd']['HostConfig']['Tmpfs'] = {target:options}
        self.containers['incidentd']['Mounts'].append({'Type':'tmpfs','Source':'','Destination':target,'RW':True})
        self.assertEqual(inventory.validate_runtime(self.rendered, self.containers, self.networks, self.root), [])
        self.assertTrue(inventory.verify_static_configuration(self.rendered, self.root, self.candidate))


if __name__ == '__main__': unittest.main()
