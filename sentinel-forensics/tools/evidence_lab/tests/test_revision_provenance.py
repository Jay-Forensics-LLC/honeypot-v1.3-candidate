"""Copied offline code records unavailable Git provenance without inventing it."""
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import qualify as module
from qualify import generate, qualify
from core import IngestError


class RevisionProvenance(unittest.TestCase):
    def test_output_below_source_is_rejected_before_writing(self):
        with tempfile.TemporaryDirectory() as name:
            root=Path(name); source=root/'segments'; source.mkdir()
            generate(source/'capture',3)
            before={p.relative_to(source).as_posix():p.read_bytes() for p in source.iterdir()}
            with self.assertRaisesRegex(IngestError,'separate_from_source'):
                qualify(source,source/'derived-case',profile='synthetic',expected_packets=3,min_free_bytes=0)
            self.assertEqual(before,{p.relative_to(source).as_posix():p.read_bytes() for p in source.iterdir()})

    def test_copied_code_synthetic_checks_continue_but_real_cannot_pass(self):
        original=module.subprocess.run
        def offline_git(args,**kwargs):
            if args[0]=='git': raise subprocess.CalledProcessError(128,args)
            return original(args,**kwargs)
        with tempfile.TemporaryDirectory() as name:
            root=Path(name); source=root/'fixture.pcap'; generate(source,3)
            with patch('qualify.subprocess.run',side_effect=offline_git):
                synthetic=qualify(source,root/'synthetic',profile='synthetic',expected_packets=3,min_free_bytes=0)
                real=qualify(source,root/'real',dataset_id='explicit synthetic test of real gate',min_free_bytes=0)
            self.assertEqual(synthetic['status'],'SYNTHETIC_PASS')
            self.assertIsNone(synthetic['code_commit']); self.assertIsNone(synthetic['code_dirty'])
            self.assertEqual(synthetic['code_revision_status'],'unavailable')
            self.assertTrue(synthetic['code_sha256'])
            # Independent capinfos is required for real; absent Git never becomes pinned code.
            if real.get('runs'):
                self.assertFalse(real['checks']['pinned_real_code'])
                self.assertEqual(real['status'],'FAILED')
            else:
                self.assertNotEqual(real['status'],'GOAL_PASS')

    def test_missing_git_does_not_mask_dataset_prerequisite(self):
        with tempfile.TemporaryDirectory() as name:
            root=Path(name)
            with patch('qualify.subprocess.run',side_effect=FileNotFoundError('git')):
                report=qualify(root/'missing',root/'out',dataset_id='unavailable dataset')
            self.assertEqual(report['status'],'BLOCKED_EXTERNAL')
            self.assertEqual(report['reason'],'source_or_required_tool_not_found')
            self.assertIn('ios_ingest.py',report['code_sha256'])


if __name__=='__main__': unittest.main()
