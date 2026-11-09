"""Offline integration policy, bounded parsing and provenance storage fixtures."""
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from phase10.io import parse_json, parse_jsonl, parse_xml, read_regular
from phase10.model import MAX_BYTES, Phase10Error, in_scope, make_finding, normalize_indicator
from phase10.policy import Policy
from phase10.registry import PLUGINS
from phase10.store import Store
import phase10.store as store_module

STAMP = '2026-11-01T05:30:00Z'


class PolicyAndModel(unittest.TestCase):
    def context(self, **changes):
        return {'raw_source_hash': 'ab' * 32, 'imported_at': STAMP,
                'scope': ['example.test', '192.0.2.0/24'], **changes}

    def test_missing_policy_is_disabled_without_writes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'absent'
            policy = Policy.load(root / 'policy.json')
            self.assertFalse(policy.enabled)
            store = Store(root / 'store', policy)
            self.assertEqual(store.manifests(), [])
            self.assertEqual(store.export(), [])
            with self.assertRaises(Phase10Error):
                store.save('spiderfoot', 'csv', b'', [], STAMP)
            self.assertFalse(root.exists())

    def test_closed_policy_checks_types_quotas_and_registry(self):
        invalid = ({'enabled': 1}, {'enabled': True, 'plugins': ['unknown']},
                   {'max_bytes': MAX_BYTES + 1}, {'max_records': 0},
                   {'timeout_seconds': True}, {'scope': ['a', 'a']},
                   {'plugins': 'spiderfoot'}, {'api_key': 'synthetic'},
                   {'privacy_policy': '\n'}, {'retention_days': 366})
        for row in invalid:
            with self.subTest(row=row), self.assertRaises(Phase10Error):
                Policy.from_dict(row)
        with self.assertRaises(Phase10Error):
            Policy(enabled=1)
        policy = Policy.from_dict({'enabled': True, 'plugins': ['spiderfoot']})
        self.assertEqual(policy.require('spiderfoot').mode, 'offline')
        with self.assertRaises(Phase10Error):
            policy.require('nmap')
        self.assertTrue(all(p.executable is None and not p.secrets_required for p in PLUGINS.values()))

    def test_explicit_scope_preserves_domain_boundaries_and_exact_assets(self):
        scope = ['example.test', '192.0.2.0/24', 'arn:aws:s3:::owned-bucket']
        self.assertTrue(in_scope('domain', 'a.example.test', scope))
        self.assertFalse(in_scope('domain', 'notexample.test', scope))
        self.assertFalse(in_scope('domain', 'example.test.attacker.test', scope))
        self.assertTrue(in_scope('url', 'https://example.test/report?token=synthetic', scope))
        self.assertTrue(in_scope('ip', '192.0.2.4', scope))
        self.assertFalse(in_scope('ip', '198.51.100.4', scope))
        self.assertTrue(in_scope('other', 'arn:aws:s3:::owned-bucket', scope))
        self.assertFalse(in_scope('relation', 'example.test', scope))

    def test_normalization_handles_families_and_omits_url_secrets(self):
        self.assertEqual(normalize_indicator('ip', '2001:0db8::1')[1], '2001:db8::1')
        self.assertEqual(normalize_indicator('domain', 'EXAMPLE.test.')[1], 'example.test')
        self.assertEqual(normalize_indicator('url', 'HTTPS://EXAMPLE.test:443/path?token=synthetic#key')[1], 'https://example.test/path')
        self.assertEqual(normalize_indicator('file', 'AB' * 32)[1], 'ab' * 32)
        for kind, value in (('url', 'https://user:synthetic@example.test/'),
                            ('ip', 'not-an-address'), ('domain', '-bad.test'), ('domain', 'bad.test..'),
                            ('email', '@example.test'), ('other', 'bad\nvalue')):
            with self.subTest(kind=kind), self.assertRaises(Phase10Error):
                normalize_indicator(kind, value)

    def test_finding_id_is_stable_without_inventing_historic_times(self):
        finding = make_finding('spiderfoot', 'row-1', 'domain', 'example.test', self.context())
        again = make_finding('spiderfoot', 'row-1', 'domain', 'example.test', self.context(imported_at='2026-11-02T00:00:00Z'))
        self.assertEqual(finding['finding_id'], again['finding_id'])
        self.assertIsNone(finding['collected_at'])
        self.assertEqual(finding['scope_status'], 'owned')
        self.assertEqual(finding['evidence_reference'], 'sha256:' + 'ab' * 32)
        different = make_finding('spiderfoot', 'row-2', 'domain', 'example.test', self.context())
        self.assertNotEqual(finding['finding_id'], different['finding_id'])

    def test_relationships_do_not_infer_ownership(self):
        finding = make_finding('spiderfoot', 'edge-1', 'relation', 'a -> b', self.context(),
                               relationship={'source': 'a', 'target': 'b', 'type': 'observed_relation'},
                               scope_status='shared_infrastructure')
        self.assertEqual(finding['scope_status'], 'shared_infrastructure')
        with self.assertRaises(Phase10Error):
            make_finding('spiderfoot', 'row-1', 'domain', 'unrelated.test', self.context(), scope_status='owned')

    def test_details_reject_secret_fields_but_keep_aggregate_sessions(self):
        finding = make_finding('bloodhound', 'aggregate', 'other', 'lab-summary', self.context(),
                               details={'metrics': {'sessions': 4}, 'source_time': {'utc_ns': '1793511000000000000'}})
        self.assertEqual(finding['details']['metrics']['sessions'], 4)
        self.assertEqual(finding['details']['source_time']['utc_ns'], '1793511000000000000')
        for details in ({'metrics': {'session_token': 'synthetic'}},
                        {'provenance': {'password': 'synthetic'}}, {'raw_response': 'synthetic'}):
            with self.subTest(details=details), self.assertRaises(Phase10Error):
                make_finding('spiderfoot', 'row', 'domain', 'example.test', self.context(), details=details)


