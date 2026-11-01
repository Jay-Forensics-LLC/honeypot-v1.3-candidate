"""Synthetic demo creation stays private, deterministic and separate from sensors."""
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from phase10.model import Phase10Error
from phase10.session_demo import create_demo, FIXTURE_ID


class SessionDemo(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name)
        self.root = self.base / 'state/demo-session'

    def contents(self):
        return {str(path.relative_to(self.root)): path.read_bytes()
                for path in self.root.rglob('*') if path.is_file()}

    def test_fresh_demo_has_matched_twelve_packet_capture_and_emulated_commands(self):
        catalog = create_demo(self.root)
        snapshot = catalog.snapshot()
        self.assertEqual(len(snapshot['sessions']), 1)
        selected = snapshot['sessions'][0]
        self.assertEqual(selected['event_count'], 3)
        self.assertEqual(selected['command_count'], 2)
        plan = catalog.prepare(selected['selection_id'])
        self.assertEqual([row['command'] for row in plan.transcript['commands']], ['id', 'uname -a'])
        self.assertEqual(plan.capture['status'], 'matched')
        self.assertEqual(plan.capture['association']['packet_count'], 12)
        self.assertEqual(catalog.demo_context, {'synthetic': True, 'fixture': FIXTURE_ID})
        manifest = json.loads((self.root / 'demo.json').read_bytes())
        self.assertTrue(manifest['synthetic'])
        self.assertEqual(manifest['expected_lead'], 'repeated_syn')
        for name, receipt in manifest['files'].items():
            raw = (self.root / name).read_bytes()
            self.assertEqual(hashlib.sha256(raw).hexdigest(), receipt['sha256'])
            self.assertEqual(len(raw), receipt['bytes'])
        for path in [self.root, *self.root.rglob('*')]:
            self.assertEqual(path.stat().st_mode & 0o777, 0o700 if path.is_dir() else 0o600)
        self.assertFalse((self.base / 'logs').exists())

    def test_repeat_creation_is_byte_identical_and_does_not_replace_files(self):
        create_demo(self.root)
        before = self.contents()
        identities = {name: (self.root / name).stat().st_ino for name in before}
        create_demo(self.root)
        self.assertEqual(self.contents(), before)
        self.assertEqual({name: (self.root / name).stat().st_ino for name in before}, identities)

    def test_existing_unknown_or_corrupt_data_is_preserved_without_new_files(self):
        for mode in ('unknown', 'corrupt', 'mode', 'hardlink'):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as tmp:
                self.root = Path(tmp) / 'demo'
                create_demo(self.root)
                path = self.root / 'demo.json'
                if mode == 'unknown':
                    (self.root / 'unexpected.txt').write_bytes(b'preserve unexpected data')
                elif mode == 'corrupt':
                    path.write_bytes(b'preserve altered demo')
                elif mode == 'mode':
                    path.chmod(0o644)
                else:
                    os.link(path, Path(tmp) / 'held-hardlink')
                before = self.contents()
                with self.assertRaises(Phase10Error):
                    create_demo(self.root)
                self.assertEqual(self.contents(), before)

    def test_symlink_root_parent_and_known_leaf_are_refused(self):
        target = self.base / 'target'
        target.mkdir(mode=0o700)
        self.root.parent.mkdir(parents=True)
        self.root.symlink_to(target, target_is_directory=True)
        with self.assertRaises(Phase10Error):
            create_demo(self.root)
        self.assertEqual(list(target.iterdir()), [])
        self.root.unlink()
        create_demo(self.root)
        known = self.root / 'demo.json'
        held = self.base / 'held'
        known.rename(held)
        known.symlink_to(held)
        before = held.read_bytes()
        with self.assertRaises(Phase10Error):
            create_demo(self.root)
        self.assertEqual(held.read_bytes(), before)
        parent_alias = self.base / 'parent-alias'
        parent_alias.symlink_to(target, target_is_directory=True)
        with self.assertRaises(Phase10Error):
            create_demo(parent_alias / 'demo')
        self.assertEqual(list(target.iterdir()), [])


if __name__ == '__main__':
    unittest.main()
