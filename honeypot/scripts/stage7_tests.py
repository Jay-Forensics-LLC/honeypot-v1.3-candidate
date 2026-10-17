#!/usr/bin/env python3
"""Run retained Stage 7 offline tests explicitly; never run a live qualification."""
import importlib.util
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
MODULES = (
    'test-stage7-evidence-durability.py',
    'test-stage7-evidence-integrity-sweep.py',
    'test-stage7-live-remediation.py',
    'test-stage7-network-restart.py',
    'test-stage7-recovery-record-verifier.py',
    'test-stage7-restart-resilience.py',
    'test-stage7-runtime-drift-diagnosis.py',
)


def load_suite(folder):
    unavailable = [folder / name for name in MODULES
                   if (folder / name).is_symlink() or not (folder / name).is_file()]
    if unavailable:
        raise ValueError('Required retained Stage 7 tests absent or symlink:\n' +
                         '\n'.join(str(path) for path in unavailable))
    suite = unittest.TestSuite()
    for name in MODULES:
        path = folder / name
        spec = importlib.util.spec_from_file_location(name[:-3].replace('-', '_'), path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        tests = unittest.defaultTestLoader.loadTestsFromModule(module)
        if not tests.countTestCases():
            raise ValueError('Required Stage 7 module contains no tests: ' + str(path))
        suite.addTests(tests)
    return suite


def main():
    try:
        suite = load_suite(ROOT / 'work/live-qualification')
    except Exception as exc:
        print('Stage 7 offline tests BLOCKED: ' + str(exc), file=sys.stderr)
        return 2
    print(f'Stage 7 offline: {len(MODULES)} modules, {suite.countTestCases()} tests', flush=True)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    print('Live Stage 7/8 qualification: NOT TESTED; gates remain BLOCKED', flush=True)
    return 0 if result.wasSuccessful() and result.testsRun else 1


if __name__ == '__main__':
    sys.exit(main())
