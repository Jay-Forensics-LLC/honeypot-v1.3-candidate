"""Synthetic minimized exchanges; no analyzer, capture services or network run."""
import copy
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from phase10.case_leads import save_case_review
from phase10.cases import case_detail, case_export
from phase10.model import Phase10Error
from phase10.policy import Policy
from phase10.sentinel import parse_sentinel
from phase10.store import Store
from test_phase9_sentinel import encode, exchange_rows

BASE = 1793491200123456789
LABEL = 'p_' + 'a' * 32
SRC = 'p_' + 'b' * 32
DST = 'p_' + 'c' * 32


def fixture():
    case, source, observed, event, association, finding, coverage, _ = exchange_rows()
    case['payload']['configuration'] = {'rules': {'syn_minimum': 2, 'port_minimum': 2,
        'dns_label_minimum': 4, 'dns_minimum_questions': 2}}
    source['payload'].update(size=4096, kind='pcap')
    observations, events = [], []

    def observation(ident, ordinal, kind, protocol, data):
        item, timeline = copy.deepcopy(observed), copy.deepcopy(event)
        when = {'utc_ns': BASE + ordinal, 'precision': {'decimal_digits': 9},
                'timezone': 'UTC', 'status': 'normalized', 'clock': 'capture_interface'}
        item['id'] = item['payload']['id'] = ident
        item['payload'].update(ordinal=ordinal, kind=kind, protocol=protocol, data=data, time=when)
        item['payload']['provenance'].update(byte_offset=ordinal * 10, byte_length=10)
        timeline['id'] = timeline['payload']['event_id'] = ident
        timeline['payload'].update(ordinal=ordinal, kind=kind, protocol=protocol, time=when,
                                   original_utc_ns=BASE + ordinal, utc_ns=BASE + ordinal,
                                   storage='packet_meta' if ident.startswith('packet:') else 'observations',
                                   row_id=int(ident.split(':')[1]))
        observations.append(item)
        events.append(timeline)

    for ident, port in ((1, 443), (2, 443), (3, 8443)):
        observation('packet:' + str(ident), ident, 'network.tcp', 'tcp',
                    {'src': SRC, 'dst': DST, 'sport': 12345, 'dport': port, 'tcp_flags': 2})
    observation('observation:1', 4, 'dns.question', 'udp', {'response': False, 'label_lengths': [5, 3]})
    observation('observation:2', 5, 'dns.question', 'udp', {'response': False, 'label_lengths': [6]})
    observation('observation:3', 6, 'arp.mapping', 'arp', {'address': DST, 'mac': SRC})
    observation('observation:4', 7, 'arp.mapping', 'arp', {'address': DST, 'mac': LABEL})
    associations = []
    for ident, evidence, mac in ((1, 3, SRC), (2, 4, LABEL)):
        item = copy.deepcopy(association)
        item['id'] = 'association:' + str(ident)
        item['payload'].update(id=ident, evidence_id=evidence, left_value=DST, right_value=mac,
                               start_ns=BASE, end_ns=BASE + 1000, conflicts=[1])
        associations.append(item)
    thresholds = {
        'repeated_syn': {'window_seconds': 60, 'syn_minimum': 2},
        'destination_ports': {'window_seconds': 60, 'port_minimum': 2},
        'dns_long_labels': {'window_seconds': 60, 'dns_label_minimum': 4, 'dns_minimum_questions': 2},
        'conflicting_mappings': {'mapping_minimum_conflicts': 1}}
    findings = []
    bucket = BASE // (60 * 10**9)
    for ident, rule in enumerate(thresholds, 1):
        item = copy.deepcopy(finding)
        item['id'] = 'finding:' + str(ident)
        evaluation = {'required_coverage': 'Synthetic required coverage', 'minimum_sample_size': 2,
                      'sample_unit': 'Synthetic sample unit', 'thresholds': thresholds[rule]}
        if rule in ('repeated_syn', 'destination_ports'):
            evidence = {'first_packet': 1, 'last_packet': 2 if rule == 'repeated_syn' else 3,
                        'selector': {'table': 'rule_packets', 'context': LABEL, 'src': SRC,
                                     'dst': DST, 'bucket': bucket, 'dport': 443 if rule == 'repeated_syn' else None}}
            metrics = {'eligible_count': 2, 'window_bucket': bucket, 'src': SRC, 'dst': DST}
        elif rule == 'dns_long_labels':
            evidence = {'first_observation': 1, 'last_observation': 2,
                        'selector': {'table': 'rule_dns', 'context': LABEL, 'bucket': bucket, 'minimum_label_length': 4}}
            metrics = {'questions': 2, 'long_label_questions': 2, 'window_bucket': bucket}
        else:
            evidence = {'conflict': 1, 'associations': [1, 2]}
            metrics = {'conflicts': 1}
        item['payload'].update(id=ident, rule=rule, start_ns=BASE, end_ns=BASE + 1000,
                               evidence=evidence, metrics={**metrics, 'evaluation': evaluation})
        findings.append(item)
    coverage['payload']['details']['counts'].update(packet_records=3, observations=4,
        associations=2, conflicts=1, findings=4, parse_errors=0)
    return [case, source, *observations, *events, *associations, *findings, coverage]


