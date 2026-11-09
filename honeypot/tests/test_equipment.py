"""Synthetic inventory persistence and honest operational-status classification."""
from concurrent.futures import ThreadPoolExecutor
import datetime as dt
import json
import multiprocessing
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import equipment
from phase10.model import Phase10Error


def record(name='Workbench BLE', tracking='manual', **extra):
    return {'name': name, 'description': 'Synthetic equipment inventory entry',
            'category': 'sensor', 'active': True, 'tracking': tracking, **extra}


def create_in_process(path, name):
    equipment.EquipmentStore(path).save(record(name))


class EquipmentInventory(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        self.path = self.root / 'state/equipment.json'
        self.store = equipment.EquipmentStore(self.path)

    def test_read_empty_creates_nothing_and_roundtrip_keeps_custom_fields(self):
        self.assertEqual(self.store.list(), [])
        self.assertFalse(self.path.parent.exists())
        entry = self.store.save(record(equipment_class='BLE Scanners', value='$49.99'))
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.path.parent.stat().st_mode & 0o777, 0o700)
        self.assertEqual(equipment.EquipmentStore(self.path).list(), [entry])
        self.assertEqual(entry['equipment_class'], 'BLE Scanners')
        self.assertEqual(entry['value'], '$49.99')
        self.assertEqual(entry['reported_status'], 'unknown')
        self.assertIsNone(entry['reported_at'])
        self.assertEqual(len(entry['id']), 32)
        saved = self.store.save(record(name='Desk ESP32', tracking='heartbeat',
                                       id=entry['id'], equipment_class='ESP32', value='Lab asset A-12'))
        self.assertEqual(saved['id'], entry['id'])
        self.assertEqual(saved['created_at'], entry['created_at'])
        self.assertEqual(self.store.remove(entry['id']), saved)
        self.assertEqual(self.store.list(), [])

    def test_status_report_is_server_stamped_and_tracking_change_clears_old_report(self):
        entry = self.store.save(record())
        reported = self.store.report(entry['id'], 'degraded')
        self.assertEqual(reported['reported_status'], 'degraded')
        self.assertIsNotNone(equipment._instant(reported['reported_at']))
        changed = self.store.save(record(id=entry['id'], tracking='cowrie'))
        self.assertEqual(changed['reported_status'], 'unknown')
        self.assertIsNone(changed['reported_at'])
        with self.assertRaises(Phase10Error):
            self.store.report(entry['id'], 'operational')
        with self.assertRaises(Phase10Error):
            self.store.report(entry['id'], 'invented-state')

    def test_invalid_fields_do_not_create_or_modify_inventory(self):
        cases = [record(active=1), record(tracking='http://external.example'),
                 record(category='unregistered'), record(name=''), record(name='A' * 81),
                 record(description='D' * 501), record(name='Bad\nlabel'),
                 record(equipment_class='X' * 81), record(value='Bad\tvalue'),
                 record(value=49.99), record(reported_status='operational'),
                 record(reported_at='2026-11-01T00:00:00Z'), record(id=None)]
        for row in cases:
            with self.subTest(row=row), self.assertRaises((Phase10Error, TypeError)):
                self.store.save(row)
        self.assertFalse(self.path.parent.exists())

    def test_unknown_ids_and_quota_preserve_existing_entries(self):
        first = self.store.save(record())
        before = self.path.read_bytes()
        for operation in (lambda: self.store.save(record(id='f' * 32)),
                          lambda: self.store.remove('f' * 32),
                          lambda: self.store.report('f' * 32, 'offline')):
            with self.assertRaises(Phase10Error):
                operation()
            self.assertEqual(self.path.read_bytes(), before)
        with patch.object(equipment, 'MAX_ENTRIES', 1), self.assertRaises(Phase10Error):
            self.store.save(record('Second entry'))
        self.assertEqual(self.store.list(), [first])

    def test_corruption_duplicate_ids_and_nonprivate_files_fail_without_reset(self):
        entry = self.store.save(record())
        for raw in (b'{broken', json.dumps({'schema_version': 1, 'equipment': [entry, entry]}).encode(),
                    b'{"schema_version":1,"schema_version":1,"equipment":[]}'):
            with self.subTest(raw=raw):
                self.path.write_bytes(raw)
                with self.assertRaises(Phase10Error):
                    self.store.save(record('Another entry'))
                self.assertEqual(self.path.read_bytes(), raw)
        self.path.write_text(json.dumps({'schema_version': 1, 'equipment': [entry]}))
        self.path.chmod(0o644)
        with self.assertRaises(Phase10Error):
            self.store.list()

    def test_old_schema_one_entries_gain_empty_custom_fields_without_write(self):
        entry = self.store.save(record())
        entry.pop('equipment_class')
        entry.pop('value')
        self.path.write_text(json.dumps({'schema_version': 1, 'equipment': [entry]}))
        original = self.path.read_bytes()
        normalized = self.store.list()[0]
        self.assertEqual((normalized['equipment_class'], normalized['value']), ('', ''))
        self.assertEqual(self.path.read_bytes(), original)

    def test_aliases_are_rejected_and_atomic_failure_keeps_original(self):
        self.store.save(record())
        original = self.path.read_bytes()
        with patch.object(equipment.os, 'replace', side_effect=OSError('Synthetic failure')):
            with self.assertRaises(OSError):
                self.store.save(record('Another entry'))
        self.assertEqual(self.path.read_bytes(), original)
        self.assertEqual(sorted(path.name for path in self.path.parent.iterdir()), ['equipment.json'])
        protected = self.root / 'protected'
        protected.write_bytes(b'SYNTHETIC unchanged content')
        protected.chmod(0o600)
        self.path.unlink()
        self.path.symlink_to(protected)
        with self.assertRaises(OSError):
            self.store.save(record())
        self.path.unlink()
        os.link(protected, self.path)
        with self.assertRaises(Phase10Error):
            self.store.save(record())
        self.assertEqual(protected.read_bytes(), b'SYNTHETIC unchanged content')
        linked = self.root / 'linked'
        linked.symlink_to(self.path.parent, target_is_directory=True)
        with self.assertRaises(OSError):
            equipment.EquipmentStore(linked / 'equipment.json').list()

    def test_concurrent_threads_and_processes_do_not_lose_entries(self):
        with ThreadPoolExecutor(max_workers=6) as pool:
            list(pool.map(lambda i: self.store.save(record('Thread ' + str(i))), range(12)))
        context = multiprocessing.get_context('fork')
        processes = [context.Process(target=create_in_process, args=(str(self.path), 'Process ' + str(i)))
                     for i in range(6)]
        for process in processes:
            process.start()
        for process in processes:
            process.join(timeout=5)
            self.assertEqual(process.exitcode, 0)
        entries = self.store.list()
        self.assertEqual(len(entries), 18)
        self.assertEqual(len({row['id'] for row in entries}), 18)


