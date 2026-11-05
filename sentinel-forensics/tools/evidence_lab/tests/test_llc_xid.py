"""Basic-XID observations require complete declared wire data and retain limits."""
from contextlib import closing
import hashlib
import io
import json
from pathlib import Path
import socket
import sqlite3
import struct
import tempfile
import unittest
from unittest.mock import patch

from analyze import analyze
from capture import classic, pcapng
from contract import validate_file
from core import Reader
from network import DecodeError, decode, llc_xid
from query import timeline
from fixtures import arp, dns_question, eth, epb, interface, ipv4, pcap, section, udp
from llc_fixtures import DESTINATION_MAC, SOURCE_MAC, ethernet, xid


class LlcXidMetadata(unittest.TestCase):
    def packet(self, frame, *, original_extra=0, link=1):
        raw = pcap([frame],link=link)
        if original_extra:
            # Change only the original wire size, retaining the captured bytes.
            raw = raw[:36]+struct.pack('<I',len(frame)+original_extra)+raw[40:]
        return next(classic(Reader(io.BytesIO(raw))))

    def assert_supported(self, payload, *, tags=(), padding=b''):
        meta, apps, losses = decode(self.packet(ethernet(payload,tags=tags,padding=padding)))
        self.assertEqual(losses,[])
        self.assertEqual(meta['protocol'],'llc')
        self.assertIsNone(meta['src'])
        self.assertIsNone(meta['dst'])
        self.assertIsNone(meta['sport'])
        self.assertIsNone(meta['dport'])
        self.assertIsNone(meta['ip_bytes'])
        self.assertEqual(meta['src_mac'],SOURCE_MAC)
        self.assertEqual(meta['dst_mac'],DESTINATION_MAC)
        self.assertEqual(meta['vlan'],[tci & 0xfff for _,tci in tags])
        self.assertEqual([kind for kind,_ in apps],['llc.xid'])
        self.assertEqual(set(apps[0][1]),{'declared_length','dsap','ssap','control',
            'response','poll_final','group','format','types_octet','capability_code',
            'receive_window_octet','receive_window'})
        return apps[0][1]

    def test_complete_command_response_and_poll_final_wire_combinations(self):
        for ssap in (0,1):
            for control in (0xaf,0xbf):
                with self.subTest(ssap=ssap,control=control):
                    data = self.assert_supported(xid(ssap=ssap,control=control))
                    self.assertEqual(data['declared_length'],6)
                    self.assertEqual(data['dsap'],0)
                    self.assertEqual(data['ssap'],ssap)
                    self.assertEqual(data['control'],control)
                    self.assertIs(data['response'],ssap==1)
                    self.assertIs(data['poll_final'],control==0xbf)
                    self.assertIs(data['group'],False)
                    self.assertEqual(data['format'],0x81)
                    # An observed response does not establish a preceding poll,
                    # physical-device identity, or a live connection state.
                    self.assertNotIn('solicited',data)

    def test_null_and_non_null_capability_codes_remain_numeric(self):
        for code in (1,3,5,7):
            with self.subTest(null_capability=code):
                data = self.assert_supported(xid(types_octet=code))
                self.assertEqual(data['types_octet'],code)
                self.assertEqual(data['capability_code'],code)
        for code in range(1,8):
            with self.subTest(non_null_capability=code):
                data = self.assert_supported(xid(dsap=0x42,ssap=0x43,types_octet=code))
                self.assertEqual(data['dsap'],0x42)
                self.assertEqual(data['ssap'],0x43)
                self.assertEqual(data['capability_code'],code)
        # Mixed null/non-null addresses retain their raw SAPs without invented
        # class labels or host-capability verification.
        data = self.assert_supported(xid(dsap=0x42,ssap=1,types_octet=2))
        self.assertEqual(data['capability_code'],2)

    def test_zero_and_maximum_window_are_not_hidden_by_masking(self):
        for wire,decoded in ((0,0),(2,1),(126,63),(128,64),(254,127)):
            with self.subTest(wire=wire):
                data = self.assert_supported(xid(receive_window_octet=wire))
                self.assertEqual(data['receive_window_octet'],wire)
                self.assertEqual(data['receive_window'],decoded)

    def test_group_command_is_observable_but_group_response_is_explicit_loss(self):
        data = self.assert_supported(xid(dsap=1,ssap=0))
        self.assertIs(data['group'],True)
        self.assertIs(data['response'],False)
        data = self.assert_supported(xid(dsap=255,ssap=0x42,types_octet=2))
        self.assertEqual(data['dsap'],255)
        meta,apps,losses = decode(self.packet(ethernet(xid(dsap=1,ssap=1))))
        self.assertEqual(meta['protocol'],'llc')
        self.assertEqual(apps,[])
        self.assertEqual(losses,['llc_xid_response_group'])

    def test_declared_length_excludes_padding_even_if_it_looks_like_protocol_data(self):
        payload = xid(receive_window_octet=254)
        expected = self.assert_supported(payload)
        for pad in (b'\0'*40, b'opaque-padding-do-not-retain', xid(types_octet=7), b'\xff'*1494):
            with self.subTest(padding_length=len(pad)):
                self.assertEqual(self.assert_supported(payload,padding=pad),expected)
        # The same octets INSIDE the declared payload remain unexamined, and
        # cannot be silently stripped to turn a longer PDU into a complete XID.
        _,apps,losses = decode(self.packet(ethernet(payload+b'\0')))
        self.assertEqual(apps,[])
        self.assertEqual(losses,['llc_xid_trailing_data_unexamined'])

    def test_vlan_qinq_and_existing_depth_budget_keep_full_context(self):
        for tags in ((),((0x8100,23),),((0x88a8,71),(0x8100,23)),
                     ((0x88a8,71),(0x9100,21),(0x8100,23),(0x8100,4094))):
            with self.subTest(tags=tags):
                self.assert_supported(xid(),tags=tags,padding=b'\0'*40)
        frame = ethernet(xid(),tags=((0x8100,23),)*5)
        _,apps,losses = decode(self.packet(frame))
        self.assertEqual(apps,[])
        self.assertEqual(losses,['vlan_depth_limit'])

    def test_incomplete_declared_payload_cannot_borrow_bytes_or_claim_xid(self):
        for length in range(6):
            with self.subTest(captured_payload_length=length):
                frame = ethernet(xid()[:length],declared_length=6)
                meta,apps,losses = decode(self.packet(frame,original_extra=6-length))
                self.assertEqual(meta['protocol'],'llc')
                self.assertEqual(apps,[])
                self.assertEqual(losses,['truncated_8023_payload'])
        for length in range(6):
            with self.subTest(declared_payload_length=length):
                # Complete-looking external pad does not satisfy LLC bytes
                # outside the packet's declared MAC-client payload.
                frame = ethernet(xid()[:length],padding=xid())
                _,apps,losses = decode(self.packet(frame))
                self.assertEqual(apps,[])
                self.assertEqual(losses,['truncated_protocol'])

    def test_complete_xid_with_missing_external_pad_keeps_capture_uncertainty(self):
        packet = self.packet(ethernet(xid()),original_extra=40)
        self.assertEqual(packet.status,'capture_truncated')
        self.assertEqual(packet.original,len(packet.payload)+40)
        self.assertEqual(decode(packet)[2],[])
        self.assertEqual(len(decode(packet)[1]),1)

    def test_unknown_formats_reserved_bits_and_capabilities_remain_explicit_losses(self):
        cases = [(xid(format=0x82),'unsupported_llc_xid_format'),
                 (xid(types_octet=0xe1),'llc_xid_reserved_bits'),
                 (xid(receive_window_octet=1),'llc_xid_reserved_bits'),
                 (xid(receive_window_octet=255),'llc_xid_reserved_bits')]
        cases += [(xid(types_octet=code),'unsupported_llc_xid_capability')
                  for code in (0,2,4,6,8,31)]
        cases += [(xid(dsap=0x42,ssap=0x43,types_octet=code),'unsupported_llc_xid_capability')
                  for code in (0,8,31)]
        for payload,loss in cases:
            with self.subTest(payload=payload.hex(),loss=loss):
                with self.assertRaisesRegex(DecodeError,'^'+loss+'$'):
                    llc_xid(payload)
                meta,apps,losses = decode(self.packet(ethernet(payload)))
                self.assertEqual(meta['protocol'],'llc')
                self.assertEqual(apps,[])
                self.assertEqual(losses,[loss])

    def test_other_llc_controls_and_snap_cannot_be_counted_as_basic_xid(self):
        payloads = [xid(control=control) for control in (0,1,3,0xe3,0xf3,0xae)]
        payloads += [bytes.fromhex('aaaa030000000800')+ipv4(udp(dns_question())),
                     bytes.fromhex('aaaa0300601d0001')+bytes(38),
                     bytes.fromhex('aaaa030040960000')+bytes(34)]
        for payload in payloads:
            with self.subTest(control=payload[2],length=len(payload)):
                _,apps,losses = decode(self.packet(ethernet(payload)))
                self.assertEqual(apps,[])
                self.assertEqual(losses,['unsupported_llc_control'])

    def test_length_type_boundary_and_ethernet_ii_dispatch_are_preserved(self):
        for length in (6,1499,1500):
            payload = xid()+bytes(length-6)
            _,apps,losses = decode(self.packet(ethernet(payload)))
            if length==6:
                self.assertEqual(len(apps),1)
                self.assertEqual(losses,[])
            else:
                self.assertEqual(apps,[])
                self.assertEqual(losses,['llc_xid_trailing_data_unexamined'])
        for field in (1501,1518,1535):
            _,apps,losses = decode(self.packet(ethernet(xid(),declared_length=field)))
            self.assertEqual(apps,[])
            self.assertEqual(losses,['reserved_ethernet_length_type'])
        for field in (1536,0x88b5,0x886c):
            meta,apps,losses = decode(self.packet(ethernet(xid(),declared_length=field)))
            self.assertEqual(meta['protocol'],'unsupported')
            self.assertEqual(apps,[])
            # LLC-shaped bytes in an Ethernet-II payload never become XID.
            # The recognized vendor EtherType additionally reports why its
            # own guarded common-header subset cannot interpret these bytes.
            self.assertEqual(losses,['unsupported_ethertype'] +
                             (['broadcom_event_subtype_unsupported'] if field==0x886c else []))
        meta,apps,losses = decode(self.packet(eth(ipv4(udp(dns_question())))))
        self.assertEqual(meta['protocol'],'udp')
        self.assertEqual([kind for kind,_ in apps],['dns.question'])
        self.assertEqual(losses,[])
        meta,apps,losses = decode(self.packet(arp()))
        self.assertEqual(meta['protocol'],'arp')
        self.assertEqual([kind for kind,_ in apps],['arp.mapping'])
        self.assertEqual(losses,[])

    def test_invalid_packets_remain_accounted_and_do_not_block_later_valid_packet(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            frames = [ethernet(xid(types_octet=0xe1)),
                      ethernet(xid()[:-1],declared_length=6),
                      ethernet(xid()+b'\0'),
                      ethernet(bytes.fromhex('aaaa0300601d0001')+bytes(38)),
                      ethernet(xid())]
            raw = pcap(frames)
            source = root/'invented-mixed-xid.pcap'
            source.write_bytes(raw)
            output = root/'case'
            with patch.object(socket,'socket',side_effect=AssertionError('network forbidden')), \
                 patch.object(socket,'getaddrinfo',side_effect=AssertionError('DNS forbidden')):
                manifest = analyze([source],output,pseudonym_key=b'K'*32)
            self.assertEqual(source.read_bytes(),raw)
            self.assertEqual(manifest['status'],'COMPLETE')
            coverage = manifest['coverage']
            self.assertEqual(coverage['counts']['packet_records'],5)
            self.assertEqual(coverage['counts']['observations'],1)
            self.assertEqual(coverage['decoding_losses'],{
                'llc_xid_reserved_bits':1,'truncated_8023_payload':1,
                'llc_xid_trailing_data_unexamined':1,'unsupported_llc_control':1})
            with closing(sqlite3.connect(output/'index.sqlite')) as db:
                self.assertEqual(db.execute('SELECT ordinal,kind FROM observations').fetchone(),(5,'llc.xid'))
                self.assertEqual(db.execute("SELECT COUNT(*) FROM records WHERE kind='packet'").fetchone()[0],5)
            self.assertGreater(validate_file(output/'export/exchange.jsonl'),0)

    def test_index_preserves_occurrences_exact_source_bytes_and_minimized_exports(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            pad = b'private-padding-marker-do-not-retain'
            frame = ethernet(xid(),padding=pad)
            qinq = ethernet(xid(ssap=0,control=0xbf,types_octet=7,receive_window_octet=254),
                            tags=((0x88a8,71),(0x8100,23)),padding=pad)
            raw_pcap = pcap([(1700000000,frame),(1700000000,frame),(1700000001,qinq)])
            raw_ng = (section()+interface()+epb(qinq)+
                      section('>')+interface('>')+epb(frame,endian='>'))
            sources = [root/'invented-xid.pcap',root/'invented-xid.pcapng']
            for source,raw in zip(sources,(raw_pcap,raw_ng)):
                source.write_bytes(raw)
            output = root/'case'
            with patch.object(socket,'socket',side_effect=AssertionError('network forbidden')), \
                 patch.object(socket,'getaddrinfo',side_effect=AssertionError('DNS forbidden')):
                manifest = analyze(sources,output,pseudonym_key=b'K'*32)
            self.assertEqual([source.read_bytes() for source in sources],[raw_pcap,raw_ng])
            coverage = manifest['coverage']
            self.assertEqual(coverage['protocol_distribution'],{'llc':5})
            self.assertEqual(coverage['decoding_losses'],{})
            self.assertEqual(coverage['counts']['packet_records'],5)
            with closing(sqlite3.connect(output/'index.sqlite')) as db:
                rows = db.execute("SELECT source_id,ordinal,context,data_json,provenance_json,duplicate_of FROM observations WHERE kind='llc.xid' ORDER BY id").fetchall()
                self.assertEqual(len(rows),5)
                self.assertEqual(sum(row[5] is not None for row in rows),1)
                self.assertEqual(rows[0][0:2],(1,1))
                self.assertEqual(rows[1][0:2],(1,2))
                self.assertTrue(rows[2][2].endswith('/vlan:71,23'))
                packets = [list(classic(Reader(io.BytesIO(raw_pcap)))),
                           [packet for packet in pcapng(Reader(io.BytesIO(raw_ng))) if packet.kind=='packet']]
                expected = {(sid,packet.ordinal):packet
                            for sid,items in enumerate(packets,1) for packet in items}
                for sid,ordinal,context,data_raw,ref_raw,_ in rows:
                    data,ref = json.loads(data_raw),json.loads(ref_raw)
                    packet = expected[sid,ordinal]
                    raw = (raw_pcap,raw_ng)[sid-1]
                    original = raw[ref['byte_offset']:ref['byte_offset']+ref['byte_length']]
                    self.assertEqual(ref['record_sha256'],hashlib.sha256(original).hexdigest())
                    self.assertEqual(ref['record_sha256'],packet.sha256)
                    self.assertEqual(ref['source_id'],sid)
                    self.assertEqual(ref['ordinal'],ordinal)
                    self.assertEqual(ref['byte_offset'],packet.offset)
                    self.assertEqual(ref['byte_length'],packet.length)
                    self.assertEqual(ref['section'],packet.section)
                    self.assertEqual(ref['interface'],packet.interface)
                    self.assertEqual(ref['block'],packet.block)
                    self.assertEqual(ref['precision'],'byte')
                    self.assertEqual(data['declared_length'],6)
                    self.assertIsNone(data['src'])
                    self.assertIsNone(data['dst'])
                    self.assertIsNone(data['sport'])
                    self.assertIsNone(data['dport'])
                    self.assertNotIn('src_mac',data)
                    self.assertNotIn('dst_mac',data)
                    self.assertNotIn(pad.decode(),data_raw)
                # Link-layer observations do not manufacture IP conversations,
                # identities or findings from the XID capability octets.
                for table in ('flows','associations','findings'):
                    self.assertEqual(db.execute('SELECT COUNT(*) FROM '+table).fetchone()[0],0)
                self.assertEqual(db.execute('SELECT SUM(captured_bytes) FROM packet_meta').fetchone()[0],
                                 3*len(frame)+2*len(qinq))
                selected = list(timeline(db,identifier=SOURCE_MAC,protocol='llc',source=1))
                self.assertEqual(len(selected),3)
                self.assertTrue(all(row['kind']=='network.llc' for row in selected))
                self.assertEqual(len(list(timeline(db,protocol='llc'))),10)
            for path in (output/'export').iterdir():
                public = path.read_text()
                for identifier in (SOURCE_MAC,DESTINATION_MAC,pad.decode()):
                    self.assertNotIn(identifier,public)
            self.assertGreater(validate_file(output/'export/exchange.jsonl'),0)


if __name__=='__main__':
    unittest.main()
