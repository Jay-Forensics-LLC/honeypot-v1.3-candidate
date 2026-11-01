"""Wholly synthetic saved telemetry, preservation receipts and packet fixtures."""
import dataclasses
import hashlib
import json
import os
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from phase10 import session_cases as sessions
from phase10.model import Phase10Error

STAMP = '2026-11-01T12:00:00Z'
EPOCH = 1793534400


def event(identity='event-1', source='cowrie', **changes):
    row = {'event_id': identity, 'source': source, 'session_id': 'synthetic-session',
           'timestamp': STAMP, 'source_ip': '192.0.2.10', 'source_port': 41000,
           'destination_port': 2222 if source == 'cowrie' else 2121,
           'service': 'ssh' if source == 'cowrie' else 'ftp',
           'event_type': 'cowrie.command.input' if source == 'cowrie' else '2000',
           'command': 'id' if source == 'cowrie' else '', 'password_present': True}
    row.update(changes)
    return row


def line(row):
    return (json.dumps(row, sort_keys=True) + '\n').encode()


def frame(*, src='192.0.2.10', dst='172.29.40.2', sport=41000, dport=2222,
          family=4, transport='tcp', fragment=False):
    import ipaddress
    if transport == 'tcp':
        payload = struct.pack('!HHIIBBHHH', sport, dport, 1, 0, 0x50, 0x02, 4096, 0, 0)
        proto = 6
    else:
        payload = struct.pack('!HHHH', sport, dport, 8, 0)
        proto = 17
    if family == 4:
        ip = struct.pack('!BBHHHBBH4s4s', 0x45, 0, 20 + len(payload), 1,
                         0x2000 if fragment else 0, 64, proto, 0,
                         ipaddress.ip_address(src).packed, ipaddress.ip_address(dst).packed)
        kind = b'\x08\x00'
    else:
        ip = struct.pack('!IHBB16s16s', 6 << 28, len(payload), proto, 64,
                         ipaddress.ip_address(src).packed, ipaddress.ip_address(dst).packed)
        kind = b'\x86\xdd'
    return b'\x00' * 12 + kind + ip + payload


def pcap(packets=None, *, order='<', nano=False, seconds=EPOCH, link=1):
    packets = [frame()] if packets is None else packets
    magic = (b'\x4d\x3c\xb2\xa1' if nano else b'\xd4\xc3\xb2\xa1') if order == '<' else (
        b'\xa1\xb2\x3c\x4d' if nano else b'\xa1\xb2\xc3\xd4')
    return magic + struct.pack(order + 'HHIIII', 2, 4, 0, 0, 65535, link) + b''.join(
        struct.pack(order + 'IIII', seconds, 0, len(packet), len(packet)) + packet for packet in packets)


def pcapng(packet=None, *, order='<', ticks=EPOCH * 10**6, options=b''):
    packet = frame() if packet is None else packet
    section = struct.pack(order + 'IIIHHqI', 0x0a0d0d0a, 28, 0x1a2b3c4d, 1, 0, -1, 28)
    size = 20 + len(options)
    interface = struct.pack(order + 'IIHHI', 1, size, 1, 0, 65535) + options + struct.pack(order + 'I', size)
    padded = packet + b'\0' * (-len(packet) % 4)
    size = 32 + len(padded)
    enhanced = struct.pack(order + 'IIIIIII', 6, size, 0, ticks >> 32, ticks & 0xffffffff,
                           len(packet), len(packet)) + padded + struct.pack(order + 'I', size)
    return section + interface + enhanced


class SessionFixture(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.catalog = sessions.SessionCatalog(self.root)

    def write(self, rows, source='cowrie', slot=0):
        path = self.root / 'logs/normalized' / (source + '.jsonl' + ('.' + str(slot) if slot else ''))
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b''.join(line(row) for row in rows))
        return path

    def selected(self):
        snapshot = self.catalog.snapshot()
        self.assertEqual(snapshot['status'], 'available')
        return snapshot['sessions'][0]

    def plan(self):
        self.write([event()])
        return self.catalog.prepare(self.selected()['selection_id'])

    def preserve(self, raw, *, identities=None, receipt_changes=None, incident_name='a' * 24 + '-0000'):
        folder = self.root / 'incidents/2026-11-01' / incident_name
        (folder / 'pcap').mkdir(parents=True)
        digest = hashlib.sha256(raw).hexdigest()
        path = folder / 'pcap' / (digest + '.pcapng')
        path.write_bytes(raw)
        receipt = {'source': '/synthetic/unopened/ring_00001.pcapng',
                   'destination': path.name, 'sha256': digest, 'size': len(raw),
                   'timestamp': STAMP, 'verified_stable': True,
                   'source_size_at_start': len(raw), 'acquisition_limit_bytes': len(raw),
                   'source_sha256_at_start': digest,
                   'source_identity': {'device': 1, 'inode': 2, 'mtime_ns': 3, 'ctime_ns': 4}}
        receipt.update(receipt_changes or {})
        (folder / 'incident.json').write_text(json.dumps({'related_events': identities or ['event-1']}))
        (folder / 'metadata.json').write_text(json.dumps({'copies': [receipt]}))
        return path