class BoundedInputs(unittest.TestCase):
    def test_json_rejects_duplicates_depth_nonfinite_and_nonobject_lines(self):
        for data in (b'{"a":1,"a":2}', b'[' * 33 + b'0' + b']' * 33,
                     b'{"score":NaN}', b'{"score":1e1000}', b'{"incomplete":'):
            with self.subTest(data=data[:30]), self.assertRaises(Phase10Error):
                parse_json(data)
        self.assertEqual(parse_json(b'{"value":"[quoted]"}'), {'value': '[quoted]'})
        with self.assertRaises(Phase10Error):
            parse_jsonl(b'[]\n')
        with self.assertRaises(Phase10Error):
            parse_jsonl(b'{}\n{}\n', 1)

    def test_xml_uses_only_bounded_declared_data(self):
        self.assertEqual(parse_xml(b'<graph><node id="1"/></graph>').tag, 'graph')
        for data in (b'<!DOCTYPE graph><graph/>', b'<!ENTITY example "x"><graph/>',
                     b'<a>' * 33 + b'</a>' * 33, b'<a>'):
            with self.subTest(data=data[:30]), self.assertRaises(Phase10Error):
                parse_xml(data)

    def test_reader_checks_opened_file_and_input_budget(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            report = root / 'report.csv'
            report.write_bytes(b'abc')
            self.assertEqual(read_regular(report, 3), b'abc')
            with self.assertRaises(Phase10Error):
                read_regular(report, 2)
            alias = root / 'alias'
            alias.symlink_to(report)
            with self.assertRaises(Phase10Error):
                read_regular(alias)
            folder = root / 'folder'
            folder.mkdir()
            (folder / 'report').write_bytes(b'data')
            (root / 'linked-folder').symlink_to(folder, target_is_directory=True)
            with self.assertRaises(Phase10Error):
                read_regular(root / 'linked-folder/report')
            fifo = root / 'fifo'
            os.mkfifo(fifo)
            with self.assertRaises(Phase10Error):
                read_regular(fifo)


class ProvenanceStore(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name) / 'integrations'
        self.policy = Policy(enabled=True, plugins=('spiderfoot', 'recon-ng'), scope=('example.test',))
        self.store = Store(self.root, self.policy)
        self.raw = b'Type,Data\nDOMAIN_NAME,example.test\n'

    def finding(self, tool='spiderfoot', imported_at=STAMP):
        context = self.policy.context(hashlib.sha256(self.raw).hexdigest(), imported_at)
        return make_finding(tool, 'row-1', 'domain', 'example.test', context)

    def test_private_write_once_originals_projection_and_audit(self):
        manifest = self.store.save('spiderfoot', 'csv', self.raw, [self.finding()], STAMP)
        self.assertFalse(manifest['deduplicated'])
        self.assertEqual((self.root / manifest['original']['path']).read_bytes(), self.raw)
        self.assertEqual(self.store.export(), [self.finding()])
        self.assertEqual(len(self.store.manifests()), 1)
        self.assertEqual(json.loads((self.root / 'audit.jsonl').read_text())['action'], 'import')
        for path in [self.root, *self.root.rglob('*')]:
            self.assertFalse(path.stat().st_mode & 0o077, str(path))

    def test_duplicate_import_retains_original_timestamp_and_exact_records(self):
        original = self.store.save('spiderfoot', 'csv', self.raw, [self.finding(), self.finding()], STAMP)
        next_stamp = '2026-11-02T00:00:00Z'
        again = self.store.save('spiderfoot', 'csv', self.raw, [self.finding(imported_at=next_stamp)], next_stamp)
        self.assertTrue(again['deduplicated'])
        self.assertEqual(again['import_id'], original['import_id'])
        self.assertEqual(again['imported_at'], STAMP)
        self.assertEqual(again['normalized']['records'], 1)
        self.assertEqual(self.store.export(), [self.finding()])
        self.assertEqual(len((self.root / 'audit.jsonl').read_text().splitlines()), 1)

    def test_shared_raw_bytes_keep_distinct_plugin_provenance(self):
        self.store.save('spiderfoot', 'csv', self.raw, [self.finding()], STAMP)
        self.store.save('recon-ng', 'json', self.raw, [self.finding('recon-ng')], STAMP)
        self.assertEqual(len(list((self.root / 'objects').iterdir())), 1)
        self.assertEqual({row['source_tool'] for row in self.store.export()}, {'spiderfoot', 'recon-ng'})

    def test_failed_manifest_allows_later_retry_without_changing_original(self):
        write_once = store_module._write_once

        def fail_manifest(parent, name, data):
            if name.endswith('.json'):
                raise OSError('synthetic manifest failure')
            return write_once(parent, name, data)

        with patch.object(store_module, '_write_once', side_effect=fail_manifest), self.assertRaises(Phase10Error):
            self.store.save('spiderfoot', 'csv', self.raw, [self.finding()], STAMP)
        original = next((self.root / 'objects').iterdir())
        self.assertEqual(original.read_bytes(), self.raw)
        self.assertEqual(list((self.root / 'findings').iterdir()), [])
        self.assertEqual(self.store.manifests(), [])
        next_stamp = '2026-11-02T00:00:00Z'
        manifest = self.store.save('spiderfoot', 'csv', self.raw, [self.finding(imported_at=next_stamp)], next_stamp)
        self.assertFalse(manifest['deduplicated'])
        self.assertEqual(manifest['imported_at'], next_stamp)
        self.assertEqual(self.store.export(), [self.finding(imported_at=next_stamp)])
        self.assertEqual(original.read_bytes(), self.raw)

    def test_failed_manifest_preserves_preexisting_projection(self):
        self.store.save('spiderfoot', 'csv', self.raw, [self.finding()], STAMP)
        digest = hashlib.sha256(self.raw).hexdigest()
        identifier = hashlib.sha256(store_module._json(['recon-ng', PLUGINS['recon-ng'].version, 'json', digest])).hexdigest()
        projection = self.root / 'findings' / (identifier + '.jsonl')
        projected = store_module._json(self.finding('recon-ng'))
        projection.write_bytes(projected)
        projection.chmod(0o600)
        write_once = store_module._write_once

        def fail_manifest(parent, name, data):
            if name == identifier + '.json':
                raise OSError('synthetic manifest failure')
            return write_once(parent, name, data)

        with patch.object(store_module, '_write_once', side_effect=fail_manifest), self.assertRaises(Phase10Error):
            self.store.save('recon-ng', 'json', self.raw, [self.finding('recon-ng')], STAMP)
        self.assertEqual(projection.read_bytes(), projected)
        self.assertEqual(self.store.export(), [self.finding()])

    def test_audit_failure_preserves_committed_projection(self):
        open_file = os.open

        def fail_audit(path, *args, **kwargs):
            if path == 'audit.jsonl':
                raise OSError('synthetic audit failure')
            return open_file(path, *args, **kwargs)

        with patch.object(store_module.os, 'open', side_effect=fail_audit), self.assertRaises(Phase10Error):
            self.store.save('spiderfoot', 'csv', self.raw, [self.finding()], STAMP)
        self.assertEqual(len(self.store.manifests()), 1)
        self.assertEqual(self.store.export(), [self.finding()])
        original = next((self.root / 'objects').iterdir())
        self.assertEqual(original.read_bytes(), self.raw)
        next_stamp = '2026-11-02T00:00:00Z'
        again = self.store.save('spiderfoot', 'csv', self.raw, [self.finding(imported_at=next_stamp)], next_stamp)
        self.assertTrue(again['deduplicated'])
        self.assertEqual(self.store.export(), [self.finding()])

    def test_provenance_mismatch_rejected_before_store_creation(self):
        row = {**self.finding(), 'raw_source_hash': 'sha256:' + '00' * 32}
        with self.assertRaises(Phase10Error):
            self.store.save('spiderfoot', 'csv', self.raw, [row], STAMP)
        self.assertFalse(self.root.exists())

    def test_changed_original_never_exports_as_verified_projection(self):
        manifest = self.store.save('spiderfoot', 'csv', self.raw, [self.finding()], STAMP)
        (self.root / manifest['original']['path']).write_bytes(b'changed ordinary fixture')
        with self.assertRaises(Phase10Error):
            self.store.export()

    def test_store_quota_and_private_root_are_enforced(self):
        with patch('phase10.store.MAX_STORE_BYTES', 1), self.assertRaises(Phase10Error):
            self.store.save('spiderfoot', 'csv', self.raw, [self.finding()], STAMP)
        self.assertEqual(self.store.manifests(), [])
        self.root.chmod(0o755)
        with self.assertRaises(Phase10Error):
            self.store.save('spiderfoot', 'csv', self.raw, [self.finding()], STAMP)


if __name__ == '__main__':
    unittest.main()
