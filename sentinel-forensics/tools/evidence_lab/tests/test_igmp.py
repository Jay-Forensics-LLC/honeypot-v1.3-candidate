"""Invented IGMP metadata fixtures retain wire facts, bounds and uncertainty."""
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
from capture import classic
from contract import validate_file
from core import Reader
from network import DecodeError, decode, igmp, MAX_IGMP_RECORDS, MAX_IGMP_SOURCES
from query import timeline
from fixtures import eth, ipv4, ipv6, pcap
from igmp_fixtures import (GROUP, SOURCE, checksum, with_checksum, legacy,
                           query_v3, group_record, report_v3)


MEMBERSHIP = 'observed_control_message_no_membership_state_inference'
VERSION_SEMANTICS = 'wire_format_classification_not_host_state'


class IgmpMetadata(unittest.TestCase):
    def packet(self, payload, *, family=4, fragment=0, link=1, vlan=None):
        data = (ipv4(payload, 2, src=SOURCE, dst='224.0.0.22', frag=fragment)
                if family==4 else ipv6(payload, 2))
        frame = eth(data, 0x0800 if family==4 else 0x86dd, vlan=vlan) if link==1 else data
        return next(classic(Reader(io.BytesIO(pcap([frame],link=link)))))

    def assert_message(self, payload, expected_version):
        self.assertEqual(checksum(payload), 0)
        apps = igmp(payload)
        self.assertEqual(apps[0][0], 'igmp.message')
        message = apps[0][1]
        self.assertEqual(message['message_type'], payload[0])
        self.assertEqual(message['version'], expected_version)
        self.assertEqual(message['version_semantics'], VERSION_SEMANTICS)
        self.assertEqual(message['checksum'], int.from_bytes(payload[2:4], 'big'))
        self.assertIs(message['checksum_valid'], True)
        self.assertEqual(message['membership_semantics'], MEMBERSHIP)
        return apps

    def test_legacy_wire_formats_and_explicit_response_timer(self):
        for typ, version in ((0x12,1), (0x16,2), (0x17,2)):
            with self.subTest(message_type=typ):
                apps = self.assert_message(legacy(typ),version)
                self.assertEqual(len(apps),1)
                self.assertEqual(apps[0][1]['address'],GROUP)
        v1 = self.assert_message(legacy(0x11,address='0.0.0.0'),1)[0][1]
        self.assertEqual(v1['max_response_code'],0)
        self.assertIsNone(v1['max_response_tenths'])
        # IGMPv2's timer remains a linear byte, including the high-bit boundary.
        v2 = self.assert_message(legacy(0x11,address=GROUP,max_response_code=255),2)[0][1]
        self.assertEqual(v2['max_response_code'],255)
        self.assertEqual(v2['max_response_tenths'],255)

    def test_v3_query_keeps_ordered_repeated_sources_and_wire_control_fields(self):
        sources = (SOURCE,'198.51.100.41',SOURCE)
        message = self.assert_message(query_v3(address=GROUP,max_response_code=144,
            sources=sources,suppress=True,robustness=5,query_interval_code=143),3)[0][1]
        self.assertEqual(message['address'],GROUP)
        self.assertEqual(message['source_count'],3)
        self.assertEqual(message['source_addresses'],list(sources))
        self.assertIs(message['suppress'],True)
        self.assertEqual(message['robustness'],5)
        self.assertEqual(message['max_response_tenths'],256)
        self.assertEqual(message['query_interval_code'],143)
        self.assertEqual(message['query_interval_seconds'],248)

    def test_v3_floating_timer_boundaries_use_units_without_float_rounding(self):
        # Literal expected values independently describe the RFC timer examples.
        for code, expected in ((0,0),(1,1),(127,127),(128,128),(129,136),
                               (143,248),(144,256),(255,31744)):
            with self.subTest(code=code):
                message = igmp(query_v3(max_response_code=code,query_interval_code=code))[0][1]
                self.assertEqual(message['max_response_code'],code)
                self.assertEqual(message['max_response_tenths'],expected)
                self.assertEqual(message['query_interval_seconds'],expected)

    def test_v3_report_preserves_record_order_duplicates_and_each_record_type(self):
        sources = (SOURCE,'198.51.100.41',SOURCE)
        records = [group_record(record_type=typ,sources=sources) for typ in range(1,7)]
        records.append(records[0])
        apps = self.assert_message(report_v3(records),3)
        self.assertEqual(apps[0][1]['group_record_count'],7)
        groups = apps[1:]
        self.assertEqual(len(groups),7)
        self.assertEqual([row['record_type'] for _,row in groups],[1,2,3,4,5,6,1])
        for index, (kind,row) in enumerate(groups):
            self.assertEqual(kind,'igmp.group_record')
            self.assertEqual(row['record_index'],index)
            self.assertEqual(row['address'],GROUP)
            self.assertEqual(row['source_count'],3)
            self.assertEqual(row['source_addresses'],list(sources))
            self.assertEqual(row['auxiliary_words'],0)
            self.assertEqual(row['membership_semantics'],MEMBERSHIP)

    def test_empty_and_maximum_count_messages_are_explicit_occurrences(self):
        report = self.assert_message(report_v3(),3)
        self.assertEqual(len(report),1)
        self.assertEqual(report[0][1]['group_record_count'],0)
        query = self.assert_message(query_v3(),3)[0][1]
        self.assertEqual(query['source_count'],0)
        self.assertEqual(query['source_addresses'],[])
        self.assertEqual(len(igmp(report_v3([group_record()]*MAX_IGMP_RECORDS))),1+MAX_IGMP_RECORDS)
        sources = [SOURCE]*MAX_IGMP_SOURCES
        self.assertEqual(igmp(query_v3(address=GROUP,sources=sources))[0][1]['source_addresses'],sources)
        half = MAX_IGMP_SOURCES//2
        groups = igmp(report_v3([group_record(sources=[SOURCE]*half),
                                 group_record(sources=[SOURCE]*(MAX_IGMP_SOURCES-half))]))[1:]
        self.assertEqual(sum(row['source_count'] for _,row in groups),MAX_IGMP_SOURCES)

    def test_count_budgets_apply_to_the_whole_report(self):
        messages = [report_v3([group_record()]*(MAX_IGMP_RECORDS+1)),
                    query_v3(address=GROUP,sources=[SOURCE]*(MAX_IGMP_SOURCES+1)),
                    report_v3([group_record(sources=[SOURCE]*MAX_IGMP_SOURCES),
                               group_record(sources=[SOURCE])])]
        for payload in messages:
            with self.subTest(size=len(payload)):
                with self.assertRaises(DecodeError) as caught:
                    igmp(payload)
                self.assertIn('budget',str(caught.exception))
                _,apps,losses = decode(self.packet(payload))
                self.assertEqual(apps,[])
                self.assertIn(str(caught.exception),losses)

    def test_structural_failures_are_not_hidden_by_invalid_checksums(self):
        valid_query = query_v3(address=GROUP,sources=[SOURCE])
        valid_report = report_v3([group_record(sources=[SOURCE])])
        messages = [b'',legacy()[:7],valid_query[:-1],valid_report[:-1]]
        for payload in messages:
            with self.subTest(size=len(payload)):
                with self.assertRaises(DecodeError) as caught:
                    igmp(payload)
                self.assertNotEqual(str(caught.exception),'igmp_checksum_invalid')
                self.assertTrue(str(caught.exception)=='truncated_protocol' or str(caught.exception).startswith('igmp_'))
                _,apps,losses = decode(self.packet(payload))
                self.assertEqual(apps,[])
                self.assertIn(str(caught.exception),losses)
        for extra in (1,2,3):
            with self.subTest(query_size=8+extra):
                payload = with_checksum(legacy(0x11)+bytes(extra))
                with self.assertRaisesRegex(DecodeError,'^igmp_query_length$'):
                    igmp(payload)

    def test_auxiliary_trailing_and_unknown_content_remain_losses(self):
        cases = [(report_v3([group_record(auxiliary=b'\x01\x02\x03\x04')]),
                  'igmp_auxiliary_data_unexamined'),
                 (with_checksum(legacy()+b'opaque'),'igmp_trailing_data_unexamined')]
        for payload, code in cases:
            with self.subTest(code=code):
                with self.assertRaisesRegex(DecodeError,'^'+code+'$'):
                    igmp(payload)
                meta,apps,losses = decode(self.packet(payload))
                self.assertEqual(meta['protocol'],'igmp')
                self.assertEqual(apps,[])
                self.assertIn(code,losses)
        for payload in (legacy(0x30),report_v3([group_record(record_type=7)])):
            with self.assertRaises(DecodeError) as caught:
                igmp(payload)
            self.assertIn('unsupported',str(caught.exception))
            self.assertEqual(decode(self.packet(payload))[1],[])

    def test_invalid_group_addresses_are_not_claimed_as_membership_messages(self):
        for payload in (legacy(address='0.0.0.0'),legacy(address=SOURCE),
                        query_v3(address=SOURCE),report_v3([group_record(address=SOURCE)])):
            with self.assertRaises(DecodeError):
                igmp(payload)
            self.assertEqual(decode(self.packet(payload))[1],[])
        self.assertEqual(igmp(legacy(0x11,address='0.0.0.0'))[0][1]['address'],'0.0.0.0')
        # A General Query cannot carry a source-filter list. Keep its captured
        # framing as explicit unsupported content rather than invent membership.
        invalid_general = query_v3(sources=[SOURCE])
        with self.assertRaisesRegex(DecodeError,'^igmp_query_group_sources$'):
            igmp(invalid_general)
        _,apps,losses = decode(self.packet(invalid_general))
        self.assertEqual(apps,[])
        self.assertIn('igmp_query_group_sources',losses)

    def test_checksum_corruption_preserves_packet_metadata_and_explicit_loss(self):
        valid = legacy()
        broken = valid[:2]+bytes([valid[2]^1])+valid[3:]
        with self.assertRaisesRegex(DecodeError,'^igmp_checksum_invalid$'):
            igmp(broken)
        meta,apps,losses = decode(self.packet(broken))
        self.assertEqual(meta['protocol'],'igmp')
        self.assertEqual(meta['src'],SOURCE)
        self.assertEqual(meta['dst'],'224.0.0.22')
        self.assertIsNone(meta['sport'])
        self.assertIsNone(meta['dport'])
        self.assertEqual(apps,[])
        self.assertIn('igmp_checksum_invalid',losses)

    def test_only_complete_ipv4_igmp_reaches_the_message_parser(self):
        for link,vlan in ((1,None),(1,25),(101,None),(228,None)):
            with self.subTest(link=link,vlan=vlan):
                meta,apps,losses = decode(self.packet(legacy(),link=link,vlan=vlan))
                self.assertEqual(meta['protocol'],'igmp')
                self.assertEqual(len(apps),1)
                self.assertEqual(losses,[])
        meta,apps,losses = decode(self.packet(legacy(),family=6))
        self.assertEqual(meta['protocol'],'ip_2')
        self.assertEqual(apps,[])
        self.assertIn('igmp_address_family_mismatch',losses)
        for flags in (0x2000,1):
            meta,apps,losses = decode(self.packet(legacy(),fragment=flags))
            self.assertEqual(meta['protocol'],'ipv4_fragment')
            self.assertEqual(apps,[])
            self.assertIn('fragment_no_reassembly',losses)

    def test_declared_raw_ip_family_cannot_be_overridden_by_packet_bytes(self):
        for family,link in ((4,229),(6,228)):
            with self.subTest(family=family,link=link):
                meta,apps,losses = decode(self.packet(legacy(),family=family,link=link))
                self.assertNotEqual(meta['protocol'],'igmp')
                self.assertEqual(apps,[])
                self.assertIn('raw_ip_linktype_family_mismatch',losses)
        # Correct IPv6 link declarations reach the separate IPv4-only IGMP gate;
        # DLT_RAW retains its version-nibble dispatch for either address family.
        for link in (101,229):
            with self.subTest(accepted_ipv6_link=link):
                meta,apps,losses = decode(self.packet(legacy(),family=6,link=link))
                self.assertEqual(meta['protocol'],'ip_2')
                self.assertEqual(apps,[])
                self.assertIn('igmp_address_family_mismatch',losses)
                self.assertNotIn('raw_ip_linktype_family_mismatch',losses)

    def test_truncated_v3_prefix_is_not_reclassified_as_a_legacy_query(self):
        # All four v3 extension bytes are zero. The first eight bytes therefore
        # also have a valid legacy checksum; checksum validation alone cannot
        # prevent a snaplen-truncated v3 query from becoming a false v2 event.
        payload = query_v3(robustness=0,query_interval_code=0)
        self.assertEqual(checksum(payload[:8]),0)
        self.assertEqual(igmp(payload[:8])[0][1]['version'],2)
        truncated = eth(ipv4(payload,2,src=SOURCE,dst='224.0.0.1')[:-4])
        packet = next(classic(Reader(io.BytesIO(pcap([truncated])))))
        meta,apps,losses = decode(packet)
        self.assertEqual(meta['protocol'],'igmp')
        self.assertEqual(apps,[])
        self.assertIn('truncated_ip',losses)
        self.assertNotIn('igmp_checksum_invalid',losses)

    def test_index_retains_group_occurrences_flow_counts_and_minimized_addresses(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            group_two = '239.255.0.32'
            filter_source = '198.51.100.41'
            repeated = group_record(sources=[filter_source,SOURCE,filter_source])
            message = report_v3([repeated,repeated,group_record(record_type=6,address=group_two)])
            frame = eth(ipv4(message,2,src=SOURCE,dst='224.0.0.22'))
            raw = pcap([(1700000000,frame),(1700000000,frame)])
            source = root/'invented-igmp.pcap'
            source.write_bytes(raw)
            output = root/'case'
            with patch.object(socket,'socket',side_effect=AssertionError('network forbidden')), \
                 patch.object(socket,'getaddrinfo',side_effect=AssertionError('DNS forbidden')):
                manifest = analyze([source],output,pseudonym_key=b'K'*32)
            self.assertEqual(source.read_bytes(),raw)
            self.assertEqual(manifest['coverage']['counts']['duplicate_records'],1)
            self.assertEqual(manifest['coverage']['decoding_losses'],{})
            with sqlite3.connect(output/'index.sqlite') as db:
                self.assertEqual(db.execute('SELECT COUNT(*) FROM observations').fetchone()[0],8)
                self.assertEqual(db.execute('SELECT COUNT(*) FROM observations WHERE duplicate_of IS NOT NULL').fetchone()[0],4)
                self.assertEqual(db.execute('SELECT COUNT(*) FROM associations').fetchone()[0],0)
                self.assertEqual(db.execute('SELECT COUNT(*) FROM findings').fetchone()[0],0)
                # This address appears only inside source-filter arrays. Each of
                # two groups contains it twice, in each of two source packets.
                # Query results retain four distinct group occurrences, never
                # eight array-element hits and never one inferred identity.
                selected = list(timeline(db,identifier=filter_source,protocol='igmp',source=1))
                self.assertEqual(len(selected),4)
                self.assertEqual(len({row['event_id'] for row in selected}),4)
                self.assertEqual([row['ordinal'] for row in selected],[1,1,2,2])
                self.assertTrue(all(row['kind']=='igmp.group_record' for row in selected))
                limited = list(timeline(db,identifier=filter_source,limit=3))
                self.assertEqual(len(limited),3)
                self.assertEqual(len({row['event_id'] for row in limited}),3)
                rows = db.execute('SELECT ordinal,kind,data_json,provenance_json FROM observations ORDER BY id').fetchall()
                for ordinal,kind,data_raw,provenance_raw in rows:
                    data,ref = json.loads(data_raw),json.loads(provenance_raw)
                    original = raw[ref['byte_offset']:ref['byte_offset']+ref['byte_length']]
                    self.assertEqual(hashlib.sha256(original).hexdigest(),ref['record_sha256'])
                    self.assertEqual(ref['source_id'],1)
                    self.assertEqual(ref['ordinal'],ordinal)
                    self.assertEqual(data['src'],SOURCE)
                    self.assertIsNone(data['sport'])
                    if kind=='igmp.group_record' and data['record_index']<2:
                        self.assertEqual(data['source_addresses'],[filter_source,SOURCE,filter_source])
                flow = db.execute('SELECT protocol,packets,packets_a_to_b,packets_b_to_a,captured_a_to_b,captured_b_to_a FROM flows').fetchone()
                self.assertEqual(flow[0:2],('igmp',2))
                self.assertEqual(sum(flow[2:4]),2)
                self.assertEqual(sum(flow[4:6]),2*len(frame))
            for path in (output/'export').iterdir():
                public = path.read_text()
                for address in (SOURCE,GROUP,group_two,filter_source,'224.0.0.22'):
                    self.assertNotIn(address,public)
            self.assertGreater(validate_file(output/'export/exchange.jsonl'),0)


if __name__=='__main__':
    unittest.main()
