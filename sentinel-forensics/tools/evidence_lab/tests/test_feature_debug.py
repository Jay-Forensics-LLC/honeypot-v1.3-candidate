"""HoneyTrace 2026-11-01 regressions using wholly synthetic local evidence."""
from contextlib import closing, redirect_stdout
import io
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

import analyze as analyzer
from adapters import TETRA
from capture import Packet
from core import IngestError, read_configuration, read_pseudonym_key, time_info
from fixtures import dns_question, eth, ipv4, pcap, tcp, udp
from query import finding
from store import Store


class FeatureDebug(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def case(self, name, payload):
        source = self.root / (name + '.pcap')
        source.write_bytes(pcap(payload))
        output = self.root / (name + '-case')
        analyzer.analyze([source], output, pseudonym_key=b'F' * 32)
        db = sqlite3.connect(output / 'index.sqlite')
        self.addCleanup(db.close)
        return db

    def test_dns_report_range_matches_only_rule_support(self):
        base = 1700000000
        packets = [(base + i, eth(ipv4(udp(dns_question(
            'short.example.test' if i in (0, 6) else 'a' * 50 + '.example.test')))))
            for i in range(7)]
        db = self.case('dns-support', packets)
        ident, start, end, raw = db.execute(
            "SELECT id,start_ns,end_ns,evidence_json FROM findings WHERE rule='dns_long_labels'").fetchone()
        lead = finding(db, ident)
        support = lead['support']['records']
        self.assertEqual(len(support), 5)
        self.assertEqual((start, end), ((base + 1) * 10**9, (base + 5) * 10**9))
        self.assertEqual((start, end), (min(r['utc_ns'] for r in support), max(r['utc_ns'] for r in support)))
        evidence = json.loads(raw)
        self.assertEqual((evidence['first_observation'], evidence['last_observation']), (2, 6))
        metrics = json.loads(db.execute("SELECT metrics_json FROM findings WHERE id=?", (ident,)).fetchone()[0])
        self.assertEqual((metrics['questions'], metrics['long_label_questions']), (7, 5))

    def test_rejected_tcp_headers_do_not_support_syn_or_port_leads(self):
        packets = []
        for i in range(20):
            body = bytearray(tcp(dport=443 if i < 10 else 100 + i))
            body[12] = 0 if i < 10 else 0xf0
            packets.append((1700000000 + i, eth(ipv4(bytes(body), 6))))
        db = self.case('tcp-headers', packets)
        self.assertEqual(db.execute('SELECT COUNT(*) FROM records').fetchone()[0], 20)
        self.assertEqual(db.execute('SELECT COUNT(*) FROM packet_meta WHERE losses!=?', ('[]',)).fetchone()[0], 20)
        self.assertEqual(db.execute('SELECT COUNT(*) FROM rule_packets').fetchone()[0], 0)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM findings WHERE rule IN ('repeated_syn','destination_ports')").fetchone()[0], 0)

    def test_valid_tcp_header_remains_eligible_with_unsupported_application(self):
        packets = [eth(ipv4(tcp(b'unsupported-dns', dport=53), 6)) for _ in range(10)]
        db = self.case('tcp-application', packets)
        self.assertEqual(db.execute('SELECT COUNT(*) FROM rule_packets').fetchone()[0], 10)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM findings WHERE rule='repeated_syn'").fetchone()[0], 1)

    def test_radio_summaries_include_exact_normalized_times(self):
        source = self.root / 'radio.tetra.jsonl'
        source.write_text(''.join(json.dumps({'schema': TETRA, 'kind': 'ap',
            'bssid': '02:00:00:00:00:01', 'ssid': 'synthetic', 'rssi': -50,
            'timestamp': value}) + '\n' for value in (
                '2026-01-01T00:00:02.000000001Z', '2026-01-01T00:00:01Z')))
        output = self.root / 'radio-case'
        analyzer.analyze([source], output, pseudonym_key=b'R' * 32)
        with closing(sqlite3.connect(output / 'index.sqlite')) as db:
            self.assertEqual(db.execute('SELECT first_time,last_time FROM summary').fetchone(),
                ('2026-01-01T00:00:01.000000000Z', '2026-01-01T00:00:02.000000001Z'))
            self.assertEqual(db.execute('SELECT COUNT(*) FROM observations').fetchone()[0], 2)

    def test_record_summary_order_preserves_mixed_precision_and_original(self):
        with closing(sqlite3.connect(':memory:')) as db:
            store = Store(db)
            payload = b'\0' * 12 + b'\x08\x00'
            for ordinal, units, ticks in [(1, 10**6, 10**6), (2, 10**9, 10**9 + 1)]:
                packet = Packet(ordinal, ordinal * 64, 64, str(ordinal) * 64,
                                time_info(ticks=ticks, units=units), payload, len(payload), 1)
                store.add_record(1, packet.row())
                store.packet(1, packet)
            self.assertEqual(db.execute('SELECT MIN(timestamp),MAX(timestamp) FROM records').fetchone(),
                ('1970-01-01T00:00:01.000000000Z', '1970-01-01T00:00:01.000000001Z'))
            originals = [json.loads(row[0])['original'] for row in db.execute('SELECT time_json FROM packet_meta ORDER BY ordinal')]
            self.assertEqual(originals, [{'ticks': 10**6, 'units_per_second': 10**6, 'offset_seconds': 0},
                                        {'ticks': 10**9 + 1, 'units_per_second': 10**9, 'offset_seconds': 0}])

    def test_unsupported_mapping_threshold_fails_before_output_or_input_work(self):
        output = self.root / 'unsupported'
        with patch.object(analyzer, 'source_file') as source, self.assertRaisesRegex(IngestError, 'mapping_threshold_must_be_one'):
            analyzer.analyze([self.root / 'not-read'], output,
                             config={'rules': {'mapping_minimum_conflicts': 2}})
        source.assert_not_called()
        self.assertFalse(output.exists())

    def test_cli_key_and_configuration_are_bounded_before_analysis(self):
        key = self.root / 'key'
        key.write_bytes(b'K' * 32)
        self.assertEqual(read_pseudonym_key(key), b'K' * 32)
        for size in (31, 33, 40):
            key.write_bytes(b'K' * size)
            with self.assertRaisesRegex(IngestError, 'pseudonym_key_must_be_32_bytes'):
                read_pseudonym_key(key)
        config = self.root / 'config.json'
        config.write_bytes(b'{"contexts":{}}')
        self.assertEqual(read_configuration(config), {'contexts': {}})
        output = self.root / 'never-created'
        with patch.object(sys, 'argv', ['analyze.py', str(self.root / 'not-read'), '--output', str(output),
                                       '--pseudonym-key', str(key)]), patch.object(analyzer, 'analyze') as work, redirect_stdout(io.StringIO()):
            self.assertEqual(analyzer.main(), 2)
        work.assert_not_called()
        self.assertFalse(output.exists())
        # A reduced allowance exercises the same byte gate without a large fixture.
        with patch('core.MAX_RECORD', 8), self.assertRaisesRegex(IngestError, 'record_budget_exceeded'):
            read_configuration(config)


if __name__ == '__main__':
    unittest.main()
