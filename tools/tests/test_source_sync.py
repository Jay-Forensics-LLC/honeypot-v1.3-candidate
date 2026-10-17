"""Constructed source-checkpoint fixtures only; no retained runtime evidence."""
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

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
        validator.verify_snapshot(self.root, self.manifest())

    def test_non_git_mode_rejected_even_when_local_mode_matches(self):
        self.path.chmod(0o664)
        with self.assertRaisesRegex(ValueError, 'Non-Git source mode'):
            validator.verify_snapshot(self.root, self.manifest())

    def test_changed_missing_or_extra_source_rejected(self):
        manifest = self.manifest()
        self.path.write_text('print("changed fixture")\n')
        with self.assertRaisesRegex(ValueError, 'hash/size'):
            validator.verify_snapshot(self.root, manifest)
        self.path.unlink()
        with self.assertRaisesRegex(ValueError, 'inventory'):
            validator.verify_snapshot(self.root, manifest)
        self.path.write_text('print("constructed fixture")\n')
        (self.root / 'honeypot/extra.py').write_text('pass\n')
        with self.assertRaisesRegex(ValueError, 'inventory'):
            validator.verify_snapshot(self.root, manifest)

    def test_unreviewed_work_and_live_environment_rejected_even_with_matching_hash(self):
        self.path.unlink()
        work = self.root / 'honeypot/work'
        work.mkdir()
        report = work / 'report.json'
        report.write_text('{}\n')
        report.chmod(0o644)
        with self.assertRaisesRegex(ValueError, 'Unreviewed work'):
            validator.verify_snapshot(self.root, self.manifest(report))
        report.unlink()
        environment = self.root / 'honeypot/.env'
        environment.write_text('SYNTHETIC=value\n')
        environment.chmod(0o644)
        with self.assertRaisesRegex(ValueError, 'Live environment'):
            validator.verify_snapshot(self.root, self.manifest(environment))

    def test_symlinks_traversal_and_binary_content_rejected(self):
        manifest = self.manifest()
        self.path.unlink()
        self.path.symlink_to('/dev/null')
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            validator.verify_snapshot(self.root, manifest)
        self.path.unlink()
        with self.assertRaisesRegex(ValueError, 'Unsafe path'):
            validator.safe_path(self.root, '../outside')
        self.path.write_bytes(b'print("fixture")\x00\n')
        self.path.chmod(0o644)
        with self.assertRaisesRegex(ValueError, 'Sensitive/binary'):
            validator.verify_snapshot(self.root, self.manifest())

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


class IntegratedSourceTests(unittest.TestCase):
    setUp = SourceCheckpointTests.setUp
    manifest = SourceCheckpointTests.manifest
    # Reuse setup only; the historical checkpoint cases remain a separate suite.
    def test_current_source_can_evolve_without_changing_historical_receipt(self):
        self.path.write_text('print("new reviewed source")\n')
        self.assertEqual(validator.verify_source(self.root), 1)

    def test_current_source_rejects_unreviewed_work(self):
        path = self.root / 'honeypot/work/private-report.py'
        path.parent.mkdir()
        path.write_text('pass\n')
        path.chmod(0o644)
        with self.assertRaisesRegex(ValueError, 'Unreviewed work'):
            validator.verify_source(self.root)

    def test_retained_qualification_sources_are_pinned_and_required(self):
        path = self.root / 'honeypot/work/live-qualification/fixture.py'
        path.parent.mkdir(parents=True)
        path.write_text('pass\n')
        path.chmod(0o644)
        record = self.manifest(path)['files'][0]
        receipt = {'qualification_source_allowlist': [record['path']], 'files': [record]}
        (self.root / 'docs').mkdir()
        (self.root / 'docs/source-sync-manifest.json').write_text(json.dumps(receipt))
        self.assertEqual(validator.verify_source(self.root), 2)
        path.write_text('print("unreviewed change")\n')
        with self.assertRaisesRegex(ValueError, 'differs from export receipt'):
            validator.verify_source(self.root)
        path.unlink()
        with self.assertRaisesRegex(ValueError, 'inventory differs'):
            validator.verify_source(self.root)


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        path = self.root / '.github/workflows'
        path.mkdir(parents=True)
        self.path = path / 'source-baseline.yml'
        self.config = {'permissions': {'contents': 'read'}, 'jobs': {'offline-validation': {'steps': [
            {'uses': 'actions/checkout@v7', 'with': {'persist-credentials': False}},
            {'run': 'python -B tools/validate_baseline.py'}]}}}

    def write(self):
        import yaml
        self.path.write_text(yaml.safe_dump(self.config))

    def test_action_version_updates_do_not_invalidate_the_historical_workflow_hash(self):
        for version in ('v4', 'v7'):
            self.config['jobs']['offline-validation']['steps'][0]['uses'] = 'actions/checkout@' + version
            self.write()
            validator.verify_workflow(self.root)

    def test_permissions_credentials_and_validator_execution_remain_required(self):
        steps = self.config['jobs']['offline-validation']['steps']
        steps[0]['with']['persist-credentials'] = True
        self.write()
        with self.assertRaisesRegex(ValueError, 'must not persist'):
            validator.verify_workflow(self.root)
        steps[0]['with']['persist-credentials'] = False
        steps[1]['run'] = 'echo checks skipped'
        self.write()
        with self.assertRaisesRegex(ValueError, 'must run'):
            validator.verify_workflow(self.root)
        steps[1]['run'] = 'python -B tools/validate_baseline.py'
        self.config['permissions']['contents'] = 'write'
        self.write()
        with self.assertRaisesRegex(ValueError, 'permissions differ'):
            validator.verify_workflow(self.root)


if __name__ == '__main__':
    unittest.main()


class ReviewedQualificationUpdates(unittest.TestCase):
    setUp = SourceCheckpointTests.setUp
    manifest = SourceCheckpointTests.manifest

    def prepare(self):
        path=self.root/'honeypot/work/live-qualification/fixture.py'
        path.parent.mkdir(parents=True);path.write_text('pass\n');path.chmod(0o644)
        original=self.manifest(path)['files'][0]
        (self.root/'docs').mkdir()
        receipt={'qualification_source_allowlist':[original['path']], 'files':[original]}
        (self.root/'docs/source-sync-manifest.json').write_text(json.dumps(receipt))
        path.write_text('print("reviewed fix")\n')
        update=self.manifest(path)['files'][0]
        update.update(original_sha256=original['sha256'],reason='Reviewed security fix')
        self.receipt=self.root/'docs/qualification-source-updates.json'
        self.receipt.write_text(json.dumps({'version':1,'updates':[update]}))
        return path,update

    def test_new_pin_preserves_original_receipt_and_rejects_later_tampering(self):
        path,update=self.prepare();original=(self.root/'docs/source-sync-manifest.json').read_bytes()
        self.assertEqual(validator.verify_source(self.root),2)
        self.assertEqual((self.root/'docs/source-sync-manifest.json').read_bytes(),original)
        path.write_text('print("unreviewed")\n')
        with self.assertRaisesRegex(ValueError,'differs'):validator.verify_source(self.root)

    def test_wrong_origin_duplicate_unknown_path_and_version_rejected(self):
        path,update=self.prepare()
        cases=[{'version':2,'updates':[update]},
               {'version':1,'updates':[{**update,'original_sha256':'wrong'}]},
               {'version':1,'updates':[update,update]},
               {'version':1,'updates':[{**update,'path':'honeypot/work/private.py'}]}]
        for amended in cases:
            self.receipt.write_text(json.dumps(amended))
            with self.assertRaises(ValueError):validator.verify_source(self.root)
