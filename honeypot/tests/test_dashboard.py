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
        self.server = dashboard.create_server(self.root, port=0)
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

    def test_public_shell_and_private_api_session(self):
        status, shell, headers = self.call('/', auth=False)
        self.assertEqual(status, 200)
        self.assertIn(b'HoneyTrace', shell)
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertIn("script-src 'self'", headers['Content-Security-Policy'])
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
                patch.object(dashboard.Store, 'export', return_value=[]):
            status, snapshot, _ = self.call('/api/state')
        self.assertEqual(status, 200)
        self.assertEqual([row['import_id'] for row in snapshot['imports']],
                         ['c' * 64, 'a' * 64, 'b' * 64])
        manifests[0]['imported_at'] = 'invalid-saved-time'
        with patch.object(dashboard.Store, 'manifests', return_value=manifests), \
                patch.object(dashboard.Store, 'export', return_value=[]):
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

    def test_help_and_request_errors_keep_the_workflow_local(self):
        self.assertEqual(len(self.call('/api/guide')[1]['steps']), 3)
        self.assertEqual(self.call('/not-a-dashboard-file')[0], 404)
        self.assertEqual(self.call('/api/state?token=not-used')[0], 400)
        self.assertEqual(self.call('/api/policy', {}, headers={'Content-Type': 'text/plain'})[0], 400)
        self.assertEqual(self.call('/api/policy', {}, headers={'Content-Length': str(2 * dashboard.MAX_BYTES + 1)})[0], 413)
        self.assertEqual(self.call('/api/state', method='OPTIONS')[0], 405)


if __name__ == '__main__':
    unittest.main()
