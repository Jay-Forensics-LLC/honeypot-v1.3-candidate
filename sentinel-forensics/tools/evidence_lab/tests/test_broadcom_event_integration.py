"""Invented fixed-header integration, privacy and provenance; no owner data."""
from contextlib import closing
import hashlib
import hmac
import json
import os
from pathlib import Path
import socket
import sqlite3
import struct
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from analyze import analyze
from contract import CONTRACT, validate
from core import canonical
from broadcom_fixtures import SOURCE_MAC, DESTINATION_MAC, event, envelope, ethernet
from fixtures import section, interface, spb


KEY = b'J' * 32
SECONDS = 1700000000
FRACTION = 123456789
ORIGINAL_NS = SECONDS * 10**9 + FRACTION
STATION = b'S3CRET'
IFNAME = b'PRIVATE_IFACE\n\xff'
BODY = b'UNINTERPRETED_PRIVATE_BODY_MARKER'


def classic_records(items):
    """Exactly specified ns records permit byte-identical duplicate occurrences."""
    header = b'\x4d\x3c\xb2\xa1' + struct.pack('<HHiiII', 2, 4, 0, 0, 65535, 1)
    records = []
    for frame, fraction, extra_original in items:
        records.append(struct.pack('<IIII', SECONDS, fraction, len(frame), len(frame) + extra_original) + frame)
    return header + b''.join(records), records


