"""Qualification revision claims must describe the implementation being executed."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import qualify as module


@unittest.skipUnless(shutil.which('git'),'local Git is required for revision integrity regressions')
class RevisionWorkspace(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.checkout = self.root/'checkout'
        lab = self.checkout/'tools/evidence_lab'
        lab.mkdir(parents=True)
        original = Path(module.__file__).resolve()
        for path in original.parent.glob('*.py'):
            shutil.copyfile(path,lab/path.name)
        ios = self.checkout/'tools/ios_sysdiagnose'
        ios.mkdir()
        shutil.copyfile(original.parents[1]/'ios_sysdiagnose/ingest.py',ios/'ingest.py')
        self.module_path = lab/'qualify.py'
        # The outer test runner may deliberately use a relocated Git metadata
        # directory. Fixture commands must never inherit it or edit that index.
        self.git_env = {key:value for key,value in os.environ.items() if not key.startswith('GIT_')}
        self.git(self.checkout,'init','-q')
        self.git(self.checkout,'add','tools')
        self.git(self.checkout,'-c','user.name=Synthetic Test','-c','user.email=test@example.invalid',
                 'commit','-qm','Synthetic copied implementation')

    def git(self,checkout,*args):
        return subprocess.run(['git','-C',str(checkout),*args],env=self.git_env,
                              capture_output=True,text=True,check=True,timeout=10).stdout.strip()

    def report(self,git_checkout):
        variables={'GIT_DIR':str(git_checkout/'.git'),'GIT_WORK_TREE':str(git_checkout)}
        with patch.object(module,'__file__',str(self.module_path)),patch.dict(os.environ,variables):
            return module.qualify(self.root/'missing-capture',self.root/'qualification',
                                  dataset_id='synthetic revision-integrity check')

    def test_unrelated_git_environment_cannot_pin_the_suite(self):
        unrelated=self.root/'unrelated'
        unrelated.mkdir()
        self.git(unrelated,'init','-q')
        self.git(unrelated,'-c','user.name=Synthetic Test','-c','user.email=test@example.invalid',
                 'commit','--allow-empty','-qm','Unrelated synthetic repository')
        report=self.report(unrelated)
        self.assertEqual(report['code_revision_status'],'workspace_mismatch')
        self.assertFalse(report['code_matches_revision'])
        self.assertNotEqual(report['status'],'GOAL_PASS')

    def test_assume_unchanged_cannot_hide_implementation_mismatch(self):
        relative='tools/evidence_lab/core.py'
        self.git(self.checkout,'update-index','--assume-unchanged',relative)
        with (self.checkout/relative).open('a') as stream:
            stream.write('\n# Synthetic local implementation change.\n')
        self.assertEqual(self.git(self.checkout,'status','--porcelain'),'')
        report=self.report(self.checkout)
        self.assertEqual(report['code_revision_status'],'implementation_mismatch')
        self.assertFalse(report['code_matches_revision'])
        self.assertNotEqual(report['status'],'GOAL_PASS')

    def test_same_root_clean_matching_implementation_is_pinned(self):
        report=self.report(self.checkout)
        self.assertEqual(report['code_revision_status'],'git')
        self.assertEqual(report['code_commit'],self.git(self.checkout,'rev-parse','HEAD'))
        self.assertIs(report['code_dirty'],False)
        self.assertTrue(report['code_matches_revision'])

    def test_code_changed_after_pinning_cannot_pass_reproducible_runs(self):
        source=self.root/'fixture.pcap'
        module.generate(source,3)
        original=module.measured_process
        changed=[False]
        def change_then_run(*args,**kwargs):
            if not changed[0]:
                with (self.module_path.parent/'core.py').open('a') as stream:
                    stream.write('\n# Synthetic change after provenance check.\n')
                changed[0]=True
            return original(*args,**kwargs)
        variables={'GIT_DIR':str(self.checkout/'.git'),'GIT_WORK_TREE':str(self.checkout)}
        with patch.object(module,'__file__',str(self.module_path)),patch.dict(os.environ,variables),patch.object(module,'capinfos_count',return_value=None),patch.object(module,'measured_process',side_effect=change_then_run):
            report=module.qualify(source,self.root/'qualification',profile='synthetic',expected_packets=3,min_free_bytes=0)
        self.assertEqual(report['status'],'FAILED')
        self.assertTrue(report['code_matches_revision'])
        self.assertTrue(report['checks']['reproducible_records'])
        self.assertTrue(report['checks']['reproducible_minimized_export'])
        self.assertFalse(report['checks']['implementation_unchanged'])


if __name__=='__main__': unittest.main()