class EquipmentObservation(unittest.TestCase):
    def setUp(self):
        self.now = dt.datetime(2026, 11, 1, 12, 0, tzinfo=dt.timezone.utc)
        self.entry = {**record(), 'reported_status': 'operational', 'reported_at': '2026-11-01T11:59:00Z'}

    def state(self, **kwargs):
        return equipment.operational_status(self.entry, kwargs.get('health_status', 'not_collected'),
                                            kwargs.get('health', {}), kwargs.get('jobs', {}), now=self.now)

    def test_manual_is_explicit_and_inactive_never_stops_equipment(self):
        self.entry['reported_at'] = '2020-01-01T00:00:00Z'
        result = self.state()
        self.assertEqual(result['status'], 'operational')
        self.assertEqual(result['source'], 'manual')
        self.assertIn('not an automatic', result['note'])
        self.entry['active'] = False
        result = self.state()
        self.assertEqual(result['status'], 'inactive')
        self.assertIn('not stopped', result['note'])

    def test_heartbeat_expiration_missing_and_future_times_are_unknown(self):
        self.entry['tracking'] = 'heartbeat'
        self.assertEqual(self.state()['status'], 'operational')
        for stamp in ('2026-11-01T11:57:59Z', '2026-11-01T12:00:10Z', None, 'bad'):
            self.entry['reported_at'] = stamp
            with self.subTest(stamp=stamp):
                result = self.state()
                self.assertEqual(result['status'], 'unknown')
                self.assertTrue(result['stale'])

    def test_saved_service_status_requires_recent_valid_observation(self):
        self.entry['tracking'] = 'cowrie'
        health = {'timestamp': '2026-11-01T11:59:00Z', 'stale': False,
                  'services': [{'name': 'cowrie', 'state': 'running', 'health': 'healthy'}]}
        result = self.state(health_status='available', health=health)
        self.assertEqual((result['status'], result['source']), ('operational', 'saved_telemetry'))
        self.assertIn('not a fresh', result['note'])
        for observed, expected in (({'state': 'running', 'health': 'unhealthy'}, 'degraded'),
                                   ({'state': 'exited', 'health': 'none'}, 'offline'),
                                   ({'state': 'unknown'}, 'unknown')):
            health['services'][0] = {'name': 'cowrie', **observed}
            self.assertEqual(self.state(health_status='available', health=health)['status'], expected)
        health['timestamp'] = '2026-11-01T11:00:00Z'
        self.assertTrue(self.state(health_status='available', health=health)['stale'])
        self.assertEqual(self.state(health_status='available', health=health)['status'], 'unknown')

    def test_capture_and_analyzer_availability_are_distinct_sources(self):
        self.entry['tracking'] = 'pcap'
        health = {'timestamp': '2026-11-01T12:00:00Z', 'stale': False, 'pcap_running': False}
        self.assertEqual(self.state(health_status='available', health=health)['status'], 'offline')
        self.entry['tracking'] = 'sentinel'
        self.assertEqual(self.state(jobs={'available': True})['status'], 'ready')
        self.assertEqual(self.state(jobs={'available': True, 'jobs': [{'status': 'running'}]})['status'], 'operational')
        self.assertEqual(self.state(jobs={'available': False})['status'], 'offline')


if __name__ == '__main__':
    unittest.main()
