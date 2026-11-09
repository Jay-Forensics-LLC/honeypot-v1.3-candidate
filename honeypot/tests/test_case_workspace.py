"""Case-local views use synthetic minimized records and never the private index."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from phase10.cases import case_detail, case_export, list_cases
from phase10.model import Phase10Error, make_finding
from phase10.policy import Policy
from phase10.sentinel import parse_sentinel
from phase10.store import Store
from test_phase9_sentinel import encode, exchange_rows, parse

BASE = 1793491200123456789


def saved_case(store, times, run_prefix='1', *, receipt=True, protocols=None):
    rows = exchange_rows()
    case, source, observed, event, _, _, coverage, _ = rows
    case['payload']['run_id'] = run_prefix + case['payload']['run_id'][1:]
    source['payload']['kind'] = 'pcap'
    observations, timeline = [], []
    for index, ns in enumerate(times, 1):
        observation, item = copy.deepcopy(observed), copy.deepcopy(event)
        ident = 'observation:' + str(index)
        time = {'utc_ns': ns, 'precision': {'decimal_digits': 9} if ns is not None else None,
                'timezone': 'UTC' if ns is not None else None,
                'status': 'normalized' if ns is not None else 'unresolved',
                'clock': 'capture_interface'}
        protocol = 'tcp' if index % 2 else 'dns'
        observation['id'] = observation['payload']['id'] = ident
        observation['payload'].update(ordinal=index, protocol=protocol, time=time,
                                      data={'src': 'p_' + 'b' * 32})
        item['id'] = item['payload']['event_id'] = ident
        item['payload'].update(ordinal=index, row_id=index, protocol=protocol, time=time,
                               utc_ns=ns, original_utc_ns=ns)
        observations.append(observation)
        timeline.append(item)
    coverage['payload']['details']['counts'].update(packet_records=len(times), observations=len(times),
                                                    associations=0, findings=0, parse_errors=0)
    coverage['payload']['details'].update(
        rules=[{'rule': 'repeated_syn', 'version': '1.0.0', 'status': 'NO_FINDING',
                'eligible': len(times), 'findings': 0, 'configuration': {}, 'reason': 'PRIVATE_TEST'}],
        reassembly='none')
    if protocols is not None:
        coverage['payload']['details']['protocol_distribution'] = protocols
    data = encode([case, source, *observations, *timeline, coverage])
    digest = hashlib.sha256(data).hexdigest()
    context = store.policy.context(digest, '2026-11-01T00:00:00Z')
    if receipt:
        context['sentinel_bundle_receipt'] = {
            'status': 'COMPLETE', 'exchange_sha256': digest, 'bundle_sha256': 'f' * 64,
            'run_id': case['payload']['run_id'], 'parser_version': case['payload']['parser_version']}
    normalized = parse_sentinel(data, 'jsonl', context)
    return store.save('sentinel', 'jsonl', data, normalized, context['imported_at'])['import_id']


class CaseWorkspace(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name) / 'store'
        self.policy = Policy(enabled=True, plugins=('sentinel',), max_records=2015)
        self.store = Store(self.root, self.policy)

    def test_case_isolation_and_pages_beyond_overview_and_combined_export_limits(self):
        first = saved_case(self.store, [BASE + index for index in range(1005)])
        second = saved_case(self.store, [BASE, None], '2')
        with self.assertRaises(Phase10Error):
            self.store.export()
        cases = list_cases(self.store)
        self.assertEqual({row['case_id'] for row in cases}, {first, second})
        self.assertEqual(len({row['namespace'] for row in cases}), 2)
        result = case_detail(self.store, first, {'offset': 1000, 'limit': 50})
        self.assertEqual(result['timeline']['total'], 1005)
        self.assertEqual(len(result['timeline']['items']), 5)
        self.assertEqual(result['timeline']['items'][-1]['details']['provenance']['ordinal'], '1005')
        exported = case_export(self.store, second)
        self.assertEqual(exported['case']['event_count'], 2)
        self.assertTrue(all(row['details']['namespace'] == exported['case']['namespace']
                            for row in exported['findings']))
        self.assertNotIn('PRIVATE_TEST', json.dumps(exported))

    def test_exact_time_sort_filter_ties_and_unresolved(self):
        case = saved_case(self.store, [BASE + 2, BASE, BASE + 1, BASE, None])
        result = case_detail(self.store, case)
        items = result['timeline']['items']
        self.assertEqual([row['details']['provenance']['ordinal'] for row in items],
                         ['2', '4', '3', '1', '5'])
        self.assertEqual(items[2]['details']['metrics']['adjusted_utc_ns'], str(BASE + 1))
        self.assertIsNone(items[-1]['details']['source_time']['utc_ns'])
        filtered = case_detail(self.store, case, {'since': '2026-11-01T00:00:00.123456790Z',
                                                 'until': '2026-11-01T01:00:00.123456791+01:00'})
        self.assertEqual([row['details']['metrics']['adjusted_utc_ns']
                          for row in filtered['timeline']['items']], [str(BASE + 1), str(BASE + 2)])
        self.assertEqual(case_detail(self.store, case, {'include_unresolved': False})['timeline']['total'], 4)

    def test_search_source_protocol_and_merged_provenance(self):
        case = saved_case(self.store, [BASE, BASE + 1, None])
        result = case_detail(self.store, case, {'protocol': 'dns', 'source_id': 1, 'query': 'p_' + 'b' * 32})
        self.assertEqual(result['timeline']['total'], 1)
        row = result['timeline']['items'][0]
        self.assertEqual(row['observation']['details']['provenance']['byte_length'], 2)
        self.assertEqual(row['details']['provenance']['source_sha256'], 'a' * 64)
        originals = {item['finding_id']: item for item in self.store.read_import(case)['findings']}
        self.assertEqual({key: value for key, value in row.items() if key != 'observation'},
                         originals[row['finding_id']])
        self.assertEqual(row['observation'], originals[row['observation']['finding_id']])
        self.assertEqual(result['filters']['protocols'], ['dns', 'tcp'])
        self.assertEqual(result['filters']['source_ids'], [1])
        self.assertEqual(result['coverage'][0]['details']['metrics']['rules'][0]['eligible'], 3)
        self.assertTrue(result['coverage'][0]['details']['limitations'])
        self.assertEqual(case_detail(self.store, case, {'source_id': 2})['timeline']['total'], 0)

    def test_invalid_filters_and_case_identifiers_are_rejected(self):
        case = saved_case(self.store, [BASE])
        for filters in ({'extra': 1}, {'offset': True}, {'offset': -1}, {'limit': 201},
                        {'source_id': True}, {'source_id': '1'}, {'include_unresolved': 1},
                        {'query': '\n'}, {'query': 'q' * 257}, {'protocol': '../tcp'},
                        {'since': '2026-11-01T00:00:00'}, {'since': '2026-02-30T00:00:00Z'},
                        {'since': '2026-11-01T00:00:00+01:99'},
                        {'since': '2026-11-02T00:00:00Z', 'until': '2026-11-01T00:00:00Z'}):
            with self.subTest(filters=filters), self.assertRaises(Phase10Error):
                case_detail(self.store, case, filters)
        for identifier in ('../imports', '', '0' * 64):
            with self.subTest(identifier=identifier), self.assertRaises(Phase10Error):
                case_detail(self.store, identifier)

    def test_disabled_unverified_and_tampered_imports_are_not_exposed(self):
        case = saved_case(self.store, [BASE])
        for policy in (Policy(), Policy(enabled=True, plugins=('bbot',))):
            disabled = Store(self.root, policy)
            self.assertEqual(list_cases(disabled), [])
            with self.assertRaises(Phase10Error):
                case_export(disabled, case)
        unverified = saved_case(self.store, [BASE], '2', receipt=False)
        with self.assertRaises(Phase10Error):
            case_detail(self.store, unverified)
        projection = self.root / 'findings' / (case + '.jsonl')
        projection.write_bytes(projection.read_bytes().replace(b'normalized', b'NORMALIZED', 1))
        with self.assertRaises(Phase10Error):
            case_export(self.store, case)

    def test_selected_case_does_not_read_other_import_projections(self):
        case = saved_case(self.store, [BASE])
        other = saved_case(self.store, [BASE], '2')
        (self.root / 'findings' / (other + '.jsonl')).write_text('invalid')
        self.assertEqual(case_detail(self.store, case)['timeline']['total'], 1)
        with self.assertRaises(Phase10Error):
            case_detail(self.store, other)
        manifest = self.root / 'imports' / (case + '.json')
        manifest.write_text('{"import_id":"' + case + '","plugin_id":"sentinel"}')
        with self.assertRaises(Phase10Error):
            case_export(self.store, case)

    def test_real_exchange_coverage_name_is_minimized_but_scope_stays_explicit(self):
        rows = exchange_rows()
        rows[6]['payload']['name'] = 'p_' + 'c' * 32
        coverage = next(row for row in parse(rows) if row['details']['metrics']['entity'] == 'coverage')
        self.assertEqual(coverage['details']['counts']['observations'], 1)
        self.assertNotIn('name', coverage['details']['metrics'])
        for change in ({'name': 'arbitrary_scope'}, {'name': 'p_' + 'c' * 31}):
            rows[6]['payload'].update(change)
            with self.assertRaises(Phase10Error):
                parse(rows)
        rows = exchange_rows()
        rows[6]['id'] = 'coverage:other'
        with self.assertRaises(Phase10Error):
            parse(rows)

    def test_association_evidence_ids_never_fall_back_to_colliding_packet_ids(self):
        rows = exchange_rows()
        packet = copy.deepcopy(rows[2])
        packet['id'] = packet['payload']['id'] = 'packet:1'
        packet['payload'].update(kind='network.arp', protocol='arp', ordinal=2)
        rows.insert(2, packet)
        association = next(row for row in parse(rows) if row['details']['metrics']['entity'] == 'association')
        self.assertEqual(association['details']['provenance']['evidence_id'], 'observation:1')
        # Packet and decoded observation IDs occupy separate source tables;
        # an integer collision cannot repair a missing decoded observation.
        rows = [row for row in rows if row['id'] != 'observation:1']
        with self.assertRaises(Phase10Error):
            parse(rows)

    def test_all_ip_protocol_counts_round_trip_without_expanding_generic_details(self):
        protocols = {'ip_' + str(number): number for number in range(256)}
        case = saved_case(self.store, [BASE], protocols=protocols)
        coverage = case_detail(self.store, case)['coverage'][0]
        self.assertEqual(coverage['details']['metrics']['protocol_distribution'], protocols)
        self.assertIn(coverage, self.store.read_import(case)['findings'])
        self.assertEqual(len(self.store.export()), 5)
        context = self.policy.context('a' * 64, '2026-11-01T00:00:00Z')
        generic = {'key_' + str(number): number for number in range(101)}
        for details in ({'metrics': {'arbitrary': generic}},
                        {'source_time': {'protocol_distribution': generic}},
                        {'metrics': {'nested': {'protocol_distribution': generic}}}):
            with self.subTest(details=next(iter(details))), self.assertRaises(Phase10Error):
                make_finding('bbot', 'fixture', 'domain', 'sample.example.org', context, details=details)

    def test_protocol_coverage_limits_remain_strict(self):
        context = self.policy.context('a' * 64, '2026-11-01T00:00:00Z')
        for protocols in ({'ip_' + str(number): 1 for number in range(513)},
                          {'tcp': True}, {'tcp': -1}, {'tcp': 1.5}, {'tcp': 10**15 + 1},
                          {'invalid protocol': 1}, {'session': 1}):
            rows = exchange_rows()
            rows[6]['payload']['details']['protocol_distribution'] = protocols
            with self.subTest(protocols=next(iter(protocols))), self.assertRaises(Phase10Error):
                parse(rows)
            with self.assertRaises(Phase10Error):
                make_finding('bbot', 'fixture', 'domain', 'sample.example.org', context,
                             details={'metrics': {'protocol_distribution': protocols}})


if __name__ == '__main__':
    unittest.main()
