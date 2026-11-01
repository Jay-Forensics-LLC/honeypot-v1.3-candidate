# HoneyTrace local modification, 2026-11-01: retain failed resource qualification.
from contextlib import closing
import sqlite3, subprocess, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
from qualify import generate, qualify, semantic_digest, verify_bundle, capinfos_count
from analyze import IngestError
from reconstruct_resource import ResourceSamplingFailure

class Tests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name); self.src=self.root/'input.pcap'; self.out=self.root/'out'
        generate(self.src,100)
    def run_fixture(self,expected=100,**kw):
        with patch('qualify.capinfos_count',return_value=None):
            return qualify(self.src,self.out,profile='synthetic',expected_packets=expected,min_free_bytes=0,**kw)
    def test_repeat_workers(self):
        r=self.run_fixture(); self.assertEqual(r['status'],'SYNTHETIC_PASS',
            (r.get('reason'),r.get('failure_details')))
        self.assertTrue(r['checks']['reproducible_records']); self.assertEqual(len(r['runs']),2)
        self.assertNotIn(str(self.src),(self.out/'qualification.json').read_text())
    def test_wrong_count(self): self.assertEqual(self.run_fixture(expected=99)['status'],'FAILED')
    def test_memory_gate(self): self.assertEqual(self.run_fixture(max_rss=1)['status'],'FAILED')
    def test_unavailable_measurement_cannot_pass_qualification(self):
        failure=ResourceSamplingFailure('process_status_unavailable','status',
            exception=PermissionError('synthetic metadata unavailable'))
        with patch('qualify.measured_process',side_effect=failure):
            report=self.run_fixture()
        self.assertEqual(report['status'],'FAILED')
        self.assertEqual(report['reason'],'process_status_unavailable')
        self.assertEqual(report['failure_details']['stage'],'status')
    def test_independent_count_without_memory_metrics_does_not_pass_budget(self):
        with patch('qualify.capinfos_count',return_value=100) as decoder:
            decoder.last_metrics=None
            report=qualify(self.src,self.out,profile='synthetic',expected_packets=100,min_free_bytes=0)
        self.assertEqual(report['status'],'FAILED')
        self.assertFalse(report['checks']['independent_memory_budget'])
    def test_real_identity_gate(self):
        r=qualify(self.src,self.out); self.assertEqual(r['reason'],'actual_dataset_identity_required')
        self.assertEqual(r['status'],'BLOCKED_EXTERNAL')
    def test_real_decoder_gate(self):
        with patch('qualify.GOAL_BYTES',1),patch('qualify.capinfos_count',return_value=None):
            r=qualify(self.src,self.out,min_free_bytes=0,dataset_id='fixture-not-real-qualification')
        self.assertEqual(r['reason'],'capinfos_required_for_real_goal')
    def test_tampering(self):
        self.run_fixture(); b=self.out/'run-1'; old=semantic_digest(b)
        with closing(sqlite3.connect(b/'index.sqlite')) as db:
            db.execute('UPDATE records SET captured_bytes=1 WHERE ordinal=1'); db.commit()
        self.assertNotEqual(semantic_digest(b),old)
        with self.assertRaises(IngestError): verify_bundle(b)
    def test_no_overwrite(self):
        self.out.mkdir(); (self.out/'keep').write_text('keep')
        with self.assertRaises(FileExistsError): self.run_fixture()
        self.assertTrue((self.out/'keep').exists())
    def test_independent_parser(self):
        with patch('qualify.shutil.which',return_value='/usr/bin/capinfos'):
            with patch('qualify.measured_process',return_value=(0,b'File name: private\nNumber of packets: 100\n',{})):
                self.assertEqual(capinfos_count(self.src,5),100)
            with patch('qualify.measured_process',return_value=(1,b'private',{})):
                with self.assertRaisesRegex(IngestError,'independent_decoder_failed'): capinfos_count(self.src,5)
    def test_timeout(self):
        with patch('qualify.capinfos_count',side_effect=subprocess.TimeoutExpired('capinfos',1)):
            r=qualify(self.src,self.out,profile='synthetic',expected_packets=100,min_free_bytes=0)
        self.assertEqual(r['status'],'FAILED'); self.assertEqual(r['reason'],'timeout')
    def test_fixture_reproducible(self):
        p=self.root/'other'; generate(p,100); self.assertEqual(p.read_bytes(),self.src.read_bytes())
        with self.assertRaises(FileExistsError): generate(p,100)

if __name__=='__main__': unittest.main()
