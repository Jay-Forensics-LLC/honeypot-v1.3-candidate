"""Offline OSINT format, provenance and relationship regressions."""
import hashlib
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from phase10.model import MAX_BYTES, Phase10Error
from phase10.osint import parse_bbot, parse_recon_ng, parse_spiderfoot


class OfflineOSINT(unittest.TestCase):
    def context(self, data, **changes):
        return {'raw_source_hash': hashlib.sha256(data).hexdigest(),
                'imported_at': '2026-11-01T12:00:00Z', 'scope': ['example.com'],
                'max_records': 100, **changes}

    def csv(self, text, **context):
        data = text.encode()
        return parse_spiderfoot(data, 'csv', self.context(data, **context))

    def gexf(self, nodes, edges='', attributes=''):
        return ('<gexf xmlns="http://www.gexf.net/1.2draft"><graph>' + attributes
                + '<nodes>' + nodes + '</nodes><edges>' + edges
                + '</edges></graph></gexf>').encode()

    def test_spiderfoot_aliases_provenance_and_determinism(self):
        data = (b'Event Type,Indicator Value,Record ID,Timestamp,Source,False Positive\n'
                b'Internet Name,WWW.Example.com,event-1,2026-10-31T12:00:00+00:00,example.com,0\n'
                b'IP Address,203.0.113.10,event-2,,,1\n')
        rows = parse_spiderfoot(data, 'csv', self.context(data))
        self.assertEqual(rows, parse_spiderfoot(data, 'csv', self.context(data)))
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]['indicator_value'], 'www.example.com')
        self.assertEqual(rows[0]['collected_at'], '2026-10-31T12:00:00Z')
        self.assertEqual(rows[0]['scope_status'], 'owned')
        self.assertEqual(rows[0]['relationship']['type'], 'observed_relation')
        self.assertEqual(rows[1]['assessment'], 'false_positive')
        self.assertIsNone(rows[1]['collected_at'])
        self.assertEqual(rows[0]['raw_source_hash'], 'sha256:' + hashlib.sha256(data).hexdigest())

    def test_cloudflare_cohost_does_not_establish_ownership(self):
        rows = self.csv('Type,Data,Source\nInternet Name,example.com,\n'
                        'IP Address,104.16.0.1,example.com\n'
                        'Co-Hosted Site,unrelated.example,example.com\n')
        self.assertEqual(rows[0]['scope_status'], 'owned')
        self.assertNotEqual(rows[1]['scope_status'], 'owned')
        self.assertEqual(rows[2]['scope_status'], 'shared_infrastructure')
        self.assertEqual(rows[2]['relationship']['type'], 'co_hosted')
        self.assertNotIn('ownership', json.dumps(rows))

    def test_csv_rejects_ambiguous_missing_and_malformed_rows(self):
        invalid = ['Type,type,Data\nIP Address,IP Address,203.0.113.1\n',
                   'Type,Data,Value\nIP Address,203.0.113.1,203.0.113.1\n',
                   'Module,Data\nexample,203.0.113.1\n',
                   'Type,Data\nIP Address\n',
                   'Type,Data\nIP Address,203.0.113.1,extra\n',
                   'Type,Data,FP\nIP Address,203.0.113.1,unknown\n',
                   'Type,Data\nUndocumented,"private fixture text"\n',
                   'Type,Data\nInternet Name,\n']
        for text in invalid:
            with self.subTest(text=text), self.assertRaises(Phase10Error) as caught:
                self.csv(text)
            self.assertNotIn('private fixture text', str(caught.exception))

    def test_csv_enforces_record_byte_and_text_bounds(self):
        text = 'Type,Data\nIP Address,203.0.113.1\nIP Address,203.0.113.2\n'
        with self.assertRaises(Phase10Error):
            self.csv(text, max_records=1)
        with self.assertRaises(Phase10Error):
            self.csv('Type,Data\nOther,' + 'x' * 4097 + '\n')
        with self.assertRaises(Phase10Error):
            parse_spiderfoot(b'x' * (MAX_BYTES + 1), 'csv', self.context(b'x'))

    def test_gexf_preserves_entities_and_edges_without_merging(self):
        attributes = '<attributes class="node"><attribute id="0" title="type"/></attributes>'
        nodes = ''.join('<node id="' + node_id + '" label="' + label + '">'
                        '<attvalues><attvalue for="0" value="' + event_type
                        + '"/></attvalues></node>' for node_id, label, event_type in (
                            ('a', 'example.com', 'INTERNET_NAME'),
                            ('b', 'unrelated.example', 'INTERNET_NAME'),
                            ('c', '104.16.0.1', 'IP_ADDRESS')))
        data = self.gexf(nodes, '<edge id="one" source="a" target="c"/>'
                              '<edge id="two" source="b" target="c"/>', attributes)
        rows = parse_spiderfoot(data, 'gexf', self.context(data))
        self.assertEqual(len(rows), 5)
        self.assertEqual(sum(row['indicator_type'] == 'relation' for row in rows), 2)
        self.assertEqual(sum(row['scope_status'] == 'owned' for row in rows), 1)
        self.assertEqual([row['relationship']['type'] for row in rows[3:]],
                         ['observed_relation', 'observed_relation'])
        self.assertEqual(len({row['finding_id'] for row in rows}), 5)

    def test_gexf_infers_only_supported_entities(self):
        data = self.gexf('<node id="a" label="2001:db8::1"/>')
        rows = parse_spiderfoot(data, 'gexf', self.context(data))
        self.assertEqual(rows[0]['indicator_type'], 'ip')
        self.assertEqual(rows[0]['indicator_value'], '2001:db8::1')

    def test_gexf_rejects_missing_edges_duplicate_nodes_and_limits(self):
        cases = [self.gexf('<node id="a" label="example.com"/>',
                           '<edge source="a" target="missing"/>'),
                 self.gexf('<node id="a" label="example.com"/>'
                           '<node id="a" label="other.example"/>'),
                 self.gexf('<node id="a" label="not an entity"/>'),
                 self.gexf('<node id="a" label="example.com"/>',
                           '<edge id="one" source="a" target="a"/>'
                           '<edge id="one" source="a" target="a"/>'),
                 b'<!DOCTYPE gexf [<!ENTITY note "fixture">]><gexf/>',
                 b'<gexf/>',
                 b'<not-gexf/>']
        for data in cases:
            with self.subTest(data=data), self.assertRaises(Phase10Error):
                parse_spiderfoot(data, 'gexf', self.context(data))
        data = self.gexf('<node id="a" label="example.com"/>', '<edge source="a" target="a"/>')
        with self.assertRaises(Phase10Error):
            parse_spiderfoot(data, 'gexf', self.context(data, max_records=1))

    def test_recon_ng_workspace_record_schema(self):
        data = json.dumps({'schema_version': 1, 'workspace': 'local-fixture', 'records': [
            {'id': 'one', 'type': 'domain', 'value': 'EXAMPLE.COM', 'confidence': 0.75,
             'collected_at': '2026-10-31T12:00:00Z'},
            {'type': 'email', 'value': 'case@example.com', 'source': 'example.com'}]}).encode()
        rows = parse_recon_ng(data, 'json', self.context(data))
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]['source_tool'], 'recon-ng')
        self.assertEqual(rows[0]['confidence'], 0.75)
        self.assertEqual(rows[1]['relationship']['type'], 'observed_relation')
        self.assertEqual(rows[1]['source_record_id'], 'local-fixture:2')

    def test_recon_ng_rejects_unknown_versions_fields_and_confidence(self):
        valid = {'schema_version': 1, 'workspace': 'fixture',
                 'records': [{'type': 'domain', 'value': 'example.com'}]}
        cases = [{**valid, 'schema_version': True}, {**valid, 'schema_version': 2},
                 {**valid, 'unexpected': 'fixture'},
                 {**valid, 'records': [{'type': 'domain', 'value': 'example.com', 'confidence': True}]},
                 {**valid, 'records': [{'type': 'domain', 'value': 'example.com', 'unknown': 'fixture'}]}]
        for row in cases:
            data = json.dumps(row).encode()
            with self.subTest(row=row), self.assertRaises(Phase10Error):
                parse_recon_ng(data, 'json', self.context(data))

    def test_bbot_native_entities_keep_source_identity(self):
        data = b'\n'.join(json.dumps(row).encode() for row in [
            {'type': 'DNS_NAME', 'data': 'example.com', 'id': 'node-one',
             'timestamp': '2026-10-31T08:00:00-04:00', 'scope_distance': 99},
            {'type': 'URL_UNVERIFIED', 'data': 'https://example.com/a?fixture=private',
             'id': 'node-two', 'source': 'example.com'},
            {'type': 'DNS_NAME', 'data': 'example.com', 'id': 'node-three'}]) + b'\n'
        rows = parse_bbot(data, 'jsonl', self.context(data))
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0]['collected_at'], '2026-10-31T12:00:00Z')
        self.assertEqual(rows[1]['indicator_value'], 'https://example.com/a')
        self.assertNotEqual(rows[0]['finding_id'], rows[2]['finding_id'])
        self.assertNotIn('fixture=private', json.dumps(rows))

    def test_bbot_rejects_unknown_structured_or_over_limit_events(self):
        for data in (b'{"type":"HTTP_RESPONSE","data":{"body":"fixture"}}\n',
                     b'{"type":"DNS_NAME","data":{"value":"example.com"}}\n',
                     b'{"type":"DNS_NAME"}\n', b'[]\n', b'not JSON\n'):
            with self.subTest(data=data), self.assertRaises(Phase10Error):
                parse_bbot(data, 'jsonl', self.context(data))
        data = b'{"type":"DNS_NAME","data":"example.com"}\n' * 2
        with self.assertRaises(Phase10Error):
            parse_bbot(data, 'jsonl', self.context(data, max_records=1))

    def test_unsupported_formats_and_naive_time_are_explicit(self):
        for parser in (parse_spiderfoot, parse_recon_ng, parse_bbot):
            with self.subTest(parser=parser), self.assertRaises(Phase10Error):
                parser(b'', 'unsupported', self.context(b''))
        rows = self.csv('Type,Data,Updated\nInternet Name,example.com,2026-10-31 12:00:00\n')
        self.assertIsNone(rows[0]['collected_at'])


if __name__ == '__main__':
    unittest.main()