class BroadcomObservationIntegration(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)

    def frame(self, *, tags=(), **overrides):
        options = {'flags': 0x1234, 'event_type': 16, 'status': 0xffffffff,
                   'reason': 0xdeadbeef, 'auth_type': 7, 'ifidx': 9, 'bsscfgidx': 11,
                   'station': STATION, 'ifname': IFNAME, 'data': BODY}
        options.update(overrides)
        # Deliberately inconsistent literal outer length is descriptive, not
        # an invented capture-truncation or decoded-body conclusion.
        return ethernet(envelope(event(**options), length=0), tags=tags)

    def analyze_sources(self, captures, *, config=None):
        sources = []
        for number, raw in enumerate(captures, 1):
            source = self.root / ('private-invented-input-' + str(number) + '.pcap')
            source.write_bytes(raw)
            sources.append(source)
        before = [(p.read_bytes(), p.stat().st_mtime_ns) for p in sources]
        output = self.root / 'case'
        # The native optional-header observation needs Python/SQLite only.
        # Captured identifiers never cause name resolution, traffic or tools.
        with patch.dict(os.environ, {'PATH': ''}), \
             patch.object(socket, 'socket', side_effect=AssertionError('network forbidden')), \
             patch.object(socket, 'getaddrinfo', side_effect=AssertionError('resolution forbidden')), \
             patch.object(subprocess, 'Popen', side_effect=AssertionError('external process forbidden')):
            manifest = analyze(sources, output, config=config, pseudonym_key=KEY)
        self.assertEqual(before, [(p.read_bytes(), p.stat().st_mtime_ns) for p in sources])
        self.assertEqual(manifest['status'], 'COMPLETE')
        self.assertEqual(manifest['compromise_assessment'], 'not_performed')
        for name in ('findings', 'associations', 'conflicts'):
            self.assertEqual(manifest['coverage']['counts'][name], 0)
        self.assertEqual(manifest['coverage']['counts']['parse_errors'], 0)
        self.assertEqual(manifest['coverage']['filtered_packets'], 0)
        for line in (output / 'SHA256SUMS').read_text().splitlines():
            digest, relative = line.split('  ', 1)
            self.assertEqual(hashlib.sha256((output / relative).read_bytes()).hexdigest(), digest)
        return sources, output, manifest

    def rows(self, output, query, arguments=()):
        with closing(sqlite3.connect((output / 'index.sqlite').as_uri() + '?mode=ro&immutable=1', uri=True)) as db:
            db.row_factory = sqlite3.Row
            return [dict(row) for row in db.execute(query, arguments)]

    def observations(self, output):
        return self.rows(output, "SELECT * FROM observations WHERE kind='bcm.event_header' ORDER BY id")

    def exchange(self, output):
        result = [json.loads(line) for line in (output / 'export/exchange.jsonl').read_bytes().splitlines()]
        for row in result:
            self.assertEqual(row['contract'], CONTRACT)
            validate(row)
        return result

    def test_native_header_observation_keeps_coarse_loss_and_generates_no_findings(self):
        frame = self.frame()
        raw, _ = classic_records([(frame, FRACTION, 0)])
        _, output, manifest = self.analyze_sources([raw])
        self.assertEqual(manifest['coverage']['counts']['packet_records'], 1)
        self.assertEqual(manifest['coverage']['decoding_losses'], {'unsupported_ethertype': 1})
        packet = self.rows(output, 'SELECT protocol,losses,src,dst FROM packet_meta')[0]
        self.assertEqual(packet['protocol'], 'broadcom_event')
        self.assertEqual(json.loads(packet['losses']), ['unsupported_ethertype'])
        self.assertIsNone(packet['src']);self.assertIsNone(packet['dst'])
        (observation,) = self.observations(output)
        data = json.loads(observation['data_json'])
        self.assertEqual(data['header_profile'], 'broadcom_event_v2_common/1')
        self.assertEqual(data['status'], 0xffffffff)
        self.assertEqual(data['reason'], 0xdeadbeef)
        self.assertEqual(data['body_interpretation'], 'not_decoded')
        self.assertEqual(data['body_coverage'], 'opaque_declared_bytes_captured')
        self.assertEqual(data['outer_length_relation'], 'different_from_captured_minus4')
        self.assertEqual(data['declared_data_bytes_captured'], len(BODY))
        for field in ('station', 'station_address', 'ifname', 'interface_name', 'addr', 'body', 'payload', 'event_name'):
            self.assertNotIn(field, data)
        self.assertEqual(self.rows(output, 'SELECT COUNT(*) count FROM findings')[0]['count'], 0)

    def test_exact_record_duplicates_remain_two_observations_with_original_references(self):
        frame = self.frame()
        raw, records = classic_records([(frame, FRACTION, 0), (frame, FRACTION, 0)])
        _, output, manifest = self.analyze_sources([raw])
        self.assertEqual(manifest['coverage']['counts']['packet_records'], 2)
        self.assertEqual(manifest['coverage']['counts']['duplicate_records'], 1)
        self.assertEqual(manifest['coverage']['decoding_losses'], {'unsupported_ethertype': 2})
        observations = self.observations(output)
        self.assertEqual(len(observations), 2)
        self.assertIsNone(observations[0]['duplicate_of'])
        self.assertEqual(observations[1]['duplicate_of'], observations[0]['id'])
        for ordinal, (observation, record) in enumerate(zip(observations, records), 1):
            provenance = json.loads(observation['provenance_json'])
            self.assertEqual(provenance['source_id'], 1)
            self.assertEqual(provenance['ordinal'], ordinal)
            self.assertEqual(provenance['packet_number'], ordinal)
            self.assertEqual(provenance['byte_offset'], 24 + (ordinal - 1) * len(record))
            self.assertEqual(provenance['byte_length'], len(record))
            self.assertEqual(provenance['record_sha256'], hashlib.sha256(record).hexdigest())
            self.assertEqual(provenance['precision'], 'byte')
            self.assertEqual(observation['record_hash'], hashlib.sha256(record).hexdigest())
        exported = [r['payload'] for r in self.exchange(output)
                    if r['entity'] == 'observation' and r['payload']['kind'] == 'bcm.event_header']
        self.assertEqual(len(exported), 2)
        self.assertEqual(exported[1]['duplicate_of'], 'observation:' + str(observations[0]['id']))

    def test_original_nanosecond_time_and_reversible_offset_keep_vlan_scope(self):
        frame = self.frame(tags=((0x8100, 7), (0x88a8, 9)))
        raw, _ = classic_records([(frame, FRACTION, 0)])
        offset = -7654321
        context = 'PRIVATE_OPERATOR_CONTEXT'
        config = {'contexts': {'1': context}, 'clock_adjustments': {
            '1': {'offset_ns': offset, 'justification': 'private unverified clock correction'}}}
        _, output, _ = self.analyze_sources([raw], config=config)
        (observation,) = self.observations(output)
        self.assertEqual(observation['context'], context + '/section:0/interface:0/vlan:7,9')
        when = json.loads(observation['time_json'])
        self.assertEqual(when['utc_ns'], ORIGINAL_NS)
        self.assertEqual(when['original'], {'ticks': ORIGINAL_NS, 'units_per_second': 10**9, 'offset_seconds': 0})
        self.assertEqual(when['precision'], {'numerator': 1, 'denominator': 10**9})
        self.assertEqual(when['clock'], 'capture_interface')
        (timeline,) = self.rows(output, "SELECT original_utc_ns,utc_ns,context FROM timeline_index WHERE kind='bcm.event_header'")
        self.assertEqual(timeline['original_utc_ns'], ORIGINAL_NS)
        self.assertEqual(timeline['utc_ns'], ORIGINAL_NS + offset)
        self.assertEqual(timeline['utc_ns'] - offset, when['utc_ns'])
        adjustment = self.rows(output, 'SELECT offset_ns,justification FROM adjustments')[0]
        self.assertEqual(adjustment, config['clock_adjustments']['1'])

    def test_same_bytes_across_sources_preserve_contexts_without_identity_association(self):
        raw, _ = classic_records([(self.frame(), FRACTION, 0)])
        contexts = {'1': 'PRIVATE_NETWORK_A', '2': 'PRIVATE_NETWORK_B'}
        _, output, manifest = self.analyze_sources([raw, raw], config={'contexts': contexts})
        observations = self.observations(output)
        self.assertEqual(len(observations), 2)
        self.assertEqual([r['source_id'] for r in observations], [1, 2])
        self.assertEqual([r['context'] for r in observations], [v + '/section:0/interface:0/vlan:' for v in contexts.values()])
        self.assertEqual(manifest['coverage']['counts']['packet_records'], 2)
        self.assertEqual(manifest['coverage']['counts']['duplicate_records'], 1)
        self.assertEqual(self.rows(output, 'SELECT COUNT(*) count FROM associations')[0]['count'], 0)

    def test_export_omits_station_interface_body_paths_and_key_and_hmacs_context_mac(self):
        raw, _ = classic_records([(self.frame(), FRACTION, 0)])
        context = 'PRIVATE_SOURCE_CONTEXT'
        sources, output, _ = self.analyze_sources([raw], config={'contexts': {'1': context}})
        raw_private_data = self.observations(output)[0]['data_json'].encode()
        for secret in (STATION, IFNAME, BODY):self.assertNotIn(secret, raw_private_data)
        for path in (output / 'export').iterdir():
            value = path.read_bytes()
            for secret in (STATION, STATION.hex().encode(), IFNAME, BODY, KEY, SOURCE_MAC.encode(),
                           DESTINATION_MAC.encode(), str(sources[0]).encode(), str(output).encode(), context.encode()):
                self.assertNotIn(secret, value)
        exported = self.exchange(output)
        (observation,) = [r['payload'] for r in exported if r['entity'] == 'observation'
                         and r['payload']['kind'] == 'bcm.event_header']
        expected = 'p_' + hmac.new(KEY, canonical(context + '/section:0/interface:0/vlan:'), hashlib.sha256).hexdigest()[:32]
        self.assertEqual(observation['context'], expected)
        (packet,) = [r['payload'] for r in exported if r['entity'] == 'observation'
                    and r['payload']['kind'] == 'network.broadcom_event']
        expected_mac = 'p_' + hmac.new(KEY, canonical(SOURCE_MAC), hashlib.sha256).hexdigest()[:32]
        self.assertEqual(packet['data']['src_mac'], expected_mac)

    def test_foreign_or_incomplete_header_keeps_packet_and_loss_without_observation(self):
        valid = self.frame()
        foreign = ethernet(envelope(event(), namespace=b'\xaa\xbb\xcc'))
        incomplete = ethernet(envelope(event())[:-1])
        raw, _ = classic_records([(frame, FRACTION + n, 0) for n, frame in enumerate((valid, foreign, incomplete))])
        _, output, manifest = self.analyze_sources([raw])
        self.assertEqual(manifest['coverage']['counts']['packet_records'], 3)
        self.assertEqual(manifest['coverage']['decoding_losses']['unsupported_ethertype'], 3)
        self.assertEqual(len(self.observations(output)), 1)

    def test_missing_declared_body_and_capture_truncation_are_explicit_not_findings(self):
        frame = self.frame(data=b'ab', datalen=20)
        raw, _ = classic_records([(frame, FRACTION, 18)])
        _, output, manifest = self.analyze_sources([raw])
        self.assertEqual(manifest['coverage']['decoding_losses']['unsupported_ethertype'], 1)
        self.assertEqual(manifest['coverage']['decoding_losses']['capture_truncated'], 1)
        (observation,) = self.observations(output)
        data = json.loads(observation['data_json'])
        self.assertEqual(data['body_coverage'], 'declared_bytes_unavailable')
        self.assertEqual(data['datalen'], 20)
        self.assertEqual(data['captured_bytes_after_header'], 2)
        self.assertEqual(data['declared_data_bytes_captured'], 2)
        self.assertEqual(data['body_interpretation'], 'not_decoded')

    def test_simple_pcapng_packet_missing_time_stays_missing_with_original_block_locator(self):
        raw = section() + interface() + spb(self.frame())
        _, output, manifest = self.analyze_sources([raw])
        (observation,) = self.observations(output)
        when, provenance = json.loads(observation['time_json']), json.loads(observation['provenance_json'])
        self.assertIsNone(observation['utc_ns'])
        self.assertIsNone(when['utc_ns'])
        self.assertEqual(when['status'], 'missing')
        (timeline,) = self.rows(output, "SELECT original_utc_ns,utc_ns FROM timeline_index WHERE kind='bcm.event_header'")
        self.assertEqual(timeline, {'original_utc_ns': None, 'utc_ns': None})
        self.assertEqual(provenance['ordinal'], 3)
        self.assertEqual(provenance['packet_number'], 1)
        self.assertEqual(provenance['byte_offset'], len(section()) + len(interface()))
        self.assertEqual(provenance['byte_length'], len(spb(self.frame())))
        self.assertEqual(provenance['record_sha256'], hashlib.sha256(spb(self.frame())).hexdigest())
        self.assertEqual(manifest['coverage']['decoding_losses']['unsupported_ethertype'], 1)
        self.assertEqual(manifest['coverage']['decoding_losses']['timestamp_missing'], 1)
