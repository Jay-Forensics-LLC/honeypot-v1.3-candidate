import copy
import datetime as dt
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import health_snapshot as snapshot
import hp


class SavedHealth(unittest.TestCase):
    def setUp(self):
        self.now = dt.datetime(2026, 10, 6, tzinfo=dt.timezone.utc)
        self.row = {'timestamp': self.now.isoformat(), 'boot_id': 'current',
                    'severity': 'LOW', 'problems': [], 'guard': {'ok': True},
                    'pcap_running': True, 'capture': {'ok': True},
                    'containers': {name: {'state': 'running', 'health': 'healthy'}
                                   for name in snapshot.SERVICES}}

    def check(self, row=None):
        return snapshot.problems(self.row if row is None else row, 'current', self.now)

    def test_fresh_same_boot(self):
        self.assertEqual(self.check(), [])

    def test_previous_boot_and_legacy_snapshot(self):
        for value in ('previous', None):
            self.row['boot_id'] = value
            self.assertTrue(self.check())

    def test_stale_future_and_invalid_timestamp(self):
        for value in ('2026-10-05T23:56:59Z', '2026-10-06T00:00:06Z',
                      '2026-10-06T00:00:00', 'bad', None):
            self.row['timestamp'] = value
            self.assertTrue(self.check())

    def test_unhealthy_missing_and_failed_checks(self):
        for key, value in [('containers', {}), ('guard', {}), ('capture', {}),
                           ('pcap_running', False), ('severity', 'CRITICAL'),
                           ('problems', ['pipeline failed'])]:
            row = copy.deepcopy(self.row); row[key] = value
            self.assertTrue(self.check(row))

    def test_missing_snapshot(self):
        self.assertTrue(self.check({}))

    def test_malformed_nested_state_fails_closed(self):
        for key in ('guard', 'capture', 'containers', 'problems'):
            row = copy.deepcopy(self.row); row[key] = None
            self.assertTrue(self.check(row))

    def test_status_rejects_previous_boot_without_modifying_snapshot(self):
        row=copy.deepcopy(self.row);row['boot_id']='previous'
        original=copy.deepcopy(row)
        with patch.object(hp,'read_json',return_value=row), \
             patch.object(hp,'boot_id',return_value='current'), patch('builtins.print'):
            self.assertEqual(hp.status(),1)
        self.assertEqual(row,original)

    def test_status_and_health_fail_for_saved_failure(self):
        with patch.object(hp, 'read_json', return_value=self.row), \
             patch.object(hp, 'snapshot_problems', return_value=['pipeline failed']), \
             patch('builtins.print'):
            self.assertEqual(hp.status(), 1)
            self.assertEqual(hp.health(), 1)

    def test_status_succeeds_for_validated_saved_observation(self):
        with patch.object(hp, 'read_json', return_value=self.row), \
             patch.object(hp, 'snapshot_problems', return_value=[]), \
             patch('builtins.print'):
            self.assertEqual(hp.status(), 0)


if __name__ == '__main__':
    unittest.main()
