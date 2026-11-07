"""Synthetic exchange interoperability; no external analyzer or evidence used."""
import copy
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from phase10.model import Phase10Error
from phase10.sentinel import parse_sentinel, verify_bundle


RUN = '12345678-1234-4234-9234-123456789abc'
LABEL = 'p_' + 'a' * 32
WHEN = {'utc_ns': None, 'precision': None, 'timezone': None,
        'status': 'unresolved', 'clock': 'unknown'}


def exchange_rows():
    def row(entity, ident, payload):
        return {'contract': 'sentinel.honeytrace/1', 'entity': entity,
                'id': ident, 'payload': payload}
    observation = {'id': 'observation:1', 'source_id': 1, 'ordinal': 1,
                   'kind': 'telemetry.record', 'protocol': 'text', 'context': LABEL,
                   'time': copy.deepcopy(WHEN), 'data': {}, 'duplicate_of': None,
                   'provenance': {'source_id': 1, 'precision': 'byte',
                                  'byte_offset': 0, 'byte_length': 2,
                                  'record_sha256': 'b' * 64}}
    return [
        row('case', 'case', {'status': 'COMPLETE', 'run_id': RUN, 'parser_version': '2.0.10',
                            'tools': {}, 'configuration': {}, 'limitations': [],
                            'privacy': {'export': 'case_scoped_hmac_minimized_not_anonymous',
                                        'payload_retention': False}}),
        row('source', 'source:1', {'id': 1, 'sha256': 'a' * 64, 'size': 2,
                                 'kind': 'text', 'parser_version': '2.0.10', 'metadata': {}}),
        row('observation', 'observation:1', observation),
        row('timeline', 'observation:1', {'event_id': 'observation:1', 'source_id': 1,
                                         'ordinal': 1, 'kind': 'telemetry.record', 'protocol': 'text',
                                         'context': LABEL, 'original_utc_ns': None, 'utc_ns': None,
                                         'time': copy.deepcopy(WHEN), 'storage': 'observations', 'row_id': 1}),
        row('association', 'association:1', {'id': 1, 'relationship': 'observed_mapping',
                                            'context': LABEL, 'left_type': 'ip', 'left_value': LABEL,
                                            'right_type': 'mac', 'right_value': LABEL,
                                            'start_ns': None, 'end_ns': None, 'evidence_id': 1,
                                            'rule': 'association.mapping', 'rule_version': '1.0.0',
                                            'confidence': 'observed', 'explanation': 'Synthetic mapping.',
                                            'limitations': [], 'conflicts': []}),
        row('finding', 'finding:1', {'id': 1, 'rule': 'repeated_syn', 'rule_version': '1.0.0',
                                    'context': LABEL, 'start_ns': None, 'end_ns': None,
                                    'severity': 'review', 'confidence': 'supported_pattern',
                                    'explanation': 'Synthetic review lead.', 'alternatives': [],
                                    'limitations': [], 'evidence': {}, 'metrics': {}}),
        row('coverage', 'coverage', {'name': 'supported_subset', 'details': {
            'counts': {'packet_records': 0, 'observations': 1, 'flows': 0, 'associations': 1,
                       'conflicts': 0, 'findings': 1, 'parse_errors': 1, 'duplicate_records': 0},
            'decoding_losses': {'unsupported_ethertype': 2}, 'capture_blocks': {},
            'protocol_distribution': {}, 'filtered_packets': 0, 'payload_retention': False}}),
        row('error', 'error:1:2', {'code': 'timestamp_unresolved', 'source_id': 1,
                                  'ordinal': 2, 'details': {}}),
    ]


def encode(rows):
    return b''.join((json.dumps(row, sort_keys=True) + '\n').encode() for row in rows)


def parse(rows, **context):
    data = encode(rows)
    return parse_sentinel(data, 'jsonl', {
        'raw_source_hash': hashlib.sha256(data).hexdigest(),
        'imported_at': '2026-11-01T00:00:00Z', 'scope': [], **context})


