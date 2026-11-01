"""Local dashboard workflows use only isolated synthetic reports and saved state."""
import base64
from contextlib import closing
import hashlib
import http.client
import json
import os
from pathlib import Path
import plistlib
import sqlite3
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import dashboard


class DashboardWorkflow(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.server = dashboard.create_server(
            self.root, port=0, sentinel_root=self.root / 'missing-companion')
        assets = self.root / 'web'
        assets.mkdir()
        (assets / 'index.html').write_text('<!doctype html><title>HoneyTrace</title>')
        (assets / 'app.js').write_text('"use strict";')
        (assets / 'styles.css').write_text('body {color: white}')
        self.server.assets = assets
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop_server)
        self.raw = (json.dumps({'id': 'dashboard-fixture', 'type': 'DNS_NAME',
                               'data': 'asset.example.org',
                               'timestamp': '2026-11-01T00:00:00Z'}) + '\n').encode()

    def stop_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def call(self, path, payload=None, *, auth=True, headers=None, method=None):
        body = None if payload is None else json.dumps(payload).encode()
        values = {'Authorization': 'Bearer ' + self.server.session_token} if auth else {}
        if payload is not None:
            values.update({'Content-Type': 'application/json',
                           'Origin': 'http://127.0.0.1:' + str(self.server.server_port)})
        values.update(headers or {})
        with closing(http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)) as connection:
            connection.request(method or ('POST' if payload is not None else 'GET'), path,
                               body=body, headers=values)
            response = connection.getresponse()
            data, status, response_headers = response.read(), response.status, dict(response.getheaders())
        if response_headers.get('Content-Type', '').startswith('application/json'):
            data = json.loads(data)
        return status, data, response_headers

    def enable(self, plugins, **extra):
        row = {'enabled': True, 'plugins': list(plugins), **extra}
        status, result, _ = self.call('/api/policy', row)
        self.assertEqual(status, 200, result)
        return result

    def upload(self):
        return self.call('/api/import', {'plugin': 'bbot', 'format': 'jsonl',
                                        'data': base64.b64encode(self.raw).decode()})

    def test_unknown_sensor_does_not_require_available_inventory(self):
        with patch.object(self.server, 'equipment_workspace', side_effect=dashboard.Phase10Error('Unavailable')):
            self.assertIsNone(self.server.sensor_snapshot({'equipment_id': None}))
            self.assertIsNone(self.server.capture_context({'workflow': 'packet_squirrel'})['sensor'])
            self.assertIsNone(self.server.sensor_snapshot({}, 'cowrie'))
            with self.assertRaises(dashboard.Phase10Error):
                self.server.sensor_snapshot({'equipment_id': 'explicit-selection'})

    def test_profile_limit_does_not_claim_capture_oversize(self):
        with patch.object(dashboard, 'render_profile', side_effect=dashboard.InputTooLarge(1024**2, 1024**2 + 1)):
            status, row, _ = self.call('/api/decoy-profile', {'profile_id': 'small-office'})
        self.assertEqual(status, 413)
        self.assertEqual(row['code'], 'input_too_large')
        self.assertEqual(row['limit_bytes'], 1024**2)
        self.assertNotIn('Capture', row['error'])

    def test_public_shell_and_private_api_session(self):
        status, shell, headers = self.call('/', auth=False)
        self.assertEqual(status, 200)
        self.assertIn(b'HoneyTrace', shell)
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertIn("script-src 'self'", headers['Content-Security-Policy'])
        self.assertNotIn('Server', headers)
        self.assertNotIn(self.server.session_token.encode(), shell)
        self.assertEqual(self.call('/api/state', auth=False)[0], 401)
        self.assertEqual(self.call('/api/state', headers={'Authorization': 'Bearer expired'})[0], 401)
        self.assertEqual(self.call('/api/state')[0], 200)
        self.assertEqual(self.call('/api/state', headers={'Host': 'other.test'})[0], 403)
        self.assertEqual(self.call('/api/state', headers={'Origin': 'https://other.test'})[0], 403)

    def test_disabled_empty_state_is_useful_and_creates_no_runtime_files(self):
        status, state, _ = self.call('/api/state')
        self.assertEqual(status, 200)
        self.assertFalse(state['policy']['enabled'])
        self.assertEqual(state['store_status'], 'disabled')
        self.assertEqual(state['metrics']['findings'], 0)
        self.assertEqual(state['telemetry']['status'], 'not_collected')

        self.assertEqual(state['posture']['edition'], 'Free core')
        self.assertEqual(state['posture']['guard'], 'not_checked')
        self.assertTrue(all(item['status'] == 'planned' for item in state['hardware']))
        self.assertEqual(self.upload()[0], 409)
        self.assertEqual(self.call('/api/export')[0], 409)
        self.assertFalse((self.root / 'state').exists())
        self.assertFalse((self.root / 'configs').exists())

    def test_unreadable_health_directory_reports_unavailable(self):
        with patch.object(dashboard.Path, 'lstat', side_effect=PermissionError):
            self.assertEqual(dashboard._health(self.root), ('unavailable', {}))

    def test_settings_import_provenance_and_export_round_trip(self):
        self.enable(['bbot'])
        policy = self.root / 'configs/phase10.json'
        self.assertEqual(policy.stat().st_mode & 0o777, 0o600)
        self.assertEqual(json.loads(policy.read_text())['plugins'], ['bbot'])
        status, result, _ = self.upload()
        self.assertEqual(status, 200, result)
        self.assertEqual(result['manifest']['records'], 1)
        self.assertNotIn('original', result['manifest'])
        self.assertEqual(self.upload()[1]['manifest']['deduplicated'], True)
        status, state, _ = self.call('/api/state')
        self.assertEqual(status, 200)
        self.assertEqual(state['metrics']['imports'], 1)
        self.assertEqual(state['metrics']['findings'], 1)
        self.assertEqual(state['findings'][0]['indicator_value'], 'asset.example.org')
        status, exported, _ = self.call('/api/export')
        self.assertEqual(status, 200)
        self.assertEqual(exported['findings'][0]['evidence_reference'],
                         'sha256:' + hashlib.sha256(self.raw).hexdigest())
        self.assertEqual(exported['findings'], state['findings'])

    def test_bad_input_has_actionable_private_error_and_preserves_existing_import(self):
        self.enable(['bbot'])
        self.assertEqual(self.upload()[0], 200)
        status, result, _ = self.call('/api/import', {'plugin': 'bbot', 'format': 'jsonl',
                                                     'data': base64.b64encode(b'{PRIVATE_TEST').decode()})
        self.assertEqual(status, 400)
        self.assertEqual(result['code'], 'invalid_input')
        self.assertNotIn('PRIVATE_TEST', json.dumps(result))
        self.assertEqual(self.call('/api/state')[1]['metrics']['findings'], 1)
        self.assertEqual(self.call('/api/policy', {'enabled': True, 'plugins': ['unknown-tool']})[0], 400)
        self.assertEqual(self.call('/api/state')[1]['policy']['plugins'], ['bbot'])

    def test_recent_evidence_uses_import_instants_and_stable_id_ties(self):
        self.enable(['bbot'])
        manifests = [{'import_id': letter * 64, 'plugin_id': 'bbot', 'format': 'jsonl',
                      'imported_at': stamp, 'raw_source_hash': 'sha256:' + letter * 64,
                      'normalized': {'records': 1}}
                     for letter, stamp in [('a', '2026-11-01T12:00:00+01:00'),
                                           ('b', '2026-11-01T10:30:00Z'),
                                           ('c', '2026-11-01T11:00:00Z')]]
        with patch.object(dashboard.Store, 'manifests', return_value=manifests), \
                patch.object(dashboard.Store, 'read_import', return_value={'findings': []}):
            status, snapshot, _ = self.call('/api/state')
        self.assertEqual(status, 200)
        self.assertEqual([row['import_id'] for row in snapshot['imports']],
                         ['c' * 64, 'a' * 64, 'b' * 64])
        manifests[0]['imported_at'] = 'invalid-saved-time'
        with patch.object(dashboard.Store, 'manifests', return_value=manifests), \
                patch.object(dashboard.Store, 'read_import', return_value={'findings': []}):
            status, snapshot, _ = self.call('/api/state')
        self.assertEqual(status, 200)
        self.assertEqual(snapshot['store_status'], 'unavailable')
        self.assertIsNone(snapshot['metrics']['imports'])
        self.assertEqual(snapshot['imports'], [])

    def test_saved_health_is_allowlisted_and_never_claims_a_live_check(self):
        state = self.root / 'state'
        state.mkdir()
        (state / 'health.json').write_text(json.dumps({
            'timestamp': '2020-01-01T00:00:00Z', 'severity': 'LOW',
            'containers': {'cowrie': {'state': 'running', 'health': 'healthy', 'secret': 'PRIVATE_TEST'}},
            'guard': {'ok': True, 'diagnostics': 'PRIVATE_TEST'},
            'capture': {'ok': True}, 'pcap_running': True,
            'problems': ['PRIVATE_TEST'], 'password': 'PRIVATE_TEST',
            'disk_percent': 10**400}))
        path = self.root / 'logs/normalized/cowrie.jsonl'
        path.parent.mkdir(parents=True)
        path.write_text('PRIVATE_LOG_TEST\n')
        with patch('subprocess.run', side_effect=AssertionError('No live collector')):
            status, snapshot, _ = self.call('/api/state')
        self.assertEqual(status, 200)
        health = snapshot['telemetry']['health']
        self.assertTrue(health['stale'])
        self.assertFalse(health['current_runtime_verified'])
        self.assertTrue(health['guard_ok'])
        self.assertIsNone(health['disk_percent'])
        self.assertEqual(health['services'][0]['state'], 'running')
        self.assertTrue(snapshot['telemetry']['sources'][0]['present'])
        self.assertNotIn('PRIVATE_TEST', json.dumps(snapshot))
        self.assertNotIn('PRIVATE_LOG_TEST', json.dumps(snapshot))

    def test_bad_settings_or_evidence_do_not_break_overview(self):
        configs = self.root / 'configs'
        configs.mkdir()
        (configs / 'phase10.json').write_text('{invalid')
        status, state, _ = self.call('/api/state')
        self.assertEqual(status, 200)
        self.assertEqual(state['errors'][0]['code'], 'policy_unavailable')
        self.enable(['bbot'])
        store = self.root / 'state/phase10'
        store.mkdir(parents=True, mode=0o700)
        os.chmod(store, 0o755)
        status, state, _ = self.call('/api/state')
        self.assertEqual(status, 200)
        self.assertEqual(state['store_status'], 'unavailable')
        self.assertIsNone(state['metrics']['imports'])

    def test_specialized_inputs_use_dedicated_workflows(self):
        self.enable(['sentinel', 'imazing', 'forensics'])
        for plugin, format_name in (('sentinel', 'jsonl'), ('imazing', 'sqlite'), ('forensics', 'binary')):
            with self.subTest(plugin=plugin):
                status, _, _ = self.call('/api/import', {'plugin': plugin, 'format': format_name,
                                                        'data': base64.b64encode(self.raw).decode()})
                self.assertEqual(status, 400)
        status, result, _ = self.call('/api/forensics', {'data': base64.b64encode(b'Synthetic artifact').decode()})
        self.assertEqual(status, 200, result)
        self.assertEqual(result['result']['source_sha256'], hashlib.sha256(b'Synthetic artifact').hexdigest())
        self.assertFalse(result['result']['processor_execution'])

    def test_completed_backup_metadata_round_trip(self):
        self.enable(['imazing'])
        path = self.root / 'fixture.db'
        with closing(sqlite3.connect(path)) as db, db:
            db.execute('CREATE TABLE Files (fileID TEXT,domain TEXT,relativePath TEXT,flags INTEGER,file BLOB)')
            db.execute('INSERT INTO Files VALUES (?,?,?,?,?)',
                       ('a' * 40, 'HomeDomain', 'PRIVATE_PERSONAL_PATH', 1, b'fixture'))
        files = {'Manifest.plist': plistlib.dumps({'IsEncrypted': False, 'OwnerName': 'PRIVATE_PERSON'}),
                 'Status.plist': plistlib.dumps({'SnapshotState': 'finished'}),
                 'Manifest.db': path.read_bytes()}
        status, result, _ = self.call('/api/imazing', {'files': {
            name: base64.b64encode(data).decode() for name, data in files.items()}})
        self.assertEqual(status, 200, result)
        self.assertEqual(result['result']['coverage'], 'metadata-only')
        self.assertEqual(result['result']['counts']['records'], 1)
        self.assertEqual(len(result['result']['manifests']), 3)
        self.assertNotIn('PRIVATE_PERSON', json.dumps(result))
        self.assertNotIn('PRIVATE_PERSONAL_PATH', json.dumps(self.call('/api/export')[1]))

    def test_mock_intelligence_is_explicit_and_cached_for_the_session(self):
        self.enable(['mock-ti'])
        request = {'provider': 'abuseipdb', 'type': 'ip', 'value': '8.8.8.8',
                   'response': {'data': {'abuseConfidenceScore': 42, 'totalReports': 3,
                                         'token': 'PRIVATE_TOKEN'}}}
        status, result, _ = self.call('/api/enrich', request)
        self.assertEqual(status, 200, result)
        self.assertTrue(result['mock'])
        self.assertEqual(result['sharing'], 'none')
        self.assertNotIn('PRIVATE_TOKEN', json.dumps(result))
        self.assertTrue(self.call('/api/enrich', request)[1]['cached'])

    def test_verified_case_timeline_export_and_disabled_visibility(self):
        from test_phase9_sentinel import RUN, encode, exchange_rows

        self.assertEqual(self.call('/api/cases', auth=False)[0], 401)
        self.assertEqual(self.call('/api/cases')[1]['cases'], [])
        self.enable(['sentinel'])
        bundle = self.root / 'completed-case'
        (bundle / 'export').mkdir(parents=True)
        files = {'index.sqlite': b'SYNTHETIC private index',
                 'pseudonym.key': b'PRIVATE_CASE_KEY',
                 'state.json': json.dumps({'status': 'COMPLETE', 'version': '2.0.10'}).encode(),
                 'manifest.json': json.dumps({'schema': 'evidence-lab/2', 'status': 'COMPLETE',
                                              'parser_version': '2.0.10', 'run_id': RUN}).encode(),
                 'export/exchange.jsonl': encode(exchange_rows())}
        for name, raw in files.items():
            (bundle / name).write_bytes(raw)
        (bundle / 'SHA256SUMS').write_text(''.join(
            hashlib.sha256(raw).hexdigest() + '  ' + name + '\n' for name, raw in files.items()))
        status, result, _ = self.call('/api/sentinel', {'bundle_path': str(bundle)})
        self.assertEqual(status, 200, result)
        case_id = result['manifest']['import_id']
        status, workspace, _ = self.call('/api/cases')
        self.assertEqual(status, 200, workspace)
        self.assertEqual(workspace['cases'][0]['case_id'], case_id)
        status, detail, _ = self.call('/api/case', {'case_id': case_id, 'limit': 1})
        self.assertEqual(status, 200, detail)
        self.assertEqual(detail['timeline']['total'], 1)
        self.assertIsNone(detail['timeline']['items'][0]['details']['source_time']['utc_ns'])
        status, exported, _ = self.call('/api/case-export', {'case_id': case_id})
        self.assertEqual(status, 200, exported)
        self.assertEqual(len(exported['findings']), 8)
        self.assertNotIn('PRIVATE_CASE_KEY', json.dumps(exported))
        self.assertNotIn('private index', json.dumps(workspace) + json.dumps(detail))
        self.assertEqual(self.call('/api/case', {'case_id': '../escape'})[0], 400)
        self.enable([])
        self.assertEqual(self.call('/api/cases')[1]['cases'], [])
        self.assertEqual(self.call('/api/case-export', {'case_id': case_id})[0], 400)

    def test_analysis_requires_module_and_configured_companion(self):
        self.assertEqual(self.call('/api/jobs', {'input_path': '/private/capture.pcap'})[0], 409)
        self.enable(['sentinel'])
        status, result, _ = self.call('/api/jobs', {'input_path': '/private/capture.pcap'})
        self.assertEqual(status, 409, result)
        self.assertEqual(result['code'], 'analysis_unavailable')
        self.assertNotIn('/private/capture.pcap', json.dumps(result))
        self.assertFalse(self.call('/api/cases')[1]['jobs']['available'])

    def test_diagnostics_are_authenticated_sanitized_and_independent_of_import_policy(self):
        self.assertEqual(self.call('/api/diagnostics', auth=False)[0], 401)
        self.enable(['bbot'])
        request_logged = threading.Event()
        log_event = self.server.log.event

        def record_event(event, **fields):
            result = log_event(event, **fields)
            if event == 'http.request' and fields.get('route') == '/api/import':
                request_logged.set()
            return result

        # The response can arrive before the handler's finally block logs it.
        with patch.object(self.server.log, 'event', side_effect=record_event):
            self.assertEqual(self.upload()[0], 200)
            self.assertTrue(request_logged.wait(5), 'Import request log did not complete')
        self.server.log.event('dashboard.test', operation='diagnostic_check',
                              password='PRIVATE_PASSWORD', path='/private/evidence',
                              token=self.server.session_token)
        status, result, _ = self.call('/api/diagnostics')
        self.assertEqual(status, 200, result)
        self.assertEqual(result['logging']['status'], 'available')
        self.assertTrue(any(row['event'] == 'dashboard.test' for row in result['entries']))
        requests = [row for row in result['entries'] if row['event'] == 'http.request']
        self.assertTrue(any(row.get('route') == '/api/import' and row.get('status_code') == 200
                            and len(row.get('correlation_id', '')) == 32 for row in requests))
        status, exported, _ = self.call('/api/diagnostics-export', {})
        self.assertEqual(status, 200)
        self.assertEqual(exported['scope'], 'sanitized_operational_diagnostics')
        text = json.dumps(exported)
        for value in ('PRIVATE_PASSWORD', '/private/evidence', self.server.session_token,
                      'asset.example.org'):
            self.assertNotIn(value, text)
        self.assertEqual(self.call('/api/diagnostics', {'limit': 201})[0], 400)
        self.assertEqual(self.call('/api/diagnostics-export', {}, auth=False)[0], 401)

    def test_decoy_profiles_prepare_source_without_changing_sensors(self):
        self.assertEqual(self.call('/api/decoys', auth=False)[0], 401)
        status, info, _ = self.call('/api/decoys')
        self.assertEqual(status, 200)
        self.assertFalse(info['privacy']['server_header'])
        self.assertEqual({item['id'] for item in info['profiles']}, {'fileserver', 'webserver'})
        status, result, _ = self.call('/api/decoy-profile', {'profile_id': 'webserver'})
        self.assertEqual(status, 200, result)
        self.assertEqual(result['status'], 'prepared')
        self.assertEqual(len(result['files']), 2)
        self.assertFalse((self.root / 'configs/cowrie').exists())
        self.assertEqual(self.call('/api/decoy-profile', {'profile_id': 'unknown'})[0], 400)

    def test_equipment_inventory_custom_class_value_and_observed_status(self):
        self.assertEqual(self.call('/api/equipment', auth=False)[0], 401)
        self.assertEqual(self.call('/api/equipment')[1]['equipment'], [])

        payload = {'name': 'Lab scanner', 'description': 'Synthetic desk receiver',
                   'category': 'sensor', 'active': True, 'tracking': 'heartbeat',
                   'equipment_class': 'BLE Scanners', 'value': '$49.99'}
        status, result, _ = self.call('/api/equipment-save', payload)
        self.assertEqual(status, 200, result)
        identifier = result['equipment']['id']
        status, state, _ = self.call('/api/equipment')
        entry = state['equipment'][0]
        self.assertEqual(entry['equipment_class'], 'BLE Scanners')
        self.assertEqual(entry['value'], '$49.99')
        self.assertEqual(entry['operational']['status'], 'unknown')
        self.assertEqual(self.call('/api/equipment-report', {'id': identifier, 'status': 'operational'})[0], 200)
        entry = self.call('/api/equipment')[1]['equipment'][0]
        self.assertEqual(entry['operational']['status'], 'operational')
        self.assertEqual(entry['operational']['source'], 'heartbeat')
        self.assertTrue(entry['operational']['observed_at'])
        self.assertFalse(self.call('/api/state')[1]['policy']['enabled'])
        self.assertEqual(self.call('/api/equipment-remove', {'id': identifier})[0], 200)
        self.assertEqual(self.call('/api/equipment')[1]['equipment'], [])

    def test_security_review_prioritizes_and_keeps_operator_decisions_separate(self):
        self.assertEqual(self.call('/api/review-imports', auth=False)[0], 401)
        self.assertFalse(self.call('/api/review-imports')[1]['available'])
        self.enable(['nuclei'], assessment_approved=True, scope=['198.51.100.10'])
        raw = (json.dumps({'template-id': 'synthetic-tls-review',
                           'info': {'severity': 'high'}, 'type': 'http',
                           'host': 'https://198.51.100.10',
                           'matched-at': 'https://198.51.100.10/'}) + '\n').encode()
        status, imported, _ = self.call('/api/import', {'plugin': 'nuclei', 'format': 'jsonl',
                                                       'data': base64.b64encode(raw).decode()})
        self.assertEqual(status, 200, imported)
        identifier = imported['manifest']['import_id']
        selection = {'import_ids': [identifier]}
        status, view, _ = self.call('/api/security-review', selection)
        self.assertEqual(status, 200, view)
        item = view['items'][0]
        original = item['source']
        self.assertEqual(item['priority'], 'high')
        status, decision, _ = self.call('/api/security-triage', {
            'import_id': identifier, 'finding_id': original['finding_id'],
            'status': 'in_review', 'note': 'Synthetic operator follow-up'})
        self.assertEqual(status, 200, decision)
        item = self.call('/api/security-review', selection)[1]['items'][0]
        self.assertEqual(item['source'], original)
        self.assertEqual(item['triage']['status'], 'in_review')
        status, report, _ = self.call('/api/security-report', selection)
        self.assertEqual(status, 200, report)
        self.assertEqual(report['report_type'], 'honeytrace.security-review')
        self.enable(['nuclei'], assessment_approved=True, scope=['203.0.113.10'])
        self.assertEqual(self.call('/api/security-review', selection)[1]['items'], [])
    def test_help_and_request_errors_keep_the_workflow_local(self):
        self.assertEqual(len(self.call('/api/guide')[1]['steps']), 3)
        self.assertEqual(self.call('/not-a-dashboard-file')[0], 404)
        self.assertEqual(self.call('/api/state?token=not-used')[0], 400)
        self.assertEqual(self.call('/api/policy', {}, headers={'Content-Type': 'text/plain'})[0], 400)
        self.assertEqual(self.call('/api/policy', {}, headers={'Content-Length': str(2 * dashboard.MAX_BYTES + 1)})[0], 413)
        self.assertEqual(self.call('/api/state', method='OPTIONS')[0], 405)
        self.assertNotIn('Server', self.call('/api/state', method='TRACE')[2])


if __name__ == '__main__':
    unittest.main()
