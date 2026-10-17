"""Correctness regressions for PR #19 and issue #20; synthetic fixtures only."""
import copy
from contextlib import contextmanager
import datetime as dt
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
import incidentd as engine
import evidence_store as evidence
import runtime_inventory as inventory
import stage7_qualification as qualification
from test_demo import fixture

RAW = {'src_ip': '192.0.2.10', 'session': 'synthetic', 'eventid': 'cowrie.login.failed'}
START = dt.datetime(2026, 10, 17, 23, 59, tzinfo=dt.timezone.utc).timestamp()


def rows(path):
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


@contextmanager
def clock(now):
    stamp = dt.datetime.fromtimestamp(now, dt.timezone.utc).isoformat().replace('+00:00', 'Z')
    with patch.object(engine.time, 'time', return_value=now), patch.object(engine, 'utc', return_value=stamp):
        yield stamp


class ReplayRecovery(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copytree(ROOT/'detections', self.root/'detections')
        (self.root/'captures').mkdir()
        self.engine = engine.Engine(self.root)
        self.source = self.root/'logs/cowrie/cowrie.json'

    def write_source(self, raw=RAW):
        self.source.parent.mkdir(parents=True, exist_ok=True)
        with self.source.open('a') as stream: stream.write(json.dumps(raw)+'\n')

    def evidence_files(self):
        return sorted((self.root/'incidents').rglob('events.jsonl'))

    def metadata(self):
        return [json.loads(p.read_text()) for p in sorted((self.root/'incidents').rglob('incident.json'))]

    def retained(self):
        return {p: p.read_bytes() for p in self.evidence_files()}

    def assert_retained(self, original):
        self.assertEqual(self.retained(), original)

    def test_committed_replay_across_windows_and_utc_day(self):
        with clock(START): self.engine.process('cowrie', RAW, 'stable')
        original = self.retained()
        self.assertEqual(next(iter(original)).parents[1].name, '2026-10-17')
        self.engine.prune(START + 3*self.engine.window)
        self.assertFalse(self.engine.state['groups'])
        with clock(START + 3*self.engine.window), patch.object(Path, 'glob', side_effect=AssertionError('Replay must not scan history')):
            self.engine.process('cowrie', RAW, 'stable')
        with clock(START + 86400): engine.Engine(self.root).process('cowrie', RAW, 'stable')
        self.assert_retained(original)
        self.assertEqual(self.metadata()[0]['related_events'], ['stable'])
        self.assertEqual(len(rows(self.root/'logs/normalized/events.jsonl')), 3)

    def test_orphan_poll_replay_across_windows_and_day_uses_retained_chronology(self):
        self.write_source()
        with clock(START), patch.object(engine, 'evidence_commit', side_effect=OSError('synthetic metadata crash')):
            with self.assertRaises(OSError): self.engine.poll()
        self.assertEqual(self.engine.state['offsets'], {})
        self.assertEqual(self.metadata(), [])
        original = self.retained()
        saved = rows(next(iter(original)))[0]['normalized']
        with clock(START + 3*self.engine.window):
            restarted = engine.Engine(self.root); restarted.poll()
        self.assert_retained(original)
        meta = self.metadata()[0]
        self.assertEqual(meta['timestamp_start'], saved['timestamp'])
        self.assertEqual(meta['timestamp_end'], saved['timestamp'])
        self.assertEqual(meta['source_ip'], saved['source_ip'])
        self.assertEqual(restarted.state['offsets']['logs/cowrie/cowrie.json']['offset'], self.source.stat().st_size)
        self.assertEqual(rows(self.root/'logs/normalized/events.jsonl')[-1], saved)

    def test_invalid_timestamp_orphan_uses_original_fallback(self):
        raw = {**RAW, 'timestamp': '../../invalid'}
        with clock(START) as stamp, patch.object(engine, 'evidence_commit', side_effect=OSError('synthetic crash')):
            with self.assertRaises(OSError): self.engine.process('cowrie', raw, 'stable')
        original = self.retained()
        with clock(START + 86400): engine.Engine(self.root).process('cowrie', raw, 'stable')
        self.assert_retained(original)
        self.assertEqual(self.metadata()[0]['timestamp_start'], stamp)

    def test_forged_valid_timestamp_cannot_choose_location(self):
        with clock(START): self.engine.process('cowrie', {**RAW, 'timestamp': '2099-01-01T00:00:00Z'}, 'stable')
        self.assertEqual(self.evidence_files()[0].parents[1].name, '2026-10-17')

    def test_replay_finds_original_after_event_count_segment_rollover(self):
        self.engine.rules['max_events_per_incident'] = 1
        with clock(START):
            self.engine.process('cowrie', RAW, 'first')
            self.engine.process('cowrie', RAW, 'second')
            original = self.retained()
            self.engine.process('cowrie', RAW, 'first')
        with clock(START + 86400): engine.Engine(self.root).process('cowrie', RAW, 'first')
        self.assert_retained(original)
        self.assertEqual(len(original), 2)
        self.assertTrue(all(len(meta['related_events']) == 1 for meta in self.metadata()))

    def test_orphan_replay_finds_original_after_byte_segment_rollover(self):
        with clock(START): self.engine.process('cowrie', RAW, 'first')
        size = self.evidence_files()[0].stat().st_size
        with clock(START), patch.object(engine, 'MAX_INCIDENT_BYTES', size+20):
            with patch.object(engine, 'evidence_commit', side_effect=OSError('synthetic crash')):
                with self.assertRaises(OSError): self.engine.process('cowrie', RAW, 'second')
        original = self.retained()
        with clock(START + 86400): engine.Engine(self.root).process('cowrie', RAW, 'second')
        self.assert_retained(original)
        self.assertEqual(len(original), 2)
        self.assertEqual(sorted(meta['related_events'] for meta in self.metadata()), [['first'], ['second']])

    def test_reservation_survives_crash_before_append(self):
        with clock(START), patch.object(engine, 'evidence_append', side_effect=OSError('synthetic crash before append')):
            with self.assertRaises(OSError): self.engine.process('cowrie', RAW, 'stable')
        location = self.engine.locations.lookup('stable')
        self.assertFalse(location[1]); self.assertFalse(self.evidence_files())
        with clock(START + 86400): engine.Engine(self.root).process('cowrie', RAW, 'stable')
        self.assertEqual(self.evidence_files(), [location[0]/'events.jsonl'])

    def test_append_before_locator_confirmation_survives_restart(self):
        remember = self.engine.locations.remember
        def fail_confirmation(*args, **kwargs):
            if kwargs.get('evidenced'): raise OSError('synthetic crash after evidence fsync')
            return remember(*args, **kwargs)
        with clock(START), patch.object(self.engine.locations, 'remember', side_effect=fail_confirmation):
            with self.assertRaises(OSError): self.engine.process('cowrie', RAW, 'stable')
        original = self.retained()
        with clock(START + 86400): engine.Engine(self.root).process('cowrie', RAW, 'stable')
        self.assert_retained(original)
        self.assertEqual(self.metadata()[0]['related_events'], ['stable'])

    def test_reservation_failure_never_appends_evidence(self):
        with patch.object(self.engine.locations, 'remember', side_effect=OSError('synthetic index failure')):
            with self.assertRaises(OSError): self.engine.process('cowrie', RAW, 'stable')
        self.assertFalse(self.evidence_files())

    def test_committed_and_orphan_replays_reject_changed_raw_or_source(self):
        with clock(START): self.engine.process('cowrie', RAW, 'stable')
        original = self.retained()
        for missing_metadata in (False, True):
            if missing_metadata: next((self.root/'incidents').rglob('incident.json')).unlink()
            for source, raw in [('cowrie', {**RAW, 'session': 'changed'}), ('opencanary', RAW)]:
                with self.subTest(orphan=missing_metadata, source=source), clock(START + 86400):
                    with self.assertRaisesRegex(evidence.EvidenceIntegrityError, 'Replay source differs'):
                        engine.Engine(self.root).process(source, raw, 'stable')
                self.assert_retained(original)

    def test_missing_located_evidence_fails_closed_without_relocation(self):
        with clock(START): self.engine.process('cowrie', RAW, 'stable')
        metadata = next((self.root/'incidents').rglob('incident.json')); original = metadata.read_bytes()
        self.evidence_files()[0].unlink()
        with clock(START + 86400):
            with self.assertRaises(evidence.EvidenceIntegrityError): engine.Engine(self.root).process('cowrie', RAW, 'stable')
        self.assertFalse(self.evidence_files()); self.assertEqual(metadata.read_bytes(), original)

    def summary_recovery(self, stale):
        offset = 0
        if stale:
            self.write_source()
            with clock(START): self.engine.poll()
            offset = self.source.stat().st_size
        self.write_source({**RAW, 'eventid': 'cowrie.login.success'})
        append = engine.append_json
        def fail_summary(path, *args, **kwargs):
            if Path(path) == self.root/'logs/normalized/incidents.jsonl': raise OSError('synthetic publication crash')
            return append(path, *args, **kwargs)
        with clock(START), patch.object(engine, 'append_json', side_effect=fail_summary):
            with self.assertRaises(OSError): self.engine.poll()
        self.assertEqual(self.engine.state['offsets'].get('logs/cowrie/cowrie.json', {}).get('offset', 0), offset)
        original = self.retained()
        self.assertEqual(len(self.metadata()[0]['related_events']), 1+int(stale))
        for report in (self.root/'incidents').rglob('incident.md'): report.unlink()
        with clock(START + 86400):
            restarted = engine.Engine(self.root)
            with patch.object(engine, 'append_json', side_effect=fail_summary):
                with self.assertRaises(OSError): restarted.poll()
            self.assertEqual(restarted.state['offsets'].get('logs/cowrie/cowrie.json', {}).get('offset', 0), offset)
            restarted.poll()
        self.assert_retained(original)
        latest = rows(self.root/'logs/normalized/incidents.jsonl')[-1]
        self.assertEqual(latest['event_count'], 1+int(stale)); self.assertEqual(latest['severity'], 'HIGH')
        self.assertEqual(restarted.state['offsets']['logs/cowrie/cowrie.json']['offset'], self.source.stat().st_size)
        self.assertTrue(next((self.root/'incidents').rglob('incident.md')).exists())

    def test_absent_summary_republished_before_checkpoint(self): self.summary_recovery(False)
    def test_stale_summary_republished_before_checkpoint(self): self.summary_recovery(True)

    def test_legacy_location_backfill_recovers_original_orphan(self):
        with clock(START), patch.object(engine, 'evidence_commit', side_effect=OSError('synthetic crash')):
            with self.assertRaises(OSError): self.engine.process('cowrie', RAW, 'stable')
        original = self.retained()
        self.engine.locations.path.unlink()  # Synthetic pre-index upgrade fixture.
        with clock(START + 86400): engine.Engine(self.root).process('cowrie', RAW, 'stable')
        self.assert_retained(original)

    def test_location_backfill_is_bounded_and_holds_source_checkpoint(self):
        record = {'event_id': 'seed', 'normalized': engine.normalize('cowrie', RAW), 'raw': RAW}
        self.engine.locations.path.unlink()
        for i in range(65):
            path = self.root/'incidents/2026-10-16'/str(i); path.mkdir(parents=True)
            record['event_id'] = record['normalized']['event_id'] = str(i)
            evidence.append(path/'events.jsonl', record)
        self.write_source()
        with patch.object(engine, 'evidence_records', wraps=evidence.records) as scanned:
            restarted = engine.Engine(self.root)
            self.assertLessEqual(scanned.call_count, 32)
        self.assertFalse(restarted.locations_ready)
        with self.assertRaises(evidence.ReplayIndexPending): restarted.process('cowrie', RAW, 'unknown')
        with patch.object(engine, 'evidence_records', wraps=evidence.records) as scanned:
            restarted.poll()
            self.assertLessEqual(scanned.call_count, 32)
        self.assertEqual(restarted.state['offsets'], {}); self.assertFalse(restarted.statepath.exists())
        restarted.poll()
        self.assertTrue(restarted.locations_ready)
        self.assertEqual(restarted.state['offsets']['logs/cowrie/cowrie.json']['offset'], self.source.stat().st_size)

    def test_unknown_corrupt_history_blocks_backfill_and_preserves_original(self):
        self.engine.locations.path.unlink()
        path = self.root/'incidents/2026-10-16/corrupt/events.jsonl'; path.parent.mkdir(parents=True)
        path.write_bytes(b'\0synthetic corrupt evidence\n'); original = path.read_bytes()
        self.write_source()
        restarted = engine.Engine(self.root); restarted.poll()
        self.assertFalse(restarted.locations_ready); self.assertEqual(restarted.state['offsets'], {})
        self.assertEqual(path.read_bytes(), original)
        self.assertEqual(rows(self.root/'logs/system/evidence-integrity.jsonl')[-1]['original_sha256'], hashlib.sha256(original).hexdigest())

    def test_locator_corruption_is_not_replaced(self):
        path = self.engine.locations.path; path.write_bytes(b'synthetic corrupt sqlite')
        with self.assertRaises(evidence.EvidenceIntegrityError): engine.Engine(self.root)
        self.assertEqual(path.read_bytes(), b'synthetic corrupt sqlite')

    def test_locator_path_traversal_is_rejected(self):
        with self.engine.locations.database() as db:
            db.execute('INSERT INTO locations VALUES (?, ?, ?)', ('bad', '../outside', 1))
        with self.assertRaises(evidence.EvidenceIntegrityError): self.engine.process('cowrie', RAW, 'bad')

    def test_integrity_diagnostic_satisfies_stage7_digest_contract(self):
        path = self.root/'incidents/2026-10-17/synthetic/events.jsonl'; path.parent.mkdir(parents=True)
        path.write_bytes(b'\0synthetic corrupt record\n'); original = path.read_bytes()
        engine.Engine(self.root)
        diagnostic = rows(self.root/'logs/system/evidence-integrity.jsonl')[-1]
        digest = hashlib.sha256(original).hexdigest()
        self.assertEqual(diagnostic['original_sha256'], digest)
        diagnostic['path'] = '/hp/incidents/'+str(path.relative_to(self.root/'incidents'))
        historical = types.SimpleNamespace(ORIGINAL=path, ORIGINAL_HASH=digest)
        with patch.object(qualification, 'RUNTIME', self.root), patch.object(qualification.review, 'retained_module', return_value=historical), patch.object(qualification.demo, 'rows', return_value=[diagnostic]):
            self.assertEqual(qualification.integrity_startup()['status'], 'PASS')
        self.assertEqual(path.read_bytes(), original)


class StaticMountTrust(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)/'runtime'; self.candidate = Path(self.temp.name)/'candidate'
        for directory in (self.root, self.candidate):
            for name in ('configs', 'detections', 'dashboards'): shutil.copytree(ROOT/name, directory/name)
        self.rendered, self.containers, self.networks, old = fixture()
        for service in self.rendered['services'].values():
            for volume in service.get('volumes', []): volume['source'] = volume['source'].replace(str(old), str(self.root))
        for container in self.containers.values():
            container['Config']['Labels']['com.docker.compose.project.working_dir'] = str(self.root)
            for mount in container['Mounts']: mount['Source'] = mount['Source'].replace(str(old), str(self.root))

    def reject(self):
        self.assertTrue(inventory.validate_runtime(self.rendered, self.containers, self.networks, self.root))
        with self.assertRaises(ValueError): inventory.verify_static_configuration(self.rendered, self.root, self.candidate)

    def test_full_reviewed_policy_and_content_pass(self):
        self.assertEqual(inventory.validate_runtime(self.rendered, self.containers, self.networks, self.root), [])
        hashes = inventory.verify_static_configuration(self.rendered, self.root, self.candidate)
        self.assertIn('detections/correlation/rules.json', hashes)
        self.assertIn('configs/cowrie/cowrie.cfg', hashes)
        self.assertIn('dashboards/honeypot-overview.json', hashes)

    def test_agreeing_external_redirect_is_rejected(self):
        external = Path(self.temp.name)/'external'; external.write_text('unreviewed')
        for volume in self.rendered['services']['incidentd']['volumes']: volume['source'] = str(external)
        for mount in self.containers['incidentd']['Mounts']: mount['Source'] = str(external)
        self.reject()

    def test_agreeing_omission_is_rejected_for_every_service(self):
        for name in inventory.STATIC_MOUNTS:
            with self.subTest(service=name):
                rendered, containers = copy.deepcopy(self.rendered), copy.deepcopy(self.containers)
                self.rendered['services'][name]['volumes'] = []
                self.containers[name]['Mounts'] = [m for m in self.containers[name]['Mounts'] if m['Destination'] not in inventory.STATIC_MOUNTS[name]]
                self.reject()
                self.rendered, self.containers = rendered, containers

    def test_agreeing_destination_change_is_rejected(self):
        self.rendered['services']['incidentd']['volumes'][0]['target'] = '/hp/elsewhere'
        self.containers['incidentd']['Mounts'][0]['Destination'] = '/hp/elsewhere'
        self.reject()

    def test_agreeing_writable_static_mount_is_rejected(self):
        self.rendered['services']['incidentd']['volumes'][0]['read_only'] = False
        self.containers['incidentd']['Mounts'][0]['RW'] = True
        self.reject()

    def test_duplicate_static_target_is_rejected(self):
        volume = copy.deepcopy(self.rendered['services']['incidentd']['volumes'][0])
        self.rendered['services']['incidentd']['volumes'].append(volume)
        self.reject()

    def test_extra_mount_cannot_cover_static_subtree(self):
        self.rendered['services']['incidentd']['volumes'].append({'type': 'bind', 'source': '/external', 'target': '/hp/detections/iocs', 'read_only': True})
        self.containers['incidentd']['Mounts'].append({'Type': 'bind', 'Source': '/external', 'Destination': '/hp/detections/iocs', 'RW': False})
        self.reject()

    def test_same_content_symlink_is_rejected(self):
        config = self.root/'configs/cowrie/cowrie.cfg'
        config.unlink(); config.symlink_to(self.candidate/'configs/cowrie/cowrie.cfg')
        with self.assertRaisesRegex(ValueError, 'symlink'):
            inventory.verify_static_configuration(self.rendered, self.root, self.candidate)

    def test_static_policy_matches_reviewed_compose(self):
        try: import yaml
        except ImportError: self.skipTest('PyYAML unavailable')
        compose = yaml.safe_load((ROOT/'docker-compose.yml').read_text())
        actual = {}
        for name, service in compose['services'].items():
            actual[name] = {}
            for volume in service.get('volumes', []):
                if volume.startswith(('./configs/', './detections:', './detections/', './dashboards:')):
                    source, target, mode = volume.split(':')
                    self.assertEqual(mode, 'ro'); actual[name][target] = source.removeprefix('./')
        self.assertEqual(actual, inventory.STATIC_MOUNTS)


if __name__ == '__main__': unittest.main()
