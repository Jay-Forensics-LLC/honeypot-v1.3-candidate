"""Independent local Wireshark checks on explicitly synthetic protocol fixtures."""
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from capture import classic as real_classic
from network import decode as real_decode
from oracle import compare, FIELDS
from fixtures import addr, arp, dhcp, dns_question, epb, eth, interface, ipv4, ipv6, ndp, pcap, qname, section, tcp, udp


def supported_frames():
    # Option 61 may carry a different identifier and reuses tshark's MAC field;
    # the supported adapter specifically records the fixed BOOTP chaddr.
    bootp = dhcp(lease=60)[42:-1] + b'\x3d\x07\x01' + bytes.fromhex('020000000099') + b'\xff'
    dhcp_identifier = eth(ipv4(udp(bootp, 67, 68), src='198.51.100.20', dst='255.255.255.255'))
    solicitation = b'\x87\0\0\0' + bytes(4) + addr('2001:db8::2')
    solicitation += b'\x01\x01' + bytes.fromhex('020000000003')
    # CNAME and EDNS exercise TTL alignment around supported address records.
    cname = qname('example.test') + struct.pack('!HHIH', 5, 1, 10, len(qname('alias.test'))) + qname('alias.test')
    a = qname('alias.test') + struct.pack('!HHIH', 1, 1, 30, 4) + addr('198.51.100.20')
    aaaa = qname('alias.test') + struct.pack('!HHIH', 28, 1, 60, 16) + addr('2001:db8::20')
    opt = b'\0' + struct.pack('!HHIH', 41, 1232, 0, 0)
    dns = struct.pack('!6H', 1, 0x8180, 0, 3, 0, 1) + cname + a + aaaa + opt
    # Both 802.1ad and 802.1Q IDs must be retained in the independent comparison.
    qinq = bytes.fromhex('02000000000202000000000188a8')
    qinq += struct.pack('!HHHH', 100, 0x8100, 25, 0x0800) + ipv4(tcp(flags=18), 6)
    return [arp(), dhcp_identifier, ndp(), eth(ipv6(solicitation, src='2001:db8::3'), 0x86dd),
            qinq, eth(ipv4(udp(dns, 53, 50000)))]


