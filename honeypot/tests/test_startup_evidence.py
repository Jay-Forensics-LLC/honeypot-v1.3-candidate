"""Positive startup observations never replace independent verification."""
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
import incidentd
from evidence_store import EvidenceIntegrityError


class StartupEvidence(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        shutil.copytree(ROOT/'detections', self.root/'detections')

    def diagnostics(self):
        path = self.root/'logs/system/evidence-startup.jsonl'
        return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []

    def complete(self, engine):
        for _ in range(10):
            engine.inspect_existing_evidence()
            if engine.startup_scan_reported:
                return self.diagnostics()[-1]
        self.fail('Startup scan did not finish within fixture bound')

    def test_empty_startup_is_scoped_once_and_identifies_process(self):
        engine = incidentd.Engine(self.root)
        row = self.complete(engine)
        self.assertEqual(row['status'], 'CLEAN')
        self.assertTrue(row['scan_complete'])
        self.assertTrue(row['locator_ready'])
        self.assertEqual(row['scanned_incidents'], 0)
        self.assertEqual(row['blocked_incidents'], 0)
        self.assertGreater(row['producer_pid'], 0)
        self.assertGreater(row['producer_started_ticks'], 0)
        self.assertEqual(row['boot_id'], Path('/proc/sys/kernel/random/boot_id').read_text().strip())
        self.assertIn('not a global integrity', row['scope'])
        engine.inspect_existing_evidence()
        self.assertEqual(len(self.diagnostics()), 1)

    def test_complete_existing_incident_is_counted_on_new_engine(self):
        engine = incidentd.Engine(self.root)
        self.complete(engine)
        engine.process('cowrie', {'src_ip': '192.0.2.5', 'eventid': 'cowrie.login.failed'}, 'synthetic-startup')
        row = self.complete(incidentd.Engine(self.root))
        self.assertEqual(row['status'], 'CLEAN')
        self.assertEqual(row['scanned_incidents'], 1)
        self.assertEqual(len(self.diagnostics()), 2)

    def test_corrupt_original_is_preserved_and_never_reported_clean(self):
        engine = incidentd.Engine(self.root)
        raw = {'src_ip': '192.0.2.5', 'eventid': 'cowrie.login.failed'}
        engine.process('cowrie', raw, 'synthetic-corrupt-startup')
        path = next((self.root/'incidents').glob('*/*/events.jsonl'))
        path.write_bytes(path.read_bytes()+b'\x00\x00')
        original = path.read_bytes()
        restarted = incidentd.Engine(self.root)
        row = self.complete(restarted)
        self.assertEqual(row['status'], 'BLOCKED')
        self.assertGreater(row['blocked_incidents'], 0)
        with self.assertRaises(EvidenceIntegrityError):
            restarted.process('cowrie', raw, 'synthetic-corrupt-startup')
        self.assertEqual(path.read_bytes(), original)
        failures = self.root/'logs/system/evidence-integrity.jsonl'
        self.assertEqual(json.loads(failures.read_text().splitlines()[-1])['original_sha256'],
                         hashlib.sha256(original).hexdigest())

    def test_unreadable_branch_does_not_produce_positive_startup(self):
        engine = incidentd.Engine(self.root)
        folder = self.root/'incidents/day'
        folder.mkdir(parents=True)
        original = Path.iterdir
        def inspect(path):
            if path == folder:
                raise PermissionError('synthetic unreadable startup branch')
            return original(path)
        with patch.object(Path, 'iterdir', inspect):
            with self.assertRaises(PermissionError):
                engine.inspect_existing_evidence()
        self.assertFalse(engine.startup_scan_reported)
        self.assertEqual(self.diagnostics(), [])
        with self.assertRaises(EvidenceIntegrityError):
            engine.inspect_existing_evidence()
        self.assertEqual(self.diagnostics(), [])

    def test_symlinked_incident_is_not_clean(self):
        engine = incidentd.Engine(self.root)
        day = self.root/'incidents/day'
        day.mkdir(parents=True)
        (day/'unsafe').symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(EvidenceIntegrityError):
            engine.inspect_existing_evidence()
        self.assertFalse(engine.startup_scan_reported)
        with self.assertRaises(EvidenceIntegrityError):
            engine.inspect_existing_evidence()
        self.assertEqual(self.diagnostics(), [])


if __name__ == '__main__':
    unittest.main()
