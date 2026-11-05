"""Explicit source contexts/clock offsets cannot be silently ignored or aliased.

All packet/radio identifiers and timestamps are invented regression fixtures.
"""
from contextlib import closing
import hashlib
import json
from pathlib import Path
import socket
import sqlite3
import struct
import tempfile
import unittest
from unittest.mock import patch

from adapters import TETRA
from analyze import analyze, config_validate
from core import IngestError, time_info
from fixtures import arp, pcap
from qualify import qualify


CLIENT = '02:00:00:00:00:41'
BSSID = '02:00:00:00:00:51'
WHEN = '2023-11-14T22:13:20Z'


def qinq_arp(outer, inner):
    raw = arp(address='192.0.2.41',mac=CLIENT.replace(':',''))
    return raw[:12]+struct.pack('!HHHHH',0x88a8,outer,0x8100,inner,0x0806)+raw[14:]


class ContextConfiguration(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.radio = self.root/'invented.tetra.jsonl'
        self.radio.write_text(json.dumps({'schema':TETRA,'kind':'association',
            'client_mac':CLIENT,'bssid':BSSID,'timestamp':WHEN})+'\n')

    def test_canonical_source_id_applies_context_and_reversible_clock_offset(self):
        config = {'contexts':{'1':'invented-network'},'clock_adjustments':{
            '1':{'offset_ns':10**9,'justification':'Invented test calibration'}}}
        output = self.root/'clock-context'
        analyze([self.radio],output,config=config)
        with closing(sqlite3.connect(output/'index.sqlite')) as db:
            context,original,adjusted,when_raw = db.execute(
                'SELECT context,original_utc_ns,utc_ns,time_json FROM timeline_index').fetchone()
            self.assertEqual(context,'invented-network')
            self.assertEqual(original,time_info(WHEN)['utc_ns'])
            self.assertEqual(adjusted-original,10**9)
            self.assertEqual(json.loads(when_raw)['original'],WHEN)
            self.assertEqual(db.execute('SELECT source_id,offset_ns,justification FROM adjustments').fetchone(),
                             (1,10**9,'Invented test calibration'))
            association = db.execute('SELECT context,start_ns,end_ns FROM associations').fetchone()
            self.assertEqual(association,('invented-network',adjusted,adjusted))
        # Reversal uses a new case and leaves the source timestamp untouched.
        reversed_output = self.root/'clock-reversed'
        analyze([self.radio],reversed_output,config={'contexts':{'1':'invented-network'}})
        with closing(sqlite3.connect(reversed_output/'index.sqlite')) as db:
            self.assertEqual(db.execute('SELECT original_utc_ns,utc_ns FROM timeline_index').fetchone(),
                             (original,original))

    def test_noncanonical_or_oversized_ids_fail_in_both_configuration_maps(self):
        aliases = ('01','0001',1,True,1.0,'١','１','¹','+1','-1',' 1','1 ','1\n',
                   '', '0','00','4097','9999','1'*10000)
        for field,code in (('contexts','invalid_context_configuration'),
                           ('clock_adjustments','invalid_clock_adjustment')):
            for alias in aliases:
                with self.subTest(field=field,alias_type=type(alias).__name__,alias_length=len(str(alias))):
                    value = 'invented-network' if field=='contexts' else {
                        'offset_ns':1,'justification':'Invented offset'}
                    with self.assertRaisesRegex(IngestError,'^'+code+'$'):
                        config_validate({field:{alias:value}})
            value = 'invented-network' if field=='contexts' else {
                'offset_ns':1,'justification':'Invented offset'}
            # Configuring the same positional source through aliases must fail,
            # even if one entry is otherwise a valid canonical source ID.
            with self.assertRaisesRegex(IngestError,'^'+code+'$'):
                config_validate({field:{'1':value,'01':value}})
            config_validate({field:{'4096':value}})

    def test_canonical_missing_source_is_rejected_before_output_creation(self):
        for field in ('contexts','clock_adjustments'):
            with self.subTest(field=field):
                value = 'invented-network' if field=='contexts' else {
                    'offset_ns':1,'justification':'Invented offset'}
                config = {field:{'2':value}}
                config_validate(config)
                output = self.root/('out-of-range-'+field)
                with self.assertRaisesRegex(IngestError,'^configuration_source_id_out_of_range$'):
                    analyze([self.radio],output,config=config)
                self.assertFalse(output.exists())

    def test_false_configuration_values_cannot_silently_become_defaults(self):
        for index,config in enumerate((False,0,[],'')):
            with self.subTest(config_type=type(config).__name__):
                output = self.root/('invalid-config-'+str(index))
                with patch('analyze.source_file',side_effect=AssertionError('source access forbidden')):
                    with self.assertRaisesRegex(IngestError,'^invalid_configuration$'):
                        analyze([self.root/'missing-source'],output,config=config)
                self.assertFalse(output.exists())
                qualified_output = self.root/('invalid-qualification-config-'+str(index))
                with patch('qualify.platform.system',return_value='Linux'), \
                     patch('qualify.inventory',side_effect=AssertionError('source inventory forbidden')):
                    with self.assertRaisesRegex(IngestError,'^invalid_configuration$'):
                        qualify(self.root/'missing-source',qualified_output,config=config)
                self.assertFalse(qualified_output.exists())
        for index,config in enumerate((None,{})):
            with self.subTest(accepted_default=config):
                result = analyze([self.radio],self.root/('default-'+str(index)),config=config)
                self.assertEqual(result['status'],'COMPLETE')

    def test_radio_context_can_match_exact_double_vlan_capture_without_merging_other_vlan(self):
        first = self.root/'invented-first.pcap'
        other = self.root/'invented-other.pcap'
        first.write_bytes(pcap([(1700000000,qinq_arp(100,25))]))
        other.write_bytes(pcap([(1700000000,qinq_arp(100,26))]))
        radio_rows = [{'schema':TETRA,'kind':'ap','bssid':BSSID,'ssid':'invented-private-network','timestamp':WHEN},
                      {'schema':TETRA,'kind':'association','client_mac':CLIENT,'bssid':BSSID,'timestamp':WHEN}]
        self.radio.write_text(''.join(json.dumps(row)+'\n' for row in radio_rows))
        paths = [first,other,self.radio]
        original = [path.read_bytes() for path in paths]
        capture_context = 'invented-network/section:0/interface:0/vlan:100,25'
        other_context = 'invented-network/section:0/interface:0/vlan:100,26'
        output = self.root/'qinq-radio'
        config = {'contexts':{'1':'invented-network','2':'invented-network','3':capture_context}}
        with patch.object(socket,'socket',side_effect=AssertionError('network forbidden')), \
             patch.object(socket,'getaddrinfo',side_effect=AssertionError('name resolution forbidden')):
            manifest = analyze(paths,output,config=config)
        self.assertEqual([path.read_bytes() for path in paths],original)
        self.assertEqual(manifest['coverage']['counts']['parse_errors'],0)
        with closing(sqlite3.connect(output/'index.sqlite')) as db:
            self.assertEqual(db.execute('SELECT source_id,context FROM packet_meta ORDER BY source_id').fetchall(),
                             [(1,capture_context),(2,other_context)])
            self.assertEqual(db.execute('SELECT COUNT(*) FROM associations').fetchone()[0],3)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM conflicts').fetchone()[0],0)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM findings').fetchone()[0],0)
            # The common MAC is a shared observed graph node in the explicitly
            # matching context. It remains a source-backed statement, not proof
            # of persistent physical identity. The other VLAN cannot join it.
            joined = db.execute('''SELECT ip.left_value,ip.right_value,wifi.right_value
                FROM associations ip JOIN associations wifi
                ON ip.context=wifi.context AND ip.right_value=wifi.left_value AND ip.start_ns=wifi.start_ns
                WHERE ip.relationship='arp.mapping' AND wifi.relationship='wifi.association' ''').fetchall()
            self.assertEqual(joined,[('192.0.2.41',CLIENT,BSSID)])
            associations = db.execute('''SELECT a.relationship,a.rule,a.rule_version,o.source_id,o.ordinal,o.provenance_json
                FROM associations a JOIN observations o ON o.id=a.evidence_id ORDER BY a.id''').fetchall()
            self.assertEqual([(row[0],row[3],row[4]) for row in associations],
                             [('arp.mapping',1,1),('arp.mapping',2,1),('wifi.association',3,2)])
            for relationship,rule,version,sid,ordinal,ref_raw in associations:
                self.assertEqual(rule,'association.'+relationship)
                self.assertTrue(version)
                ref = json.loads(ref_raw)
                self.assertEqual(ref['source_id'],sid)
                data = original[sid-1][ref['byte_offset']:ref['byte_offset']+ref['byte_length']]
                self.assertEqual(hashlib.sha256(data).hexdigest(),ref['record_sha256'])
            self.assertEqual(db.execute("SELECT COUNT(*) FROM associations WHERE relationship='wifi.ap'").fetchone()[0],0)


if __name__=='__main__':
    unittest.main()
