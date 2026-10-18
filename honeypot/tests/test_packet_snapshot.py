import hashlib
import copy
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import packet_snapshot as snapshots


def block(kind, body, order='<'):
    size=12+len(body)
    return struct.pack(order+'II',kind,size)+body+struct.pack(order+'I',size)


def capture(order='<'):
    section=block(0x0a0d0d0a,struct.pack(order+'IHHq',0x1a2b3c4d,1,0,-1),order)
    interface=block(1,struct.pack(order+'HHI',1,0,65535),order)
    packet=block(6,struct.pack(order+'IIIII',0,0,1,4,4)+b'data',order)
    return section+interface+packet,packet


class SnapshotInspection(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.path=Path(self.tmp.name)/'snapshot.pcapng'

    def inspect(self,data):
        self.path.write_bytes(data)
        return snapshots.inspect_snapshot(self.path)

    def test_complete_little_and_big_endian_snapshots_are_unchanged(self):
        for order in ('<','>'):
            data,_=capture(order)
            result=self.inspect(data)
            self.assertEqual(result,{'raw_sha256':hashlib.sha256(data).hexdigest(),
                                     'raw_bytes':len(data),'derivation':None})
            self.assertEqual(self.path.read_bytes(),data)

    def test_exact_complete_prefix_and_tail_provenance_for_both_byte_orders(self):
        for order in ('<','>'):
            data,packet=capture(order)
            raw=data+packet[:12]
            result=self.inspect(raw)
            self.assertEqual(result['derivation'],{
                'method':snapshots.METHOD,'format':'pcapng',
                'source_sha256':hashlib.sha256(raw).hexdigest(),'source_bytes':len(raw),
                'prefix_bytes':len(data),'discarded_tail_bytes':12,'complete_blocks':3,
                'tail_block_type':6,'tail_declared_bytes':len(packet)})
            self.assertEqual(self.path.read_bytes(),raw)

    def test_multi_section_capture_changes_byte_order_without_skipping_blocks(self):
        little,_=capture('<');big,packet=capture('>')
        result=self.inspect(little+big+packet[:12])
        self.assertEqual(result['derivation']['complete_blocks'],6)
        self.assertEqual(result['derivation']['prefix_bytes'],len(little+big))

    def test_classic_pcap_is_left_to_strict_tshark_parser(self):
        data=struct.pack('<IHHIIII',0xa1b2c3d4,2,4,0,0,65535,1)
        self.assertIsNone(self.inspect(data)['derivation'])

    def test_bad_complete_trailer_or_interior_length_cannot_be_trimmed(self):
        data,packet=capture()
        for raw in (data[:-4]+struct.pack('<I',16)+packet[:12],
                    data[:28]+struct.pack('<II',1,0)+data[36:]+packet[:12]):
            with self.assertRaisesRegex(ValueError,'block (trailer|length)'):
                self.inspect(raw)

    def test_bad_complete_packet_metadata_or_options_are_not_salvaged(self):
        data,packet=capture();prefix=data[:-len(packet)]
        malformed=[block(6,struct.pack('<IIIII',1,0,1,4,4)+b'data'),
                   block(6,struct.pack('<IIIII',0,0,1,8,4)+b'data'),
                   block(6,struct.pack('<IIIII',0,0,1,100,100)+b'data'),
                   block(6,struct.pack('<IIIII',0,0,1,4,4)+b'data'+struct.pack('<HH',2,20))]
        for broken in malformed:
            with self.assertRaises(ValueError):self.inspect(prefix+broken+packet[:12])

    def test_unsupported_or_incomplete_headers_fail_closed(self):
        data,packet=capture()
        for raw in (data+packet[:7],data+struct.pack('<II',123456,32)+b'\0'*4,
                    data+struct.pack('<II',6,0xffffffff),data[:16],
                    data+struct.pack('<III',6,len(packet),9)):
            with self.assertRaises(ValueError):self.inspect(raw)

    def test_invalid_visible_metadata_in_incomplete_tail_cannot_be_discarded(self):
        data,packet=capture()
        tails=[struct.pack('<II',6,len(packet)),
               struct.pack('<IIIIIII',6,100,0,0,1,8,4),
               struct.pack('<IIIIIII',6,32,0,0,1,12,12),
               struct.pack('<IIHHI',1,24,1,1,65535),
               struct.pack('<III',3,100,4)]
        for tail in tails:
            with self.assertRaises(ValueError):self.inspect(data+tail)

    def test_empty_symlink_and_oversized_snapshot_refused(self):
        with self.assertRaises(ValueError):self.inspect(b'')
        original=Path(self.tmp.name)/'original';original.write_bytes(b'capture')
        self.path.unlink();self.path.symlink_to(original)
        with self.assertRaises((OSError,ValueError)):snapshots.inspect_snapshot(self.path)
        self.path.unlink()
        with self.path.open('wb') as stream:stream.truncate(snapshots.MAX_SNAPSHOT_BYTES+1)
        with self.assertRaisesRegex(ValueError,'64 MiB'):snapshots.inspect_snapshot(self.path)

    def test_invalid_section_order_and_option_terminator_fail_closed(self):
        data,_=capture()
        for raw in (data[:8]+b'bad!'+data[12:],
                    block(0x0a0d0d0a,struct.pack('<IHHq',0x1a2b3c4d,1,0,-1)+b'\0'*8)):
            with self.assertRaises(ValueError):self.inspect(raw)


class AcquisitionVerification(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.folder=Path(self.tmp.name)

    def receipt(self,path,data):
        path.write_bytes(data)
        return {'path':str(path),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}

    def packet(self,partial=True):
        complete,tail=capture()
        raw=complete+tail[:12] if partial else complete
        raw_receipt=self.receipt(self.folder/'raw.pcapng',raw)
        parser_receipt=self.receipt(self.folder/'prefix.pcapng',complete) if partial else dict(raw_receipt)
        return {'snapshot':parser_receipt['path'],'sha256':parser_receipt['sha256'],'bytes':parser_receipt['bytes'],
                'acquisition':{'raw_snapshot':raw_receipt,'parser_snapshot':parser_receipt,
                               'derivation':snapshots.inspect_snapshot(raw_receipt['path'])['derivation']}}

    def test_valid_derived_and_complete_acquisitions_recheck_without_source_writes(self):
        for partial in (True,False):
            packet=self.packet(partial);before={p:p.read_bytes() for p in self.folder.iterdir()}
            result=snapshots.verify_acquisition(packet)
            self.assertEqual(result['status'],'PASS');self.assertEqual(result['derived'],partial)
            expected=packet['acquisition']['raw_snapshot']['bytes']
            if partial:expected+=packet['bytes']
            self.assertEqual(result['unique_bytes'],expected)
            self.assertEqual(before,{p:p.read_bytes() for p in self.folder.iterdir()})

    def test_classic_and_opaque_complete_artifacts_preserve_existing_parser_contract(self):
        for raw in (b'capture',struct.pack('<IHHIIII',0xa1b2c3d4,2,4,0,0,65535,1)):
            receipt=self.receipt(self.folder/'classic.pcap',raw)
            packet={'snapshot':receipt['path'],'sha256':receipt['sha256'],'bytes':receipt['bytes'],
                    'acquisition':{'raw_snapshot':dict(receipt),'parser_snapshot':dict(receipt),'derivation':None}}
            self.assertFalse(snapshots.verify_acquisition(packet)['derived'])

    def test_tampered_raw_or_prefix_fails_hash_or_exact_prefix_checks(self):
        for which in ('raw_snapshot','parser_snapshot'):
            packet=self.packet();receipt=packet['acquisition'][which]
            path=Path(receipt['path']);changed=path.read_bytes()+b'changed';path.write_bytes(changed)
            with self.assertRaisesRegex(ValueError,'hash or size'):snapshots.verify_acquisition(packet)
        packet=self.packet();receipt=packet['acquisition']['parser_snapshot']
        wrong=Path(receipt['path']).read_bytes()[:-4]+b'fake'
        packet['acquisition']['parser_snapshot']=self.receipt(Path(receipt['path']),wrong)
        packet.update(sha256=packet['acquisition']['parser_snapshot']['sha256'],bytes=len(wrong))
        with self.assertRaisesRegex(ValueError,'exact complete-block prefix'):snapshots.verify_acquisition(packet)

    def test_missing_invented_or_typed_derivation_metadata_is_refused(self):
        for mutation in ('missing','null','extra','wrong_method','bool_count'):
            packet=self.packet();acquisition=packet['acquisition']
            if mutation=='missing':del acquisition['derivation']
            elif mutation=='null':acquisition['derivation']=None
            elif mutation=='extra':acquisition['derivation']['invented']='field'
            elif mutation=='wrong_method':acquisition['derivation']['method']='arbitrary-repair'
            else:acquisition['derivation']['complete_blocks']=True
            with self.assertRaises(ValueError):snapshots.verify_acquisition(packet)
        packet=self.packet(False);packet['acquisition']['derivation']={'method':snapshots.METHOD}
        with self.assertRaisesRegex(ValueError,'same unmodified artifact'):snapshots.verify_acquisition(packet)

    def test_receipt_types_bounds_keys_and_packet_linkage_are_strict(self):
        bad_fields=[('bytes',True),('bytes',0),('bytes',snapshots.MAX_SNAPSHOT_BYTES+1),
                    ('sha256','A'*64),('sha256',None),('path',123)]
        for receipt_name in ('raw_snapshot','parser_snapshot'):
            for field,value in bad_fields:
                packet=self.packet();packet['acquisition'][receipt_name][field]=value
                with self.assertRaises(ValueError):snapshots.verify_acquisition(packet)
            packet=self.packet();packet['acquisition'][receipt_name]['extra']='field'
            with self.assertRaises(ValueError):snapshots.verify_acquisition(packet)
        for field,value in (('bytes',True),('sha256','0'*64),('snapshot',str(self.folder/'raw.pcapng'))):
            packet=self.packet();packet[field]=value
            with self.assertRaises(ValueError):snapshots.verify_acquisition(packet)

    def test_canonical_same_parent_paths_and_no_symlinks_are_required(self):
        packet=self.packet();receipt=packet['acquisition']['raw_snapshot']
        for path in ('raw.pcapng',str(self.folder/'..'/self.folder.name/'raw.pcapng')):
            changed=copy.deepcopy(packet);changed['acquisition']['raw_snapshot']['path']=path
            with self.assertRaises(ValueError):snapshots.verify_acquisition(changed)
        alias=self.folder/'alias';alias.symlink_to(receipt['path'])
        changed=copy.deepcopy(packet);changed['acquisition']['raw_snapshot']['path']=str(alias)
        with self.assertRaises(ValueError):snapshots.verify_acquisition(changed)
        elsewhere=self.folder/'other';elsewhere.mkdir()
        changed=copy.deepcopy(packet);raw=Path(receipt['path']).read_bytes()
        changed['acquisition']['raw_snapshot']=self.receipt(elsewhere/'raw.pcapng',raw)
        with self.assertRaisesRegex(ValueError,'same-parent'):snapshots.verify_acquisition(changed)

    def test_complete_snapshot_cannot_claim_an_unnecessary_second_artifact(self):
        packet=self.packet(False);raw=Path(packet['snapshot']).read_bytes()
        receipt=self.receipt(self.folder/'duplicate.pcapng',raw)
        packet['acquisition']['parser_snapshot']=receipt
        packet.update(snapshot=receipt['path'],sha256=receipt['sha256'],bytes=receipt['bytes'])
        with self.assertRaisesRegex(ValueError,'same unmodified artifact'):snapshots.verify_acquisition(packet)

    def test_unique_raw_and_parser_bytes_are_bounded_and_missing_metadata_fails(self):
        packet=self.packet();total=packet['bytes']+packet['acquisition']['raw_snapshot']['bytes']
        with patch.object(snapshots,'MAX_ACQUISITION_BYTES',total-1):
            with self.assertRaisesRegex(ValueError,'128 MiB'):snapshots.verify_acquisition(packet)
        for packet in ({}, {'acquisition':None}, {'acquisition':{}}):
            with self.assertRaises(ValueError):snapshots.verify_acquisition(packet)


if __name__=='__main__':unittest.main()
