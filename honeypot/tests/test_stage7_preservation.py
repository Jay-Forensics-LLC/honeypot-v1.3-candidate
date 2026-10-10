import copy
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import stage7_preservation as custody
import stage7_recovery_check as review


class Preservation(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        folder = self.root / 'incidents/2026-10-10/example'; folder.mkdir(parents=True)
        self.incident = folder
        (folder / 'events.jsonl').write_text('{"event_id":"one"}\n')
        (folder / 'incident.json').write_text(json.dumps({'incident_id': 'example', 'related_events': ['one']}))
        (folder / 'metadata.json').write_text('{"copies":[]}')
        source = self.root / 'logs/normalized/events.jsonl'; source.parent.mkdir(parents=True)
        source.write_text('{"event_id":"one"}\n'); self.log = source
        state = self.root / 'state/incidentd'; state.mkdir(parents=True)
        self.write_state()
        (state / 'heartbeat').touch()
        sweep = review.retained_module('stage7-evidence-integrity-sweep')
        historical = SimpleNamespace(ORIGINAL=self.root/'absent', ORIGINAL_HASH='pinned', verify=lambda: {
            'original_sha256':'pinned','bundle_hashes':{},'normalized_source':{},'raw_source':{},
            'recovery_bundle':'retained','recorded_recovery_bundle':'recorded'})
        original = review.retained_module
        patcher = patch.object(review, 'retained_module', side_effect=lambda name: historical if name == 'stage7-reconciled-evidence' else sweep)
        patcher.start(); self.addCleanup(patcher.stop)

    def write_state(self, offset=None):
        info = self.log.stat()
        (self.root/'state/incidentd/state.json').write_text(json.dumps({'offsets': {
            'logs/normalized/events.jsonl': {'inode': f'{info.st_dev}:{info.st_ino}', 'offset': info.st_size if offset is None else offset}}}))

    def test_append_preserves_original_prefix_and_event_count(self):
        before = custody.snapshot(self.root)
        with self.log.open('a') as f: f.write('{"event_id":"two"}\n')
        self.write_state()
        after = custody.snapshot(self.root)
        self.assertEqual(custody.compare(self.root, before, after)['status'], 'PASS')
        self.assertEqual(after['sweep']['files_scanned'], 1)

    def test_rotation_preserves_inode_history_and_documents_new_offset(self):
        before = custody.snapshot(self.root)
        self.log.rename(str(self.log)+'.1'); self.log.write_text('{"event_id":"two"}\n'); self.write_state()
        after = custody.snapshot(self.root)
        self.assertEqual(len(custody.compare(self.root, before, after)['source_rotations']), 1)
        Path(str(self.log)+'.1').unlink()
        with self.assertRaisesRegex(ValueError, 'inode absent'):
            custody.compare(self.root, before, custody.snapshot(self.root))

    def test_prefix_mutation_offset_regression_and_history_loss_rejected(self):
        before = custody.snapshot(self.root)
        self.write_state(0)
        with self.assertRaisesRegex(ValueError, 'offset regressed'):
            custody.compare(self.root, before, custody.snapshot(self.root))
        self.write_state(); self.log.write_text('{"event_id":"two"}\n')
        with self.assertRaisesRegex(ValueError, 'prefix changed'):
            custody.compare(self.root, before, custody.snapshot(self.root))
        changed = copy.deepcopy(before); changed['incidents'] = {}
        self.log.write_text('{"event_id":"one"}\n')
        with self.assertRaisesRegex(ValueError, 'history lost'): custody.compare(self.root, before, changed)

    def test_custody_hash_size_and_manifest_must_match(self):
        (self.incident/'pcap').mkdir(); packet=self.incident/'pcap/example.pcapng'; packet.write_bytes(b'packet')
        row={'source':'/captures/segment','destination':packet.name,'sha256':hashlib.sha256(b'packet').hexdigest(),
             'size':6,'verified_stable':True}
        (self.incident/'metadata.json').write_text(json.dumps({'copies':[row]}))
        before=custody.snapshot(self.root)
        self.assertEqual(custody.compare(self.root,before,custody.snapshot(self.root))['status'],'PASS')
        packet.write_bytes(b'change')
        with self.assertRaisesRegex(ValueError,'hash/size differs'): custody.snapshot(self.root)

    def test_fixed_copy_mutation_during_read_rejected(self):
        path=self.root/'copy'; path.write_bytes(b'before'); real=os.pread
        def mutate(fd,count,offset):
            result=real(fd,count,offset)
            with path.open('ab') as stream: stream.write(b'after')
            return result
        with patch.object(custody.os,'pread',side_effect=mutate):
            with self.assertRaisesRegex(ValueError,'Fixed custody'): custody.prefix(path,fixed=True)

    def test_unreadable_and_symlink_files_never_skipped(self):
        original=Path.iterdir
        with patch.object(Path,'iterdir',side_effect=PermissionError('unreadable')):
            with self.assertRaises(PermissionError): custody.tree_files(self.root/'logs')
        (self.root/'logs/link').symlink_to(self.log)
        with self.assertRaisesRegex(ValueError,'Symlink/special'): custody.snapshot(self.root)

    def test_limits_and_invalid_checkpoint_block_incomplete_acquisition(self):
        for field in ('LOG_BUDGET','CUSTODY_BUDGET'):
            progress={}
            with patch.object(custody,field,1):
                with self.assertRaises(ValueError): custody.snapshot(self.root,progress)
            self.assertEqual(progress['status'],'INCOMPLETE')
        self.write_state(self.log.stat().st_size+1)
        with self.assertRaisesRegex(ValueError,'checkpoint'): custody.snapshot(self.root)
        with self.assertRaisesRegex(ValueError,'Incomplete'): custody.compare(self.root,{'status':'INCOMPLETE'}, {})

    def test_callback_failure_does_not_complete_evidence_sweep(self):
        progress={}
        with self.assertRaisesRegex(RuntimeError,'callback'):
            review.evidence_integrity(self.root,progress,on_incident=lambda *args: (_ for _ in ()).throw(RuntimeError('callback')))
        self.assertEqual(progress['status'],'INCOMPLETE')
        seen=[]
        review.evidence_integrity(self.root,on_incident=lambda path,data,metadata,*rest: seen.append((path,data,json.loads(metadata))))
        self.assertEqual(seen[0][1],(self.incident/'events.jsonl').read_bytes())
        self.assertEqual(seen[0][2]['related_events'],['one'])


if __name__ == '__main__': unittest.main()
