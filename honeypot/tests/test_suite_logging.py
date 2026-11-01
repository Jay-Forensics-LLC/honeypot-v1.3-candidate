"""Operational metadata is bounded, private and independent from evidence."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from operational_log import SuiteLog, correlation, get_log


class SuiteLogging(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        self.log = SuiteLog(self.root, 'dashboard')

    def test_readonly_construction_levels_and_private_records(self):
        self.assertEqual(self.log.read_recent()['status'], 'not_collected')
        self.assertEqual(list(self.root.iterdir()), [])
        with patch.dict(os.environ, {'HP_LOG_LEVEL': 'WARNING'}):
            warning = SuiteLog(self.root, 'suite')
        self.assertFalse(warning.event('suite.started'))
        self.assertTrue(warning.event('suite.failed', level='ERROR', error_code='test_failure'))
        self.assertEqual(self.log.path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.log.path.parent.stat().st_mode & 0o777, 0o700)
        self.assertEqual(self.log.read_recent()['entries'][0]['event'], 'suite.failed')
        with patch.dict(os.environ, {'HP_LOG_LEVEL': 'invalid'}):
            self.assertEqual(SuiteLog(self.root).level, 'INFO')

    def test_closed_fields_drop_credentials_evidence_and_unbounded_text(self):
        self.log.event('http.completed', route='/api/import', method='POST', status_code=200,
                       records=3, payload='PRIVATE_CAPTURE', token='PRIVATE_TOKEN',
                       password='PRIVATE_PASSWORD', exception='PRIVATE_EXCEPTION',
                       path='/private/source', ip='192.0.2.1',
                       operation='unsafe\ninput', job_id='not-a-job', error_type='unsafe exception',
                       bytes=True, duration_ms=10**1000, plugin={'secret': 'PRIVATE'})
        data = self.log.path.read_text()
        self.assertNotIn('PRIVATE', data)
        self.assertNotIn('/private', data)
        self.assertNotIn('192.0.2.1', data)
        row = json.loads(data)
        self.assertEqual(row['records'], 3)
        self.assertNotIn('bytes', row)
        self.assertNotIn('duration_ms', row)
        self.assertNotIn('operation', row)

    def test_correlation_and_binding_route_nested_events_without_global_leak(self):
        with self.log.bind(), correlation() as first:
            get_log('imports').event('worker.completed', records=2)
            with correlation() as second:
                get_log('store').event('store.committed', import_id='a' * 64)
            self.log.event('http.completed', status_code=200)
        self.assertNotEqual(first, second)
        rows = list(reversed(self.log.read_recent()['entries']))
        self.assertEqual([row['correlation_id'] for row in rows], [first, second, first])
        self.assertEqual([row['component'] for row in rows], ['imports', 'store', 'dashboard'])
        self.log.event('suite.stopped')
        self.assertNotIn('correlation_id', self.log.read_recent()['entries'][0])

    def test_rotation_and_threaded_writers_preserve_complete_json(self):
        self.log.event('suite.started')
        with self.log.path.open('ab') as stream:
            stream.truncate(20 * 1024**2 + 1)
        self.log.event('suite.rotated')
        archive = Path(str(self.log.path) + '.1')
        self.assertEqual(archive.stat().st_size, 20 * 1024**2 + 1)
        self.assertEqual(archive.stat().st_mode & 0o777, 0o600)
        with ThreadPoolExecutor(max_workers=6) as pool:
            self.assertTrue(all(pool.map(lambda number: self.log.event('http.completed', count=number), range(60))))
        rows = [json.loads(line) for line in self.log.path.read_text().splitlines()]
        self.assertEqual(len(rows), 61)
        self.assertEqual(sorted(row['count'] for row in rows if 'count' in row), list(range(60)))

    def test_write_failure_is_reported_without_raising_and_links_are_refused(self):
        with patch('operational_log.append_json', side_effect=OSError('PRIVATE_FAILURE')):
            self.assertFalse(self.log.event('suite.failed', error_type='OSError'))
        self.assertEqual(self.log.status()['write_failures'], 1)
        self.assertEqual(self.log.status()['last_error'], 'log_write_failed')
        self.assertNotIn('PRIVATE_FAILURE', json.dumps(self.log.status()))
        self.log.path.parent.mkdir(parents=True)
        protected = self.root / 'protected'
        protected.write_text('SYNTHETIC unchanged bytes')
        expected = hashlib.sha256(protected.read_bytes()).hexdigest()
        self.log.path.symlink_to(protected)
        self.assertFalse(self.log.event('suite.failed'))
        self.assertEqual(self.log.read_recent()['status'], 'unavailable')
        self.assertEqual(hashlib.sha256(protected.read_bytes()).hexdigest(), expected)

    def test_read_filters_archives_and_sanitizes_persisted_records(self):
        self.log.event('suite.started', level='INFO')
        os.replace(self.log.path, Path(str(self.log.path) + '.1'))
        self.log.child('jobs').event('job.failed', level='ERROR', job_id='a' * 32,
                                     error_code='analysis_failed')
        with self.log.path.open('a') as stream:
            stream.write('malformed PRIVATE_TEST\n')
            stream.write(json.dumps({'timestamp': '2026-11-01T00:00:00Z', 'level': 'WARNING',
                                     'component': 'dashboard', 'event': 'http.completed',
                                     'password': 'PRIVATE_PASSWORD', 'route': '/api/state'}) + '\n')
        self.assertEqual(len(self.log.read_recent()['entries']), 3)
        errors = self.log.read_recent(level='ERROR', component='jobs')['entries']
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]['error_code'], 'analysis_failed')
        self.assertNotIn('PRIVATE', json.dumps(self.log.read_recent()))
        for options in ({'limit': 0}, {'limit': 201}, {'level': 'BOGUS'}, {'component': 'untrusted'}):
            with self.assertRaises(ValueError):
                self.log.read_recent(**options)

    def test_cli_help_success_rejection_and_private_log_root_passthrough(self):
        import hp
        with patch.object(hp, 'ROOT', self.root), patch.object(sys, 'argv', ['hp', '--help']), \
                patch.object(hp, '_main', side_effect=SystemExit(0)):
            with self.assertRaises(SystemExit):
                hp.main()
        self.assertEqual(self.log.read_recent()['entries'][0]['event'], 'cli.completed')
        with patch.object(hp, 'ROOT', self.root), patch.object(sys, 'argv', ['hp', 'PRIVATE_BAD_COMMAND']), \
                patch.object(hp, '_main', side_effect=SystemExit(2)):
            with self.assertRaises(SystemExit):
                hp.main()
        self.assertEqual(self.log.read_recent()['entries'][0]['event'], 'cli.rejected')
        self.assertNotIn('PRIVATE', self.log.path.read_text())
        with patch.object(sys, 'argv', ['hp', 'dashboard', '--log-root', '/private/operator']), \
                patch('dashboard.serve', return_value=0) as serve:
            self.assertEqual(hp._main(), 0)
        self.assertEqual(serve.call_args.kwargs, {'log_root': Path('/private/operator')})

    def test_import_worker_events_include_durations_and_shared_correlation(self):
        from phase10.policy import Policy
        from phase10.service import parse_report
        from phase10.store import Store

        raw = b'{"id":"synthetic","type":"DNS_NAME","data":"example.org"}\n'
        policy = Policy(enabled=True, plugins=('bbot',))
        context = policy.context(hashlib.sha256(raw).hexdigest(), '2026-11-01T00:00:00Z')
        with self.log.bind(), correlation() as identifier:
            findings = parse_report('bbot', 'jsonl', raw, context, 5)
            store = Store(self.root / 'imports', policy)
            store.save('bbot', 'jsonl', raw, findings, context['imported_at'])
            store.save('bbot', 'jsonl', raw, findings, context['imported_at'])
            store.export()
        entries = self.log.read_recent()['entries']
        self.assertEqual({row['event'] for row in entries},
                         {'worker.started', 'worker.completed', 'store.committed',
                          'store.deduplicated', 'store.exported'})
        self.assertTrue(all(row['correlation_id'] == identifier for row in entries))
        self.assertNotIn('example.org', self.log.path.read_text())
        self.assertIn('duration_ms', next(row for row in entries if row['event'] == 'worker.completed'))


if __name__ == '__main__':
    unittest.main()
