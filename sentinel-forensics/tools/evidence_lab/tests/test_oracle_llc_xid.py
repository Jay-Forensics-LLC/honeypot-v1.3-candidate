"""Independent basic-XID fields and deliberate omission/masking regressions."""
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

from core import IngestError
from network import decode as real_decode
from oracle import FIELDS, compare, compare_llc_xid
from fixtures import epb, interface, pcap, section
from llc_fixtures import ethernet, xid


def supported_llc_frames():
    """Wholly invented null/non-null SAPs, both P/F values and external padding."""
    return [
        ethernet(xid(ssap=0)),
        ethernet(xid(types_octet=3, receive_window_octet=2)),
        ethernet(xid(ssap=0, control=0xbf, types_octet=5, receive_window_octet=254)),
        ethernet(xid(control=0xbf, types_octet=7, receive_window_octet=10)),
        ethernet(xid(dsap=4, ssap=4, types_octet=2)),
        ethernet(xid(dsap=5, ssap=4, types_octet=6, receive_window_octet=254)),
        ethernet(xid(), tags=((0x8100, 25),), padding=b'\xa5'*40),
        ethernet(xid(), tags=((0x88a8, 100), (0x8100, 25)), padding=b'\xa5'*40),
    ]


class LLCReferenceEligibility(unittest.TestCase):
    def fields(self):
        fields=dict.fromkeys(FIELDS,'')
        fields.update({'frame.protocols':'eth:llc','eth.len':'6','llc.dsap':'0x00',
                       'llc.ssap':'0x01','llc.control':'0x00af',
                       'basicxid.llc.xid.format':'0x81','basicxid.llc.xid.types':'0x01',
                       'basicxid.llc.xid.wsize':'0','sentinel_xid_raw.types':'01',
                       'sentinel_xid_raw.window':'00'})
        return fields

    def test_reference_llc_inside_ip_does_not_establish_outer_scope(self):
        fields=self.fields();fields['frame.protocols']='eth:ethertype:ip:udp:llc'
        comparisons=[]
        compare_llc_xid({'protocol':'udp'},[],fields,True,lambda *args:comparisons.append(args))
        self.assertEqual(comparisons,[])

    def test_missing_raw_reference_octet_fails_explicitly(self):
        fields=self.fields();fields['sentinel_xid_raw.types']=''
        with self.assertRaisesRegex(IngestError,'oracle_llc_required_raw_octet'):
            compare_llc_xid({'protocol':'llc'},[],fields,True,lambda *args:None)

    def test_ambiguous_raw_reference_octets_fail_explicitly(self):
        for value in ('01,01','1','0001','zz'):
            with self.subTest(value=value):
                fields=self.fields();fields['sentinel_xid_raw.types']=value
                with self.assertRaisesRegex(IngestError,'oracle_llc_required_raw_octet'):
                    compare_llc_xid({'protocol':'llc'},[],fields,True,lambda *args:None)

    def test_reserved_raw_bits_cannot_be_hidden_by_reference_masks(self):
        fields=self.fields();fields['sentinel_xid_raw.types']='e1'
        comparisons=[]
        compare_llc_xid({'protocol':'llc'},[('llc.xid',{})],fields,True,
                        lambda *args:comparisons.append(args))
        self.assertIn(('llc_xid_message_count',1,0),comparisons)


