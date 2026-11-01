"""Admission preserves readable policies and committed import inventories."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import dashboard
from phase10.model import Phase10Error
from phase10.policy import Policy
import phase10.policy as policy_module
from phase10.store import Store
import phase10.store as store_module

STAMP = '2026-11-01T00:00:00Z'


class PolicyAdmission(unittest.TestCase):
    def test_exact_serialized_policy_roundtrips(self):
        policy = Policy(enabled=True, plugins=('bbot',), scope=('example.test', '\u03bb.example.test'))
        raw = policy.serialize()
        self.assertTrue(raw.endswith(b'\n'))
        self.assertIn(b'\\u03bb', raw)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'policy.json'
            dashboard._write_policy(path, policy)
            self.assertEqual(path.read_bytes(), raw)
            self.assertEqual(Policy.load(path), policy)

    def test_constructor_and_dictionary_check_encoded_expansion(self):
        # These small lists have equal character counts; ASCII escaping changes
        # their serialized size. Lower the byte cap instead of allocating MiBs.
        ascii_scope = ('a' * 100,)
        unicode_scope = ('\u03bb' * 100,)
        limit = len(Policy(scope=ascii_scope).serialize())
        with patch.object(policy_module, 'MAX_POLICY_BYTES', limit):
            self.assertEqual(Policy(scope=ascii_scope).scope, ascii_scope)
            with self.assertRaisesRegex(Phase10Error, 'serialized byte limit'):
                Policy(scope=unicode_scope)
            with self.assertRaisesRegex(Phase10Error, 'serialized byte limit'):
                Policy.from_dict({'scope': list(unicode_scope)})

    def test_oversized_save_preserves_previous_policy(self):
        previous = Policy(enabled=True, plugins=('bbot',))
        proposed = Policy(enabled=True, plugins=('bbot',), scope=('\u03bb' * 100,))
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'policy.json'
            dashboard._write_policy(path, previous)
            before = path.read_bytes()
            with patch.object(policy_module, 'MAX_POLICY_BYTES', len(before)):
                with self.assertRaisesRegex(Phase10Error, 'serialized byte limit'):
                    dashboard._write_policy(path, proposed)
                self.assertEqual(path.read_bytes(), before)
                self.assertEqual(Policy.load(path), previous)
            self.assertEqual([p.name for p in path.parent.iterdir()], ['policy.json'])


class ManifestAdmission(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name) / 'imports'
        self.store = Store(self.root, Policy(enabled=True, plugins=('bbot',), scope=('example.test',)))
        self.first_raw, self.second_raw = b'{"fixture":1}\n', b'{"fixture":2}\n'

    def snapshot(self):
        return {p.relative_to(self.root).as_posix(): p.read_bytes()
                for p in self.root.rglob('*') if p.is_file()}

    def test_aggregate_admission_counts_saved_bytes_and_preserves_inventory(self):
        first = self.store.save('bbot', 'jsonl', self.first_raw, [], STAMP)
        path = self.root / 'imports' / (first['import_id'] + '.json')
        # Valid retained whitespace is part of the actual inventory budget.
        original = json.loads(path.read_bytes())
        path.write_text(json.dumps(original, indent=2) + '\n', encoding='utf-8')
        encoded_size = len(store_module._json(original))
        limit = path.stat().st_size + encoded_size - 1
        before = self.snapshot()
        with patch.object(store_module, 'MAX_MANIFEST_INVENTORY_BYTES', limit):
            with self.assertRaisesRegex(Phase10Error, 'Manifest inventory byte limit'):
                self.store.save('bbot', 'jsonl', self.second_raw, [], STAMP)
            self.assertEqual(self.snapshot(), before)
            self.assertEqual(len(self.store.manifests()), 1)
            self.assertTrue(self.store.save('bbot', 'jsonl', self.first_raw, [], STAMP)['deduplicated'])
            self.assertEqual(self.store.read_import(first['import_id'])['findings'], [])

    def test_individual_manifest_rejected_before_objects_are_written(self):
        # The ordinary fixture manifest is hundreds of bytes; only its admitted
        # limit is reduced, while the actual input remains tiny.
        with patch.object(store_module, 'MAX_MANIFEST_BYTES', 128):
            with self.assertRaisesRegex(Phase10Error, 'Manifest inventory byte limit'):
                self.store.save('bbot', 'jsonl', self.first_raw, [], STAMP)
        self.assertEqual(self.snapshot(), {})
        self.assertFalse((self.root / 'objects').exists())
        self.assertEqual(self.store.manifests(), [])


if __name__ == '__main__':
    unittest.main()