class SentinelExchange(unittest.TestCase):
    def test_all_entities_keep_review_semantics_and_unknown_time(self):
        result = parse(exchange_rows())
        self.assertEqual(len(result), 8)
        self.assertEqual({row['details']['metrics']['entity'] for row in result},
                         {'case', 'source', 'observation', 'timeline', 'association', 'finding', 'coverage', 'error'})
        self.assertTrue(all(row['indicator_type'] in ('other', 'relation') for row in result))
        self.assertTrue(all(row['scope_status'] == 'unknown' and row['collected_at'] is None for row in result))
        lead = next(row for row in result if row['details']['metrics']['entity'] == 'finding')
        self.assertEqual(lead['assessment'], 'possible')
        self.assertIsNone(lead['confidence'])
        observed = result[2]
        self.assertIsNone(observed['details']['source_time']['utc_ns'])
        self.assertEqual(observed['details']['time_status'], 'unresolved')
        coverage = result[6]['details']
        self.assertEqual(coverage['counts']['parse_errors'], 1)
        self.assertEqual(coverage['metrics']['decoding_losses'], {'unsupported_ethertype': 2})

    def test_exact_nanoseconds_and_resolution_are_strings_without_rounding(self):
        rows = exchange_rows()
        time = {'utc_ns': 1793491200123456789, 'precision': {'numerator': 1, 'denominator': 1000000000},
                'timezone': 'UTC', 'status': 'normalized', 'clock': 'capture_interface'}
        rows[2]['payload']['time'] = time
        rows[3]['payload']['time'] = time
        rows[3]['payload']['utc_ns'] = rows[3]['payload']['original_utc_ns'] = time['utc_ns']
        observed = parse(rows)[2]
        self.assertEqual(observed['details']['source_time']['utc_ns'], '1793491200123456789')
        self.assertEqual(observed['details']['source_time']['precision']['denominator'], '1000000000')

    def test_stable_ids_and_case_isolation(self):
        rows = exchange_rows()
        first = parse(rows)
        self.assertEqual([r['finding_id'] for r in first], [r['finding_id'] for r in parse(rows)])
        rows[0]['payload']['run_id'] = '22345678-1234-4234-9234-123456789abc'
        second = parse(rows)
        self.assertNotEqual(first[4]['relationship']['source'], second[4]['relationship']['source'])

    def test_every_envelope_shape_is_closed_and_integer_types_are_strict(self):
        for index in range(len(exchange_rows())):
            with self.subTest(entity=index):
                rows = exchange_rows()
                rows[index]['payload']['extra'] = True
                with self.assertRaises(Phase10Error):
                    parse(rows)
        rows = exchange_rows()
        rows[1]['payload']['id'] = True
        with self.assertRaises(Phase10Error):
            parse(rows)

    def test_case_completion_order_and_source_links_are_required(self):
        for mutate in (
                lambda rows: rows[0]['payload'].update(status='INCOMPLETE'),
                lambda rows: rows.insert(1, copy.deepcopy(rows[0])),
                lambda rows: rows.pop(0),
                lambda rows: rows[2]['payload'].update(source_id=2),
                lambda rows: rows[2]['payload']['provenance'].update(byte_length=3),
                lambda rows: rows[3]['payload'].update(event_id='observation:9'),
                lambda rows: rows[4]['payload'].update(evidence_id=9),
                lambda rows: rows.pop(6)):
            rows = exchange_rows()
            mutate(rows)
            with self.assertRaises(Phase10Error):
                parse(rows)

    def test_minimized_identifiers_and_duplicate_occurrences(self):
        rows = exchange_rows()
        rows[2]['payload']['data']['src'] = LABEL
        result = parse(rows)
        self.assertEqual(result[2]['details']['metrics']['identifiers']['src'], LABEL)
        rows[2]['payload']['data']['src'] = '192.0.2.1'
        with self.assertRaises(Phase10Error):
            parse(rows)
        rows = exchange_rows()
        duplicate = copy.deepcopy(rows[2])
        duplicate['id'] = duplicate['payload']['id'] = 'observation:2'
        duplicate['payload'].update(ordinal=2, duplicate_of='observation:1')
        rows.insert(3, duplicate)
        result = parse(rows)
        self.assertEqual(result[3]['details']['provenance']['duplicate_of'], 'observation:1')
        self.assertNotEqual(result[2]['finding_id'], result[3]['finding_id'])

    def test_budgets_digest_and_optional_bundle_receipt(self):
        rows = exchange_rows()
        with self.assertRaises(Phase10Error):
            parse(rows, max_records=7)
        with self.assertRaises(Phase10Error):
            parse_sentinel(encode(rows), 'jsonl', {'raw_source_hash': '0' * 64})
        with self.assertRaises(Phase10Error):
            parse(rows, sentinel_bundle_receipt={'status': 'COMPLETE', 'exchange_sha256': '0' * 64})

    def test_numeric_overflow_in_opaque_metadata_is_rejected(self):
        rows = exchange_rows()
        rows[0]['payload']['tools']['number'] = 'OVERFLOW'
        data = encode(rows).replace(b'"OVERFLOW"', b'1e999')
        with self.assertRaises(Phase10Error):
            parse_sentinel(data, 'jsonl', {'raw_source_hash': hashlib.sha256(data).hexdigest(),
                                          'imported_at': '2026-11-01T00:00:00Z'})


