"""Independent offline IGMP comparisons and deliberate omission/corruption checks."""
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

from network import decode as real_decode
from oracle import compare, reference_layers
from fixtures import epb, eth, interface, ipv4, ipv6, pcap, section
from igmp_fixtures import GROUP, SOURCE, group_record, legacy, query_v3, report_v3


def supported_igmp_frames():
    """Entirely invented supported layouts, including empty and repeated data."""
    bodies=[
        legacy(0x11, '0.0.0.0'),
        legacy(0x11, GROUP, max_response_code=150),
        legacy(0x12), legacy(0x16), legacy(0x17),
        query_v3(),
        query_v3(GROUP, max_response_code=150, sources=(SOURCE, SOURCE, '192.0.2.32'),
                 suppress=True, robustness=5, query_interval_code=150),
        report_v3(),
        report_v3((group_record(1, GROUP, (SOURCE, SOURCE)),
                   group_record(2, '239.255.0.32'),
                   group_record(6, '239.255.0.33', ('192.0.2.32',)))),
    ]
    return [eth(ipv4(body, 2, dst=GROUP)) for body in bodies]


class IGMPReferenceLayers(unittest.TestCase):
    def test_only_outer_ipv4_can_select_igmp(self):
        self.assertEqual(reference_layers('eth:ip:igmp'), ('ip', 'igmp'))
        self.assertEqual(reference_layers('eth:ipv6:igmp'), ('ipv6', None))
        self.assertEqual(reference_layers('eth:ip:icmp:ip:igmp'), ('ip', 'icmp'))
        self.assertEqual(reference_layers('eth:ipv6:icmpv6:ip:igmp'), ('ipv6', 'icmpv6'))


