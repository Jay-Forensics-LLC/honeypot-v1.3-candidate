from contextlib import closing
import io
import json
import os
from pathlib import Path
import shutil
import sqlite3
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from analyze import analyze
from core import IngestError, Reader
from capture import classic
from qualify import qualify, generate, inventory, verify_bundle, measured_process
from fixtures import pcap, arp

class QualificationSafety(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup); self.root=Path(self.tmp.name)
    def segment(self,name,n):
        p=self.root/name; p.write_bytes(pcap([arp()]*n)); return p
    def test_directory_inventory_and_two_clean_runs(self):
        source=self.root/'segments'; source.mkdir(); generate(source/'b',5); generate(source/'a',3)
        report=qualify(source,self.root/'case',profile='synthetic',expected_packets=8,min_free_bytes=0)
        self.assertEqual(report['status'],'SYNTHETIC_PASS'); self.assertEqual(len(report['inventory']),2)
        if shutil.which('capinfos'): self.assertTrue(all(r['reconciled'] for r in report['per_file_reconciliation']))
        self.assertTrue(report['checks']['source_unchanged']); self.assertTrue(report['checks']['reproducible_minimized_export'])
    def test_per_file_mismatch_fails_even_if_total_matches(self):
        source=self.root/'segments'; source.mkdir(); generate(source/'a',3); generate(source/'b',5)
        with patch('qualify.capinfos_count',side_effect=[5,3]):
            report=qualify(source,self.root/'case',profile='synthetic',expected_packets=8,min_free_bytes=0)
        self.assertEqual(report['status'],'FAILED'); self.assertFalse(report['checks']['independent_count'])
    def test_non_capture_segments_not_silently_ignored(self):
        source=self.root/'segments'; source.mkdir(); generate(source/'a',3); (source/'other').write_bytes(b'unrecognized')
        report=qualify(source,self.root/'case',profile='synthetic',expected_packets=3,min_free_bytes=0)
        self.assertEqual(report['reason'],'non_capture_segments_in_inventory'); self.assertEqual(len(report['inventory']),2)
    def test_inventory_symlink_and_hardlink_rejected(self):
        p=self.segment('a',1); q=self.root/'b'; q.symlink_to(p)
        with self.assertRaises(IngestError): inventory(q)
        q.unlink(); os.link(p,q)
        with self.assertRaises(IngestError): inventory(p)
    def test_space_preflight_has_report(self):
        p=self.segment('a',1)
        report=qualify(p,self.root/'case',profile='synthetic',expected_packets=1,min_free_bytes=10**20)
        self.assertEqual(report['reason'],'insufficient_output_space'); self.assertFalse(report['runs'])
        self.assertTrue((self.root/'case/qualification.md').exists())
    def test_mutation_fails_integrity_or_framing(self):
        p=self.segment('a',1)
        def mutate(*args):
            p.write_bytes(p.read_bytes()+b'broken'); return 1
        with patch('qualify.capinfos_count',side_effect=mutate):
            report=qualify(p,self.root/'case',profile='synthetic',expected_packets=1,min_free_bytes=0)
        self.assertEqual(report['status'],'FAILED'); self.assertEqual(report['worker_failure']['reason'],'truncated_capture')
        self.assertTrue(report['worker_failure']['details']['incomplete'])
    def test_timeout_terminates_process_group(self):
        with self.assertRaises(subprocess.TimeoutExpired) as caught:
            measured_process([sys.executable,'-c','import time; time.sleep(10)'],timeout=.05,scratch=self.root/'worker')
        self.assertGreater(caught.exception.metrics['wall_seconds'],.05); self.assertFalse((self.root/'worker').exists())
    def test_cancellation_is_not_complete(self):
        p=self.segment('a',1)
        with patch('qualify.capinfos_count',side_effect=KeyboardInterrupt):
            report=qualify(p,self.root/'case',profile='synthetic',expected_packets=1,min_free_bytes=0)
        self.assertEqual(report['status'],'CANCELLED'); self.assertFalse(report['runs'])
    def test_incomplete_bundle_rejected(self):
        p=self.segment('a',1); out=self.root/'case'; analyze([p],out)
        (out/'state.json').write_text('{"status":"INCOMPLETE"}')
        with self.assertRaisesRegex(IngestError,'incomplete'): verify_bundle(out)
    def test_checksum_path_traversal_rejected(self):
        p=self.segment('a',1); out=self.root/'case'; analyze([p],out)
        (out/'SHA256SUMS').write_text('a'*64+'  ../other\n')
        with self.assertRaisesRegex(IngestError,'invalid_checksum'): verify_bundle(out)
    def test_missing_checksum_coverage_rejected(self):
        p=self.segment('a',1); out=self.root/'case'; analyze([p],out)
        (out/'SHA256SUMS').write_text('')
        with self.assertRaisesRegex(IngestError,'coverage'): verify_bundle(out)
    def test_partial_capture_truncation_quantified(self):
        p=self.segment('a',2); p.write_bytes(p.read_bytes()[:-5])
        with self.assertRaises(IngestError) as caught: analyze([p],self.root/'case')
        self.assertEqual(caught.exception.details['last_framed_ordinal'],1)
        self.assertEqual(caught.exception.details['processed_bytes'],p.stat().st_size)
        self.assertFalse((self.root/'case').exists())
    def test_limits_and_reports_do_not_promote_synthetic_goal(self):
        p=self.segment('a',1)
        report=qualify(p,self.root/'case',profile='synthetic',expected_packets=1,min_free_bytes=0,max_rss=1)
        self.assertEqual(report['status'],'FAILED'); self.assertFalse(report['checks']['memory_budget'])
        self.assertIn('total_wall_seconds',report['timing']); self.assertIn('cpu_user_seconds',report['runs'][0])
        self.assertNotEqual(report['status'],'GOAL_PASS')

if __name__=='__main__': unittest.main()

class MissingDependency(unittest.TestCase):
    def test_missing_capture_is_external_blocker(self):
        with tempfile.TemporaryDirectory() as name:
            root=Path(name)
            report=qualify(root/'missing',root/'out',dataset_id='explicitly-identified-but-unavailable')
            self.assertEqual(report['status'],'BLOCKED_EXTERNAL')
            self.assertEqual(report['reason'],'source_or_required_tool_not_found')
    def test_mixed_capture_formats_qualify(self):
        from fixtures import section,interface,epb
        with tempfile.TemporaryDirectory() as name:
            root=Path(name); src=root/'segments';src.mkdir()
            (src/'a').write_bytes(pcap([arp()])); (src/'b').write_bytes(section()+interface()+epb(arp()))
            report=qualify(src,root/'out',profile='synthetic',expected_packets=2,min_free_bytes=0)
            self.assertEqual(report['status'],'SYNTHETIC_PASS'); self.assertEqual([x['kind'] for x in report['inventory']],['pcap','pcapng'])
