import contextlib
import importlib.util
import io
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import stage7_tests


class QualificationTestRunner(unittest.TestCase):
    def test_hyphenated_tests_execute(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            (folder / 'test-stage7-fixture.py').write_text(
                'import unittest\nclass Checks(unittest.TestCase):\n'
                '    def test_real_execution(self): self.assertEqual(2+2,4)\n')
            with patch.object(stage7_tests, 'MODULES', ('test-stage7-fixture.py',)):
                suite = stage7_tests.load_suite(folder)
            result = unittest.TestResult()
            suite.run(result)
            self.assertEqual(result.testsRun, 1)
            self.assertTrue(result.wasSuccessful())

    def test_missing_empty_symlink_and_import_failure_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            path = folder / 'test-stage7-fixture.py'
            with patch.object(stage7_tests, 'MODULES', (path.name,)):
                with self.assertRaises(ValueError): stage7_tests.load_suite(folder)
                path.write_text('value = 1\n')
                with self.assertRaises(ValueError): stage7_tests.load_suite(folder)
                path.write_text('raise RuntimeError("broken import")\n')
                with self.assertRaises(RuntimeError): stage7_tests.load_suite(folder)
                path.unlink()
                path.symlink_to(folder / 'target.py')
                with self.assertRaises(ValueError): stage7_tests.load_suite(folder)

    def test_load_error_exits_blocked(self):
        with patch.object(stage7_tests, 'load_suite', side_effect=ValueError('missing')), \
             contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(stage7_tests.main(), 2)

    def test_failing_suite_never_returns_success(self):
        class Failing(unittest.TestCase):
            def runTest(self): self.fail('qualification failure')
        with patch.object(stage7_tests, 'load_suite', return_value=unittest.TestSuite([Failing()])), \
             contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(stage7_tests.main(), 1)


class RecoveryBundleLocation(unittest.TestCase):
    def setUp(self):
        path = Path(__file__).resolve().parents[1] / 'work/live-qualification/stage7-reconciled-evidence.py'
        spec = importlib.util.spec_from_file_location('bundle_location_tests', path)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)

    def test_exact_retained_bundle_resolves_after_move(self):
        with tempfile.TemporaryDirectory() as tmp:
            here = Path(tmp)
            bundle = here / self.module.EXPECTED_BUNDLE
            bundle.mkdir()
            artifact = bundle / 'events.recovered.jsonl'
            artifact.write_bytes(b'unchanged evidence\n')
            with patch.object(self.module, 'HERE', here):
                self.assertEqual(self.module.locate_bundle(self.module.LEGACY_HERE / bundle.name), bundle)
                self.assertEqual(self.module.locate_bundle(bundle), bundle)
            self.assertEqual(artifact.read_bytes(), b'unchanged evidence\n')

    def test_unknown_path_name_missing_bundle_and_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            here = Path(tmp)
            bundle = here / self.module.EXPECTED_BUNDLE
            with patch.object(self.module, 'HERE', here):
                for path in (self.module.LEGACY_HERE / bundle.name,
                             Path('/unreviewed') / bundle.name,
                             self.module.LEGACY_HERE / 'another-bundle'):
                    with self.subTest(path=path), self.assertRaises(RuntimeError):
                        self.module.locate_bundle(path)
                target = here / 'target'
                target.mkdir()
                bundle.symlink_to(target, target_is_directory=True)
                with self.assertRaises(RuntimeError): self.module.locate_bundle(bundle)

    def test_changed_report_hash_rejected_before_bundle_resolution(self):
        with tempfile.TemporaryDirectory() as tmp:
            report = Path(tmp) / 'report.json'
            report.write_bytes(b'{}\n')
            with patch.object(self.module, 'REPORT', report), \
                 patch.object(self.module, 'locate_bundle') as locate:
                with self.assertRaises(AssertionError): self.module.verify()
                locate.assert_not_called()