class SentinelBundle(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name) / 'case'
        (self.root / 'export').mkdir(parents=True)
        (self.root / 'index.sqlite').write_bytes(b'SYNTHETIC index')
        (self.root / 'pseudonym.key').write_bytes(b'k' * 32)
        (self.root / 'state.json').write_text(json.dumps({'status': 'COMPLETE', 'version': '2.0.10'}))
        (self.root / 'manifest.json').write_text(json.dumps({'schema': 'evidence-lab/2', 'status': 'COMPLETE',
                                                           'parser_version': '2.0.10', 'run_id': RUN}))
        (self.root / 'export/exchange.jsonl').write_bytes(encode(exchange_rows()))
        self.seal()

    def seal(self):
        files = sorted(path for path in self.root.rglob('*') if path.is_file() and path.name != 'SHA256SUMS')
        (self.root / 'SHA256SUMS').write_text(''.join(hashlib.sha256(path.read_bytes()).hexdigest() +
                                                    '  ' + path.relative_to(self.root).as_posix() + '\n'
                                                    for path in files))

    def test_full_bundle_verification_returns_minimal_receipt_and_exchange(self):
        verified = verify_bundle(self.root)
        self.assertEqual(verified['exchange'], encode(exchange_rows()))
        self.assertEqual(verified['receipt']['files_verified'], 5)
        self.assertNotIn('pseudonym.key', json.dumps(verified['receipt']))
        result = parse(exchange_rows(), sentinel_bundle_receipt=verified['receipt'])
        self.assertEqual(len(result), 8)

    def test_modified_omitted_extra_and_incomplete_files_are_rejected(self):
        for mode in ('modified', 'omitted', 'extra', 'incomplete'):
            with self.subTest(mode=mode):
                if mode == 'modified':
                    (self.root / 'index.sqlite').write_bytes(b'changed')
                elif mode == 'omitted':
                    lines = (self.root / 'SHA256SUMS').read_text().splitlines()
                    (self.root / 'SHA256SUMS').write_text('\n'.join(line for line in lines if not line.endswith('pseudonym.key')))
                elif mode == 'extra':
                    (self.root / 'unlisted.txt').write_text('unlisted')
                else:
                    (self.root / 'state.json').write_text('{"status":"INCOMPLETE","version":"2.0.10"}')
                    self.seal()
                with self.assertRaises(Phase10Error):
                    verify_bundle(self.root)
                self.seal()
                if (self.root / 'unlisted.txt').exists():
                    (self.root / 'unlisted.txt').unlink()
                    self.seal()

    def test_special_alias_and_resource_limits_are_rejected(self):
        for limits in ({'max_files': 2}, {'max_total_bytes': 10}):
            with self.assertRaises(Phase10Error):
                verify_bundle(self.root, **limits)
        alias = self.root.parent / 'alias'
        alias.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(Phase10Error):
            verify_bundle(alias)
        extra = self.root / 'alias.txt'
        extra.symlink_to(self.root / 'index.sqlite')
        with self.assertRaises(Phase10Error):
            verify_bundle(self.root)


if __name__ == '__main__':
    unittest.main()
