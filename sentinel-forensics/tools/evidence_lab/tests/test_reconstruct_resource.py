"""Strict resource metadata and owned-child isolation; no evidence or decoder."""
import errno
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from core import IngestError
import reconstruct_resource as probe
from oracle import OwnedSessionProcess

class SamplerTransitionTests(unittest.TestCase):
    def sample(self, identities, snapshots, *, pauses=None):
        identities = iter(identities); snapshots = iter(snapshots)
        return probe.measured_process_rss(123,identity=lambda _:next(identities),
            status=lambda _:next(snapshots),pause=(pauses.append if pauses is not None else lambda _:None),
            check=lambda:None)

    def test_running_without_rss_then_explicit_zombie_is_terminal(self):
        pauses = []
        result = self.sample([(7,'R'),(7,'R'),(7,'Z')],
                             [('R',None,0),('R',None,0)],pauses=pauses)
        self.assertIsNone(result[0])
        self.assertEqual(pauses,[probe.STATUS_RETRY_SECONDS])

    def test_missing_rss_must_recover_a_real_live_measurement(self):
        result = self.sample([(7,'R'),(7,'R'),(7,'R')],
                             [('R',None,0),('R',4096,1)])
        self.assertEqual(result,(4096,(7,'R')))

    def test_persistent_live_missing_rss_fails_with_fixed_diagnostics(self):
        with self.assertRaises(probe.ResourceSamplingFailure) as caught:
            self.sample([(7,'R')]*4,[('R',None,0)]*3)
        self.assertEqual(caught.exception.details,{
            'code':'live_process_memory_unavailable','stage':'status',
            'exception_type':'ResourceSamplingFailure','errno':None,'state':'R','rss_field_count':0,
            'attempts':3})

    def test_positive_disappearance_or_old_identity_exit_is_terminal(self):
        for final in (None,(8,'R'),(7,'X')):
            with self.subTest(final=final):
                result = self.sample([(7,'R'),final],[('R',None,0)])
                self.assertIsNone(result[0])

    def test_permission_and_other_live_io_failure_are_never_disappearance(self):
        for error in (PermissionError(errno.EACCES,'private path must not be saved'),
                      OSError(errno.EIO,'private bytes must not be saved')):
            def unreadable(_):
                raise probe.ResourceSamplingFailure('process_status_unavailable','status',exception=error)
            with self.subTest(errno=error.errno),self.assertRaises(probe.ResourceSamplingFailure) as caught:
                probe.measured_process_rss(123,identity=lambda _:(7,'R'),status=unreadable,
                    pause=lambda _:None,check=lambda:None)
            self.assertEqual(caught.exception.details['errno'],error.errno)
            self.assertNotIn('private',json.dumps(caught.exception.details))

    def test_missing_status_does_not_become_zero_for_surviving_identity(self):
        with self.assertRaisesRegex(probe.ResourceSamplingFailure,'live_process_memory_unavailable'):
            self.sample([(7,'R')]*4,[None]*3)

    def test_retry_respects_the_existing_global_guard(self):
        def expired():
            raise IngestError('total_time_budget_exceeded')
        with self.assertRaisesRegex(IngestError,'total_time_budget_exceeded'):
            probe.measured_process_rss(123,identity=lambda _:(7,'R'),status=lambda _:('R',None,0),
                pause=lambda _:None,check=expired)

    def test_status_parser_rejects_missing_duplicate_malformed_and_bad_units(self):
        for raw in ('State:\n','State:\tR\nState:\tS\n',
                    'State:\tR\nVmRSS:\t1 kB\nVmRSS:\t2 kB\n',
                    'State:\tR\nVmRSS:\t1 MB\n','State:\tR\nVmRSS:\t-1 kB\n'):
            with self.subTest(raw=raw),patch.object(Path,'open',return_value=io.StringIO(raw)),\
                 self.assertRaisesRegex(probe.ResourceSamplingFailure,'process_status_fields_invalid'):
                probe.proc_status(123)
        with patch.object(Path,'open',return_value=io.StringIO('State:\tR (running)\nVmRSS:\t4 kB\n')):
            self.assertEqual(probe.proc_status(123),('R',4096,1))
        with patch.object(Path,'open',return_value=io.StringIO('State:\tR (running)\n')):
            self.assertEqual(probe.proc_status(123),('R',None,0))

    def test_actual_presence_checks_never_hide_permissions_or_live_io_errors(self):
        for error in (PermissionError(errno.EACCES,'do not persist this path'),
                      OSError(errno.EIO,'do not persist these bytes')):
            with self.subTest(errno=error.errno),patch.object(Path,'stat',side_effect=error),\
                 self.assertRaises(probe.ResourceSamplingFailure) as caught:
                probe.proc_absent(123)
            self.assertEqual(caught.exception.details['errno'],error.errno)
            self.assertNotIn('do not persist',json.dumps(caught.exception.details))
        with patch.object(Path,'stat',side_effect=FileNotFoundError(errno.ENOENT,'gone')):
            self.assertTrue(probe.proc_absent(123))
        with patch.object(Path,'stat',side_effect=ProcessLookupError(errno.ESRCH,'gone')):
            self.assertTrue(probe.proc_absent(123))

    def test_live_status_permission_failure_is_fixed_and_disappearance_is_positive(self):
        error = PermissionError(errno.EACCES,'private resource path')
        with patch.object(Path,'open',side_effect=error),self.assertRaises(probe.ResourceSamplingFailure) as caught:
            probe.proc_status(123)
        self.assertEqual(caught.exception.details['exception_type'],'PermissionError')
        self.assertEqual(caught.exception.details['errno'],errno.EACCES)
        error = FileNotFoundError(errno.ENOENT,'gone')
        with patch.object(Path,'open',side_effect=error),\
             patch.object(Path,'stat',side_effect=error):
            self.assertIsNone(probe.proc_status(123))

