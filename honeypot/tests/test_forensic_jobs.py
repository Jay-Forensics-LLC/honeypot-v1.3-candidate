"""Synthetic companion processes exercise job boundaries without capture services."""
import json
import os
from pathlib import Path
import struct
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from phase10.jobs import JobManager, _usage, _directory
from phase10.model import Phase10Error


class ForensicJobs(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.companion = self.root / 'companion'
        self.analyzer = self.companion / 'tools/evidence_lab/analyze.py'
        self.analyzer.parent.mkdir(parents=True)
        self.capture = self.root / 'capture.pcap'
        self.capture.write_bytes(struct.pack('<IHHIIII', 0xa1b2c3d4, 2, 4, 0, 0, 65535, 1))
        self.imports = []
        self.manager = JobManager(self.companion, self.root / 'private-jobs', self.accept)
        self.addCleanup(self.manager.close)
        self.stub()

    def test_workspace_usage_keeps_one_child_directory_open(self):
        workspace = self.root / 'usage-jobs'
        workspace.mkdir(mode=0o700)
        wide = workspace / 'wide'
        wide.mkdir(mode=0o700)
        parent = wide
        for index in range(40):
            child = parent / f'd{index:02d}'
            child.mkdir(mode=0o700)
            blob = child / 'f'
            blob.write_bytes(b'x')
            blob.chmod(0o600)
            parent = child
        root = _directory(workspace)
        self.addCleanup(os.close, root)
        open_count = {'now': 0, 'max': 0}
        real_open, real_close = os.open, os.close

        def counting_open(*args, **kwargs):
            descriptor = real_open(*args, **kwargs)
            open_count['now'] += 1
            open_count['max'] = max(open_count['max'], open_count['now'])
            return descriptor

        def counting_close(descriptor):
            open_count['now'] -= 1
            return real_close(descriptor)

        with patch('phase10.jobs.os.open', counting_open), patch('phase10.jobs.os.close', counting_close):
            self.assertEqual(_usage(root), 40)
        self.assertLessEqual(open_count['max'], 2)
        self.assertEqual(open_count['now'], 0)

    def accept(self, path):
        self.assertEqual(json.loads((path / 'state.json').read_text())['status'], 'COMPLETE')
        self.assertTrue((path / 'SHA256SUMS').is_file())
        self.imports.append(path)
        return 'a' * 64

    def stub(self, body=''):
        self.analyzer.write_text('''import json, os, pathlib, sys, time
out = pathlib.Path(sys.argv[sys.argv.index('--output') + 1])
out.mkdir(mode=0o700)
(out/'state.json').write_text(json.dumps({'status':'INCOMPLETE','stage':'ingestion'}))
''' + body + '''
(out/'state.json').write_text(json.dumps({'status':'COMPLETE'}))
(out/'SHA256SUMS').write_text('synthetic stub callback marker')
''')

    def finish(self, timeout=5):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            job = self.manager.snapshot()['jobs'][0]
            if job['status'] != 'running':
                return job
            time.sleep(0.02)
        self.fail('Synthetic job did not complete')

    def test_explicit_capture_job_imports_only_after_child_exit(self):
        before = self.capture.read_bytes()
        self.assertTrue(self.manager.available())
        self.assertFalse(self.manager.workspace_path.exists())
        started = self.manager.start(str(self.capture))
        result = self.finish()
        self.assertEqual(result['status'], 'complete')
        self.assertEqual(result['case_id'], 'a' * 64)
        self.assertEqual(self.capture.read_bytes(), before)
        self.assertEqual(len(self.imports), 1)
        self.assertFalse((self.imports[0].parent / 'capture.pcap').exists())
        self.assertNotIn(str(self.root), json.dumps(self.manager.snapshot()))
        for path in self.manager.workspace_path.rglob('*'):
            self.assertEqual(path.stat().st_mode & 0o077, 0)
        reloaded = JobManager(self.companion, self.manager.workspace_path, self.accept)
        self.addCleanup(reloaded.close)
        self.assertEqual(reloaded.snapshot()['jobs'][0]['id'], started['id'])
        self.assertEqual(reloaded.snapshot()['jobs'][0]['status'], 'complete')

    def test_cancel_and_running_guard_never_import_partial_output(self):
        self.stub('time.sleep(20)\n')
        job = self.manager.start(str(self.capture))
        with self.assertRaises(Phase10Error):
            self.manager.start(str(self.capture))
        self.manager.cancel(job['id'])
        self.assertEqual(self.finish()['status'], 'cancelled')
        self.assertEqual(self.imports, [])

    def test_timeout_is_distinct_from_failure_and_does_not_import(self):
        self.stub('time.sleep(20)\n')
        with patch('phase10.jobs.JOB_TIMEOUT_SECONDS', 0.1):
            self.manager.start(str(self.capture))
            result = self.finish()
        self.assertEqual(result['error_code'], 'analysis_timeout')
        self.assertEqual(self.imports, [])

    def test_failed_child_and_rejected_verification_never_report_ready(self):
        self.stub('print("PRIVATE_CAPTURE_DIAGNOSTIC"); sys.exit(2)\n')
        self.manager.start(str(self.capture))
        self.assertEqual(self.finish()['error_code'], 'analysis_failed')
        self.assertEqual(self.imports, [])
        self.assertNotIn('PRIVATE_CAPTURE_DIAGNOSTIC', json.dumps(self.manager.snapshot()))
        self.stub()
        self.manager.import_callback = lambda _: (_ for _ in ()).throw(Phase10Error('private details'))
        self.manager.start(str(self.capture))
        self.assertEqual(self.finish()['error_code'], 'import_failed')

    def test_invalid_source_and_unconfigured_companion_do_not_start(self):
        alias = self.root / 'alias.pcap'
        alias.symlink_to(self.capture)
        for path in (str(alias), 'relative.pcap'):
            with self.assertRaises(Phase10Error):
                self.manager.start(path)
        self.capture.write_bytes(b'invalid capture')
        with self.assertRaises(Phase10Error):
            self.manager.start(str(self.capture))
        self.assertFalse(self.manager.workspace_path.exists())
        absent = JobManager(None, self.root / 'not-created', self.accept)
        self.addCleanup(absent.close)
        self.assertFalse(absent.available())
        with self.assertRaises(Phase10Error):
            absent.start(str(self.capture))

    def test_existing_empty_workspace_is_usable_and_bad_history_is_not_overwritten(self):
        self.manager.workspace_path.mkdir(mode=0o700)
        empty = JobManager(self.companion, self.manager.workspace_path, self.accept)
        self.addCleanup(empty.close)
        self.assertEqual(empty.snapshot()['history_status'], 'available')
        empty.start(str(self.capture))
        empty.close()
        history = self.manager.workspace_path / 'jobs.json'
        history.write_text('not JSON')
        damaged = JobManager(self.companion, self.manager.workspace_path, self.accept)
        self.addCleanup(damaged.close)
        self.assertEqual(damaged.snapshot()['history_status'], 'unavailable')
        with self.assertRaises(Phase10Error):
            damaged.start(str(self.capture))
        self.assertEqual(history.read_text(), 'not JSON')

    def test_worker_uses_trusted_imports_minimal_environment_and_limits(self):
        (self.analyzer.parent / 'trusted_sibling.py').write_text('value = 42\n')
        (self.root / 'trusted_sibling.py').write_text('raise RuntimeError("Evidence directory imported")\n')
        self.stub('''import resource, trusted_sibling
assert trusted_sibling.value == 42
assert 'HONEYTRACE_SYNTHETIC_SECRET' not in os.environ
assert resource.getrlimit(resource.RLIMIT_AS)[0] <= 512*1024**2
assert resource.getrlimit(resource.RLIMIT_NOFILE)[0] <= 64
''')
        with patch.dict(os.environ, {'HONEYTRACE_SYNTHETIC_SECRET': 'synthetic'}):
            self.manager.start(str(self.capture))
            self.assertEqual(self.finish()['status'], 'complete')

    def test_lifecycle_logging_contains_identifiers_and_codes_only(self):
        logger = Mock()
        self.manager.logger = logger
        self.manager.start(str(self.capture))
        self.assertEqual(self.finish()['status'], 'complete')
        events = [call.args[0] for call in logger.event.call_args_list]
        self.assertEqual(events[0], 'job.started')
        self.assertIn('job.stage', events)
        self.assertEqual(events[-1], 'job.complete')
        self.assertNotIn(str(self.root), str(logger.event.call_args_list))

    def test_excessive_child_diagnostics_are_bounded_and_do_not_reach_api(self):
        self.stub('sys.stdout.write("PRIVATE_TEST" * 200000); sys.stdout.flush(); time.sleep(20)\n')
        job = self.manager.start(str(self.capture))
        self.assertEqual(self.finish()['error_code'], 'analysis_failed')
        log = self.manager.workspace_path / job['id'] / 'analysis.log'
        self.assertLessEqual(log.stat().st_size, 1024**2)
        self.assertNotIn('PRIVATE_TEST', json.dumps(self.manager.snapshot()))

    def test_workspace_quota_and_permissions_prevent_new_analysis(self):
        with patch('phase10.jobs.MAX_WORKSPACE_BYTES', 1):
            with self.assertRaises(Phase10Error):
                self.manager.start(str(self.capture))
        os.chmod(self.manager.workspace_path, 0o755)
        with self.assertRaises(Phase10Error):
            self.manager.start(str(self.capture))
        self.assertEqual(self.imports, [])

    def test_shutdown_cancels_child_and_reconciles_interrupted_history(self):
        self.stub('time.sleep(20)\n')
        self.manager.start(str(self.capture))
        self.manager.close()
        self.assertEqual(self.finish()['status'], 'cancelled')
        history = self.manager.workspace_path / 'jobs.json'
        rows = json.loads(history.read_text())
        rows[0].update(status='running', stage='ingestion')
        history.write_text(json.dumps(rows))
        before = history.read_bytes()
        reloaded = JobManager(self.companion, self.manager.workspace_path, self.accept)
        self.addCleanup(reloaded.close)
        self.assertEqual(reloaded.snapshot()['jobs'][0]['error_code'], 'analysis_interrupted')
        self.assertEqual(history.read_bytes(), before)  # Read-only startup.
        self.assertEqual(self.imports, [])

    def test_cancel_during_verification_preserves_actual_committed_result(self):
        verifying, release = threading.Event(), threading.Event()

        def accept(path):
            verifying.set()
            self.assertTrue(release.wait(timeout=3))
            return self.accept(path)

        self.manager.import_callback = accept
        job = self.manager.start(str(self.capture))
        self.assertTrue(verifying.wait(timeout=3))
        self.assertEqual(self.manager.cancel(job['id'])['stage'], 'verifying')
        release.set()
        self.assertEqual(self.finish()['status'], 'complete')
        self.assertEqual(len(self.imports), 1)


if __name__ == '__main__':
    unittest.main()