class CaseLeads(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.store = Store(self.root / 'store', Policy(enabled=True, plugins=('sentinel',)))
        self.decisions = self.root / 'reviews' / 'decisions.json'

    def save(self, rows=None, run_prefix='1'):
        rows = copy.deepcopy(fixture() if rows is None else rows)
        rows[0]['payload']['run_id'] = run_prefix + rows[0]['payload']['run_id'][1:]
        data = encode(rows)
        digest = hashlib.sha256(data).hexdigest()
        context = self.store.policy.context(digest, '2026-11-01T00:00:00Z')
        context['sentinel_bundle_receipt'] = {'status': 'COMPLETE', 'exchange_sha256': digest,
            'bundle_sha256': 'f' * 64, 'run_id': rows[0]['payload']['run_id'],
            'parser_version': rows[0]['payload']['parser_version']}
        return self.store.save('sentinel', 'jsonl', data,
                               parse_sentinel(data, 'jsonl', context), context['imported_at'])['import_id']

    def lead(self, case, rule='repeated_syn', **kwargs):
        return next(item for item in case_detail(self.store, case, **kwargs)['lead_details'] if item['rule'] == rule)

    def originals(self):
        return {path.relative_to(self.store.root).as_posix(): path.read_bytes()
                for path in self.store.root.rglob('*') if path.is_file()}

    def test_all_four_rules_link_exact_unchanged_source_records(self):
        case = self.save()
        before = self.originals()
        original = self.store.read_import(case)['findings']
        result = case_detail(self.store, case)
        expected = {'repeated_syn': ['packet:1', 'packet:2'],
                    'destination_ports': ['packet:1', 'packet:2', 'packet:3'],
                    'dns_long_labels': ['observation:1', 'observation:2'],
                    'conflicting_mappings': ['observation:3', 'observation:4']}
        for lead in result['lead_details']:
            support = lead['support']
            self.assertEqual(support['status'], 'resolved')
            self.assertEqual([item['details']['provenance']['occurrence_id'] for item in support['records']], expected[lead['rule']])
            self.assertEqual(support['returned_records'], support['total_matching_records'])
            for item in support['records']:
                self.assertIn(item, original)
                self.assertEqual(item['details']['provenance']['source_sha256'], 'a' * 64)
                self.assertTrue(item['details']['provenance']['record_sha256'])
                self.assertEqual(item['details']['source_time']['precision']['decimal_digits'], 9)
        self.assertEqual(case_export(self.store, case)['findings'], original)
        self.assertEqual(self.lead(case, 'destination_ports')['pattern_metrics'], {'distinct_destination_ports': 2})
        self.assertEqual(self.lead(case)['evaluation']['thresholds'], {'window_seconds': 60, 'syn_minimum': 2})
        self.assertEqual(before, self.originals())

    def test_support_sample_limits_are_explicit_and_do_not_change_counts(self):
        case = self.save()
        with patch('phase10.case_leads.MAX_SUPPORT_RECORDS', 1):
            support = self.lead(case, 'destination_ports')['support']
        self.assertEqual((support['status'], support['returned_records'], support['total_matching_records']), ('partial', 1, 3))
        self.assertTrue(support['truncated'])
        self.assertEqual(support['reason'], 'sample_limit')
        with patch('phase10.case_leads.MAX_CASE_SUPPORT_BYTES', 0):
            self.assertEqual(self.lead(case)['support']['returned_records'], 0)

    def test_arbitrary_exchange_prose_and_commands_never_enter_derivative_exports(self):
        rows = fixture()
        for row in rows:
            if row['entity'] == 'finding':
                row['payload'].update(explanation='PRIVATE_TEST', alternatives=['PRIVATE_TEST'], limitations=['PRIVATE_TEST'])
                row['payload']['metrics']['evaluation'].update(required_coverage='PRIVATE_TEST', sample_unit='PRIVATE_TEST')
                row['payload']['evidence']['reproduction'] = {'command': 'PRIVATE_TEST', 'sql': 'PRIVATE_TEST'}
            if row['entity'] == 'observation':
                row['payload']['data']['arbitrary_body'] = 'PRIVATE_TEST'
        case = self.save(rows)
        with patch('subprocess.run', side_effect=AssertionError('No subprocess')), \
                patch('socket.getaddrinfo', side_effect=AssertionError('No DNS')):
            exported = case_export(self.store, case)
        self.assertNotIn('PRIVATE_TEST', json.dumps(exported))
        self.assertTrue(all(item['support']['status'] == 'resolved' for item in exported['lead_details']))
        self.assertIn('do not prove authorship', exported['export_scope']['authorship_statement'])
        self.assertTrue(exported['export_scope']['omissions'])

    def test_unknown_rules_and_invalid_closed_selectors_remain_visible_but_unavailable(self):
        mutations = [lambda p: p.update(rule='future_rule'), lambda p: p.update(rule_version='1.0.1'),
                     lambda p: p['evidence']['selector'].update(sql='PRIVATE_TEST'),
                     lambda p: p['evidence']['selector'].update(context='p_' + 'd' * 32),
                     lambda p: p['evidence'].update(first_packet=True),
                     lambda p: p['evidence'].update(first_packet=4, last_packet=4),
                     lambda p: p['metrics'].update(eligible_count=999)]
        for index, mutation in enumerate(mutations):
            with self.subTest(mutation=index):
                rows = fixture()
                payload = next(row['payload'] for row in rows if row['id'] == 'finding:1')
                mutation(payload)
                case = self.save(rows)
                lead = case_detail(self.store, case)['lead_details'][0]
                self.assertEqual(lead['support']['status'], 'unavailable')
                self.assertEqual(lead['support']['records'], [])
                self.assertIsNone(lead['support']['total_matching_records'])
                self.assertNotIn('PRIVATE_TEST', json.dumps(lead))

    def test_mapping_refs_and_packet_observation_namespaces_never_fall_back(self):
        rows = fixture()
        mapping = next(row['payload'] for row in rows if row['id'] == 'finding:4')
        mapping['evidence']['associations'] = [1, 99]
        case = self.save(rows)
        self.assertEqual(self.lead(case, 'conflicting_mappings')['support']['status'], 'unavailable')
        # Packet 3 exists, but association evidence 3 must mean decoded observation 3.
        rows = [row for row in fixture() if not (row['entity'] in ('observation', 'timeline') and row['id'] == 'observation:3')]
        with self.assertRaises(Phase10Error):
            self.save(rows)

    def test_mapping_conflicts_require_typed_ids_matching_statements_and_real_overlap(self):
        for change in ({'conflicts': [True]}, {'evidence_id': 1},
                       {'start_ns': BASE + 1000, 'end_ns': BASE + 2000}):
            with self.subTest(change=change):
                rows = fixture()
                next(row['payload'] for row in rows if row['id'] == 'association:2').update(change)
                case = self.save(rows)
                self.assertEqual(self.lead(case, 'conflicting_mappings')['support']['status'], 'unavailable')

    def test_same_ids_across_cases_never_join_or_accept_other_case_decisions(self):
        first, second = self.save(), self.save(run_prefix='2')
        one, two = case_detail(self.store, first), case_detail(self.store, second)
        for lead in one['lead_details']:
            self.assertTrue(all(item['details']['namespace'] == one['case']['namespace'] for item in lead['support']['records']))
        self.assertNotEqual(one['lead_details'][0]['finding_id'], two['lead_details'][0]['finding_id'])
        with self.assertRaises(Phase10Error):
            save_case_review(self.store, self.decisions, {'case_id': first,
                'finding_id': two['lead_details'][0]['finding_id'], 'status': 'false_positive'})
        self.assertFalse(self.decisions.exists())

    def test_false_positive_decisions_persist_with_history_and_preserve_originals(self):
        case = self.save()
        before = self.originals()
        lead = self.lead(case)
        command = {'case_id': case, 'finding_id': lead['finding_id'], 'status': 'false_positive', 'note': 'Authorized synthetic monitor'}
        first = save_case_review(self.store, self.decisions, command)
        self.assertEqual(first['revision'], 1)
        state = self.lead(case, decision_path=self.decisions)['review']
        self.assertEqual((state['status'], state['note']), ('false_positive', command['note']))
        save_case_review(self.store, self.decisions, {**command, 'status': 'in_review', 'note': ''})
        exported = case_export(self.store, case, self.decisions)
        self.assertEqual([item['status'] for item in exported['case_review']['history']], ['false_positive', 'in_review'])
        self.assertEqual(exported['lead_details'][0]['review']['revision'], 2)
        self.assertTrue(all(item['assessment'] == 'possible' for item in exported['findings'] if item['details']['metrics']['entity'] == 'finding'))
        self.assertEqual(before, self.originals())
        self.assertEqual(self.decisions.stat().st_mode & 0o077, 0)

    def test_invalid_decisions_and_notes_do_not_create_state(self):
        case = self.save()
        finding = self.lead(case)['finding_id']
        observation = case_detail(self.store, case)['timeline']['items'][0]['observation']['finding_id']
        command = {'case_id': case, 'finding_id': finding, 'status': 'false_positive'}
        for changed in ({'finding_id': observation}, {'status': 'confirmed'}, {'note': 'a' * 513},
                        {'note': '\x00'}, {'case_id': '../case'}, {'extra': True}):
            with self.subTest(fields=changed), self.assertRaises(Phase10Error):
                save_case_review(self.store, self.decisions, {**command, **changed})
        self.assertFalse(self.decisions.exists())

    def test_tampered_originals_fail_before_support_or_review(self):
        case = self.save()
        manifest = self.store.read_import(case)['manifest']
        path = self.store.root / manifest['original']['path']
        path.write_bytes(path.read_bytes().replace(b'network.tcp', b'network.udp', 1))
        with self.assertRaises(Phase10Error):
            case_detail(self.store, case)
        with self.assertRaises(Phase10Error):
            save_case_review(self.store, self.decisions, {'case_id': case,
                'finding_id': 'a' * 64, 'status': 'false_positive'})
        self.assertFalse(self.decisions.exists())

    def test_corrupt_review_history_is_explicit_and_never_overwritten(self):
        case = self.save()
        command = {'case_id': case, 'finding_id': self.lead(case)['finding_id'], 'status': 'false_positive'}
        save_case_review(self.store, self.decisions, command)
        document = json.loads(self.decisions.read_bytes())
        document['events'][0]['status'] = 'reviewed'
        damaged = json.dumps(document).encode()
        self.decisions.write_bytes(damaged)
        review = case_detail(self.store, case, decision_path=self.decisions)['case_review']
        self.assertFalse(review['decisions_available'])
        self.assertEqual(review['reason'], 'decisions_unavailable')
        with self.assertRaises(Phase10Error):
            save_case_review(self.store, self.decisions, command)
        self.assertEqual(self.decisions.read_bytes(), damaged)

    def test_symlinks_and_atomic_write_failures_preserve_history(self):
        case = self.save()
        command = {'case_id': case, 'finding_id': self.lead(case)['finding_id'], 'status': 'false_positive'}
        save_case_review(self.store, self.decisions, command)
        before = self.decisions.read_bytes()
        with patch('phase10.case_leads.os.replace', side_effect=OSError('Synthetic write failure')):
            with self.assertRaises(OSError):
                save_case_review(self.store, self.decisions, {**command, 'status': 'reviewed'})
        self.assertEqual(self.decisions.read_bytes(), before)
        self.assertEqual(list(self.decisions.parent.iterdir()), [self.decisions])
        alias = self.decisions.with_name('alias.json')
        alias.symlink_to(self.decisions)
        with self.assertRaises((OSError, Phase10Error)):
            save_case_review(self.store, alias, command)
        os.chmod(self.decisions, 0o644)
        with self.assertRaises(Phase10Error):
            save_case_review(self.store, self.decisions, command)


if __name__ == '__main__':
    unittest.main()
