"""Finite evidence acquisition with harmless local source-writer races."""
import hashlib
import os
from pathlib import Path
import tempfile
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import incidentd


class FiniteEvidenceCopy(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.source=self.root/'original.bin'
        self.source.write_bytes(b'A'*8);self.dest=self.root/'artifacts';self.dest.mkdir()
        self.meta={'copies':[],'limitations':[]}
        self.engine=object.__new__(incidentd.Engine)

    def copy(self,budget=16):
        self.engine.copy_evidence(self.source,self.dest,self.meta,budget)

    def source_reader(self,on_copy_read):
        real_fdopen=os.fdopen;opened=[]
        class Reader:
            def __init__(self,stream):self.stream=stream;self.reads=0
            def __enter__(self):return self
            def __exit__(self,*args):return self.stream.__exit__(*args)
            def __getattr__(self,name):return getattr(self.stream,name)
            def read(self,amount):
                data=self.stream.read(amount);self.reads+=1
                if self.reads==2:on_copy_read()
                return data
        def fdopen(*args,**kwargs):
            stream=real_fdopen(*args,**kwargs)
            if not opened:opened.append(True);return Reader(stream)
            return stream
        return patch.object(incidentd.os,'fdopen',side_effect=fdopen)

    def test_unchanged_source_has_exact_bounded_copy_and_pinned_provenance(self):
        before=self.source.stat();self.copy();row=self.meta['copies'][0]
        self.assertTrue(row['verified_stable']);self.assertEqual(row['size'],8)
        self.assertEqual(row['source_size_at_start'],8);self.assertEqual(row['acquisition_limit_bytes'],8)
        self.assertEqual(row['source_identity']['inode'],before.st_ino)
        self.assertEqual(row['sha256'],hashlib.sha256(b'A'*8).hexdigest())
        self.assertEqual((self.dest/row['destination']).read_bytes(),b'A'*8)
        self.assertEqual(self.source.read_bytes(),b'A'*8)

    def test_destination_usage_counts_against_unchanged_budget(self):
        existing=self.dest/'preserved.bin';existing.write_bytes(b'X'*9)
        self.copy();self.assertEqual(self.meta['copies'],[])
        self.assertEqual(list(self.dest.iterdir()),[existing]);self.assertEqual(existing.read_bytes(),b'X'*9)
        self.assertIn('Copy budget exceeded',self.meta['limitations'][0])

    def test_growth_during_acquisition_cannot_exceed_inspected_length(self):
        def grow():
            with self.source.open('ab') as out:out.write(b'B'*32)
        with self.source_reader(grow):self.copy()
        row=self.meta['copies'][0];self.assertFalse(row['verified_stable'])
        self.assertEqual(row['size'],8);self.assertLessEqual(row['size'],16)
        self.assertEqual((self.dest/row['destination']).read_bytes(),b'A'*8)
        self.assertEqual(self.source.stat().st_size,40)
        self.assertIn('Copy changed during acquisition',self.meta['limitations'][0])

    def test_rotation_during_copy_retains_original_inode_bytes_but_marks_unstable(self):
        original=self.root/'rotated-original.bin'
        def rotate():
            self.source.rename(original);self.source.write_bytes(b'B'*8)
        with self.source_reader(rotate):self.copy()
        row=self.meta['copies'][0];self.assertFalse(row['verified_stable'])
        self.assertEqual((self.dest/row['destination']).read_bytes(),original.read_bytes())
        self.assertEqual(self.source.read_bytes(),b'B'*8)

    def test_changes_after_hash_are_rejected_before_destination_creation(self):
        real_fstat=os.fstat
        for change in ('grow','rotate'):
            self.source.write_bytes(b'A'*8);calls=[]
            def changed(fd):
                calls.append(fd)
                if len(calls)==3:
                    if change=='grow':
                        with self.source.open('ab') as out:out.write(b'B'*32)
                    else:
                        self.source.rename(self.root/'before-copy-original.bin')
                        self.source.write_bytes(b'B'*8)
                return real_fstat(fd)
            with patch.object(incidentd.os,'fstat',side_effect=changed):self.copy()
            self.assertEqual(self.meta['copies'],[]);self.assertEqual(list(self.dest.iterdir()),[])
            self.assertIn('before finite acquisition',self.meta['limitations'][-1])

    def test_truncation_during_copy_is_never_reported_stable(self):
        def truncate():
            with self.source.open('r+b') as out:out.truncate(4)
        with self.source_reader(truncate):self.copy()
        row=self.meta['copies'][0];self.assertFalse(row['verified_stable'])
        self.assertLessEqual(row['size'],row['acquisition_limit_bytes'])
        self.assertEqual(self.source.stat().st_size,4)

    def test_source_read_error_preserves_new_partial_artifact_with_failed_provenance(self):
        def fail():raise OSError('synthetic read failure')
        with self.source_reader(fail):self.copy()
        row=self.meta['copies'][0];self.assertFalse(row['verified_stable'])
        self.assertEqual(row['size'],0);self.assertTrue((self.dest/row['destination']).exists())
        self.assertEqual(self.source.read_bytes(),b'A'*8)
        self.assertIn('synthetic read failure',self.meta['limitations'][-1])

    def test_existing_destination_and_symlink_source_are_preserved(self):
        target=self.dest/(hashlib.sha256(b'A'*8).hexdigest()+'.bin');target.write_bytes(b'preserve')
        self.copy();self.assertEqual(target.read_bytes(),b'preserve');self.assertEqual(self.meta['copies'],[])
        real=self.root/'real.bin';self.source.rename(real);self.source.symlink_to(real)
        self.copy();self.assertEqual(real.read_bytes(),b'A'*8);self.assertEqual(self.meta['copies'],[])

    def test_requested_historical_hash_does_not_copy_a_different_current_version(self):
        expected=hashlib.sha256(self.source.read_bytes()).hexdigest()
        self.source.write_bytes(b'B'*8)
        self.engine.copy_evidence(self.source,self.dest,self.meta,16,expected_sha256=expected)
        self.assertEqual(self.meta['copies'],[])
        self.assertEqual(list(self.dest.iterdir()),[])
        self.assertEqual(self.source.read_bytes(),b'B'*8)
        self.assertIn('Requested artifact version unavailable',self.meta['limitations'][-1])

    def test_preservation_retains_two_versions_from_one_source_path(self):
        import json
        self.engine.artifacts=self.root/'source-artifacts';self.engine.artifacts.mkdir()
        self.engine.captures=self.root/'captures';self.engine.captures.mkdir()
        self.engine.window=300
        source=self.engine.artifacts/'versioned.bin'
        manifest=self.engine.artifacts/'sha256-manifest.jsonl'
        path=self.root/'incident';path.mkdir()
        incident={'timestamp_start':'2026-11-01T00:00:00Z','evidence_paths':[]}
        digests=[]
        for raw in (b'first version',b'second version'):
            source.write_bytes(raw);digest=hashlib.sha256(raw).hexdigest();digests.append(digest)
            with manifest.open('a') as stream:
                stream.write(json.dumps({'evidence_path':source.name,'sha256':digest})+'\n')
            self.engine.preserve(path,incident,{'sha256':digest})
        meta=json.loads((path/'metadata.json').read_text())
        self.assertEqual([row['sha256'] for row in meta['copies']],digests)
        self.assertTrue(all(row['verified_stable'] for row in meta['copies']))
        self.assertEqual((path/'artifacts'/meta['copies'][0]['destination']).read_bytes(),b'first version')
        self.assertEqual((path/'artifacts'/meta['copies'][1]['destination']).read_bytes(),b'second version')
        # A later case cannot claim it reacquired a version no longer at source.
        later=self.root/'later-incident';later.mkdir()
        self.engine.preserve(later,{'timestamp_start':incident['timestamp_start'],'evidence_paths':[]},
                             {'sha256':digests[0]})
        missing=json.loads((later/'metadata.json').read_text())
        self.assertEqual(missing['copies'],[])
        self.assertTrue(any('Requested artifact version unavailable' in note for note in missing['limitations']))
        self.assertEqual(source.read_bytes(),b'second version')


if __name__=='__main__':unittest.main()
