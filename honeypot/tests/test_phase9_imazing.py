import hashlib
from contextlib import closing
import json
from pathlib import Path
import plistlib
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from phase10.imazing import import_backup, parse_imazing
from phase10.model import Phase10Error
from phase10.policy import Policy
from phase10.store import Store


class ImazingMetadataTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.backup = self.root / 'backup'
        self.backup.mkdir()
        self.store = self.root / 'private-store'
        self.policy = Policy.from_dict({'enabled': True, 'plugins': ['imazing']})
        self.manifest = plistlib.dumps({'IsEncrypted': False, 'DeviceName': 'PRIVATE DEVICE'}, fmt=plistlib.FMT_BINARY)
        self.status = plistlib.dumps({'SnapshotState': 'finished', 'DeviceIdentifier': 'PRIVATE IDENTIFIER'})
        (self.backup / 'Manifest.plist').write_bytes(self.manifest)
        (self.backup / 'Status.plist').write_bytes(self.status)
        self.db_path = self.backup / 'Manifest.db'
        with closing(sqlite3.connect(self.db_path)) as db, db:
            db.execute('CREATE TABLE Files(fileID TEXT PRIMARY KEY,domain TEXT,relativePath TEXT,flags INTEGER,file BLOB)')
            db.executemany('INSERT INTO Files VALUES(?,?,?,?,?)', [
                ('a' * 40, 'AppDomain-com.example.app', 'PRIVATE PATH', 1, b'PRIVATE METADATA'),
                ('b' * 40, 'HomeDomain', 'Library', 2, None)])
        self.raw = self.db_path.read_bytes()

    def context(self, raw, **changes):
        row = self.policy.context(hashlib.sha256(raw).hexdigest(), '2026-11-01T12:00:00Z')
        row.update(changes)
        return row

    def test_sqlite_aggregate_preserves_digest_without_personal_fields(self):
        rows = parse_imazing(self.raw, 'sqlite', self.context(self.raw))
        self.assertEqual(rows[0]['details']['counts']['records'], 2)
        self.assertEqual(rows[0]['details']['counts']['app_domains'], 1)
        self.assertEqual(rows[0]['raw_source_hash'], 'sha256:' + hashlib.sha256(self.raw).hexdigest())
        self.assertNotIn('PRIVATE', json.dumps(rows))
        self.assertNotIn('com.example.app', json.dumps(rows))

    def test_binary_and_standard_xml_plists_retain_status_only(self):
        for raw, expected in ((self.manifest, 'unencrypted'), (self.status, 'finished')):
            with self.subTest(expected=expected):
                rows = parse_imazing(raw, 'plist', self.context(raw))
                self.assertEqual(rows[0]['details']['status'], expected)
                self.assertNotIn('PRIVATE', json.dumps(rows))

    def test_shared_binary_plist_containers_are_valid_metadata(self):
        shared = {'metadata': [1, 2]}
        raw = plistlib.dumps({'IsEncrypted': False, 'First': shared, 'Second': shared},
                             fmt=plistlib.FMT_BINARY)
        rows = parse_imazing(raw, 'plist', self.context(raw))
        self.assertEqual(rows[0]['details']['status'], 'unencrypted')

    def test_plist_entities_nesting_and_unsupported_metadata_rejected(self):
        nested = {'leaf': 'value'}
        for _ in range(40):
            nested = {'nested': nested}
        inputs = [b'<!DOCTYPE plist [<!ENTITY x "value">]><plist><dict/></plist>',
                  plistlib.dumps(nested, fmt=plistlib.FMT_BINARY),
                  plistlib.dumps({'DeviceName': 'PRIVATE'})]
        for raw in inputs:
            with self.subTest(size=len(raw)), self.assertRaises(Phase10Error):
                parse_imazing(raw, 'plist', self.context(raw))

    def test_database_format_schema_record_and_byte_limits(self):
        for raw, changes in ((b'not a database', {}), (self.raw, {'max_records': 1}),
                             (self.raw, {'max_bytes': 1})):
            with self.subTest(changes=changes), self.assertRaises(Phase10Error):
                parse_imazing(raw, 'sqlite', self.context(raw, **changes))
        with closing(sqlite3.connect(self.db_path)) as db, db:
            db.execute('ALTER TABLE Files ADD COLUMN unexpected TEXT')
        raw = self.db_path.read_bytes()
        with self.assertRaises(Phase10Error):
            parse_imazing(raw, 'sqlite', self.context(raw))

    def test_complete_backup_round_trip_and_originals_unchanged(self):
        before = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in self.backup.iterdir()}
        result = import_backup(self.store, self.policy, self.backup)
        self.assertEqual(result['coverage'], 'metadata-only')
        self.assertEqual(result['counts']['records'], 2)
        self.assertEqual(result['source_sha256'], before)
        self.assertEqual(len(result['manifests']), 3)
        self.assertEqual({p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in self.backup.iterdir()}, before)
        self.assertNotIn('PRIVATE', json.dumps(Store(self.store, self.policy).export()))
        again = import_backup(self.store, self.policy, self.backup)
        self.assertTrue(all(row['deduplicated'] for row in again['manifests']))

    def test_encrypted_incomplete_and_sidecar_backups_never_persist(self):
        for name, raw in [('Manifest.plist', plistlib.dumps({'IsEncrypted': True})),
                          ('Status.plist', plistlib.dumps({'SnapshotState': 'inprogress'})),
                          ('Manifest.db-wal', b'closed-snapshot-required')]:
            original = (self.backup / name).read_bytes() if (self.backup / name).exists() else None
            (self.backup / name).write_bytes(raw)
            with self.subTest(name=name), self.assertRaises(Phase10Error):
                import_backup(self.store, self.policy, self.backup)
            self.assertFalse(self.store.exists())
            if original is None:
                (self.backup / name).unlink()
            else:
                (self.backup / name).write_bytes(original)

    def test_disabled_and_alias_directory_never_persist(self):
        with self.assertRaises(Phase10Error):
            import_backup(self.store, Policy(), self.backup)
        alias = self.root / 'alias'
        alias.symlink_to(self.backup, target_is_directory=True)
        with self.assertRaises(Phase10Error):
            import_backup(self.store, self.policy, alias)
        self.assertFalse(self.store.exists())

    def test_changed_backup_metadata_rejected_before_store(self):
        from phase10 import imazing
        original = imazing.read_regular
        calls = 0

        def changed(path, limit):
            nonlocal calls
            calls += 1
            data = original(path, limit)
            return data + b' ' if calls == 4 else data

        with patch.object(imazing, 'read_regular', side_effect=changed), self.assertRaises(Phase10Error):
            import_backup(self.store, self.policy, self.backup)
        self.assertFalse(self.store.exists())

    def test_sidecar_created_during_final_reads_rejected_before_store(self):
        from phase10 import imazing
        original = imazing.read_regular
        calls = 0

        def changed(path, limit):
            nonlocal calls
            calls += 1
            data = original(path, limit)
            if calls == 6:
                (self.backup / 'Manifest.db-wal').write_bytes(b'snapshot changed')
            return data

        with patch.object(imazing, 'read_regular', side_effect=changed), self.assertRaises(Phase10Error):
            import_backup(self.store, self.policy, self.backup)
        self.assertFalse(self.store.exists())


if __name__ == '__main__':
    unittest.main()
