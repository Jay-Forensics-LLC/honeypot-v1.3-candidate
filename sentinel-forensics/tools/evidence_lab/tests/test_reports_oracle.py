"""Human explanations, privacy, and independent-comparison failure integrity."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from analyze import analyze
from core import IngestError
from fixtures import arp, dns_question, eth, ipv4, pcap, tcp, udp
from oracle import compare, epoch_ns, FIELDS
from rules import CATALOG

class ReportOracle(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)

    def capture(self,n=4):
        source=self.root/'private-source.pcap'
        source.write_bytes(pcap([arp()]*n))
        return source

    def decoder(self,n=4,*,bad_length=False,hook=None,timestamp=None):
        def run(args,**kwargs):
            if '--version' in args:
                return subprocess.CompletedProcess(args,0,'Synthetic decoder test stub\n','')
            for chunk in iter(lambda:kwargs['stdin'].read(65536),b''): pass
            for i in range(n):
                fields=['']*len(FIELDS)
                fields[:4]=[str(i+1),str(1700000000+i) if timestamp is None else timestamp,
                            '1' if bad_length else str(len(arp())),str(len(arp()))]
                fields[FIELDS.index('arp.src.proto_ipv4')]='192.0.2.10'
                fields[FIELDS.index('arp.src.hw_mac')]='02:00:00:00:00:01'
                fields[FIELDS.index('frame.protocols')]='eth:ethertype:arp'
                kwargs['stdout'].write(('\t'.join(fields)+'\n').encode())
            if hook: hook()
            return subprocess.CompletedProcess(args,0)
        return run

    def test_short_independent_output_keeps_full_source_hash_and_counts(self):
        source=self.capture()
        with patch('oracle.subprocess.run',side_effect=self.decoder(1)):
            r=compare([source],self.root/'oracle')
        item=r['files'][0]
        self.assertEqual(r['status'],'FAILED')
        self.assertEqual((item['packets'],item['independent_packets'],item['mismatch_count']),(4,1,3))
        self.assertEqual(item['sha256'],hashlib.sha256(source.read_bytes()).hexdigest())
        self.assertEqual(item['after_sha256'],item['sha256'])
        self.assertTrue(item['complete_source_verified'])
        self.assertFalse(list((self.root/'oracle').glob('*.tsv')))

    def test_extra_reference_packets_fail_without_losing_source_accounting(self):
        source=self.capture()
        with patch('oracle.subprocess.run',side_effect=self.decoder(5)):
            r=compare([source],self.root/'oracle')
        item=r['files'][0]
        self.assertEqual(r['status'],'FAILED')
        self.assertEqual((item['packets'],item['independent_packets'],item['mismatch_count']),(4,5,1))
        self.assertTrue(item['complete_source_verified'])

    def test_mismatch_details_bounded_but_total_exact(self):
        source=self.capture(120)
        with patch('oracle.subprocess.run',side_effect=self.decoder(120,bad_length=True)):
            r=compare([source],self.root/'oracle')
        self.assertEqual(r['status'],'FAILED')
        self.assertEqual(r['files'][0]['mismatch_count'],120)
        self.assertEqual(len(r['files'][0]['mismatches']),100)

    def test_source_mutation_and_decoder_failures_are_not_passes(self):
        source=self.capture()
        before=hashlib.sha256(source.read_bytes()).hexdigest()
        with patch('oracle.subprocess.run',side_effect=self.decoder(hook=lambda:source.write_bytes(source.read_bytes()+b'x'))):
            r=compare([source],self.root/'changed')
        self.assertEqual(r['status'],'FAILED')
        self.assertEqual(r['files'][0]['sha256'],before)
        self.assertFalse(r['files'][0]['complete_source_verified'])
        with patch('oracle.subprocess.run',side_effect=OSError('private-decoder-secret')):
            r=compare([source],self.root/'decoder-failure')
        self.assertEqual(r['status'],'FAILED')
        self.assertNotIn('private-decoder-secret',(self.root/'decoder-failure/comparison.json').read_text())

    def test_truncated_parser_never_labels_partial_digest_as_file_hash(self):
        source=self.capture()
        source.write_bytes(source.read_bytes()[:-5])
        with patch('oracle.subprocess.run',side_effect=self.decoder(3)):
            r=compare([source],self.root/'truncated')
        item=r['files'][0]
        self.assertEqual(r['status'],'FAILED')
        self.assertEqual(r['reason'],'truncated_capture')
        self.assertEqual(item['sha256'],hashlib.sha256(source.read_bytes()).hexdigest())
        self.assertFalse(item['complete_source_verified'])
        self.assertEqual(item['packets'],3)

    def test_successful_comparison_checks_both_full_hashes(self):
        source=self.capture()
        with patch('oracle.subprocess.run',side_effect=self.decoder()):
            r=compare([source],self.root/'matched')
        self.assertEqual(r['status'],'PASS')
        self.assertTrue(r['files'][0]['complete_source_verified'])
        self.assertEqual(r['files'][0]['sha256'],r['files'][0]['after_sha256'])

    def test_oracle_cancellation_saves_explicit_terminal_status(self):
        source=self.capture()
        with patch('oracle.subprocess.run',side_effect=KeyboardInterrupt):
            r=compare([source],self.root/'cancelled')
        self.assertEqual(r['status'],'CANCELLED')
        self.assertEqual(json.loads((self.root/'cancelled/comparison.json').read_bytes())['status'],'CANCELLED')

    def test_oversized_decoder_line_is_rejected_and_not_retained(self):
        from core import MAX_RECORD
        source=self.capture()
        def decoder(args,**kwargs):
            if '--version' in args: return subprocess.CompletedProcess(args,0,'Synthetic stub\n','')
            for chunk in iter(lambda:kwargs['stdin'].read(65536),b''): pass
            kwargs['stdout'].write(b'x'*(MAX_RECORD+1)+b'\n')
            return subprocess.CompletedProcess(args,0)
        with patch('oracle.subprocess.run',side_effect=decoder):
            r=compare([source],self.root/'oversized')
        self.assertEqual(r['status'],'FAILED')
        self.assertEqual(r['reason'],'oracle_line_budget')
        self.assertFalse(list((self.root/'oversized').glob('*.tsv')))

    def test_unexpected_decoder_columns_fail_explicitly(self):
        source=self.capture()
        def decoder(args,**kwargs):
            if '--version' in args: return subprocess.CompletedProcess(args,0,'Synthetic stub\n','')
            for chunk in iter(lambda:kwargs['stdin'].read(65536),b''): pass
            kwargs['stdout'].write(b'\t'.join([b'1']*(len(FIELDS)+1))+b'\n')
            return subprocess.CompletedProcess(args,0)
        with patch('oracle.subprocess.run',side_effect=decoder):
            r=compare([source],self.root/'extra-columns')
        self.assertEqual(r['status'],'FAILED')
        self.assertEqual(r['reason'],'oracle_field_count')

    def test_invalid_decoder_epoch_saves_failed_terminal_report(self):
        source=self.capture()
        for number,value in enumerate(('invalid-timestamp','NaN','Infinity','1e1000000000','1.1234567890')):
            with self.subTest(value=value),patch('oracle.subprocess.run',side_effect=self.decoder(timestamp=value)):
                output=self.root/('bad-epoch-'+str(number))
                report=compare([source],output)
            self.assertEqual(report['status'],'FAILED')
            self.assertEqual(report['reason'],'oracle_timestamp_invalid')
            self.assertFalse(report['files'][0]['complete_source_verified'])
            self.assertEqual(json.loads((output/'comparison.json').read_bytes())['status'],'FAILED')
            self.assertFalse(list(output.glob('*.tsv')))

    def test_decoder_epoch_conversion_retains_negative_subsecond_precision(self):
        for text,expected in [('0',0),('-0.000000001',-1),('-1.1',-1100000000),
                              ('1700000000.123456789',1700000000123456789)]:
            self.assertEqual(epoch_ns(text),expected)

    def test_oracle_refuses_outputs_inside_the_repository(self):
        repo=Path(__file__).resolve().parents[3]
        # The source need not be opened: the output boundary is checked first.
        with self.assertRaisesRegex(IngestError,'oracle_output_must_be_private_external_directory'):
            compare([self.root/'not-opened'],repo)

    def finding_capture(self):
        packets=[eth(ipv4(tcp(dport=443),6)) for _ in range(10)]
        packets += [eth(ipv4(tcp(dport=100+i),6)) for i in range(10)]
        packets += [eth(ipv4(udp(dns_question('a'*50+'.example.test')))) for _ in range(5)]
        packets += [(1700000000,arp()),(1700000000,arp(mac='020000000003'))]
        source=self.root/'patterns.pcap'; source.write_bytes(pcap(packets))
        return source

    def test_human_report_explains_every_rule_and_keeps_identifiers_private(self):
        source=self.finding_capture()
        analyze([source],self.root/'case',pseudonym_key=b'K'*32)
        human=(self.root/'case/export/report.md').read_text()
        exchange=[json.loads(raw) for raw in (self.root/'case/export/exchange.jsonl').read_bytes().splitlines()]
        findings=[row['payload'] for row in exchange if row['entity']=='finding']
        self.assertEqual({f['rule'] for f in findings},set(CATALOG))
        for f in findings:
            self.assertIn(f['explanation'],human)
            self.assertIn(str(f['id'])+': '+f['rule'],human)
            self.assertIn(f['context'],human)
            for text in f['alternatives']+f['limitations']: self.assertIn(text,human)
            evaluation=f['metrics']['evaluation']
            self.assertEqual(evaluation['required_coverage'],CATALOG[f['rule']]['required'])
            self.assertIn(evaluation['required_coverage'],human)
            self.assertGreaterEqual(evaluation['minimum_sample_size'],2)
            self.assertTrue(evaluation['thresholds'])
            self.assertEqual(f['evidence']['reproduction']['private_index_command'],
                ['python3','tools/evidence_lab/query.py','finding','/ABSOLUTE/PRIVATE_CASE',
                 '--id',str(f['id']),'--limit','100'])
        self.assertIn('Supporting evidence references/selectors',human)
        self.assertIn('Rule coverage:',human)
        self.assertNotIn('192.0.2.10',human)
        self.assertNotIn('198.51.100.20',human)
        self.assertNotIn('patterns.pcap',human)
        self.assertIn('not a probability of compromise',human)
        self.assertIn('Minimum sample:',human)
        self.assertIn('Effective thresholds:',human)
        self.assertIn('Reproduce with the private case path:',human)

    def test_findings_record_effective_configured_sample_gates(self):
        source=self.finding_capture()
        config={'rules':{'syn_minimum':7,'port_minimum':8,'dns_label_minimum':40,
                         'dns_minimum_questions':3,'window_seconds':60}}
        analyze([source],self.root/'configured',config=config,pseudonym_key=b'K'*32)
        records=[json.loads(raw) for raw in (self.root/'configured/export/exchange.jsonl').read_bytes().splitlines()]
        expected={'repeated_syn':('syn_minimum',7),'destination_ports':('port_minimum',8),
                  'dns_long_labels':('dns_minimum_questions',3),'conflicting_mappings':('mapping_minimum_conflicts',2)}
        for row in records:
            if row['entity']!='finding': continue
            finding=row['payload']; key,minimum=expected[finding['rule']]
            evaluation=finding['metrics']['evaluation']
            self.assertEqual(evaluation['minimum_sample_size'],minimum)
            self.assertEqual(evaluation['thresholds'][key],1 if key=='mapping_minimum_conflicts' else minimum)
            if finding['rule']=='dns_long_labels': self.assertEqual(evaluation['thresholds']['dns_label_minimum'],40)

    def test_human_report_is_deterministic_and_no_finding_is_qualified(self):
        source=self.finding_capture()
        for name in ('one','two'): analyze([source],self.root/name,pseudonym_key=b'K'*32)
        self.assertEqual((self.root/'one/export/report.md').read_bytes(),(self.root/'two/export/report.md').read_bytes())
        empty=self.root/'empty.pcap';empty.write_bytes(pcap([]))
        analyze([empty],self.root/'empty')
        text=(self.root/'empty/export/report.md').read_text()
        self.assertIn('INSUFFICIENT_EVIDENCE',text)
        self.assertIn('not a device health verdict',text)

if __name__=='__main__': unittest.main()
