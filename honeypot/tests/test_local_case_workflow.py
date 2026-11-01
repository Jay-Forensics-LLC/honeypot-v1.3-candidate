"""Local HTTP regressions use synthetic files, loopback and the bundled analyzer only."""
from contextlib import closing, contextmanager
import hashlib
import http.client
import json
from pathlib import Path
import queue
import struct
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import dashboard
from phase10.jobs import MAX_CAPTURE_BYTES


class LocalCaseWorkflow(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)

    def start(self, native=False):
        companion = (Path(__file__).resolve().parents[2] / 'sentinel-forensics'
                     if native else self.root / 'missing-companion')
        self.server = dashboard.create_server(self.root, port=0, sentinel_root=companion)
        self.thread = threading.Thread(target=self.server.serve_forever,
                                       kwargs={'poll_interval': 0.02}, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop)

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.server.jobs.close()
        self.thread.join(timeout=2)

    def call(self, path, payload=None, *, auth=True, headers=None):
        raw = None if payload is None else json.dumps(payload).encode()
        values = {'Authorization': 'Bearer ' + self.server.session_token} if auth else {}
        if payload is not None:
            values.update({'Content-Type': 'application/json', 'Origin': self.origin()})
        values.update(headers or {})
        with closing(http.client.HTTPConnection('127.0.0.1', self.server.server_port,
                                               timeout=3)) as connection:
            connection.request('GET' if payload is None else 'POST', path, raw, values)
            return self.response(connection)

    def origin(self):
        return 'http://127.0.0.1:' + str(self.server.server_port)

    def response(self, connection):
        response = connection.getresponse()
        raw, headers = response.read(), dict(response.getheaders())
        value = (json.loads(raw) if headers.get('Content-Type', '').startswith('application/json')
                 else raw)
        return response.status, value, headers

    def binary(self, *, body=None, auth=True, headers=None):
        # With no body, a positive advertised length must be rejected from headers.
        values = [('Content-Type', 'application/octet-stream'), ('Origin', self.origin())]
        if auth:
            values.append(('Authorization', 'Bearer ' + self.server.session_token))
        overridden = {key.lower() for key, _ in headers or []}
        values = [(key, value) for key, value in values if key.lower() not in overridden]
        values.extend(headers or [])
        if body is not None and 'content-length' not in overridden:
            values.append(('Content-Length', str(len(body))))
        with closing(http.client.HTTPConnection('127.0.0.1', self.server.server_port,
                                               timeout=2)) as connection:
            connection.putrequest('POST', '/api/capture-upload')
            for key, value in values:
                connection.putheader(key, value)
            connection.endheaders(body)
            return self.response(connection)

    def enable(self):
        status, result, _ = self.call('/api/policy', {'enabled': True, 'plugins': ['sentinel']})
        self.assertEqual(status, 200, result)

    def write_event(self, source='cowrie'):
        row = {'event_id': source + '-local-fixture', 'source': source,
               'timestamp': '2026-11-01T12:00:00Z', 'source_ip': '192.0.2.55',
               'source_port': 45000, 'destination_port': 2222 if source == 'cowrie' else 2121,
               'service': 'ssh' if source == 'cowrie' else 'ftp',
               'event_type': 'cowrie.command.input' if source == 'cowrie' else '2000',
               'session_id': 'local-synthetic-session' if source == 'cowrie' else '',
               'command': 'id' if source == 'cowrie' else '', 'password_present': True}
        path = self.root / 'logs/normalized' / (source + '.jsonl')
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(row) + '\n')
        return path

    def equipment(self, name='Synthetic capture sensor', **changes):
        row = {'name': name, 'description': 'Wholly synthetic local test inventory',
               'category': 'sensor', 'equipment_class': 'Capture Devices', 'value': '',
               'active': False, 'tracking': 'heartbeat', **changes}
        status, result, _ = self.call('/api/equipment-save', row)
        self.assertEqual(status, 200, result)
        return result['equipment'], row

    def wait_case(self, job_id, deadline):
        while time.monotonic() < deadline:
            status, workspace, _ = self.call('/api/cases')
            self.assertEqual(status, 200, workspace)
            job = next(item for item in workspace['jobs']['jobs'] if item['id'] == job_id)
            if job['status'] != 'running':
                self.assertEqual(job['status'], 'complete', job)
                return job['case_id']
            time.sleep(0.05)
        self.fail('Local synthetic analysis did not complete within the bounded test window')

    def test_upload_auth_headers_and_size_reject_before_reading_a_body(self):
        self.start()
        advertised = [('Content-Length', str(MAX_CAPTURE_BYTES + 1))]
        self.assertEqual(self.call('/api/sessions', auth=False)[0], 401)
        self.assertEqual(self.binary(auth=False, headers=advertised)[0], 401)
        self.assertEqual(self.binary(headers=advertised + [('Origin', 'https://other.test')])[0], 403)
        status, result, headers = self.binary(headers=advertised)
        self.assertEqual(status, 413, result)
        self.assertEqual(result['code'], 'capture_too_large')
        self.assertEqual(result['limit_bytes'], 64 * 1024**2)
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertEqual(headers['X-Content-Type-Options'], 'nosniff')
        self.assertNotIn('Server', headers)
        self.assertFalse(self.server.jobs.workspace_path.exists())

        for invalid in ([('Content-Length', '1'), ('Content-Type', 'text/plain')],
                        [('Content-Length', '1'), ('Transfer-Encoding', 'chunked')],
                        [('Content-Length', '1'), ('Content-Length', '1')],
                        [('Content-Length', '-1')], []):
            with self.subTest(headers=invalid):
                self.assertEqual(self.binary(headers=invalid)[0], 400)
        # Disabled policy is also checked before trying to consume the body.
        self.assertEqual(self.binary(headers=[('Content-Length', '24')])[0], 400)
        self.assertEqual(self.call('/api/session-open-case', {'selection_id': 'a' * 32})[0], 409)
        self.enable()
        self.assertFalse(self.call('/api/cases')[1]['jobs']['available'])
        self.assertEqual(self.binary(headers=[('Content-Length', '24'),
                                             ('X-Capture-Workflow', 'invented')])[0], 400)
        self.assertEqual(self.binary(headers=[('Content-Length', '24'),
                                             ('X-Equipment-Id', 'f' * 32)])[0], 400)

        raw = struct.pack('<IHHIIII', 0xa1b2c3d4, 2, 4, 0, 0, 65535, 1)
        # Filename text never selects a path or invents a sensor association.
        with patch.object(self.server.jobs, 'start_bytes', return_value={'id': 'b' * 32,
                                                                       'status': 'running'}) as submit:
            status, result, _ = self.binary(body=raw, headers=[
                ('X-Capture-Name', '..%2FCowrie-Packet-Squirrel.pcap'),
                ('X-Capture-Workflow', 'packet_squirrel'), ('X-Equipment-Id', '')])
        self.assertEqual(status, 202, result)
        self.assertEqual(submit.call_args.args, (raw,))
        self.assertEqual(submit.call_args.kwargs['context']['workflow'], 'packet_squirrel')
        self.assertIsNone(submit.call_args.kwargs['context']['sensor'])
        self.assertFalse(self.server.jobs.workspace_path.exists())

    def test_unknown_and_expired_selections_never_queue_a_job(self):
        self.start()
        self.enable()
        self.write_event()
        status, catalog, _ = self.call('/api/sessions')
        self.assertEqual(status, 200, catalog)
        selection = catalog['sessions'][0]['selection_id']
        self.assertEqual(self.call('/api/session-open-case', {'selection_id': 'f' * 32})[0], 400)
        self.assertEqual(self.call('/api/session-open-case', {'selection_id': selection,
                                                             'equipment_id': 'e' * 32})[0], 400)
        catalog_object, summary, acquired = self.server._session_selections[selection]
        self.server._session_selections[selection] = (catalog_object, summary, acquired - 301)
        with patch.object(self.server.jobs, 'start_prepared',
                          side_effect=AssertionError('Expired selection reached analysis')):
            self.assertEqual(self.call('/api/session-open-case', {'selection_id': selection})[0], 400)
        self.assertEqual(self.call('/api/cases')[1]['jobs']['jobs'], [])

    def test_cases_poll_during_import_returns_a_committed_case_and_job_snapshot(self):
        from phase10.policy import Policy
        from phase10.store import Store
        from test_case_workspace import BASE, saved_case

        self.start()
        self.enable()
        store = Store(self.server.store_path, Policy.load(self.server.policy_path))
        writer_ready, release_writer = threading.Event(), threading.Event()
        arrivals = queue.Queue()
        errors, response, committed = [], [], []
        operation_lock = self.server.operation_lock
        original_open = Store._open
        job = {'id': 'c' * 32, 'status': 'running', 'stage': 'verifying', 'case_id': None}

        class ObservedLock:
            def __enter__(self):
                # Notification coordinates the fixture; acquisition behavior is unchanged.
                arrivals.put('reader_waiting')
                operation_lock.acquire()
                return self

            def __exit__(self, *unused):
                operation_lock.release()

        @contextmanager
        def paused_import_lease(selected_store, create=False):
            with original_open(selected_store, create=create) as descriptor:
                if create and threading.current_thread() is writer:
                    writer_ready.set()
                    if not release_writer.wait(5):
                        raise AssertionError('Import lease was not released by the test')
                yield descriptor

        def import_case():
            try:
                with operation_lock:
                    case_id = saved_case(store, [BASE])
                    committed.append(case_id)
                    job.update(status='complete', stage='complete', case_id=case_id)
            except BaseException as exc:
                errors.append(exc)

        def poll_cases():
            try:
                response.append(self.call('/api/cases'))
            except BaseException as exc:
                errors.append(exc)
            finally:
                arrivals.put('response_finished')

        writer = threading.Thread(target=import_case, daemon=True)
        reader = threading.Thread(target=poll_cases, daemon=True)
        with patch.object(self.server, 'operation_lock', ObservedLock()), \
                patch.object(Store, '_open', paused_import_lease), \
                patch.object(self.server.jobs, 'snapshot', side_effect=lambda: {
                    'available': False, 'history_status': 'available', 'jobs': [dict(job)]}):
            writer.start()
            try:
                self.assertTrue(writer_ready.wait(3), f'Writer did not acquire its store lease: {errors}')
                reader.start()
                # Hold the exclusive lease until either the reader queues behind
                # the import, or an unprotected reader has already returned 503.
                # Both paths are event-coordinated: no scheduler timing assumption.
                arrivals.get(timeout=3)
            finally:
                release_writer.set()
                writer.join(timeout=3)
                if reader.ident is not None:
                    reader.join(timeout=3)
        self.assertFalse(writer.is_alive())
        self.assertFalse(reader.is_alive())
        self.assertEqual(errors, [])
        self.assertEqual(len(response), 1)
        status, workspace, _ = response[0]
        self.assertEqual(status, 200, workspace)
        self.assertEqual([item['case_id'] for item in workspace['cases']], committed)
        self.assertEqual(workspace['cases'][0]['event_count'], 1)
        self.assertEqual(workspace['jobs']['jobs'][0]['status'], 'complete')
        self.assertEqual(workspace['jobs']['jobs'][0]['case_id'], committed[0])

    def test_native_session_case_support_review_custody_and_log_only_case(self):
        self.start(native=True)
        self.enable()
        self.assertTrue(self.call('/api/cases')[1]['jobs']['available'], 'Bundled analyzer required')
        deadline = time.monotonic() + 15
        equipment, editable = self.equipment()
        status, reported, _ = self.call('/api/equipment-report', {'id': equipment['id'],
                                                                 'status': 'operational'})
        self.assertEqual(status, 200, reported)
        status, catalog, _ = self.call('/api/demo-session', {})
        self.assertEqual(status, 200, catalog)
        selection = next(row for row in catalog['sessions'] if row['synthetic'])
        demo_root = self.root / 'state/demo-session'
        original = next(demo_root.rglob('*.pcapng')).read_bytes()
        status, started, _ = self.call('/api/session-open-case', {
            'selection_id': selection['selection_id'], 'equipment_id': equipment['id']})
        self.assertEqual(status, 202, started)
        case_id = self.wait_case(started['job']['id'], deadline)
        status, case, _ = self.call('/api/case', {'case_id': case_id})
        self.assertEqual(status, 200, case)
        self.assertEqual(case['case']['source_count'], 2)
        self.assertEqual({row['details']['metrics']['source_kind'] for row in case['sources']},
                         {'text', 'pcapng'})
        self.assertGreaterEqual(case['timeline']['total'], 12)
        evidence = case['session_evidence']
        self.assertTrue(evidence['summary']['synthetic'])
        self.assertEqual(evidence['capture']['status'], 'matched')
        self.assertEqual([row['command'] for row in evidence['transcript']['commands']],
                         ['id', 'uname -a'])
        lead = next(item for item in case['lead_details'] if item['rule'] == 'repeated_syn')
        self.assertEqual(lead['support']['status'], 'resolved')
        self.assertGreaterEqual(lead['support']['returned_records'], 10)
        self.assertIn('syn_minimum', lead['evaluation']['thresholds'])
        self.assertTrue(lead['alternatives'])
        source_hashes = {row['details']['provenance']['source_sha256'] for row in case['sources']}
        for record in lead['support']['records']:
            provenance = record['details']['provenance']
            self.assertTrue(provenance['occurrence_id'].startswith('packet:'))
            self.assertIn(provenance['source_sha256'], source_hashes)
            self.assertRegex(provenance['record_sha256'], r'^[a-f0-9]{64}$')
        original_findings = self.call('/api/case-export', {'case_id': case_id})[1]['findings']
        status, review, _ = self.call('/api/case-review', {
            'case_id': case_id, 'finding_id': lead['finding_id'], 'status': 'false_positive',
            'note': 'Synthetic fixture review: authorized repeated connection attempts.'})
        self.assertEqual(status, 200, review)
        after = self.call('/api/case', {'case_id': case_id})[1]
        updated = next(item for item in after['lead_details'] if item['finding_id'] == lead['finding_id'])
        self.assertEqual(updated['review']['status'], 'false_positive')
        self.assertEqual(after['findings'], case['findings'])
        self.assertEqual(self.call('/api/case-export', {'case_id': case_id})[1]['findings'],
                         original_findings)

        status, custody_result, _ = self.call('/api/case-custody', {'case_id': case_id})
        self.assertEqual(status, 200, custody_result)
        custody = custody_result['custody']
        self.assertEqual(custody['status'], 'available')
        self.assertEqual(custody['checksum_ledger_sha256'], case['case']['checksum_ledger_sha256'])
        self.assertEqual(custody['exchange_sha256'].removeprefix('sha256:'),
                         case['case']['exchange_sha256'].removeprefix('sha256:'))
        self.assertRegex(custody['custody_sha256'], r'^[a-f0-9]{64}$')
        self.assertEqual(custody['sensor']['equipment_id'], equipment['id'])
        self.assertEqual(custody['sensor']['historical_status'], 'unknown')
        self.assertEqual(custody['sensor']['last_heartbeat_at'], reported['equipment']['reported_at'])
        self.assertNotEqual(custody['recorded_at'], evidence['summary']['first_seen'])
        status, report, _ = self.call('/api/case-custody-export', {'case_id': case_id})
        self.assertEqual(status, 200, report)
        self.assertTrue(report['filename'].endswith('.txt'))
        self.assertEqual(report['text'], custody_result['report'])
        self.assertIn('They do not prove authorship', report['text'])
        self.assertIn(custody['checksum_ledger_sha256'], report['text'])
        self.assertNotIn(self.server.session_token, report['text'])
        downloaded = {}
        for artifact in custody['artifacts']:
            if not artifact.get('available', artifact.get('retained', False)):
                continue
            status, raw, headers = self.call('/api/case-artifact', {
                'case_id': case_id, 'artifact_id': artifact.get('artifact_id', artifact.get('id'))})
            self.assertEqual(status, 200, artifact)
            self.assertEqual(headers['Content-Type'], 'application/octet-stream')
            self.assertTrue(headers['Content-Disposition'].startswith('attachment;'))
            self.assertEqual(len(raw), artifact['bytes'])
            self.assertEqual(hashlib.sha256(raw).hexdigest(), artifact['sha256'])
            self.assertIn(artifact['sha256'], report['text'])
            downloaded[artifact['name']] = raw
        self.assertEqual(downloaded['capture.pcap'], original)
        self.assertIn('session.jsonl', downloaded)
        self.assertIn('transcript.json', downloaded)
        raw_commands = json.loads(downloaded['transcript.json'])['commands']
        self.assertEqual([row['command'] for row in raw_commands],
                         [row['command'] for row in evidence['transcript']['commands']])
        for raw_row, public_row in zip(raw_commands, evidence['transcript']['commands']):
            self.assertEqual(raw_row['timestamp'], public_row['timestamp'])
            for key in ('event_id', 'line', 'byte_offset', 'byte_length', 'record_sha256'):
                self.assertEqual(raw_row['reference'][key], public_row['reference'][key])
            self.assertNotIn('path', public_row['reference'])
            self.assertNotIn('source_inode', public_row['reference'])
        self.assertEqual(next(demo_root.rglob('*.pcapng')).read_bytes(), original)
        self.assertEqual(self.call('/api/case-artifact', {'case_id': case_id,
                                                         'artifact_id': '../../outside'})[0], 400)
        self.assertEqual(self.call('/api/case-artifact', {'case_id': case_id,
                                                         'artifact_id': 'capture.pcap'}, auth=False)[0], 401)

        self.assertEqual(self.call('/api/equipment-save', {**editable, 'id': equipment['id'],
                                                          'name': 'Changed inventory label'})[0], 200)
        self.assertEqual(self.call('/api/equipment-remove', {'id': equipment['id']})[0], 200)
        frozen = self.call('/api/case-custody', {'case_id': case_id})[1]['custody']
        self.assertEqual(frozen['sensor'], custody['sensor'])

        # A separate real saved event has no preserved capture: logs stay useful,
        # but the application must retain that absence instead of inventing PCAP.
        self.write_event('opencanary')
        rows = self.call('/api/sessions')[1]['sessions']
        log_only = next(row for row in rows if row['source'] == 'opencanary' and not row['synthetic'])
        status, started, _ = self.call('/api/session-open-case', {
            'selection_id': log_only['selection_id'], 'equipment_id': None})
        self.assertEqual(status, 202, started)
        log_case_id = self.wait_case(started['job']['id'], deadline)
        log_case = self.call('/api/case', {'case_id': log_case_id})[1]
        self.assertEqual(log_case['case']['source_count'], 1)
        self.assertEqual(log_case['session_evidence']['capture']['status'], 'unavailable')
        self.assertEqual(log_case['session_evidence']['transcript']['commands'], [])
        self.assertIsNone(log_case['custody']['sensor'])
        self.assertFalse(any(item['name'] == 'capture.pcap' and
                             item.get('available', item.get('retained', False))
                             for item in log_case['custody']['artifacts']))
        self.assertEqual(self.call('/api/case-review', {'case_id': log_case_id,
                                                       'finding_id': lead['finding_id'],
                                                       'status': 'false_positive'})[0], 400)
        self.assertEqual(self.call('/api/policy', {'enabled': False, 'plugins': ['sentinel']})[0], 200)
        self.assertEqual(self.call('/api/case-custody', {'case_id': case_id})[0], 409)
        self.assertEqual(self.call('/api/case-artifact', {'case_id': case_id,
                                                        'artifact_id': 'capture.pcap'})[0], 400)


if __name__ == '__main__':
    unittest.main()
