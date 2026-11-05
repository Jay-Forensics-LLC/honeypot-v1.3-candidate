"""Malformed protocol families cannot abort a case or create NDP mappings."""
from contextlib import closing
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from analyze import analyze
from capture import classic
from core import Reader
from network import decode
from fixtures import addr, eth, ipv4, ipv6, ndp, pcap


class NetworkFamilies(unittest.TestCase):
    def decoded(self, frame):
        packet = next(classic(Reader(io.BytesIO(pcap([frame])))))
        return decode(packet)

    def test_icmp_protocol_must_match_ip_family(self):
        for kind in (128, 135, 136):
            with self.subTest(ip_version=4, icmp_type=kind):
                meta, observations, losses = self.decoded(
                    eth(ipv4(bytes([kind, 0, 0, 0]) + bytes(20), 58)))
                self.assertEqual(meta['protocol'], 'ip_58')
                self.assertEqual(losses, ['icmp_address_family_mismatch'])
                self.assertFalse(observations)
        meta, observations, losses = self.decoded(
            eth(ipv6(b'\x08\0\0\0', 1), 0x86dd))
        self.assertEqual(meta['protocol'], 'ip_1')
        self.assertEqual(losses, ['icmp_address_family_mismatch'])
        self.assertFalse(observations)

    def test_valid_icmp_and_ndp_still_decode(self):
        for frame, version in ((eth(ipv4(b'\x08\0\0\0', 1)), 4),
                               (eth(ipv6(b'\x80\0\0\0'), 0x86dd), 6)):
            with self.subTest(ip_version=version):
                _, observations, losses = self.decoded(frame)
                self.assertEqual(observations[0][0], 'icmp.message')
                self.assertEqual(observations[0][1]['version'], version)
                self.assertFalse(losses)
        _, observations, losses = self.decoded(ndp())
        self.assertEqual(observations[-1][0], 'ndp.mapping')
        self.assertFalse(losses)

    def test_malformed_ndp_never_yields_mapping(self):
        body = b'\x88\0\0\0' + bytes(4) + addr('2001:db8::1')
        for payload, hop, expected in ((body + b'\x02\0', 255, 'ndp_option_length'),
                                       (body + b'\x02\x01', 255, 'ndp_option_truncated'),
                                       (body, 64, 'ndp_invalid_hop_limit')):
            with self.subTest(expected=expected):
                _, observations, losses = self.decoded(eth(ipv6(payload, hop=hop), 0x86dd))
                self.assertIn(expected, losses)
                self.assertFalse(any(kind == 'ndp.mapping' for kind, _ in observations))

    def test_malformed_family_retained_without_aborting_analysis(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            source = root / 'mixed.pcap'
            source.write_bytes(pcap([eth(ipv4(b'\x87\0\0\0' + bytes(20), 58)), ndp()]))
            manifest = analyze([source], root / 'case')
            self.assertEqual(manifest['status'], 'COMPLETE')
            self.assertEqual(manifest['coverage']['counts']['packet_records'], 2)
            self.assertEqual(manifest['coverage']['decoding_losses']['icmp_address_family_mismatch'], 1)
            with closing(sqlite3.connect(root / 'case/index.sqlite')) as db:
                self.assertEqual(db.execute('SELECT COUNT(*) FROM associations').fetchone()[0], 1)
                kinds = db.execute('SELECT kind FROM observations WHERE ordinal=1').fetchall()
                self.assertFalse(kinds)
                losses = json.loads(db.execute('SELECT losses FROM packet_meta WHERE ordinal=1').fetchone()[0])
                self.assertEqual(losses, ['icmp_address_family_mismatch'])


if __name__ == '__main__':
    unittest.main()
