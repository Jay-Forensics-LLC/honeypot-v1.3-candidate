"""Constructed source-checkpoint fixtures only; no retained runtime evidence."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('validator', Path(__file__).parents[1] / 'validate_baseline.py')
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


class SourceCheckpointTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        (self.root / 'honeypot').mkdir()
        (self.root / 'tools').mkdir()
        self.path = self.root / 'honeypot/example.py'
        self.path.write_text('print("constructed fixture")\n')
        self.path.chmod(0o644)

    def manifest(self, path=None):
        path = path or self.path
        data = path.read_bytes()
        return {'files': [{'path': path.relative_to(self.root).as_posix(), 'bytes': len(data),
                           'sha256': hashlib.sha256(data).hexdigest(), 'mode': oct(path.stat().st_mode & 0o777)}],
                'qualification_source_allowlist': [], 'baseline_differences': []}

    def test_exact_reviewed_source_accepted(self):
        validator.verify_source(self.root, self.manifest())

    def test_non_git_mode_rejected_even_when_local_mode_matches(self):
        self.path.chmod(0o664)
        with self.assertRaisesRegex(ValueError, 'Non-Git source mode'):
            validator.verify_source(self.root, self.manifest())

    def test_changed_missing_or_extra_source_rejected(self):
        manifest = self.manifest()
        self.path.write_text('print("changed fixture")\n')
        with self.assertRaisesRegex(ValueError, 'hash/size'):
            validator.verify_source(self.root, manifest)
        self.path.unlink()
        with self.assertRaisesRegex(ValueError, 'inventory'):
            validator.verify_source(self.root, manifest)
        self.path.write_text('print("constructed fixture")\n')
        (self.root / 'honeypot/extra.py').write_text('pass\n')
        with self.assertRaisesRegex(ValueError, 'inventory'):
            validator.verify_source(self.root, manifest)

    def test_unreviewed_work_and_live_environment_rejected_even_with_matching_hash(self):
        self.path.unlink()
        work = self.root / 'honeypot/work'
        work.mkdir()
        report = work / 'report.json'
        report.write_text('{}\n')
        report.chmod(0o644)
        with self.assertRaisesRegex(ValueError, 'Unreviewed work'):
            validator.verify_source(self.root, self.manifest(report))
        report.unlink()
        environment = self.root / 'honeypot/.env'
        environment.write_text('SYNTHETIC=value\n')
        environment.chmod(0o644)
        with self.assertRaisesRegex(ValueError, 'Live environment'):
            validator.verify_source(self.root, self.manifest(environment))

    def test_symlinks_traversal_and_binary_content_rejected(self):
        manifest = self.manifest()
        self.path.unlink()
        self.path.symlink_to('/dev/null')
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            validator.verify_source(self.root, manifest)
        self.path.unlink()
        with self.assertRaisesRegex(ValueError, 'Unsafe path'):
            validator.safe_path(self.root, '../outside')
        self.path.write_bytes(b'print("fixture")\x00\n')
        self.path.chmod(0o644)
        with self.assertRaisesRegex(ValueError, 'Sensitive/binary'):
            validator.verify_source(self.root, self.manifest())

    def test_import_changes_need_original_and_current_hashes(self):
        manifest = self.manifest()
        original_hash = manifest['files'][0]['sha256']
        original = {'entries': [{'path': 'honeypot/example.py', 'import_sha256': original_hash}]}
        self.path.write_text('print("reviewed change")\n')
        with self.assertRaisesRegex(ValueError, 'Unaccounted'):
            validator.verify_import_records(self.root, original, manifest)
        manifest['baseline_differences'] = [{'path': 'honeypot/example.py', 'baseline_sha256': original_hash,
                                             'snapshot_sha256': hashlib.sha256(self.path.read_bytes()).hexdigest()}]
        validator.verify_import_records(self.root, original, manifest)
        manifest['baseline_differences'][0]['baseline_sha256'] = 'wrong'
        with self.assertRaisesRegex(ValueError, 'provenance'):
            validator.verify_import_records(self.root, original, manifest)


if __name__ == '__main__':
    unittest.main()
