import copy
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import qualified_normalized_source as verifier

def sha(data): return hashlib.sha256(data).hexdigest()


class QualifiedNormalizedSource(unittest.TestCase):
    def fixture(self, root):
        path = root / verifier.NAME
        path.parent.mkdir(parents=True)
        prefix = b'{"earlier":"retained"}\n'
        line = (json.dumps({'event_id': 'fixture-id', 'timestamp': 'fixture-time',
                           'source': 'suricata', 'event_type': 'stats'}) + '\n').encode()
        qualified = prefix + line
        recovery = qualified + b'{"later":"recovery"}\n'
        path.write_bytes(recovery)
        info = path.stat()
        provenance = {'path': str(path), 'offset': len(prefix), 'length': len(line),
            'qualified_snapshot_size': len(qualified), 'current_snapshot_size': len(recovery),
            'previously_qualified_source_file_sha256': sha(qualified), 'source_file_sha256': sha(recovery),
            'record_sha256': sha(line), 'event_id': 'fixture-id', 'timestamp': 'fixture-time',
            'event_type': 'stats', 'identity': f'{info.st_dev}:{info.st_ino}'}
        return path, provenance, prefix, line, recovery

    def test_same_inode_rotation_with_new_live_file_preserves_all_proof(self):
        for slot in (1, 10):
            with self.subTest(slot=slot), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp); path, prov, prefix, line, recovery = self.fixture(root)
                rotated = Path(str(path) + '.' + str(slot)); path.rename(rotated)
                # A new valid live log no longer has the historical byte boundary.
                path.write_bytes(b'{"new_active_log":"different_record"}\n')
                rotated.write_bytes(recovery + b'{"growth":true}\n')
                before = (path.read_bytes(), rotated.read_bytes(), copy.deepcopy(prov))
                row, observed = verifier.verify(root, prov, 'fixture-id')
                self.assertEqual(row['event_id'], 'fixture-id')
                self.assertEqual(observed['path'], str(rotated))
                self.assertEqual(observed['identity'], prov['identity'])
                self.assertTrue(observed['rotation_verified'])
                self.assertTrue(observed['qualified_prefix_verified'])
                self.assertTrue(observed['recovery_prefix_verified'])
                self.assertEqual(observed['record_sha256'], sha(line))
                self.assertEqual((path.read_bytes(), rotated.read_bytes(), prov), before)

    def test_unrotated_append_only_growth_still_accepted(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); path, prov, _, _, recovery = self.fixture(root)
            path.write_bytes(recovery + b'{"append":true}\n')
            row, result = verifier.verify(root, prov, 'fixture-id')
            self.assertFalse(result['rotation_verified'])
            self.assertEqual(result['source_file_sha256'], sha(path.read_bytes()))

    def test_matching_record_does_not_excuse_prefix_or_recovery_snapshot_mutation(self):
        for change in ('prefix', 'record', 'boundary', 'recovery_tail', 'truncate'):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp); path, prov, prefix, line, recovery = self.fixture(root)
                rotated = Path(str(path)+'.1'); path.rename(rotated)
                bad = {'prefix': recovery.replace(b'earlier', b'EARLIER'),
                       'record': recovery.replace(b'stats', b'STATS'),
                       'boundary': prefix[:-1]+b' '+recovery[len(prefix):],
                       'recovery_tail': recovery.replace(b'later', b'LATER'),
                       'truncate': recovery[:-1]}[change]
                rotated.write_bytes(bad)
                with self.assertRaises(RuntimeError): verifier.verify(root, prov, 'fixture-id')
                self.assertEqual(rotated.read_bytes(), bad)

    def test_same_bytes_in_replacement_inode_are_not_proven_rotation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); path, prov, _, _, recovery = self.fixture(root)
            held = root/'held-original'; path.rename(held)
            path.write_bytes(recovery)
            Path(str(path)+'.1').write_bytes(recovery)
            with self.assertRaisesRegex(RuntimeError, 'identity absent'):
                verifier.verify(root, prov, 'fixture-id')

    def test_unavailable_ambiguous_and_unconfigured_slot_fail_closed(self):
        for change in ('missing', 'ambiguous', 'outside_slots'):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp); path, prov, _, _, _ = self.fixture(root)
                if change == 'missing': path.unlink()
                elif change == 'ambiguous': os.link(path, Path(str(path)+'.1'))
                else: path.rename(Path(str(path)+'.11'))
                with self.assertRaisesRegex(RuntimeError, 'identity absent or ambiguous'):
                    verifier.verify(root, prov, 'fixture-id')

    def test_symlinks_and_special_files_never_opened(self):
        for change in ('symlink', 'fifo'):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp); path, prov, _, _, _ = self.fixture(root)
                candidate = Path(str(path)+'.1')
                if change == 'symlink': candidate.symlink_to(path)
                else: os.mkfifo(candidate)
                with patch.object(verifier.os, 'open') as opened:
                    with self.assertRaises(ValueError): verifier.verify(root, prov, 'fixture-id')
                opened.assert_not_called()

    def test_permissions_and_short_reads_propagate_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); _, prov, _, _, _ = self.fixture(root)
            with patch.object(verifier.os, 'open', side_effect=PermissionError('denied')):
                with self.assertRaises(PermissionError): verifier.verify(root, prov, 'fixture-id')
            with patch.object(verifier.os, 'pread', return_value=b''):
                with self.assertRaisesRegex(RuntimeError, 'truncated during read'):
                    verifier.verify(root, prov, 'fixture-id')
            with patch.object(verifier.os, 'pread', side_effect=TimeoutError('deadline')):
                with self.assertRaises(TimeoutError): verifier.verify(root, prov, 'fixture-id')

    def test_malformed_record_and_rewrite_during_verification_never_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); path, prov, prefix, line, recovery = self.fixture(root)
            malformed = b'!' + line[1:]
            path.write_bytes(prefix + malformed + recovery[len(prefix)+len(line):])
            changed = {**prov, 'record_sha256': sha(malformed)}
            with self.assertRaises(json.JSONDecodeError): verifier.verify(root, changed, 'fixture-id')
            path.write_bytes(recovery)
            real_pread = os.pread; seen_full_snapshot = False
            def rewrite_after_snapshot(fd, count, offset):
                nonlocal seen_full_snapshot
                data = real_pread(fd, count, offset)
                if count == len(recovery) and not seen_full_snapshot:
                    seen_full_snapshot = True
                    path.write_bytes(recovery.replace(b'later', b'LATER'))
                return data
            with patch.object(verifier.os, 'pread', side_effect=rewrite_after_snapshot):
                with self.assertRaisesRegex(RuntimeError, 'rewritten during verification'):
                    verifier.verify(root, prov, 'fixture-id')

    def test_identity_replacement_between_lookup_and_open_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); path, prov, _, _, recovery = self.fixture(root)
            real_open = os.open
            def replace_then_open(*args):
                path.rename(root/'held-original'); path.write_bytes(recovery)
                return real_open(*args)
            with patch.object(verifier.os, 'open', side_effect=replace_then_open):
                with self.assertRaisesRegex(RuntimeError, 'identity changed during open'):
                    verifier.verify(root, prov, 'fixture-id')

    def test_rename_during_read_cannot_report_a_stale_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); path, prov, _, _, recovery = self.fixture(root)
            real_pread = os.pread
            replaced = False
            def replace_after_read(*args):
                nonlocal replaced
                data = real_pread(*args)
                if not replaced:
                    replaced = True; path.rename(root/'held-original'); path.write_bytes(recovery)
                return data
            with patch.object(verifier.os, 'pread', side_effect=replace_after_read):
                with self.assertRaisesRegex(RuntimeError, 'path replaced'):
                    verifier.verify(root, prov, 'fixture-id')

    def test_wrong_event_semantics_and_invalid_bounds_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); _, prov, _, _, _ = self.fixture(root)
            for key, value in [('path', str(root/'other')), ('offset', -1), ('length', 1024**2+1),
                               ('current_snapshot_size', verifier.MAX_BYTES+1), ('timestamp', 'wrong'),
                               ('event_type', 'wrong'), ('event_id', 'wrong')]:
                changed = {**prov, key: value}
                with self.subTest(key=key), self.assertRaises((ValueError, RuntimeError)):
                    verifier.verify(root, changed, 'fixture-id')


if __name__ == '__main__': unittest.main()
