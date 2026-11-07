"""Small offline report fixtures; originating assessment tools are never run."""
import copy
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from phase10.model import Phase10Error
from phase10.reports import parse_awareness, parse_bloodhound, parse_cloudfox, parse_nmap, parse_nuclei


class ReportImports(unittest.TestCase):
    def setUp(self):
        self.context = {
            'raw_source_hash': 'a' * 64, 'imported_at': '2026-11-01T12:00:00Z',
            'scope': ['192.0.2.0/24', '2001:db8::/32', 'example.test', 'arn:aws:s3:::example-bucket'],
            'assessment_approved': True, 'awareness_approved': True,
            'privacy_policy': 'aggregate-policy-v1', 'max_records': 100,
        }

    @staticmethod
    def encoded(document):
        return json.dumps(document).encode()

    def nuclei(self, **fields):
        return {'template-id': 'http-example', 'host': 'https://example.test',
                'matched-at': 'https://example.test/path?private=value#fragment',
                'info': {'severity': 'medium'}, 'timestamp': '2026-10-31T10:00:00Z', **fields}

    def awareness(self, **fields):
        return {'schema_version': 1, 'campaign_id': 'campaign-1', 'provider': 'gophish',
                'totals': {'sent': 20, 'opened': 12, 'clicked': 3, 'reported': 7}, **fields}

    def test_nmap_native_xml_normalizes_ports_and_provenance(self):
        data = b'<!DOCTYPE nmaprun><nmaprun start="1793440800"><host><status state="up"/><address addr="192.0.2.4" addrtype="ipv4"/><ports><port protocol="tcp" portid="443"><state state="open"/><service name="https" product="PRIVATE-BANNER"/><script id="ignored" output="PRIVATE-OUTPUT"/></port></ports></host></nmaprun>'
        rows = parse_nmap(data, 'xml', self.context)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['indicator_value'], '192.0.2.4')
        self.assertEqual(rows[0]['scope_status'], 'owned')
        self.assertEqual(rows[0]['details'], {'ports': [443], 'service': 'tcp/https', 'status': 'open'})
        self.assertIsNotNone(rows[0]['collected_at'])
        self.assertEqual(rows[0]['evidence_reference'], 'sha256:' + 'a' * 64)
        self.assertNotIn('PRIVATE', json.dumps(rows))

    def test_nmap_ipv6_and_host_only_observations(self):
        rows = parse_nmap(b'<nmaprun><host><status state="down"/><address addr="2001:db8::4" addrtype="ipv6"/></host></nmaprun>', 'xml', self.context)
        self.assertEqual(rows[0]['indicator_value'], '2001:db8::4')
        self.assertEqual(rows[0]['details'], {'status': 'down'})
        self.assertIsNone(rows[0]['collected_at'])

    def test_nmap_requires_approval_and_scope(self):
        data = b'<nmaprun><host><address addr="192.0.2.4" addrtype="ipv4"/></host></nmaprun>'
        for change in ({'assessment_approved': False}, {'assessment_approved': 1}, {'scope': []}):
            with self.subTest(change=change), self.assertRaises(Phase10Error):
                parse_nmap(data, 'xml', {**self.context, **change})

    def test_nmap_outside_scope_and_invalid_port_rejected(self):
        for data in (
            b'<nmaprun><host><address addr="198.51.100.4" addrtype="ipv4"/></host></nmaprun>',
            b'<nmaprun><host><address addr="192.0.2.4" addrtype="ipv4"/><ports><port protocol="tcp" portid="65536"><state state="open"/></port></ports></host></nmaprun>',
            b'<nmaprun><host><address addr="192.0.2.4" addrtype="ipv4"/><ports><port protocol="tcp" portid="443"/></ports></host></nmaprun>',
        ):
            with self.subTest(data=data), self.assertRaises(Phase10Error):
                parse_nmap(data, 'xml', self.context)

    def test_nmap_dtd_subset_and_wrong_root_are_rejected(self):
        for data in (b'<!DOCTYPE nmaprun [<!ENTITY example "value">]><nmaprun/>', b'<other/>', b'<nmaprun>'):
            with self.subTest(data=data), self.assertRaises(Phase10Error):
                parse_nmap(data, 'xml', self.context)

    def test_nmap_output_limit_covers_address_port_product(self):
        data = b'<nmaprun><host><address addr="192.0.2.4" addrtype="ipv4"/><address addr="192.0.2.5" addrtype="ipv4"/><ports><port protocol="tcp" portid="443"><state state="open"/></port></ports></host></nmaprun>'
        with self.assertRaises(Phase10Error):
            parse_nmap(data, 'xml', {**self.context, 'max_records': 1})

    def test_nuclei_exports_typed_summary_without_raw_response(self):
        document = self.nuclei(request='PRIVATE-REQUEST', response='PRIVATE-RESPONSE', **{'extracted-results': ['PRIVATE-EXTRACTED']})
        rows = parse_nuclei(self.encoded(document) + b'\n', 'jsonl', self.context)
        self.assertEqual(rows[0]['indicator_value'], 'https://example.test/')
        self.assertEqual(rows[0]['assessment'], 'possible')
        self.assertEqual(rows[0]['details'], {'template_id': 'http-example', 'severity': 'medium'})
        exported = json.dumps(rows)
        for value in ('PRIVATE', 'private=value', '/path', 'fragment'):
            self.assertNotIn(value, exported)

    def test_nuclei_rejects_unapproved_scope_mismatch_and_userinfo(self):
        cases = [
            (self.nuclei(), {**self.context, 'assessment_approved': False}),
            (self.nuclei(**{'matched-at': 'https://outside.test'}), self.context),
            (self.nuclei(host='https://outside.test'), self.context),
            (self.nuclei(**{'matched-at': 'https://name:private@example.test'}), self.context),
        ]
        for row, context in cases:
            with self.subTest(row=row), self.assertRaises(Phase10Error):
                parse_nuclei(self.encoded(row), 'jsonl', context)

    def test_nuclei_handles_scanner_error_without_copying_error_text(self):
        rows = parse_nuclei(self.encoded(self.nuclei(error='PRIVATE ERROR')), 'jsonl', self.context)
        self.assertEqual(rows[0]['assessment'], 'scan_error')
        self.assertNotIn('PRIVATE', json.dumps(rows))

    def test_nuclei_negative_match_is_informational(self):
        rows = parse_nuclei(self.encoded(self.nuclei(**{'matcher-status': False})), 'jsonl', self.context)
        self.assertEqual(rows[0]['assessment'], 'informational')
        with self.assertRaises(Phase10Error):
            parse_nuclei(self.encoded(self.nuclei(**{'matcher-status': 'false'})), 'jsonl', self.context)

    def test_nuclei_limits_and_invalid_timestamp(self):
        data = self.encoded(self.nuclei()) + b'\n' + self.encoded(self.nuclei())
        with self.assertRaises(Phase10Error):
            parse_nuclei(data, 'jsonl', {**self.context, 'max_records': 1})
        with self.assertRaises(Phase10Error):
            parse_nuclei(self.encoded(self.nuclei(timestamp='not-a-date')), 'jsonl', self.context)

    def test_cloudfox_versioned_scoped_summary(self):
        document = {'schema_version': 1, 'records': [{'id': 'finding-1', 'resource': 'arn:aws:s3:::example-bucket', 'finding_type': 'bucket-public', 'severity': 'high'}]}
        rows = parse_cloudfox(self.encoded(document), 'json', self.context)
        self.assertEqual(rows[0]['assessment'], 'possible')
        self.assertEqual(rows[0]['scope_status'], 'owned')
        self.assertEqual(rows[0]['details']['finding_type'], 'bucket-public')

    def test_cloudfox_rejects_unknown_keys_versions_and_targets(self):
        good = {'schema_version': 1, 'records': [{'id': 'finding-1', 'resource': 'arn:aws:s3:::example-bucket', 'finding_type': 'bucket-public'}]}
        cases = [dict(good, schema_version=True), dict(good, schema_version=2), dict(good, credentials='not-exported')]
        for key, value in (('resource', 'arn:aws:s3:::outside-bucket'), ('password', 'not-exported')):
            document = copy.deepcopy(good)
            document['records'][0][key] = value
            cases.append(document)
        for document in cases:
            with self.subTest(document=document), self.assertRaises(Phase10Error):
                parse_cloudfox(self.encoded(document), 'json', self.context)

    def test_bloodhound_accepts_only_authorized_aggregate_counts(self):
        document = {'schema_version': 1, 'lab_authorized': True, 'report_id': 'lab-1', 'summary': {'nodes': 15, 'edges': 20, 'users': 5, 'sessions': 2}}
        rows = parse_bloodhound(self.encoded(document), 'json', self.context)
        self.assertEqual(rows[0]['details']['metrics'], document['summary'])
        self.assertTrue(rows[0]['details']['lab_authorized'])
        self.assertEqual(rows[0]['scope_status'], 'unknown')

    def test_bloodhound_rejects_raw_graph_and_invalid_counts(self):
        base = {'schema_version': 1, 'lab_authorized': True, 'summary': {'nodes': 15, 'edges': 20}}
        cases = [dict(base, lab_authorized=False), dict(base, users=[{'name': 'PRIVATE'}])]
        for key, value in (('nodes', -1), ('users', ['PRIVATE']), ('session_token', 'PRIVATE'), ('edges', True)):
            document = copy.deepcopy(base)
            document['summary'][key] = value
            cases.append(document)
        for document in cases:
            with self.subTest(document=document), self.assertRaises(Phase10Error):
                parse_bloodhound(self.encoded(document), 'json', self.context)
        with self.assertRaises(Phase10Error):
            parse_bloodhound(self.encoded(base), 'json', {**self.context, 'assessment_approved': False})

    def test_awareness_preserves_aggregate_counts_without_fabricating_missing_values(self):
        document = self.awareness()
        rows = parse_awareness(self.encoded(document), 'json', self.context)
        self.assertEqual(rows[0]['details']['metrics'], document['totals'])
        self.assertNotIn('completed', rows[0]['details']['metrics'])
        self.assertEqual(rows[0]['details']['provider'], 'gophish')
        self.assertEqual(rows[0]['details']['privacy_policy'], 'aggregate-policy-v1')

    def test_awareness_requires_explicit_approval_and_privacy_policy(self):
        for changes in ({'awareness_approved': False}, {'awareness_approved': 1}, {'privacy_policy': ''}, {'privacy_policy': None}):
            with self.subTest(changes=changes), self.assertRaises(Phase10Error):
                parse_awareness(self.encoded(self.awareness()), 'json', {**self.context, **changes})

    def test_awareness_rejects_identifiers_authentication_and_raw_results(self):
        for field in ('email', 'employees', 'password', 'session_token', 'results'):
            with self.subTest(field=field), self.assertRaises(Phase10Error) as error:
                parse_awareness(self.encoded(self.awareness(**{field: 'PRIVATE-VALUE'})), 'json', self.context)
            self.assertNotIn('PRIVATE-VALUE', str(error.exception))

    def test_awareness_rejects_nonaggregate_and_inconsistent_metrics(self):
        for metrics in ({'sent': 2, 'clicked': 3}, {'sent': True}, {'sent': -1}, {'sent': 2, 'users': ['PRIVATE']}, {'sent': 10**9 + 1}):
            with self.subTest(metrics=metrics), self.assertRaises(Phase10Error):
                parse_awareness(self.encoded(self.awareness(totals=metrics)), 'json', self.context)

    def test_formats_and_unsupported_providers_are_rejected(self):
        for parser in (parse_nmap, parse_nuclei, parse_cloudfox, parse_bloodhound, parse_awareness):
            with self.subTest(parser=parser.__name__), self.assertRaises(Phase10Error):
                parser(b'{}', 'unsupported', self.context)
        for provider in ('unsupported', [], {}):
            with self.subTest(provider=provider), self.assertRaises(Phase10Error):
                parse_awareness(self.encoded(self.awareness(provider=provider)), 'json', self.context)

    def test_identical_report_findings_are_deterministic(self):
        data = self.encoded(self.awareness())
        self.assertEqual(parse_awareness(data, 'json', self.context), parse_awareness(data, 'json', self.context))


if __name__ == '__main__':
    unittest.main()