class SessionSelections(SessionFixture):

    def test_empty_read_creates_nothing_and_does_not_probe_runtime(self):
        self.assertEqual(self.catalog.snapshot()['status'], 'not_collected')
        self.assertEqual(list(self.root.iterdir()), [])
        with self.assertRaises(Phase10Error):
            self.catalog.prepare('f' * 32)

    def test_cowrie_selection_preserves_exact_references_and_withholds_structured_secrets(self):
        rows = [event(password='SYNTHETIC-CAPTURED-PASSWORD', username='not-in-selection'),
                event('event-2', command='uname -a')]
        path = self.write(rows)
        before = path.read_bytes()
        selected = self.selected()
        self.assertEqual(selected['kind'], 'sensor_session')
        self.assertEqual(selected['event_count'], 2)
        self.assertNotIn('command', selected)
        plan = self.catalog.prepare(selected['selection_id'])
        self.assertIsNone(plan.capture_bytes)
        self.assertNotIn(b'SYNTHETIC-CAPTURED-PASSWORD', plan.log_bytes + plan.transcript_bytes)
        self.assertNotIn(b'not-in-selection', plan.log_bytes)
        self.assertEqual(plan.transcript['commands'][0]['command'], 'id')
        ref = plan.transcript['commands'][1]['reference']
        self.assertEqual(ref['line'], 2)
        self.assertEqual(ref['byte_offset'], len(line(rows[0])))
        self.assertEqual(ref['record_sha256'], hashlib.sha256(line(rows[1])).hexdigest())
        self.assertEqual(path.read_bytes(), before)
        self.assertIn('parsed_utc_ns', json.loads(plan.log_bytes.splitlines()[0]))

    def test_opencanary_is_an_exact_event_not_a_fabricated_session_or_transcript(self):
        self.write([event('canary-1', 'opencanary'), event('canary-2', 'opencanary')], 'opencanary')
        snapshot = self.catalog.snapshot()
        self.assertEqual(len(snapshot['sessions']), 2)
        for selected in snapshot['sessions']:
            self.assertEqual(selected['kind'], 'event')
            plan = self.catalog.prepare(selected['selection_id'])
            self.assertEqual(plan.transcript['commands'], [])
            self.assertEqual(json.loads(plan.log_bytes)['session_id'], '')

    def test_exact_replay_deduplicates_and_conflicting_id_is_withheld(self):
        self.write([event(), event(), event('conflict'), event('conflict', command='other')])
        snapshot = self.catalog.snapshot()
        self.assertEqual(snapshot['sessions'][0]['event_count'], 1)
        self.assertTrue(any(row['code'] == 'conflicting_event_ids' for row in snapshot['omissions']))
        self.assertNotIn('other', self.catalog.prepare(snapshot['sessions'][0]['selection_id']).log_bytes.decode())

    def test_later_appends_do_not_change_prepared_selection_and_expired_tokens_fail(self):
        path = self.write([event()])
        selected = self.selected()
        with path.open('ab') as stream:
            stream.write(line(event('later')))
        plan = self.catalog.prepare(selected['selection_id'])
        self.assertEqual(len(plan.log_bytes.splitlines()), 1)
        with patch.object(sessions.time, 'monotonic', return_value=10**12):
            with self.assertRaises(Phase10Error):
                self.catalog.prepare(selected['selection_id'])

    def test_frozen_plan_properties_cannot_modify_saved_acquisition(self):
        plan = self.plan()
        with self.assertRaises(dataclasses.FrozenInstanceError):
            plan.log_bytes = b'changed'
        changed = plan.provenance
        changed['records'].clear()
        self.assertEqual(len(plan.provenance['records']), 1)

    def test_rotation_tail_partial_records_and_malformed_records_are_explicit(self):
        self.write([event('old')], slot=1)
        path = self.write([event('new')])
        with path.open('ab') as stream:
            stream.write(b'{"partial":')
        snapshot = self.catalog.snapshot()
        self.assertEqual(snapshot['sessions'][0]['event_count'], 2)
        plan = self.catalog.prepare(snapshot['sessions'][0]['selection_id'])
        self.assertTrue(any(row['partial'] for row in plan.provenance['sources']))
        self.assertTrue(any(row['code'] == 'rotation_scope' for row in plan.provenance['omissions']))
        path.write_bytes(line(event()) + b'{bad}\n' + b'{"event_id":"x","source":"cowrie","source":1}\n')
        snapshot = self.catalog.snapshot()
        self.assertTrue(any(row['code'] == 'record_withheld' for row in snapshot['omissions']))

    def test_symlink_parent_special_file_and_hardlink_sources_are_not_read(self):
        for mode in ('symlink', 'parent', 'fifo', 'hardlink'):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                path = root / 'logs/normalized/cowrie.jsonl'
                path.parent.mkdir(parents=True)
                real = root / 'real'
                real.write_bytes(line(event()))
                if mode == 'symlink':
                    path.symlink_to(real)
                elif mode == 'fifo':
                    os.mkfifo(path)
                elif mode == 'hardlink':
                    os.link(real, path)
                else:
                    path.parent.rmdir()
                    target = root / 'target'
                    target.mkdir()
                    (target / 'cowrie.jsonl').write_bytes(line(event()))
                    path.parent.symlink_to(target, target_is_directory=True)
                snapshot = sessions.SessionCatalog(root).snapshot()
                self.assertEqual(snapshot['sessions'], [])
                self.assertEqual(snapshot['status'], 'unavailable')

    def test_selection_record_and_cache_limits_remain_explicit(self):
        self.write([event(str(index)) for index in range(5)])
        with patch.object(sessions, 'MAX_SELECTION_RECORDS', 2):
            selected = self.selected()
        plan = self.catalog.prepare(selected['selection_id'])
        self.assertEqual(plan.summary['event_count'], 2)
        self.assertTrue(any(row['code'] == 'selection_limit' for row in plan.provenance['omissions']))
        with patch.object(sessions, 'MAX_SELECTIONS', 1):
            self.write([event('first', session_id='one'), event('second', session_id='two')])
            snapshot = self.catalog.snapshot()
            self.assertEqual(len(snapshot['sessions']), 1)
            self.assertEqual(len(self.catalog._cache), 1)

    def test_preserved_stable_capture_requires_matching_bytes_receipt_and_related_event(self):
        self.write([event()])
        raw = pcapng()
        path = self.preserve(raw)
        plan = self.catalog.prepare(self.selected()['selection_id'])
        self.assertEqual(plan.capture['status'], 'matched')
        self.assertEqual(plan.capture_bytes, raw)
        self.assertEqual(plan.capture['association']['packet_count'], 1)
        self.assertFalse(plan.capture['association']['destination_ip_asserted_by_log'])
        self.assertEqual(path.read_bytes(), raw)
        self.assertEqual(plan.candidates[0].sha256, hashlib.sha256(raw).hexdigest())

    def test_unstable_tampered_unrelated_and_symlink_captures_stay_log_only(self):
        for mode in ('unstable', 'tampered', 'unrelated', 'symlink', 'hardlink', 'traversal'):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as tmp:
                self.root = Path(tmp)
                self.catalog = sessions.SessionCatalog(self.root)
                self.write([event(raw_ref='/never/follow/captured/path')])
                path = self.preserve(pcapng(), identities=['unrelated'] if mode == 'unrelated' else None,
                                     receipt_changes={'verified_stable': False} if mode == 'unstable' else
                                     {'destination': '../../escape.pcapng'} if mode == 'traversal' else None)
                if mode == 'tampered':
                    path.write_bytes(path.read_bytes() + b'changed')
                elif mode in ('symlink', 'hardlink'):
                    other = self.root / 'held'
                    path.rename(other)
                    if mode == 'symlink':
                        path.symlink_to(other)
                    else:
                        os.link(other, path)
                plan = self.catalog.prepare(self.selected()['selection_id'])
                self.assertIsNone(plan.capture_bytes)
                self.assertNotEqual(plan.capture['status'], 'matched')
                self.assertFalse(plan.provenance['raw_refs_followed'])

    def test_active_ring_is_never_used_and_large_preserved_capture_does_not_block_logs(self):
        self.write([event()])
        ring = self.root / 'captures'
        ring.mkdir()
        (ring / 'ring_00001.pcapng').write_bytes(pcapng())
        selected = self.selected()
        self.assertEqual(self.catalog.prepare(selected['selection_id']).capture['status'], 'unavailable')
        self.preserve(pcapng())
        with patch.object(sessions, 'MAX_CAPTURE_BYTES', 16):
            plan = self.catalog.prepare(selected['selection_id'])
        self.assertEqual(plan.capture['status'], 'too_large')
        self.assertTrue(plan.log_bytes)
        self.assertIsNone(plan.capture_bytes)

    def test_multiple_distinct_matching_preserved_copies_remain_log_only(self):
        self.write([event()])
        self.preserve(pcapng())
        self.preserve(pcapng(frame(dst='172.29.40.3')), incident_name='b' * 24 + '-0000')
        plan = self.catalog.prepare(self.selected()['selection_id'])
        self.assertEqual(plan.capture['status'], 'ambiguous')
        self.assertEqual(len(plan.candidates), 2)
        self.assertIsNone(plan.capture_bytes)
        self.assertTrue(plan.log_bytes)


