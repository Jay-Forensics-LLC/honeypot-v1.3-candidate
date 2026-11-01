"""Assessment review uses synthetic exports; tools and external clients never run."""
from dataclasses import replace
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from phase10.model import Phase10Error
from phase10.osint import parse_bbot
from phase10.policy import Policy
from phase10.reports import parse_nmap, parse_nuclei
from phase10.security_review import ReviewWorkspace
from phase10.store import Store


class SecurityReview(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.policy = Policy(enabled=True, plugins=('nmap', 'nuclei'), assessment_approved=True,
                             scope=('192.0.2.0/24', '2001:db8::/32', 'example.test'), max_records=1500)
        self.store = Store(self.root / 'imports', self.policy)
        self.path = self.root / 'reviews' / 'decisions.json'
        self.review = ReviewWorkspace(self.store, self.path)

    def save(self, plugin, raw, policy=None):
        policy = policy or self.policy
        context = policy.context(hashlib.sha256(raw).hexdigest(), '2026-11-01T12:00:00Z')
        parser, format_name = (parse_nmap, 'xml') if plugin == 'nmap' else (parse_nuclei, 'jsonl')
        rows = parser(raw, format_name, context)
        manifest = Store(self.store.root, policy).save(plugin, format_name, raw, rows, context['imported_at'])
        return manifest['import_id']

    def nuclei(self, targets=('https://asset.example.test',), **extra):
        rows = [{'template-id': 'test-' + str(index), 'host': target,
                 'matched-at': target + '/private-path?token=PRIVATE_TEST',
                 'info': {'severity': 'high'}, 'timestamp': '2026-10-31T10:00:00Z',
                 'request': 'PRIVATE_TEST', 'response': 'PRIVATE_TEST', **extra}
                for index, target in enumerate(targets)]
        return self.save('nuclei', b''.join((json.dumps(row) + '\n').encode() for row in rows))

    def nmap(self, address='192.0.2.4', state='open'):
        identity = '<address addr="' + address + '" addrtype="' + ('ipv6' if ':' in address else 'ipv4') + '"/>'
        if 'example' in address.lower():
            identity = '<hostnames><hostname name="' + address + '"/></hostnames>'
        return self.save('nmap', ('<nmaprun><host><status state="up"/>' + identity +
                         '<ports><port protocol="tcp" portid="443"><state state="' + state +
                         '"/><service name="https"/></port></ports></host></nmaprun>').encode())

    def test_exact_hosts_group_without_dns_subdomain_or_origin_identity_inference(self):
        identifiers = [self.nmap(), self.nmap('2001:db8:0::4'), self.nmap('BÜCHER.Example.Test')]
        identifiers.append(self.nuclei(('https://192.0.2.4:8443', 'https://[2001:db8::4]',
                                       'http://xn--bcher-kva.example.test', 'https://example.test',
                                       'https://asset.example.test')))
        with patch('socket.getaddrinfo', side_effect=AssertionError('No DNS query')), \
                patch('subprocess.run', side_effect=AssertionError('No tool execution')):
            result = self.review.view({'import_ids': identifiers})
        self.assertEqual(result['counts']['observations'], 8)
        self.assertEqual(result['counts']['assets'], 5)
        assets = {(row['kind'], row['value']): row for row in result['assets']}
        self.assertEqual(assets['ip', '192.0.2.4']['observations'], 2)
        self.assertEqual(assets['ip', '2001:db8::4']['observations'], 2)
        self.assertEqual(assets['domain', 'xn--bcher-kva.example.test']['observations'], 2)
        origins = [item['source']['indicator_value'] for item in result['items']]
        self.assertIn('https://192.0.2.4:8443/', origins)
        for item in result['items']:
            original = self.store.read_import(item['import_id'])['findings']
            self.assertIn(item['source'], original)
        self.assertFalse(self.path.exists())

    def test_source_priority_retains_negative_matches_errors_and_port_states(self):
        identifiers = [self.nuclei(info={'severity': 'critical'}),
                       self.nuclei(info={'severity': 'critical'}, **{'matcher-status': False}),
                       self.nuclei(info={'severity': 'critical'}, error='PRIVATE_TEST'),
                       self.nuclei(info={'severity': 'medium'}),
                       self.nmap(state='open'), self.nmap(state='filtered'), self.nmap(state='closed')]
        result = self.review.view({'import_ids': identifiers})
        by_import = {item['import_id']: item for item in result['items']}
        self.assertEqual([by_import[value]['priority'] for value in identifiers],
                         ['high', 'informational', 'collection_issue', 'normal', 'normal', 'routine', 'informational'])
        self.assertEqual(by_import[identifiers[1]]['source']['details']['severity'], 'critical')
        self.assertEqual(by_import[identifiers[2]]['source']['assessment'], 'scan_error')
        self.assertEqual(by_import[identifiers[4]]['source']['details']['status'], 'open')
        self.assertTrue(all(item['source']['confidence'] is None for item in result['items']))
        self.assertTrue(all(item['review_steps'] for item in result['items']))

    def test_current_scope_is_rechecked_and_decisions_are_retained_when_disabled(self):
        identifier = self.nuclei(('https://example.test', 'https://other.example.test'))
        original = self.review.view({'import_ids': [identifier]})['items'][0]
        self.review.triage({'import_id': identifier, 'finding_id': original['source']['finding_id'],
                            'status': 'in_review', 'note': 'Reviewing intended exposure.'})
        saved = self.path.read_bytes()
        narrow = replace(self.policy, scope=('other.example.test',))
        review = ReviewWorkspace(Store(self.store.root, narrow), self.path)
        result = review.view({'import_ids': [identifier]})
        self.assertEqual(result['counts']['excluded_scope'], 1)
        self.assertEqual(result['counts']['observations'], 1)
        excluded = next(row for row in self.store.read_import(identifier)['findings']
                        if row['indicator_value'] == 'https://example.test/')
        with self.assertRaises(Phase10Error):
            review.triage({'import_id': identifier, 'finding_id': excluded['finding_id'],
                           'status': 'resolved', 'note': ''})
        for policy, reason in ((replace(self.policy, enabled=False), 'offline_imports_disabled'),
                               (replace(self.policy, assessment_approved=False), 'assessment_not_approved'),
                               (replace(self.policy, scope=()), 'scope_required'),
                               (replace(self.policy, plugins=('bbot',)), 'assessment_modules_disabled')):
            disabled = ReviewWorkspace(Store(self.store.root, policy), self.path)
            self.assertEqual(disabled.imports(), {'available': False, 'reason': reason, 'imports': []})
            with self.assertRaises(Phase10Error):
                disabled.view({'import_ids': [identifier]})
        self.assertEqual(self.path.read_bytes(), saved)

    def test_triage_persists_across_restart_without_mutating_source_or_priorities(self):
        identifier = self.nuclei()
        source = self.review.view({'import_ids': [identifier]})['items'][0]['source']
        projection = self.store.root / 'findings' / (identifier + '.jsonl')
        before = projection.read_bytes()
        result = self.review.triage({'import_id': identifier, 'finding_id': source['finding_id'],
                                    'status': 'accepted_risk', 'note': 'Local operator decision.'})
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.path.parent.stat().st_mode & 0o777, 0o700)
        restarted = ReviewWorkspace(self.store, self.path)
        result = restarted.view({'import_ids': [identifier]})
        self.assertEqual(result['items'][0]['triage']['status'], 'accepted_risk')
        self.assertEqual(result['items'][0]['priority'], 'high')
        self.assertFalse(result['items'][0]['needs_attention'])
        self.assertEqual(result['counts']['high_priority'], 0)
        self.assertEqual(result['items'][0]['source'], source)
        self.assertEqual(projection.read_bytes(), before)

    def test_failed_atomic_replace_preserves_previous_decision(self):
        identifier = self.nuclei()
        source = self.review.view({'import_ids': [identifier]})['items'][0]['source']
        payload = {'import_id': identifier, 'finding_id': source['finding_id'], 'status': 'in_review', 'note': ''}
        self.review.triage(payload)
        before = self.path.read_bytes()
        with patch('phase10.security_review.os.replace', side_effect=OSError('fixture failure')):
            with self.assertRaises(OSError):
                self.review.triage(payload | {'status': 'resolved'})
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(list(self.path.parent.iterdir()), [self.path])

    def test_selected_imports_page_beyond_preview_and_whole_store_export_quota(self):
        first = self.nuclei(tuple('https://asset.example.test' for _ in range(1100)))
        second = self.nuclei(tuple('http://asset.example.test' for _ in range(1100)))
        with self.assertRaises(Phase10Error):
            self.store.export()
        result = self.review.view({'import_ids': [first, second], 'offset': 1050, 'limit': 100})
        self.assertEqual(result['counts']['observations'], 2200)
        self.assertEqual(result['pagination']['total'], 2200)
        self.assertEqual(len(result['items']), 100)
        self.assertTrue(result['complete'])
        report = self.review.report({'import_ids': [second, first]})
        self.assertEqual(report['selection_id'], result['selection_id'])
        self.assertEqual(len(report['items']), 2200)
        (self.store.root / 'findings' / (second + '.jsonl')).write_text('invalid')
        self.assertEqual(self.review.view({'import_ids': [first]})['counts']['observations'], 1100)
        with self.assertRaises(Phase10Error):
            self.review.view({'import_ids': [first, second]})

    def test_report_contains_full_selected_provenance_and_operator_decisions(self):
        identifier = self.nuclei()
        item = self.review.view({'import_ids': [identifier]})['items'][0]
        self.review.triage({'import_id': identifier, 'finding_id': item['source']['finding_id'],
                            'status': 'resolved', 'note': 'Reviewed by the local operator.'})
        report = self.review.report({'import_ids': [identifier]})
        self.assertEqual(report['schema_version'], 1)
        self.assertEqual(report['approved_scope'], list(self.policy.scope))
        self.assertEqual(report['items'][0]['source'], item['source'])
        self.assertEqual(report['sources'][0]['raw_source_hash'], item['source']['raw_source_hash'])
        self.assertEqual(report['items'][0]['triage']['status'], 'resolved')
        self.assertEqual(len(report['limitations']), 4)
        encoded = json.dumps(report)
        for private in ('PRIVATE_TEST', 'private-path', 'token=', str(self.root)):
            self.assertNotIn(private, encoded)

    def test_bad_inputs_unknown_findings_and_decision_state_are_rejected(self):
        identifier = self.nuclei()
        for fields in ({'import_ids': []}, {'import_ids': [identifier] * 2},
                       {'import_ids': [identifier], 'limit': True},
                       {'import_ids': [identifier], 'offset': -1},
                       {'import_ids': [identifier], 'status': 'confirmed'},
                       {'import_ids': [identifier], 'query': '\n'},
                       {'import_ids': [identifier], 'asset_id': '../assets'}):
            with self.subTest(fields=fields), self.assertRaises(Phase10Error):
                self.review.view(fields)
        with self.assertRaises(Phase10Error):
            self.review.triage({'import_id': identifier, 'finding_id': '0' * 64,
                                'status': 'resolved', 'note': ''})
        self.assertFalse(self.path.exists())
        self.path.parent.mkdir(mode=0o700)
        self.path.write_text('{invalid')
        self.path.chmod(0o600)
        with self.assertRaises(Phase10Error):
            self.review.view({'import_ids': [identifier]})
        self.assertEqual(self.path.read_text(), '{invalid')

    def test_aliased_or_shared_decision_files_are_rejected(self):
        identifier = self.nuclei()
        item = self.review.view({'import_ids': [identifier]})['items'][0]
        self.review.triage({'import_id': identifier, 'finding_id': item['source']['finding_id'],
                            'status': 'in_review', 'note': ''})
        self.path.chmod(0o644)
        with self.assertRaises(Phase10Error):
            self.review.view({'import_ids': [identifier]})
        self.path.chmod(0o600)
        alias = self.path.with_name('alias.json')
        os.link(self.path, alias)
        with self.assertRaises(Phase10Error):
            self.review.view({'import_ids': [identifier]})
        alias.unlink()
        original = self.path.with_name('original.json')
        self.path.rename(original)
        self.path.symlink_to(original)
        with self.assertRaises((OSError, Phase10Error)):
            self.review.view({'import_ids': [identifier]})

    def test_other_modules_and_selection_limits_cannot_enter_assessment_review(self):
        policy = replace(self.policy, plugins=('nmap', 'nuclei', 'bbot'))
        raw = b'{"id":"test","type":"DNS_NAME","data":"asset.example.test"}\n'
        context = policy.context(hashlib.sha256(raw).hexdigest(), '2026-11-01T12:00:00Z')
        store = Store(self.store.root, policy)
        manifest = store.save('bbot', 'jsonl', raw, parse_bbot(raw, 'jsonl', context), context['imported_at'])
        review = ReviewWorkspace(store, self.path)
        self.assertEqual(review.imports()['imports'], [])
        with self.assertRaises(Phase10Error):
            review.view({'import_ids': [manifest['import_id']]})
        identifier = self.nuclei(('https://example.test', 'https://other.example.test'))
        with patch('phase10.security_review.MAX_SELECTED_RECORDS', 1):
            with self.assertRaises(Phase10Error):
                self.review.view({'import_ids': [identifier]})
        with self.assertRaises(Phase10Error):
            self.review.view({'import_ids': [format(index, '064x') for index in range(21)]})
        source = self.store.read_import(identifier)['findings'][0]
        payload = {'import_id': identifier, 'finding_id': source['finding_id'], 'status': 'in_review', 'note': ''}
        for change in ({'note': 'n' * 513}, {'note': '\x00'}, {'status': 'confirmed'}, {'status': True}):
            with self.subTest(change=change), self.assertRaises(Phase10Error):
                self.review.triage(payload | change)
        self.assertFalse(self.path.exists())

    def test_multiline_notes_normalize_and_survive_restart_and_report(self):
        identifier = self.nuclei()
        source = self.store.read_import(identifier)['findings'][0]
        self.review.triage({'import_id': identifier, 'finding_id': source['finding_id'],
                            'status': 'in_review', 'note': 'First review step.\r\nSecond review step.'})
        restarted = ReviewWorkspace(self.store, self.path)
        self.assertEqual(restarted.report({'import_ids': [identifier]})['items'][0]['triage']['note'],
                         'First review step.\nSecond review step.')
        for note in ('invalid\x00note', '\r', '\t'):
            with self.subTest(note=repr(note)), self.assertRaises(Phase10Error):
                restarted.triage({'import_id': identifier, 'finding_id': source['finding_id'],
                                   'status': 'in_review', 'note': note})


if __name__ == '__main__':
    unittest.main()
