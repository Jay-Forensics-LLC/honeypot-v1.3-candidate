"""Synthetic private custody receipts; no analyzer, network or capture service runs."""
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from phase10.custody import CustodyStore
from phase10.model import Phase10Error
from phase10.policy import Policy
from phase10.sentinel import parse_sentinel, verify_bundle
from phase10.store import Store
from test_phase9_sentinel import encode, exchange_rows

STAMP = '2026-11-01T00:00:00Z'
JOB = '1' * 32
PRIVATE = '/PRIVATE_TEST/raw/source'


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


class CaseCustody(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.workspace = self.root / 'jobs'
        self.folder = self.workspace / JOB
        self.folder.mkdir(parents=True, mode=0o700)
        self.workspace.chmod(0o700)
        self.store = Store(self.root / 'imports', Policy(enabled=True, plugins=('sentinel',)))
        self.custody = CustodyStore(self.root / 'custody', self.store, self.workspace)

    def fixture(self, *, session=False, prefix='1'):
        context = {'workflow': 'honeypot_session' if session else 'packet_squirrel',
                   'sensor': {'equipment_id': 'a' * 32, 'name': 'Synthetic sensor',
                              'association': 'operator_selected', 'snapshot_at': STAMP,
                              'last_heartbeat_at': STAMP, 'historical_status': 'unknown'},
                   'synthetic': True}
        if session:
            event = {'event_id': 'e' * 64, 'source': 'cowrie', 'timestamp': STAMP,
                     'command': 'printf synthetic', 'password_present': True}
            log = encoded(event)
            reference = {'event_id': event['event_id'], 'source': 'cowrie', 'path': PRIVATE,
                         'line': 1, 'byte_offset': 0, 'byte_length': len(log), 'record_sha256': 'b' * 64}
            capture = {'status': 'too_large', 'relative_path': PRIVATE,
                       'omissions': ['too_large', 'search_incomplete', PRIVATE],
                       'acquisition_receipt': {'source_path': PRIVATE}}
            inputs = {'session.jsonl': log,
                      'transcript.json': encoded({'schema_version': 1, 'commands': [
                          {'command': event['command'], 'timestamp': STAMP, 'reference': reference,
                           'assessment': PRIVATE}]}),
                      'session-provenance.json': encoded({'schema_version': 1,
                          'selected_log_sha256': sha(log), 'records': [reference], 'capture': capture})}
            context.update(session={'source': 'cowrie', 'kind': 'sensor_session', 'first_seen': STAMP,
                'last_seen': STAMP, 'event_count': 1, 'command_count': 1, 'source_ip': '192.0.2.9'}, capture=capture)
            source_name = 'session.jsonl'
        else:
            inputs = {'capture.pcap': b'\xd4\xc3\xb2\xa1' + b'\0' * 20}
            source_name = 'capture.pcap'
        rows = exchange_rows()
        rows[0]['payload']['run_id'] = prefix + rows[0]['payload']['run_id'][1:]
        rows[0]['payload']['tools'] = {'python': '3.11.synthetic', 'sqlite': '3.synthetic',
                                    'code_sha256': {'analyze.py': 'c' * 64, PRIVATE: 'd' * 64}}
        rows[1]['payload'].update(sha256=sha(inputs[source_name]), size=len(inputs[source_name]),
                                  metadata={'source_path': PRIVATE})
        data = encode(rows)
        bundle = self.folder / ('case-' + prefix)
        (bundle / 'export').mkdir(parents=True, mode=0o700)
        (bundle / 'index.sqlite').write_bytes(b'SYNTHETIC private index')
        (bundle / 'pseudonym.key').write_bytes(b'SYNTHETIC unused key')
        (bundle / 'state.json').write_bytes(encoded({'status': 'COMPLETE', 'version': '2.0.10'}))
        (bundle / 'manifest.json').write_bytes(encoded({'schema': 'evidence-lab/2', 'status': 'COMPLETE',
            'run_id': rows[0]['payload']['run_id'], 'parser_version': '2.0.10',
            'tools': rows[0]['payload']['tools'], 'sources': [rows[1]['payload']]}))
        (bundle / 'export/exchange.jsonl').write_bytes(data)
        for path in bundle.rglob('*'):
            path.chmod(0o700 if path.is_dir() else 0o600)
        self.seal(bundle)
        verified = verify_bundle(bundle)
        context_import = self.store.policy.context(sha(data), STAMP)
        context_import['sentinel_bundle_receipt'] = verified['receipt']
        case = self.store.save('sentinel', 'jsonl', data,
            parse_sentinel(data, 'jsonl', context_import), STAMP)['import_id']
        artifacts = []
        for name, raw in inputs.items():
            path = self.folder / name
            path.write_bytes(raw)
            path.chmod(0o600)
            artifacts.append({'path': str(path), 'name': name, 'sha256': sha(raw), 'bytes': len(raw)})
        metadata = {'job_id': JOB, 'created_at': STAMP, 'context': context, 'artifacts': artifacts}
        return case, bundle, metadata

    def seal(self, bundle):
        files = sorted(path for path in bundle.rglob('*') if path.is_file() and path.name != 'SHA256SUMS')
        (bundle / 'SHA256SUMS').write_text(''.join(sha(path.read_bytes()) + '  ' +
            path.relative_to(bundle).as_posix() + '\n' for path in files))
        (bundle / 'SHA256SUMS').chmod(0o600)

    def test_old_cases_remain_explicitly_unknown_without_creating_receipts(self):
        case, _, _ = self.fixture()
        self.assertEqual(self.custody.detail(case)['status'], 'not_recorded')
        report = self.custody.report(case)
        self.assertIn('Unknown / not recorded', report['text'])
        self.assertIn('do not prove authorship', report['text'])
        self.assertIsNone(self.custody.session_evidence(case))
        self.assertFalse(self.custody.path.exists())

    def test_receipt_binds_import_and_bundle_and_retains_actual_versions(self):
        case, bundle, metadata = self.fixture()
        original = self.store.read_import(case)
        detail = self.custody.record(case, bundle, metadata)
        self.assertEqual(detail['status'], 'available')
        self.assertEqual(detail['analyzer']['version'], '2.0.10')
        self.assertEqual(detail['analyzer']['python'], '3.11.synthetic')
        self.assertEqual(detail['analyzer']['code_sha256'], {'analyze.py': 'c' * 64})
        self.assertTrue(detail['analyzer']['analyzed_locally'])
        self.assertEqual(detail['sensor']['historical_status'], 'unknown')
        self.assertEqual(detail['sensor']['last_heartbeat_at'], STAMP)
        self.assertEqual(detail['checksum_ledger_sha256'], sha((bundle / 'SHA256SUMS').read_bytes()))
        item = detail['artifacts'][0]
        self.assertTrue(item['retained'])
        self.assertEqual(self.custody.artifact(case, item['id']), ((self.folder / item['name']).read_bytes(), item['name']))
        self.assertEqual(original, self.store.read_import(case))
        self.assertEqual((self.custody.path / (case + '.json')).stat().st_mode & 0o077, 0)

    def test_repeated_record_preserves_original_snapshot_and_bytes(self):
        case, bundle, metadata = self.fixture()
        first = self.custody.record(case, bundle, metadata)
        path = self.custody.path / (case + '.json')
        before = path.read_bytes()
        metadata['context']['sensor']['name'] = 'Changed inventory name'
        metadata['context']['workflow'] = 'changed'
        repeated = self.custody.record(case, bundle, metadata)
        self.assertEqual(first['custody_sha256'], repeated['custody_sha256'])
        self.assertEqual(repeated['sensor']['name'], 'Synthetic sensor')
        self.assertEqual(before, path.read_bytes())

    def test_manual_import_does_not_claim_local_analysis_or_historical_sensor(self):
        case, bundle, _ = self.fixture()
        detail = self.custody.record(case, bundle, {'job_id': None, 'created_at': STAMP,
            'context': {'workflow': 'completed_case_import'}, 'artifacts': []})
        self.assertFalse(detail['analyzer']['analyzed_locally'])
        self.assertIsNone(detail['sensor'])
        self.assertEqual(detail['artifacts'], [])
        report = self.custody.report(case)['text']
        self.assertIn('import host', report)
        self.assertIn('earlier analysis host is unverified', report)

    def test_public_detail_and_human_report_omit_raw_paths_and_private_contents(self):
        case, bundle, metadata = self.fixture(session=True)
        detail = self.custody.record(case, bundle, metadata)
        report = self.custody.report(case)['text']
        self.assertNotIn('PRIVATE_TEST', json.dumps(detail))
        self.assertNotIn(str(self.root), json.dumps(detail))
        self.assertNotIn('PRIVATE_TEST', report)
        self.assertNotIn('SYNTHETIC private index', report)
        self.assertNotIn('printf synthetic', report)
        self.assertNotIn('"artifacts":', report)
        self.assertIn('too_large', report)
        self.assertIn('search_incomplete', report)
        self.assertEqual(detail['capture']['omissions'], ['other', 'search_incomplete', 'too_large'])
        self.assertIn('Deliberate omissions and unknowns', report)

    def test_session_commands_are_data_with_retained_log_references_and_explicit_packet_gaps(self):
        case, bundle, metadata = self.fixture(session=True)
        self.custody.record(case, bundle, metadata)
        with patch('subprocess.run', side_effect=AssertionError('No captured command execution')), \
                patch('socket.getaddrinfo', side_effect=AssertionError('No DNS')):
            evidence = self.custody.session_evidence(case)
        self.assertEqual(evidence['status'], 'available')
        command = evidence['transcript']['commands'][0]
        self.assertEqual(command['command'], 'printf synthetic')
        self.assertEqual(command['reference']['record_sha256'], 'b' * 64)
        self.assertIn('real-host execution is unknown', command['assessment'])
        self.assertNotIn('PRIVATE_TEST', json.dumps(evidence))
        self.assertTrue(evidence['summary']['synthetic'])
        self.assertIn('original source log bytes were not reopened', evidence['provenance']['reference_verification'])
        self.assertEqual(evidence['capture']['status'], 'too_large')
        self.assertIn('search_incomplete', evidence['capture']['omissions'])

    def test_artifact_tampering_is_rejected_on_each_access(self):
        case, bundle, metadata = self.fixture()
        detail = self.custody.record(case, bundle, metadata)
        item = detail['artifacts'][0]
        (self.folder / item['name']).write_bytes(b'changed')
        with self.assertRaises(Phase10Error):
            self.custody.artifact(case, item['id'])
        damaged = self.custody.detail(case)['artifacts'][0]
        self.assertFalse(damaged['retained'])
        self.assertEqual(damaged['verification'], 'unavailable_or_digest_mismatch')

    def test_receipt_corruption_is_unavailable_and_never_overwritten(self):
        case, bundle, metadata = self.fixture()
        self.custody.record(case, bundle, metadata)
        path = self.custody.path / (case + '.json')
        document = json.loads(path.read_bytes())
        document['record']['context']['workflow'] = 'altered'
        damaged = encoded(document)
        path.write_bytes(damaged)
        self.assertEqual(self.custody.detail(case)['status'], 'unavailable')
        with self.assertRaises(Phase10Error):
            self.custody.record(case, bundle, metadata)
        self.assertEqual(path.read_bytes(), damaged)

    def test_cross_case_receipts_and_artifact_ids_never_resolve(self):
        first, bundle, metadata = self.fixture()
        one = self.custody.record(first, bundle, metadata)
        second, other_bundle, other_metadata = self.fixture(prefix='2')
        self.custody.record(second, other_bundle, other_metadata)
        with self.assertRaises(Phase10Error):
            self.custody.artifact(second, one['artifacts'][0]['id'])
        (self.custody.path / (second + '.json')).write_bytes((self.custody.path / (first + '.json')).read_bytes())
        self.assertEqual(self.custody.detail(second)['status'], 'unavailable')

    def test_artifact_confinement_names_and_source_binding_are_required(self):
        case, bundle, metadata = self.fixture()
        original = metadata['artifacts'][0]
        for changed in ({'path': str(self.root / 'outside.pcap')}, {'name': '../capture.pcap'},
                        {'sha256': 'f' * 64}, {'bytes': original['bytes'] + 1}):
            with self.subTest(change=changed), self.assertRaises((OSError, Phase10Error)):
                self.custody.record(case, bundle, {**metadata, 'artifacts': [{**original, **changed}]})
        actual = self.folder / 'capture.pcap'
        actual.write_bytes(b'another synthetic source')
        different = {**original, 'bytes': actual.stat().st_size, 'sha256': sha(actual.read_bytes())}
        with self.assertRaises(Phase10Error):
            self.custody.record(case, bundle, {**metadata, 'artifacts': [different]})
        self.assertFalse(self.custody.path.exists())

    def test_symlinks_hardlinks_and_public_permissions_are_refused(self):
        case, bundle, metadata = self.fixture()
        path = self.folder / 'capture.pcap'
        saved = path.read_bytes()
        other = self.root / 'other.pcap'
        other.write_bytes(saved)
        other.chmod(0o600)
        path.unlink()
        path.symlink_to(other)
        with self.assertRaises((OSError, Phase10Error)):
            self.custody.record(case, bundle, metadata)
        path.unlink()
        os.link(other, path)
        with self.assertRaises(Phase10Error):
            self.custody.record(case, bundle, metadata)
        path.unlink()
        path.write_bytes(saved)
        path.chmod(0o644)
        with self.assertRaises(Phase10Error):
            self.custody.record(case, bundle, metadata)

    def test_bundle_changes_after_import_do_not_get_a_receipt(self):
        case, bundle, metadata = self.fixture()
        (bundle / 'index.sqlite').write_bytes(b'changed private index')
        self.seal(bundle)
        with self.assertRaises(Phase10Error):
            self.custody.record(case, bundle, metadata)
        self.assertFalse(self.custody.path.exists())


if __name__ == '__main__':
    unittest.main()