@unittest.skipUnless(shutil.which('tshark'), 'independent Wireshark unavailable')
class IGMPIndependentOracle(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='sentinel-oracle-igmp-')
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)

    def compare_frames(self, frames, name, mutation=None, *, kind='pcap'):
        source=self.root/(name+'.'+kind)
        source.write_bytes(pcap(frames) if kind=='pcap' else
                           section()+interface()+b''.join(epb(frame) for frame in frames))
        if mutation is None: return compare([source],self.root/(name+'-comparison'))

        def changed(packet):
            meta,apps,losses=real_decode(packet)
            return mutation(meta,apps,losses)

        with patch('oracle.decode',side_effect=changed):
            return compare([source],self.root/(name+'-comparison'))

    def mismatch_fields(self, report):
        self.assertEqual(report['status'],'FAILED',report)
        self.assertTrue(report['files'][0]['complete_source_verified'])
        return {item['field'] for item in report['files'][0]['mismatches']}

    def test_supported_pcap_and_pcapng_match_reference(self):
        frames=supported_igmp_frames()
        for kind in ('pcap','pcapng'):
            with self.subTest(kind=kind):
                report=self.compare_frames(frames,'supported-'+kind,kind=kind)
                self.assertEqual(report['status'],'PASS',report)
                item=report['files'][0]
                self.assertTrue(item['complete_source_verified'])
                self.assertEqual(item['packets'],len(frames))
                self.assertEqual(item['limited_packets'],0)
                self.assertEqual(item['compared_fields']['igmp_message_count'],len(frames))
                self.assertTrue({'igmp_type','igmp_version','igmp_checksum','igmp_checksum_valid',
                    'igmp_max_response_code','igmp_max_response_tenths','igmp_query_sources',
                    'igmp_query_interval_code','igmp_query_interval_seconds','igmp_group_sources',
                    'igmp_group_source_counts','igmp_group_record_types','igmp_group_auxiliary_words'}
                    <=item['compared_fields'].keys())

    def test_missing_messages_including_empty_report_are_detected(self):
        for name,body in [('query',query_v3()),('empty-report',report_v3())]:
            with self.subTest(kind=name):
                def omitted(meta,apps,losses): return meta,[],losses
                report=self.compare_frames([eth(ipv4(body,2))],name,omitted)
                self.assertIn('igmp_message_count',self.mismatch_fields(report))

    def test_duplicate_message_and_spurious_group_record_are_detected(self):
        def added(meta,apps,losses):
            return meta,apps+apps+[('igmp.group_record',{'record_type':1})],losses
        report=self.compare_frames([eth(ipv4(query_v3(),2))],'extra-observations',added)
        self.assertTrue({'igmp_message_count','igmp_group_record_count'}<=self.mismatch_fields(report))

    def test_wrong_query_values_are_detected_from_reference_version(self):
        body=query_v3(GROUP,max_response_code=150,sources=(SOURCE,'192.0.2.32'),
                      suppress=True,robustness=5,query_interval_code=150)

        def wrong(meta,apps,losses):
            for kind,data in apps:
                if kind=='igmp.message':
                    data.update(message_type=0x12,version=1,checksum=0,checksum_valid=False,
                        address='239.255.0.99',max_response_code=1,max_response_tenths=1,
                        source_count=0,source_addresses=[],suppress=False,robustness=0,
                        query_interval_code=1,query_interval_seconds=1)
            return meta,apps,losses

        report=self.compare_frames([eth(ipv4(body,2))],'wrong-query',wrong)
        self.assertTrue({'igmp_type','igmp_version','igmp_checksum','igmp_checksum_valid',
            'igmp_address','igmp_max_response_code','igmp_max_response_tenths',
            'igmp_query_source_count','igmp_query_sources','igmp_query_suppress',
            'igmp_query_robustness','igmp_query_interval_code','igmp_query_interval_seconds'}
            <=self.mismatch_fields(report))

    def test_missing_query_values_cannot_suppress_comparisons(self):
        body=query_v3(GROUP,max_response_code=150,sources=(SOURCE,),query_interval_code=150)

        def omitted(meta,apps,losses):
            return meta,[(kind,{}) for kind,data in apps],losses

        report=self.compare_frames([eth(ipv4(body,2))],'missing-query-fields',omitted)
        self.assertTrue({'igmp_type','igmp_version','igmp_checksum','igmp_checksum_valid',
            'igmp_max_response_code','igmp_max_response_tenths','igmp_query_sources',
            'igmp_query_interval_code','igmp_query_interval_seconds'}<=self.mismatch_fields(report))

    def test_legacy_report_address_and_v1_query_semantics_are_checked(self):
        def wrong(meta,apps,losses):
            for kind,data in apps:
                if kind=='igmp.message':
                    data['address']='239.255.0.99'
                    if data['message_type']==0x11: data['max_response_tenths']=100
            return meta,apps,losses

        frames=[eth(ipv4(legacy(0x12),2)),eth(ipv4(legacy(0x11,'0.0.0.0'),2))]
        report=self.compare_frames(frames,'legacy-meaning',wrong)
        self.assertTrue({'igmp_address','igmp_max_response_tenths'}<=self.mismatch_fields(report))

    def test_omitted_group_records_are_detected(self):
        body=report_v3((group_record(1,GROUP,(SOURCE,)),group_record(2,'239.255.0.32')))

        def omitted(meta,apps,losses):
            return meta,[(kind,data) for kind,data in apps if kind!='igmp.group_record'],losses

        report=self.compare_frames([eth(ipv4(body,2))],'missing-group-records',omitted)
        self.assertTrue({'igmp_group_record_count','igmp_group_addresses','igmp_group_sources'}
                        <=self.mismatch_fields(report))

    def test_wrong_group_metadata_and_order_are_detected(self):
        frame=supported_igmp_frames()[-1]

        def wrong(meta,apps,losses):
            messages=[(kind,data) for kind,data in apps if kind=='igmp.message']
            records=[(kind,data) for kind,data in apps if kind=='igmp.group_record']
            for kind,data in messages: data['group_record_count']=99
            for kind,data in records: data['auxiliary_words']=1
            return meta,messages+records[::-1],losses

        report=self.compare_frames([frame],'wrong-group-metadata',wrong)
        self.assertTrue({'igmp_declared_group_records','igmp_group_record_indices',
            'igmp_group_record_types','igmp_group_addresses','igmp_group_source_counts',
            'igmp_group_sources','igmp_group_auxiliary_words'}<=self.mismatch_fields(report))

    def test_group_boundaries_are_checked_when_flat_sources_match(self):
        body=report_v3((group_record(1,GROUP,(SOURCE,'192.0.2.32')),
                        group_record(2,'239.255.0.32',('192.0.2.33',))))

        def regrouped(meta,apps,losses):
            records=[data for kind,data in apps if kind=='igmp.group_record']
            records[0].update(source_count=1,source_addresses=[SOURCE])
            records[1].update(source_count=2,source_addresses=['192.0.2.32','192.0.2.33'])
            return meta,apps,losses

        report=self.compare_frames([eth(ipv4(body,2))],'regrouped-sources',regrouped)
        fields=self.mismatch_fields(report)
        self.assertTrue({'igmp_group_source_counts','igmp_group_sources'}<=fields)
        self.assertNotIn('igmp_group_addresses',fields)

    def test_source_order_and_duplicates_are_checked(self):
        body=query_v3(GROUP,sources=(SOURCE,SOURCE,'192.0.2.32'))

        def reordered(meta,apps,losses):
            apps[0][1]['source_addresses'].reverse()
            return meta,apps,losses

        report=self.compare_frames([eth(ipv4(body,2))],'reordered-query-sources',reordered)
        self.assertEqual(self.mismatch_fields(report),{'igmp_query_sources'})

    def negative_frames(self):
        payload=legacy(0x16)
        quoted=ipv4(payload,2)
        return [eth(ipv4(b'\x03\x03\0\0'+bytes(4)+quoted,1)),
                eth(ipv6(b'\x01\x04\0\0'+bytes(4)+quoted,58),0x86dd),
                eth(ipv6(payload,2),0x86dd)]

    def test_quoted_igmp_and_wrong_family_do_not_require_observations(self):
        report=self.compare_frames(self.negative_frames(),'quoted-and-wrong-family')
        self.assertEqual(report['status'],'PASS',report)
        self.assertNotIn('igmp_message_count',report['files'][0]['compared_fields'])
        self.assertEqual(report['files'][0]['limited_packets'],1)
        self.assertTrue(report['files'][0]['complete_source_verified'])

    def test_invented_observations_for_quoted_or_wrong_family_fail(self):
        def invented(meta,apps,losses):
            return meta,apps+[('igmp.message',{'message_type':0x16})],losses

        report=self.compare_frames(self.negative_frames(),'invented-quoted-igmp',invented)
        self.assertIn('igmp_message_count',self.mismatch_fields(report))

    def test_invalid_checksum_is_limited_without_valid_message_claim(self):
        body=bytearray(query_v3())
        body[2]^=1
        report=self.compare_frames([eth(ipv4(body,2))],'invalid-checksum')
        self.assertEqual(report['status'],'PASS',report)
        self.assertEqual(report['files'][0]['limited_packets'],1)
        self.assertNotIn('igmp_message_count',report['files'][0]['compared_fields'])


if __name__=='__main__': unittest.main()
