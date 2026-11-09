"""Synthetic nested-header, retransmission and bounded decoder transport checks."""
import io
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import patch

from core import IngestError, MAX_RECORD
from network import decode as real_decode
from oracle import compare, decoder_process
from fixtures import eth, hello, ipv4, ipv6, ndp, pcap, tcp, udp, dns_question


class DecoderTransport(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='sentinel-oracle-transport-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def test_both_decoder_descriptors_are_pipes_and_chunks_are_bounded(self):
        sizes = []

        class Input(io.BytesIO):
            def read(self, size=-1):
                self.assert_size(size)
                return super().read(size)

            def assert_size(self, size):
                if not 0 < size <= MAX_RECORD:
                    raise AssertionError('unbounded_source_read')

        class Destination:
            count = 0

            def write(self, data):
                sizes.append(len(data))
                self.count += len(data)

        destination = Destination()
        input_size = MAX_RECORD * 2 + 11
        output_size = MAX_RECORD * 2 + 17

        def decoder(args, **kwargs):
            self.assertTrue(stat.S_ISFIFO(os.fstat(kwargs['stdin'].fileno()).st_mode))
            self.assertTrue(stat.S_ISFIFO(os.fstat(kwargs['stdout'].fileno()).st_mode))
            consumed = 0
            for chunk in iter(lambda: kwargs['stdin'].read(65536), b''):
                consumed += len(chunk)
            self.assertEqual(consumed, input_size)
            remaining = output_size
            while remaining:
                block = b'F' * min(65536, remaining)
                kwargs['stdout'].write(block)
                remaining -= len(block)
            return subprocess.CompletedProcess(args, 0)

        with patch('oracle.subprocess.run', side_effect=decoder):
            result = decoder_process(['tshark'], Input(b'F' * input_size), destination, self.root)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(destination.count, output_size)
        self.assertTrue(sizes)
        self.assertLessEqual(max(sizes), MAX_RECORD)

    def test_timeout_and_cancellation_join_transport_threads(self):
        for error in (subprocess.TimeoutExpired('local_decoder', 60), KeyboardInterrupt()):
            with self.subTest(error=type(error).__name__):
                before = set(threading.enumerate())
                with patch('oracle.subprocess.run', side_effect=error):
                    with self.assertRaises(type(error)):
                        decoder_process(['tshark'], io.BytesIO(b'fixture'), io.BytesIO(), self.root)
                self.assertEqual(set(threading.enumerate()), before)

    def test_transport_errors_have_fixed_private_reason(self):
        class BrokenDestination:
            def write(self, data):
                raise OSError('private-output-error-text')

        def decoder(args, **kwargs):
            for chunk in iter(lambda: kwargs['stdin'].read(65536), b''): pass
            kwargs['stdout'].write(b'fixture')
            return subprocess.CompletedProcess(args, 0)

        with patch('oracle.subprocess.run', side_effect=decoder):
            with self.assertRaisesRegex(IngestError, '^oracle_pipe_transport_failed$'):
                decoder_process(['tshark'], io.BytesIO(b'fixture'), BrokenDestination(), self.root)


@unittest.skipUnless(shutil.which('tshark'), 'independent Wireshark unavailable')
class NestedReference(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='sentinel-oracle-nested-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def test_outer_address_family_and_flags_exclude_quoted_headers(self):
        quoted4 = ipv4(tcp(), 6)
        quoted6 = ipv6(tcp(), 6)
        quoted_dns = ipv6(udp(dns_question()), 17)
        frames = [
            eth(ipv4(b'\x03\x03\0\0' + bytes(4) + quoted4, 1,
                     src='203.0.113.1', dst='203.0.113.2')),
            eth(ipv4(b'\x03\x03\0\0' + bytes(4) + quoted6, 1,
                     src='203.0.113.1', dst='203.0.113.2')),
            eth(ipv6(b'\x01\x04\0\0' + bytes(4) + quoted4,
                     src='2001:db8::f1', dst='2001:db8::f2'), 0x86dd),
            eth(ipv6(b'\x01\x04\0\0' + bytes(4) + quoted6,
                     src='2001:db8::f1', dst='2001:db8::f2'), 0x86dd),
            eth(ipv6(b'\x01\x04\0\0' + bytes(4) + quoted_dns,
                     src='2001:db8::f1', dst='2001:db8::f2'), 0x86dd),
            eth(ipv4(b'\x03\x03\0\0' + bytes(4) + ndp()[14:], 1,
                     src='203.0.113.1', dst='203.0.113.2')),
        ]
        source = self.root / 'synthetic.pcap'
        source.write_bytes(pcap(frames))
        report = compare([source], self.root / 'comparison')
        self.assertEqual(report['status'], 'PASS', report)
        compared = report['files'][0]['compared_fields']
        self.assertEqual(compared['src'], len(frames))
        self.assertEqual(compared['dst'], len(frames))
        self.assertNotIn('tcp_flags', compared)
        self.assertNotIn('dns_questions', compared)
        self.assertNotIn('ndp_mappings', compared)
        self.assertTrue(report['files'][0]['complete_source_verified'])

    def test_retransmitted_complete_client_hello_is_independently_decoded(self):
        frame = eth(ipv4(tcp(hello()), 6))
        source = self.root / 'synthetic-retransmission.pcap'
        source.write_bytes(pcap([frame, frame]))
        report = compare([source], self.root / 'comparison')
        self.assertEqual(report['status'], 'PASS', report)
        self.assertEqual(report['files'][0]['compared_fields']['tls_sni'], 2)
        self.assertFalse(report['configuration']['tcp_sequence_analysis'])
        self.assertTrue(report['files'][0]['complete_source_verified'])

    def test_first_complete_hello_matches_when_more_hellos_share_packet(self):
        frame = eth(ipv4(tcp(hello() + hello()), 6))
        source = self.root / 'synthetic-multiple-hellos.pcap'
        source.write_bytes(pcap([frame]))
        report = compare([source], self.root / 'comparison')
        self.assertEqual(report['status'], 'PASS', report)
        self.assertEqual(report['files'][0]['compared_fields']['tls_sni'], 1)

    def test_supported_endpoint_and_flag_omissions_are_detected(self):
        source = self.root / 'synthetic-tcp.pcap'
        source.write_bytes(pcap([eth(ipv4(tcp(), 6))]))
        for field in ('src', 'dst', 'sport', 'dport', 'tcp_flags'):
            with self.subTest(field=field):
                def omitted(packet):
                    meta, apps, losses = real_decode(packet)
                    meta[field] = None
                    return meta, apps, losses

                with patch('oracle.decode', side_effect=omitted):
                    report = compare([source], self.root / ('omitted-' + field))
                self.assertEqual(report['status'], 'FAILED')
                self.assertIn(field, {m['field'] for m in report['files'][0]['mismatches']})

    def test_corrupted_addresses_cannot_select_quoted_inner_family(self):
        quoted = ipv6(tcp(), 6)
        frame = eth(ipv4(b'\x03\x03\0\0' + bytes(4) + quoted, 1,
                         src='203.0.113.1', dst='203.0.113.2'))
        source = self.root / 'synthetic-quoted.pcap'
        source.write_bytes(pcap([frame]))

        def wrong_family(packet):
            meta, apps, losses = real_decode(packet)
            meta.update(src='2001:db8::1', dst='2001:db8::2')
            return meta, apps, losses

        with patch('oracle.decode', side_effect=wrong_family):
            report = compare([source], self.root / 'wrong-family')
        self.assertEqual(report['status'], 'FAILED')
        self.assertEqual({m['field'] for m in report['files'][0]['mismatches']}, {'src', 'dst'})

    def test_complete_client_hello_sni_omissions_are_detected(self):
        source = self.root / 'synthetic-tls.pcap'
        source.write_bytes(pcap([eth(ipv4(tcp(hello()), 6))]))
        for mutation in ('omit_hello', 'omit_server_name'):
            with self.subTest(mutation=mutation):
                def omitted(packet):
                    meta, apps, losses = real_decode(packet)
                    if mutation == 'omit_hello':
                        apps = [(kind, data) for kind, data in apps if kind != 'tls.hello']
                    else:
                        for kind, data in apps:
                            if kind == 'tls.hello': data.pop('server_name', None)
                    return meta, apps, losses

                with patch('oracle.decode', side_effect=omitted):
                    report = compare([source], self.root / mutation)
                self.assertEqual(report['status'], 'FAILED')
                self.assertIn('tls_sni', {m['field'] for m in report['files'][0]['mismatches']})

    def test_quoted_client_hello_does_not_require_outer_tls_observation(self):
        quoted = ipv4(tcp(hello()), 6)
        frame = eth(ipv4(b'\x03\x03\0\0' + bytes(4) + quoted, 1,
                         src='203.0.113.1', dst='203.0.113.2'))
        source = self.root / 'synthetic-quoted-tls.pcap'
        source.write_bytes(pcap([frame]))
        report = compare([source], self.root / 'quoted-tls')
        self.assertEqual(report['status'], 'PASS', report)
        self.assertNotIn('tls_sni', report['files'][0]['compared_fields'])