@unittest.skipUnless(shutil.which('tshark'),'independent Wireshark unavailable')
class LLCIndependentOracle(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='sentinel-oracle-llc-')
        self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)

    def compare_frames(self,frames,name,mutation=None,kind='pcap'):
        path=self.root/(name+'.'+kind)
        path.write_bytes(pcap(frames) if kind=='pcap' else
                         section()+interface()+b''.join(epb(frame) for frame in frames))
        if mutation is None:return compare([path],self.root/(name+'-comparison'))
        def changed(packet):
            return mutation(*real_decode(packet))
        with patch('oracle.decode',side_effect=changed):
            return compare([path],self.root/(name+'-comparison'))

    def mismatches(self,report):
        self.assertEqual(report['status'],'FAILED',report)
        self.assertTrue(report['files'][0]['complete_source_verified'])
        return {item['field'] for item in report['files'][0]['mismatches']}

    def test_supported_pcap_and_pcapng_match_all_fields(self):
        frames=supported_llc_frames()
        expected={'llc_protocol','llc_xid_message_count',
                  *('llc_xid_'+key for key in ('declared_length','dsap','ssap','control','response',
                      'poll_final','group','format','types_octet','capability_code',
                      'receive_window_octet','receive_window'))}
        for kind in ('pcap','pcapng'):
            with self.subTest(kind=kind):
                report=self.compare_frames(frames,'supported-'+kind,kind=kind)
                self.assertEqual(report['status'],'PASS',report)
                entry=report['files'][0]
                self.assertEqual(entry['packets'],len(frames))
                self.assertEqual(entry['limited_packets'],0)
                self.assertTrue(entry['complete_source_verified'])
                self.assertTrue(expected<=entry['compared_fields'].keys())
                self.assertEqual(entry['compared_fields']['llc_xid_message_count'],len(frames))

    def test_unavailable_raw_helper_cannot_pass_independent_comparison(self):
        with patch('oracle.RAW_OCTET_LUA','error("invented helper load failure")'):
            report=self.compare_frames([ethernet(xid())],'helper-failed')
        self.assertEqual(report['status'],'FAILED',report)
        self.assertEqual(report.get('reason'),'oracle_decoder_failed')
        self.assertFalse(report['files'][0]['complete_source_verified'])

    def test_missing_and_duplicate_messages_are_detected(self):
        for name,transform in [('missing',lambda apps:[]),('duplicate',lambda apps:apps+apps)]:
            with self.subTest(name=name):
                def mutation(meta,apps,losses):return meta,transform(apps),losses
                report=self.compare_frames([ethernet(xid())],name,mutation)
                self.assertIn('llc_xid_message_count',self.mismatches(report))

    def test_wrong_protocol_and_every_wire_field_are_detected(self):
        def mutation(meta,apps,losses):
            meta['protocol']='unsupported'
            for _,data in apps:
                for key in data:
                    data[key]=not data[key] if type(data[key]) is bool else data[key]+1
            return meta,apps,losses
        report=self.compare_frames([ethernet(xid())],'wrong-fields',mutation)
        fields=self.mismatches(report)
        self.assertIn('llc_protocol',fields)
        self.assertTrue({'llc_xid_'+key for key in ('declared_length','dsap','ssap','control',
            'response','poll_final','group','format','types_octet','capability_code',
            'receive_window_octet','receive_window')}<=fields)

    def test_missing_fields_cannot_suppress_comparisons(self):
        def mutation(meta,apps,losses):return meta,[(kind,{}) for kind,_ in apps],losses
        report=self.compare_frames([ethernet(xid())],'missing-fields',mutation)
        self.assertIn('llc_xid_receive_window',self.mismatches(report))
        self.assertIn('llc_xid_types_octet',self.mismatches(report))

    def test_boolean_and_numeric_types_are_not_interchangeable(self):
        def mutation(meta,apps,losses):
            for _,data in apps:
                data['response']=1
                data['receive_window']=0.0
            return meta,apps,losses
        report=self.compare_frames([ethernet(xid())],'wrong-types',mutation)
        self.assertTrue({'llc_xid_response','llc_xid_receive_window'}<=self.mismatches(report))

    def test_snap_sap_reference_dispatch_gap_is_explicit(self):
        report=self.compare_frames([ethernet(xid(dsap=0xaa,ssap=0xaa))],'snap-sap-xid')
        if report['status']=='PASS':
            # A future independent decoder can legitimately fix its dispatch.
            self.assertEqual(report['files'][0]['compared_fields']['llc_xid_message_count'],1)
            self.assertTrue(report['files'][0]['complete_source_verified'])
        else:
            self.assertEqual(report.get('reason'),'oracle_llc_snap_sap_reference_unsupported')

    def test_snap_sap_omission_cannot_hide_reference_dispatch_gap(self):
        def mutation(meta,apps,losses):return meta,[],losses
        report=self.compare_frames([ethernet(xid(dsap=0xaa,ssap=0xaa))],
                                   'snap-sap-omitted',mutation)
        self.assertEqual(report['status'],'FAILED',report)
        if report.get('reason')!='oracle_llc_snap_sap_reference_unsupported':
            # If the independent decoder fixes its SAP dispatch, it must
            # instead expose the omitted observation through a mismatch.
            self.assertIn('llc_xid_message_count',self.mismatches(report))

    def test_reserved_bits_falsely_accepted_are_detected_from_raw_reference(self):
        _,valid,_=real_decode(next_packet(ethernet(xid())))
        for name,body in [('types',xid(types_octet=0xe1)),
                          ('window',xid(receive_window_octet=1))]:
            with self.subTest(name=name):
                def mutation(meta,apps,losses):
                    meta['protocol']='llc'
                    return meta,valid,[]
                report=self.compare_frames([ethernet(body)],'false-valid-'+name,mutation)
                self.assertIn('llc_xid_message_count',self.mismatches(report))


def next_packet(frame):
    import io
    from core import Reader
    from capture import classic
    return next(classic(Reader(io.BytesIO(pcap([frame])))))


if __name__=='__main__':unittest.main()