class PacketOverlap(SessionFixture):
    def test_classic_byte_orders_and_resolutions_have_exact_packet_references(self):
        plan = self.plan()
        for order in ('<', '>'):
            for nano in (False, True):
                raw = pcap(order=order, nano=nano)
                result = sessions.match_capture(raw, plan)
                self.assertEqual(result['status'], 'matched')
                self.assertEqual(result['packets'][0]['byte_offset'], 24)
                self.assertEqual(result['packets'][0]['record_sha256'], hashlib.sha256(raw[24:]).hexdigest())

    def test_pcapng_byte_orders_timestamp_resolution_and_offset(self):
        plan = self.plan()
        for order in ('<', '>'):
            options = (struct.pack(order + 'HH', 9, 1) + b'\x09\0\0\0' +
                       struct.pack(order + 'HHq', 14, 8, 1) + struct.pack(order + 'HH', 0, 0))
            result = sessions.match_capture(pcapng(order=order, ticks=(EPOCH - 1) * 10**9,
                                                   options=options), plan)
            self.assertEqual(result['status'], 'matched')
            self.assertEqual(result['packets'][0]['timestamp_utc_ns'], str(EPOCH * 10**9))

    def test_wrong_endpoint_or_time_does_not_match_and_missing_fields_stay_unknown(self):
        plan = self.plan()
        for raw in (pcap([frame(sport=41001)]), pcap(seconds=EPOCH + 3),
                    pcap([frame(src='192.0.2.11')])):
            self.assertEqual(sessions.match_capture(raw, plan)['status'], 'unmatched')
        self.write([event(source_port=None)])
        plan = self.catalog.prepare(self.selected()['selection_id'])
        self.assertEqual(sessions.match_capture(pcap(), plan)['status'], 'unknown')

    def test_reverse_direction_matches_but_multiple_destinations_are_ambiguous(self):
        plan = self.plan()
        raw = pcap([frame(src='172.29.40.2', dst='192.0.2.10', sport=2222, dport=41000)])
        self.assertEqual(sessions.match_capture(raw, plan)['status'], 'matched')
        result = sessions.match_capture(pcap([frame(), frame(dst='172.29.40.3')]), plan)
        self.assertEqual(result['status'], 'ambiguous')
        self.assertEqual(result['packet_count'], 2)

    def test_ipv6_and_udp_common_headers_are_supported_without_payload_interpretation(self):
        self.write([event(source_ip='2001:db8::1', service='snmp', destination_port=1161)])
        plan = self.catalog.prepare(self.selected()['selection_id'])
        raw = pcap([frame(src='2001:db8::1', dst='2001:db8::2', family=6,
                          dport=1161, transport='udp')])
        self.assertEqual(sessions.match_capture(raw, plan)['status'], 'matched')

    def test_unsupported_linktype_or_fragments_are_unknown_and_malformed_framing_fails(self):
        plan = self.plan()
        for raw in (pcap(link=147), pcap([frame(fragment=True)])):
            self.assertEqual(sessions.match_capture(raw, plan)['status'], 'unknown')
        for raw in (pcap()[:-1], pcapng()[:-1], pcapng()[:-4] + b'\0' * 4,
                    pcap([b'\0' * 4])):
            result = sessions.match_capture(raw, plan)
            self.assertEqual(result['status'], 'malformed')
            self.assertEqual(result['packets'], [])

    def test_packet_time_and_reference_budgets_are_explicit(self):
        plan = self.plan()
        with patch.object(sessions, 'MAX_PACKETS', 1):
            self.assertEqual(sessions.match_capture(pcap([frame(), frame()]), plan)['status'], 'unknown')
        with patch.object(sessions, 'MAX_MATCH_SECONDS', -1):
            self.assertEqual(sessions.match_capture(pcap(), plan)['status'], 'unknown')
        with patch.object(sessions, 'MAX_PACKET_REFERENCES', 1):
            result = sessions.match_capture(pcap([frame(), frame()]), plan)
        self.assertEqual(result['packet_count'], 2)
        self.assertTrue(result['packet_references_truncated'])


if __name__ == '__main__':
    unittest.main()