class RegisteredChildBudgetTests(unittest.TestCase):
    def budget(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        limits = {'timeout_seconds':10,'decoder_seconds':5,
                  'rss_bytes':536870912,'scratch_bytes':67108864}
        return probe.Budget(Path(temporary.name),limits)

    def test_sampling_includes_registered_roots_without_crawling_unrelated_jobs(self):
        budget = self.budget()
        process = SimpleNamespace(pid=12345,signal_owned_group=lambda sig:False)
        budget.register(process)
        try:
            with patch.object(probe,'tree_rss',return_value=1024) as sample, \
                 patch.object(budget,'scratch',return_value=65536):
                budget.sample()
            values = sample.call_args.kwargs
            self.assertEqual(set(values['roots']),{os.getpid(),12345})
            self.assertEqual(values['skip_children_of'],{os.getpid()})
        finally:
            budget.unregister(process)
        self.assertEqual(budget.processes,{})

    @unittest.skipUnless(sys.platform.startswith('linux'),'isolated process-group test requires Linux')
    def test_stopping_registered_child_leaves_unrelated_child_running(self):
        budget = self.budget()
        children = []
        try:
            for _ in range(2):
                children.append(subprocess.Popen([sys.executable,'-c','import time; time.sleep(30)'],
                    stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
                    start_new_session=True))
            owned,unrelated = OwnedSessionProcess(children[0]),children[1]
            budget.register(owned)
            budget.stop()
            owned.wait(timeout=5)
            self.assertIsNotNone(owned.returncode)
            self.assertIsNone(unrelated.poll())
            budget.unregister(owned)
        finally:
            for child in children:
                if child.poll() is None:child.terminate()
                try:child.wait(timeout=5)
                except subprocess.TimeoutExpired:child.kill();child.wait(timeout=5)
            for child in children:budget.unregister(child)
        self.assertTrue(all(child.poll() is not None for child in children))

    def test_resource_deadlines_memory_and_scratch_fail_without_gate_relaxation(self):
        with patch.object(probe.resource,'getrusage',return_value=SimpleNamespace(ru_maxrss=1)):
            budget = self.budget();budget.started -= 11
            with self.assertRaisesRegex(IngestError,'tls_total_time_budget'):budget.guard()
            budget = self.budget();budget.decoder_deadline = time.monotonic()-1
            with self.assertRaisesRegex(IngestError,'tls_decoder_time_budget'):budget.guard()
            budget.decoder_deadline = None
            with self.assertRaisesRegex(IngestError,'tls_decoder_time_budget'):budget.guard()
        budget = self.budget()
        with patch.object(probe.resource,'getrusage',return_value=SimpleNamespace(ru_maxrss=524289)), \
             self.assertRaisesRegex(IngestError,'tls_own_memory_budget'):
            budget.guard()
        budget = self.budget()
        with patch.object(probe,'tree_rss',return_value=1024), \
             patch.object(budget,'scratch',return_value=67108865), \
             self.assertRaisesRegex(IngestError,'tls_scratch_budget'):
            budget.sample()


class OwnedCompletionTests(unittest.TestCase):
    """Inject status snapshots; completion is an exact-handle proof, not RSS."""
    budget=RegisteredChildBudgetTests.budget
    def setup_completion(self):
        budget=self.budget()
        process=SimpleNamespace(pid=12345,returncode=0,wait=lambda timeout:0,
                                signal_owned_group=lambda sig:False)
        with patch.object(probe,'proc_identity',return_value=(7,'R')):
            budget.register(process)
        return budget,process,dict(budget.processes),dict(budget.process_identities)

    def confirm(self,budget,processes,identities,*,pid=12345,first=(7,'R'),deadline=None):
        failure=probe.ResourceSamplingFailure('live_process_memory_unavailable','status',
            state='R',rss_fields=0,attempts=3)
        return budget.confirm_owned_completion(pid,first,failure,processes,identities,
            time.monotonic()+probe.SAMPLE_SECONDS if deadline is None else deadline)

    def absent_group(self):
        return patch.object(probe.os,'killpg',side_effect=ProcessLookupError(errno.ESRCH,'gone'))

    def test_exact_reaped_child_retains_original_failed_reads_and_lifetime_gate(self):
        budget,process,processes,identities=self.setup_completion()
        with patch.object(probe,'proc_identity',return_value=None),self.absent_group(), \
             patch.object(budget,'lifetime_memory_gate',wraps=budget.lifetime_memory_gate) as lifetime:
            callback=lambda pid,first,failure:budget.confirm_owned_completion(
                pid,first,failure,processes,identities,time.monotonic()+probe.SAMPLE_SECONDS)
            rss,first=probe.measured_process_rss(process.pid,identity=lambda _:(7,'R'),
                status=lambda _:('R',None,0),pause=lambda _:None,confirm_terminal=callback)
        self.assertIsNone(rss);self.assertEqual(first,(7,'R'));lifetime.assert_called_once()
        self.assertEqual(budget.completion_details[0]['attempts'],3)
        self.assertEqual(budget.completion_details[0]['code'],'live_process_memory_unavailable')
        self.assertEqual(budget.completion_details[0]['confirmation'],
                         'original_child_reaped_and_group_absent')

    def test_handle_snapshot_survives_unregister_race(self):
        budget,process,processes,identities=self.setup_completion()
        budget.unregister(process)
        with patch.object(probe,'proc_identity',return_value=None),self.absent_group():
            self.assertTrue(self.confirm(budget,processes,identities))
        self.assertFalse(budget.processes)

    def test_unknown_self_and_changed_registration_identity_never_wait(self):
        budget,process,processes,identities=self.setup_completion()
        process.wait=lambda timeout:self.fail('unbound identity must not wait')
        for pid,first in ((os.getpid(),(7,'R')),(54321,(7,'R')),(process.pid,(8,'R'))):
            with self.subTest(pid=pid,first=first):
                self.assertFalse(self.confirm(budget,processes,identities,pid=pid,first=first))
        self.assertFalse(budget.completion_details)

    def test_persistent_live_timeout_keeps_failure_and_single_interval(self):
        budget,process,processes,identities=self.setup_completion();timeouts=[]
        def waiting(timeout):
            timeouts.append(timeout);raise subprocess.TimeoutExpired('invented',timeout)
        process.wait=waiting
        self.assertFalse(self.confirm(budget,processes,identities))
        self.assertTrue(0<timeouts[0]<=probe.SAMPLE_SECONDS)
        self.assertEqual(budget.completion_details[0]['confirmation'],'still_live')

    def test_postwait_live_identity_or_owned_group_is_not_terminal_proof(self):
        for current,group in (((7,'R'),True),(None,False)):
            budget,process,processes,identities=self.setup_completion()
            with self.subTest(identity=current),patch.object(probe,'proc_identity',return_value=current), \
                 patch.object(probe.os,'killpg',return_value=None) as group_probe:
                self.assertFalse(self.confirm(budget,processes,identities))
                if group:group_probe.assert_not_called()

    def test_group_permissions_remain_sanitized_failure(self):
        budget,process,processes,identities=self.setup_completion()
        with patch.object(probe,'proc_identity',return_value=None), \
             patch.object(probe.os,'killpg',side_effect=PermissionError(errno.EPERM,'private data')), \
             self.assertRaises(probe.ResourceSamplingFailure) as caught:
            self.confirm(budget,processes,identities)
        self.assertEqual(caught.exception.details['errno'],errno.EPERM)
        self.assertNotIn('private',json.dumps(caught.exception.details))

    def test_total_deadline_and_reaped_lifetime_peak_still_reject(self):
        budget,process,processes,identities=self.setup_completion()
        budget.started-=11
        with self.assertRaisesRegex(IngestError,'tls_total_time_budget'):
            self.confirm(budget,processes,identities)
        budget,process,processes,identities=self.setup_completion()
        with patch.object(probe,'proc_identity',return_value=None),self.absent_group(), \
             patch.object(probe.resource,'getrusage',return_value=SimpleNamespace(ru_maxrss=300000)), \
             self.assertRaisesRegex(IngestError,'tls_conservative_lifetime_memory_budget'):
            self.confirm(budget,processes,identities)

    def test_completion_cannot_overrun_sample_deadline(self):
        budget,process,processes,identities=self.setup_completion()
        with patch.object(probe.time,'monotonic',side_effect=[10,10.02,10.03,10.1]):
            self.assertFalse(self.confirm(budget,processes,identities,deadline=10.05))
        self.assertEqual(budget.completion_details[0]['confirmation'],'interval_expired')

    def test_second_decoder_registration_is_rejected(self):
        budget,process,processes,identities=self.setup_completion()
        with patch.object(probe,'proc_identity',return_value=(8,'R')), \
             self.assertRaisesRegex(IngestError,'tls_decoder_already_registered'):
            budget.register(SimpleNamespace(pid=54321,signal_owned_group=lambda sig:False))

    @unittest.skipUnless(sys.platform.startswith('linux'),'Linux owned process proof')
    def test_real_owned_reaping_with_concurrent_wait_and_unregister(self):
        budget=self.budget();children=[];waiter=None
        try:
            for seconds in (0.005,1):
                children.append(subprocess.Popen([sys.executable,'-c',
                    'import time;time.sleep('+str(seconds)+')'],
                    stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,start_new_session=True))
            owned,unrelated=OwnedSessionProcess(children[0]),children[1]
            budget.register(owned)
            processes=dict(budget.processes);identities=dict(budget.process_identities)
            self.assertIsNotNone(identities[owned.pid])
            def reap():
                owned.wait(timeout=1);budget.unregister(owned)
            waiter=threading.Thread(target=reap);waiter.start()
            self.assertTrue(self.confirm(budget,processes,identities,pid=owned.pid,
                first=identities[owned.pid]))
            waiter.join(timeout=1);self.assertFalse(waiter.is_alive())
            self.assertIsNone(unrelated.poll());self.assertFalse(budget.processes)
            self.assertEqual(budget.completion_details[0]['confirmation'],
                             'original_child_reaped_and_group_absent')
        finally:
            for child in children:
                if child.poll() is None:child.terminate()
                try:child.wait(timeout=1)
                except subprocess.TimeoutExpired:child.kill();child.wait(timeout=1)
            if waiter is not None:waiter.join(timeout=1)


if __name__=='__main__':unittest.main(verbosity=2)
