"""Synthetic companion processes exercise job boundaries without capture services."""
import json
import hashlib
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
from phase10.jobs import JobManager, MAX_CAPTURE_BYTES, _usage, _directory
from phase10.io import InputTooLarge, read_regular
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
        for index in range(40):
            child = wide / f'd{index:02d}'
            child.mkdir(mode=0o700)
            blob = child / 'f'
            blob.write_bytes(b'x')
            blob.chmod(0o600)
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
        retained = self.imports[0].parent / 'capture.pcap'
        self.assertEqual(retained.read_bytes(), before)
        record = json.loads((retained.parent / 'inputs.json').read_text())
        self.assertEqual(record['artifacts'][0]['sha256'], hashlib.sha256(before).hexdigest())
        self.assertEqual(record['artifacts'][0]['bytes'], len(before))
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

    def test_capture_over_64_mib_is_rejected_before_artifacts_or_subprocess(self):
        self.assertEqual(MAX_CAPTURE_BYTES, 64 * 1024**2)
        with self.capture.open('r+b') as stream:
            stream.truncate(MAX_CAPTURE_BYTES + 1)
        with patch('phase10.jobs.subprocess.Popen') as process:
            with self.assertRaises(InputTooLarge) as rejected:
                self.manager.start(str(self.capture))
            process.assert_not_called()
        self.assertEqual(rejected.exception.max_bytes, MAX_CAPTURE_BYTES)
        self.assertEqual(rejected.exception.actual_bytes, MAX_CAPTURE_BYTES + 1)
        self.assertNotIn(str(self.capture), str(rejected.exception))
        self.assertEqual(self.capture.stat().st_size, MAX_CAPTURE_BYTES + 1)
        self.assertFalse(self.manager.workspace_path.exists())
        self.assertEqual(self.manager.snapshot()['jobs'], [])

    def test_descriptor_reader_accepts_exact_capture_size_boundary(self):
        with self.capture.open('r+b') as stream:
            stream.truncate(MAX_CAPTURE_BYTES)
        raw = read_regular(self.capture, MAX_CAPTURE_BYTES)
        self.assertEqual(len(raw), MAX_CAPTURE_BYTES)
        self.assertEqual(raw[:4], struct.pack('<I', 0xa1b2c3d4))

    def test_capture_upload_validates_magic_and_size_before_creating_job(self):
        raw = self.capture.read_bytes()
        for invalid in (bytearray(raw), b'not a capture'):
            with self.assertRaises(Phase10Error):
                self.manager.start_bytes(invalid)
        with patch('phase10.jobs.MAX_CAPTURE_BYTES', len(raw) - 1):
            with self.assertRaises(InputTooLarge):
                self.manager.start_bytes(raw)
        self.assertFalse(self.manager.workspace_path.exists())
        # PCAPNG follows the same finished-file route and custody ledger.
        raw = b'\x0a\x0d\x0d\x0a' + b'\x00' * 8
        job = self.manager.start_bytes(raw, context={'workflow': 'packet-squirrel'})
        self.assertEqual(self.finish()['status'], 'complete')
        folder = self.manager.workspace_path / job['id']
        self.assertEqual((folder / 'capture.pcap').read_bytes(), raw)
        self.assertEqual(json.loads((folder / 'inputs.json').read_text())['context'],
                         {'workflow': 'packet-squirrel'})

    def test_prepared_sources_and_attachments_reach_private_custody_after_import(self):
        capture = self.capture.read_bytes()
        session = b'{"event_type":"session_start","synthetic":true}\n'
        transcript = b'{"entries":[{"command":"synthetic only"}]}'
        provenance = b'{"origin":"synthetic-fixture"}'
        self.stub('''assert [pathlib.Path(value).name for value in sys.argv[1:sys.argv.index('--output')]] == ['session.jsonl', 'capture.pcap']
assert pathlib.Path(sys.argv[1]).read_bytes().startswith(b'{')
''')
        completions = []

        def completed(case_id, bundle, metadata):
            self.assertEqual(self.manager.snapshot()['jobs'][0]['stage'], 'verifying')
            self.assertEqual(self.imports, [bundle])
            self.assertEqual(case_id, 'a' * 64)
            self.assertEqual(metadata['job_id'], bundle.parent.name)
            self.assertEqual(metadata['context'], {'workflow': 'session', 'synthetic': True})
            for artifact in metadata['artifacts']:
                raw = Path(artifact['path']).read_bytes()
                self.assertEqual(Path(artifact['path']).name, artifact['name'])
                self.assertEqual(len(raw), artifact['bytes'])
                self.assertEqual(hashlib.sha256(raw).hexdigest(), artifact['sha256'])
            completions.append(metadata)

        self.manager.completion_callback = completed
        context = {'workflow': 'session'}
        job = self.manager.start_prepared(lambda: {
            'sources': [('session.jsonl', session), ('capture.pcap', capture)],
            'attachments': {'transcript.json': transcript, 'session-provenance.json': provenance},
            'context': {'synthetic': True}}, context=context)
        context['workflow'] = 'mutated after submission'
        self.assertEqual(self.finish()['status'], 'complete')
        self.assertEqual(len(completions), 1)
        folder = self.manager.workspace_path / job['id']
        self.assertEqual((folder / 'session.jsonl').read_bytes(), session)
        self.assertEqual((folder / 'capture.pcap').read_bytes(), capture)
        self.assertEqual((folder / 'transcript.json').read_bytes(), transcript)
        self.assertEqual((folder / 'session-provenance.json').read_bytes(), provenance)
        self.assertEqual(json.loads((folder / 'inputs.json').read_text()), completions[0])
        public = json.dumps(self.manager.snapshot())
        self.assertNotIn('synthetic only', public)
        self.assertNotIn(str(folder), public)
        self.assertNotIn('workflow', public)

    def test_log_only_preparation_and_worker_remain_supported(self):
        self.stub("assert pathlib.Path(sys.argv[1]).name == 'session.jsonl'\nassert sys.argv.index('--output') == 2\n")
        self.manager.start_prepared(lambda: {'sources': [('session.jsonl', b'{"synthetic":true}\n')],
                                            'attachments': {}, 'context': {}})
        self.assertEqual(self.finish()['status'], 'complete')

    def test_preparation_is_asynchronous_and_cancelled_slot_never_runs_analyzer(self):
        entered, release = threading.Event(), threading.Event()

        def prepare():
            entered.set()
            self.assertTrue(release.wait(3))
            return {'sources': [('session.jsonl', b'{}\n')], 'attachments': {}, 'context': {}}

        with patch('phase10.jobs.subprocess.Popen') as process:
            job = self.manager.start_prepared(prepare)
            self.assertTrue(entered.wait(3))
            with self.assertRaises(Phase10Error):
                self.manager.start_bytes(self.capture.read_bytes())
            self.manager.cancel(job['id'])
            release.set()
            self.assertEqual(self.finish()['status'], 'cancelled')
            process.assert_not_called()
        self.assertFalse((self.manager.workspace_path / job['id'] / 'inputs.json').exists())
        self.assertEqual(self.imports, [])

    def test_preparation_consumes_the_existing_deadline(self):
        entered, release = threading.Event(), threading.Event()

        def prepare():
            entered.set()
            self.assertTrue(release.wait(3))
            return {'sources': [('session.jsonl', b'{}\n')], 'attachments': {}, 'context': {}}

        with patch('phase10.jobs.JOB_TIMEOUT_SECONDS', 0.01), patch('phase10.jobs.subprocess.Popen') as process:
            self.manager.start_prepared(prepare)
            self.assertTrue(entered.wait(3))
            time.sleep(0.03)
            release.set()
            self.assertEqual(self.finish()['error_code'], 'analysis_timeout')
            process.assert_not_called()

    def test_invalid_prepared_inputs_never_write_source_artifacts(self):
        base = {'sources': [('session.jsonl', b'{}\n')], 'attachments': {}, 'context': {}}
        variants = [
            dict(base, sources=[('../capture.pcap', self.capture.read_bytes())]),
            dict(base, sources=[('session.jsonl', b'{}'), ('session.jsonl', b'{}')]),
            dict(base, sources=[('session.jsonl', 'not bytes')]),
            dict(base, attachments={'arbitrary.json': b'{}'}),
            dict(base, context={'non_json': object()}),
            dict(base, context={'oversized': 'x' * (256 * 1024)}),
            dict(base, attachments={'transcript.json': b'x' * (4 * 1024**2 + 1)}),
        ]
        with patch('phase10.jobs.subprocess.Popen') as process:
            for value in variants:
                with self.subTest(keys=list(value)):
                    job = self.manager.start_prepared(lambda value=value: value)
                    self.assertEqual(self.finish()['status'], 'failed')
                    folder = self.manager.workspace_path / job['id']
                    self.assertEqual(list(folder.iterdir()), [])
            process.assert_not_called()

    def test_combined_prepared_source_budget_and_workspace_quota_are_distinct(self):
        raw = self.capture.read_bytes()
        with patch('phase10.jobs.MAX_CAPTURE_BYTES', len(raw)), patch('phase10.jobs.subprocess.Popen') as process:
            job = self.manager.start_prepared(lambda: {
                'sources': [('capture.pcap', raw), ('session.jsonl', b'{}\n')],
                'attachments': {}, 'context': {}})
            self.assertEqual(self.finish()['error_code'], 'capture_too_large')
            self.assertEqual(list((self.manager.workspace_path / job['id']).iterdir()), [])
            process.assert_not_called()
        entered, release = threading.Event(), threading.Event()

        def prepare():
            entered.set()
            self.assertTrue(release.wait(3))
            return {'sources': [('session.jsonl', b'{}\n')], 'attachments': {}, 'context': {}}

        self.manager.start_prepared(prepare)
        self.assertTrue(entered.wait(3))
        with patch('phase10.jobs.MAX_WORKSPACE_BYTES', 1):
            release.set()
            self.assertEqual(self.finish()['error_code'], 'workspace_quota')

    def test_custody_failure_preserves_case_identity_and_private_recovery_inputs(self):
        completion = Mock(side_effect=OSError('PRIVATE_CUSTODY_DETAIL'))
        self.manager.completion_callback = completion
        job = self.manager.start_bytes(self.capture.read_bytes(), context={'private': 'PRIVATE_CONTEXT'})
        result = self.finish()
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['error_code'], 'custody_failed')
        self.assertEqual(result['case_id'], 'a' * 64)
        self.assertEqual(completion.call_count, 1)
        self.assertEqual(len(self.imports), 1)
        folder = self.manager.workspace_path / job['id']
        self.assertTrue((folder / 'capture.pcap').is_file())
        self.assertTrue((folder / 'inputs.json').is_file())
        reloaded = JobManager(self.companion, self.manager.workspace_path, self.accept,
                              completion_callback=completion)
        self.addCleanup(reloaded.close)
        self.assertEqual(reloaded.snapshot()['jobs'][0], result)
        self.assertEqual(completion.call_count, 1)
        self.assertNotIn('PRIVATE_', json.dumps(self.manager.snapshot()))


if __name__ == '__main__':
    unittest.main()