@unittest.skipUnless(shutil.which('tshark'), 'independent Wireshark unavailable')
class OracleNetworkFields(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='sentinel-oracle-network-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def test_supported_fields_match_independent_pcap_and_pcapng(self):
        frames = supported_frames()
        for kind in ('pcap', 'pcapng'):
            with self.subTest(kind=kind):
                source = self.root / ('synthetic.' + kind)
                source.write_bytes(pcap(frames) if kind == 'pcap' else
                                   section() + interface() + b''.join(epb(f) for f in frames))
                report = compare([source], self.root / (kind + '-comparison'))
                self.assertEqual(report['status'], 'PASS', report)
                item = report['files'][0]
                self.assertTrue(item['complete_source_verified'])
                self.assertEqual(item['packets'], len(frames))
                self.assertFalse(item['mismatch_count'])
                self.assertTrue({'tcp_flags', 'vlan_ids_unordered', 'arp_addresses', 'arp_macs',
                                 'ndp_mappings', 'dhcp_op', 'dhcp_message_type', 'dhcp_client_mac',
                                 'dhcp_lease_seconds', 'dns_ipv6_answers', 'dns_address_ttls'} <= set(item['compared_fields']))

    def test_wrong_supported_metadata_is_detected(self):
        source = self.root / 'synthetic.pcap'
        source.write_bytes(pcap(supported_frames()))

        def corrupted(packet):
            meta, apps, losses = real_decode(packet)
            if meta['tcp_flags'] is not None: meta['tcp_flags'] ^= 2
            if meta['vlan']: meta['vlan'][0] += 1
            for kind, data in apps:
                if kind in ('arp.mapping', 'ndp.mapping'): data['mac'] = '02:00:00:00:00:ff'
                if kind == 'dhcp.message':
                    data['message_type'] = 2
                    data['lease_seconds'] += 1
                    data['client_mac'] = '02:00:00:00:00:ff'
                if kind == 'dns.address':
                    data['ttl'] += 1
                    if ':' in data['address']: data['address'] = '2001:db8::ff'
            return meta, apps, losses

        with patch('oracle.decode', side_effect=corrupted):
            report = compare([source], self.root / 'changed-comparison')
        self.assertEqual(report['status'], 'FAILED')
        item = report['files'][0]
        self.assertTrue(item['complete_source_verified'])
        fields = {m['field'] for m in item['mismatches']}
        self.assertTrue({'tcp_flags', 'vlan_ids_unordered', 'arp_macs', 'ndp_mappings',
                         'dhcp_message_type', 'dhcp_client_mac', 'dhcp_lease_seconds',
                         'dns_ipv6_answers', 'dns_address_ttls'} <= fields)

    def test_wrong_reference_packet_number_is_detected(self):
        source = self.root / 'synthetic.pcap'
        source.write_bytes(pcap([arp()]))

        def decoder(args, **kwargs):
            if '--version' in args:
                return subprocess.CompletedProcess(args, 0, 'Synthetic decoder test stub\n', '')
            for chunk in iter(lambda: kwargs['stdin'].read(65536), b''): pass
            values = [''] * len(FIELDS)
            values[:4] = ['99', '1700000000', str(len(arp())), str(len(arp()))]
            values[FIELDS.index('arp.src.proto_ipv4')] = '192.0.2.10'
            values[FIELDS.index('arp.src.hw_mac')] = '02:00:00:00:00:01'
            values[FIELDS.index('frame.protocols')] = 'eth:ethertype:arp'
            kwargs['stdout'].write(('\t'.join(values) + '\n').encode())
            return subprocess.CompletedProcess(args, 0)

        # This failure-path stub is separate from the actual decoder checks above.
        with patch('oracle.subprocess.run', side_effect=decoder):
            report = compare([source], self.root / 'wrong-number')
        self.assertEqual(report['status'], 'FAILED')
        self.assertEqual(report['files'][0]['mismatches'], [{'packet': 1, 'field': 'packet_number'}])

    def test_wrong_source_packet_reference_is_detected(self):
        source = self.root / 'synthetic.pcap'
        source.write_bytes(pcap([arp()]))

        def renumbered(reader):
            for packet in real_classic(reader):
                packet.metadata['packet_number'] = 99
                yield packet

        with patch('oracle.classic', side_effect=renumbered):
            report = compare([source], self.root / 'wrong-source-reference')
        self.assertEqual(report['status'], 'FAILED')
        self.assertEqual(report['files'][0]['mismatches'], [{'packet': 1, 'field': 'packet_number'}])

    def test_omitted_supported_observations_and_flags_are_detected(self):
        source = self.root / 'synthetic.pcap'
        source.write_bytes(pcap(supported_frames()))

        def omitted(packet):
            meta, _, losses = real_decode(packet)
            meta['tcp_flags'] = None
            return meta, [], losses

        with patch('oracle.decode', side_effect=omitted):
            report = compare([source], self.root / 'omissions')
        self.assertEqual(report['status'], 'FAILED')
        fields = {m['field'] for m in report['files'][0]['mismatches']}
        self.assertTrue({'arp_addresses', 'arp_macs', 'ndp_mappings', 'dhcp_message_count',
                         'dns_ipv4_answers', 'dns_ipv6_answers', 'dns_address_ttls', 'tcp_flags'} <= fields)

    def test_explicit_fragment_limitation_preserves_subset_comparison(self):
        source = self.root / 'synthetic-fragment.pcap'
        source.write_bytes(pcap([eth(ipv4(udp(dns_question()), frag=0x2000))]))
        report = compare([source], self.root / 'fragment-limited')
        self.assertEqual(report['status'], 'PASS', report)
        self.assertEqual(report['files'][0]['limited_packets'], 1)
        self.assertNotIn('dns_questions', report['files'][0]['compared_fields'])


if __name__ == '__main__':
    unittest.main()
