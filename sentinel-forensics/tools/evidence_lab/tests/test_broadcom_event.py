"""Guarded common fields are raw observations, never complete event decoding."""
import io
import json
import struct
import unittest

from capture import classic
from core import Reader
from network import DecodeError, broadcom_event_header, decode
from fixtures import pcap
from broadcom_fixtures import DESTINATION_MAC, SOURCE_MAC, envelope, ethernet, event


NUMERIC = {'version', 'flags', 'event_type', 'status', 'reason', 'auth_type',
           'datalen', 'ifidx', 'bsscfgidx'}
FIELDS = NUMERIC | {'header_profile', 'outer_length', 'outer_length_relation',
    'captured_bytes_after_header', 'declared_data_bytes_captured', 'body_coverage',
    'trailing_bytes', 'trailing_coverage', 'body_interpretation'}


class BroadcomEventHeader(unittest.TestCase):
    def packet(self, frame, *, link=1, original_extra=0):
        raw = pcap([frame], link=link)
        if original_extra:
            raw = raw[:36] + struct.pack('<I', len(frame) + original_extra) + raw[40:]
        return next(classic(Reader(io.BytesIO(raw))))

    def observed(self, payload, *, tags=()):
        meta, apps, losses = decode(self.packet(ethernet(payload, tags=tags)))
        self.assertEqual(meta['protocol'], 'broadcom_event')
        self.assertEqual(meta['src_mac'], SOURCE_MAC)
        self.assertEqual(meta['dst_mac'], DESTINATION_MAC)
        for name in ('src', 'dst', 'sport', 'dport', 'tcp_flags', 'ip_bytes'):
            self.assertIsNone(meta[name])
        self.assertEqual(meta['vlan'], [tci & 0xfff for _, tci in tags])
        self.assertEqual(losses, ['unsupported_ethertype'])
        self.assertEqual([kind for kind, _ in apps], ['bcm.event_header'])
        data = apps[0][1]
        self.assertEqual(set(data), FIELDS)
        self.assertEqual(data['header_profile'], 'broadcom_event_v2_common/1')
        self.assertEqual(data['body_interpretation'], 'not_decoded')
        self.assertTrue(all(type(data[key]) is int for key in NUMERIC))
        self.assertFalse(any(isinstance(value, (bytes, bytearray)) for value in data.values()))
        return data

    def rejected(self, payload, code):
        with self.assertRaisesRegex(DecodeError, '^' + code + '$'):
            broadcom_event_header(payload)
        meta, apps, losses = decode(self.packet(ethernet(payload)))
        self.assertEqual(meta['protocol'], 'unsupported')
        self.assertEqual(apps, [])
        self.assertEqual(losses, ['unsupported_ethertype', code])

    def test_literal_network_order_vector_compares_all_nine_fields(self):
        # Literal wire octets independently identify every numeric offset. The
        # station/name slots are intentionally present but never retained.
        wire = bytes.fromhex(
            '80010039000010180001'
            '0002a1b201020304112233445566778899aabbcc00000003'
            '020000008701'
            '756e747275737465642d6e616d652121'
            '0709'
            '102030')
        data = self.observed(wire)
        self.assertEqual({key: data[key] for key in NUMERIC}, {
            'version': 2, 'flags': 0xa1b2, 'event_type': 0x01020304,
            'status': 0x11223344, 'reason': 0x55667788, 'auth_type': 0x99aabbcc,
            'datalen': 3, 'ifidx': 7, 'bsscfgidx': 9})
        self.assertEqual(data['outer_length_relation'], 'equals_captured_minus4')
        self.assertEqual(data['body_coverage'], 'opaque_declared_bytes_captured')
        self.assertEqual(data['declared_data_bytes_captured'], 3)
        self.assertEqual(data['trailing_bytes'], 0)

    def test_unknown_numeric_codes_and_reserved_flags_stay_uninterpreted(self):
        data = self.observed(envelope(event(flags=0xffff, event_type=0xffffffff,
            status=0xfedcba98, reason=0x87654321, auth_type=0xffffffff,
            ifidx=255, bsscfgidx=254)))
        self.assertEqual(data['event_type'], 0xffffffff)
        self.assertEqual(data['flags'], 0xffff)
        self.assertEqual((data['ifidx'], data['bsscfgidx']), (255, 254))
        for name in ('event_name', 'severity', 'connected', 'authenticated', 'device', 'identity'):
            self.assertNotIn(name, data)

    def test_every_outer_namespace_guard_fails_without_header_observation(self):
        cases = [({'subtype': 0}, 'broadcom_event_subtype_unsupported'),
                 ({'subtype': 0x8002}, 'broadcom_event_subtype_unsupported'),
                 ({'version': 1}, 'broadcom_event_outer_version_unsupported'),
                 ({'namespace': b'\x00\xaa\xbb'}, 'broadcom_event_namespace_unsupported'),
                 ({'user_subtype': 2}, 'broadcom_event_user_subtype_unsupported')]
        for change, code in cases:
            with self.subTest(change=change):
                self.rejected(envelope(event(), **change), code)

    def test_other_subtype_discriminator_precedes_event_envelope_length(self):
        for payload in (b'\x00', b'\x01\x00', b'\x7f\xff', b'\x80\x02', b'\xff\xff'):
            with self.subTest(payload=payload):
                self.rejected(payload, 'broadcom_event_subtype_unsupported')
        for payload in (b'', b'\x80', b'\x80\x01', b'\x80\x01\x00\x00'):
            with self.subTest(incomplete_known_envelope=payload):
                self.rejected(payload, 'broadcom_event_outer_header_truncated')

    def test_version1_or_unknown_layout_cannot_borrow_body_as_v2_indices(self):
        for version in (0, 1, 3, 65535):
            for tail in (b'', b'\x07\x09', b'\x07\x09' * 30):
                with self.subTest(version=version, tail_bytes=len(tail)):
                    self.rejected(envelope(event(version=version, data=tail)),
                                  'broadcom_event_version_unsupported')

    def test_all_header_cut_boundaries_retain_only_explicit_loss(self):
        complete = envelope(event())
        self.assertEqual(len(complete), 58)
        for end in range(len(complete)):
            with self.subTest(captured=end):
                self.rejected(complete[:end], 'broadcom_event_outer_header_truncated'
                              if end < 10 else 'broadcom_event_header_truncated')

    def test_body_length_extremes_are_coverage_without_allocation_or_extra_loss(self):
        for declared, body, coverage, trailing in (
            (0, b'', 'empty_declared_body', 0),
            (0, b'abc', 'empty_declared_body', 3),
            (1, b'a', 'opaque_declared_bytes_captured', 0),
            (3, b'abc', 'opaque_declared_bytes_captured', 0),
            (4, b'abc', 'declared_bytes_unavailable', 0),
            (0xffffffff, b'abc', 'declared_bytes_unavailable', 0)):
            with self.subTest(declared=declared, captured=len(body)):
                data = self.observed(envelope(event(data=body, datalen=declared)))
                self.assertEqual(data['datalen'], declared)
                self.assertEqual(data['body_coverage'], coverage)
                self.assertEqual(data['captured_bytes_after_header'], len(body))
                self.assertEqual(data['declared_data_bytes_captured'], min(declared, len(body)))
                self.assertEqual(data['trailing_bytes'], trailing)
                self.assertLess(len(json.dumps(data)), 2048)

    def test_opaque_trailing_bytes_are_never_called_padding_fcs_or_body(self):
        for trailing in (b'\0\0', b'\xff\x08\x01', b'invented trailing marker'):
            with self.subTest(trailing_bytes=len(trailing)):
                data = self.observed(envelope(event(data=b'abc') + trailing))
                self.assertEqual(data['declared_data_bytes_captured'], 3)
                self.assertEqual(data['trailing_bytes'], len(trailing))
                self.assertEqual(data['trailing_coverage'], 'uninterpreted')
                self.assertFalse(any(word in json.dumps(data) for word in ('padding', 'fcs', 'trailing marker')))

    def test_outer_length_is_only_captured_relation_not_header_rejection(self):
        for length in (0, 1, 53, 54, 65535):
            with self.subTest(outer_length=length):
                data = self.observed(envelope(event(), length=length))
                self.assertEqual(data['outer_length'], length)
                self.assertEqual(data['outer_length_relation'], 'equals_captured_minus4'
                                 if length == 54 else 'different_from_captured_minus4')
                self.assertEqual(data['body_coverage'], 'empty_declared_body')

    def test_vlan_order_and_existing_depth_bound_remain(self):
        for tags in ((), ((0x8100, 23),), ((0x88a8, 71), (0x8100, 23)),
                     ((0x88a8, 71), (0x9100, 21), (0x8100, 23), (0x8100, 4094))):
            with self.subTest(tags=tags):
                self.observed(envelope(event()), tags=tags)
        _, apps, losses = decode(self.packet(ethernet(envelope(event()), tags=((0x8100, 23),) * 5)))
        self.assertEqual(apps, [])
        self.assertEqual(losses, ['vlan_depth_limit'])

    def test_unsupported_ethertype_and_linktype_never_reuse_the_vendor_layout(self):
        payload = envelope(event())
        for typ in (0xbc01, 0x886d):
            meta, apps, losses = decode(self.packet(ethernet(payload, ethertype=typ)))
            self.assertEqual(meta['protocol'], 'unsupported')
            self.assertEqual(apps, [])
            self.assertEqual(losses, ['unsupported_ethertype'])
        for link in (101, 228, 229, 999):
            _, apps, losses = decode(self.packet(payload, link=link))
            self.assertEqual(apps, [])
            self.assertTrue(losses)

    def test_capture_truncation_is_separate_from_declared_body_coverage(self):
        frame = ethernet(envelope(event(data=b'abc')))
        packet = self.packet(frame, original_extra=4)
        self.assertEqual(packet.original, len(frame) + 4)
        self.assertEqual(len(packet.payload), len(frame))
        meta, apps, losses = decode(packet)
        self.assertEqual(meta['protocol'], 'broadcom_event')
        self.assertEqual(losses, ['unsupported_ethertype'])
        self.assertEqual(apps[0][1]['body_coverage'], 'opaque_declared_bytes_captured')
        self.assertEqual(apps[0][1]['trailing_bytes'], 0)
        # Store/analyze separately retain packet.status from the capture; this
        # common-header subset does not rename a length mismatch truncation.

    def test_identifier_and_body_octets_are_not_retained(self):
        wire = envelope(event(station=b'\x00\x01\x02\x03\x04\x05',
            ifname=b'HOSTILE,\n\tNAME!\x00', data=b'PAYLOAD_SECRET'))
        data = self.observed(wire)
        raw = json.dumps(data)
        for marker in ('HOSTILE', 'NAME', 'PAYLOAD_SECRET', '00:01:02:03:04:05'):
            self.assertNotIn(marker, raw)
        self.assertEqual(data, self.observed(envelope(event(station=b'\xff' * 6,
            ifname=b'OTHER', data=b'xxxxxxxxxxxxxx'))))


if __name__ == '__main__':
    unittest.main()
