"""Lifecycle hooks use only trusted synthetic Python pipe workers, no decoder."""
import io
from contextlib import redirect_stderr
import os
import signal
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from core import IngestError
import oracle


class OwnedTransportTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.started=[];self.finished=[]

    def call(self,code,*,source=None,destination=None,**kwargs):
        return oracle.decoder_process([sys.executable,'-c',code],
            source if source is not None else io.BytesIO(b'invented input'),
            destination if destination is not None else io.BytesIO(),self.root,
            on_start=kwargs.pop('on_start',self.started.append),
            on_finish=kwargs.pop('on_finish',self.finished.append),**kwargs)

    def assert_stopped(self):
        self.assertEqual(self.started,self.finished)
        self.assertTrue(all(process.poll() is not None for process in self.started))

    def test_observed_stream_success_and_scoped_environment(self):
        output=io.BytesIO()
        code='import os,sys;sys.stdout.buffer.write(os.environ["SENTINEL_TEST_ENV"].encode()+b":"+sys.stdin.buffer.read())'
        before=dict(os.environ)
        result=self.call(code,destination=output,environment={'SENTINEL_TEST_ENV':'invented'})
        self.assertEqual(result.returncode,0)
        self.assertEqual(output.getvalue(),b'invented:invented input')
        self.assertEqual(dict(os.environ),before)
        self.assert_stopped()
        self.assertEqual(os.getsid(self.started[0].pid) if self.started[0].poll() is None else None,None)

    def test_timeout_reaps_only_owned_process_group(self):
        unrelated=subprocess.Popen([sys.executable,'-c','import time;time.sleep(30)'])
        try:
            code='import signal,sys,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);sys.stdin.buffer.read();time.sleep(30)'
            with self.assertRaises(subprocess.TimeoutExpired):self.call(code,timeout=0.1)
            self.assert_stopped()
            self.assertIsNone(unrelated.poll())
        finally:
            unrelated.terminate();unrelated.wait(timeout=5)

    def test_start_callback_failure_and_cancellation_reap(self):
        for exception in (RuntimeError('invented callback failure'),KeyboardInterrupt()):
            with self.subTest(exception=type(exception).__name__):
                self.started.clear();self.finished.clear()
                def start(process):
                    self.started.append(process)
                    raise exception
                with self.assertRaises(type(exception)):
                    self.call('import time;time.sleep(30)',on_start=start)
                self.assert_stopped()

    def test_finish_callback_failure_is_not_success(self):
        def finish(process):
            self.finished.append(process)
            raise RuntimeError('invented finish callback failure')
        with self.assertRaises(RuntimeError):
            self.call('import sys;sys.stdin.buffer.read()',on_finish=finish)
        self.assert_stopped()

    def test_early_zero_exit_cannot_hide_an_incomplete_pipe(self):
        with self.assertRaisesRegex(IngestError,'oracle_pipe_transport_failed'):
            self.call('pass',source=io.BytesIO(b'x'*(4*1024**2)))
        self.assert_stopped()

    def test_source_read_failure_is_sanitized(self):
        class BrokenSource:
            def read(self,size):raise OSError('invented private source description')
        with self.assertRaisesRegex(IngestError,'^oracle_pipe_transport_failed$'):
            self.call('import sys;sys.stdin.buffer.read()',source=BrokenSource())
        self.assert_stopped()

    def test_default_transport_still_uses_existing_run_path(self):
        def echo(command,*,stdin,stdout,**kwargs):
            stdout.write(stdin.read())
            return subprocess.CompletedProcess(command,0)
        output=io.BytesIO()
        with patch.object(oracle.subprocess,'run',side_effect=echo),\
             patch.object(oracle.subprocess,'Popen',side_effect=AssertionError('default path changed')):
            result=oracle.decoder_process(['synthetic'],io.BytesIO(b'unchanged'),output,self.root)
        self.assertEqual(result.returncode,0)
        self.assertEqual(output.getvalue(),b'unchanged')

    def test_invalid_observed_transport_options_fail_before_start(self):
        for options in ({'timeout':0},{'timeout':True},{'timeout':float('nan')},{'on_start':False}):
            with self.subTest(options=options),self.assertRaises(IngestError):
                self.call('pass',**options)
        self.assertFalse(self.started)

    def test_guard_ingest_errors_in_feed_and_drain_are_sanitized_and_reaped(self):
        class GuardedSource:
            def read(self,size):raise IngestError('private source guard details')
        class GuardedDestination:
            def write(self,chunk):raise IngestError('private sink guard details')
        for source,destination in ((GuardedSource(),io.BytesIO()),
                                   (io.BytesIO(b'invented'),GuardedDestination())):
            self.started.clear();self.finished.clear();stderr=io.StringIO()
            with self.subTest(source=type(source).__name__),redirect_stderr(stderr), \
                 patch('threading.excepthook') as hook, \
                 self.assertRaisesRegex(IngestError,'^oracle_pipe_transport_failed$'):
                self.call('import sys;sys.stdin.buffer.read();sys.stdout.buffer.write(b"x")',
                    source=source,destination=destination)
            hook.assert_not_called();self.assertNotIn('private',stderr.getvalue())
            self.assertNotIn('Traceback',stderr.getvalue());self.assert_stopped()

    def test_unexpected_worker_exceptions_are_fixed_failures_not_zero_success(self):
        for exception in (RuntimeError,TypeError):
            class BrokenSource:
                def read(self,size):raise exception('private source marker')
            class BrokenDestination:
                def write(self,chunk):raise exception('private sink marker')
            for source,destination in ((BrokenSource(),io.BytesIO()),
                                       (io.BytesIO(b'invented'),BrokenDestination())):
                self.started.clear();self.finished.clear();stderr=io.StringIO()
                with self.subTest(error=exception.__name__,source=type(source).__name__), \
                     redirect_stderr(stderr),patch('threading.excepthook') as hook, \
                     self.assertRaisesRegex(IngestError,'^oracle_pipe_transport_failed$'):
                    self.call('import sys;sys.stdin.buffer.read();sys.stdout.buffer.write(b"x")',
                        source=source,destination=destination)
                hook.assert_not_called();self.assertNotIn('private',stderr.getvalue())
                self.assertNotIn('Traceback',stderr.getvalue());self.assert_stopped()

    @unittest.skipUnless(sys.platform.startswith('linux') and hasattr(os,'pidfd_open'),
                         'Linux owned process-group proof')
    def test_exited_leader_cleans_same_session_child_before_reaping(self):
        from reconstruct_resource import proc_identity
        pidfile=self.root/'invented-descendant.pid';descendant_fd=None;descendant=None
        unrelated=subprocess.Popen([sys.executable,'-c','import time;time.sleep(5)'],
            start_new_session=True)
        code=('import subprocess,sys,pathlib;'
              'child=subprocess.Popen([sys.executable,"-c","import time;time.sleep(5)"]);'
              'pathlib.Path('+repr(str(pidfile))+').write_text(str(child.pid));'
              'sys.stdin.buffer.read()')
        def start(process):
            nonlocal descendant_fd,descendant
            self.started.append(process);deadline=time.monotonic()+1
            while not pidfile.exists():
                if time.monotonic()>deadline:raise AssertionError('synthetic child not started')
                time.sleep(0.002)
            descendant=int(pidfile.read_text());descendant_fd=os.pidfd_open(descendant)
        started=time.monotonic()
        try:
            result=self.call(code,on_start=start,timeout=1)
            self.assertEqual(result.returncode,0);self.assert_stopped()
            self.assertLess(time.monotonic()-started,2)
            observed=proc_identity(descendant)
            self.assertTrue(observed is None or observed[1] in 'ZXx')
            self.assertIsNone(unrelated.poll())
        finally:
            if descendant_fd is not None:
                try:signal.pidfd_send_signal(descendant_fd,signal.SIGKILL)
                except ProcessLookupError:pass
                os.close(descendant_fd)
            unrelated.terminate();unrelated.wait(timeout=1)

    def test_owned_group_signal_precedes_reaping_and_never_follows_it(self):
        calls=[]
        raw=SimpleNamespace(pid=12345,returncode=None)
        def reap():
            self.assertEqual(calls,[('signal',12345,signal.SIGKILL)])
            calls.append(('reap',));raw.returncode=0;return 0
        raw.wait=reap;process=oracle.OwnedSessionProcess(raw)
        with patch.object(oracle.os,'waitid',return_value=SimpleNamespace(si_pid=raw.pid)), \
             patch.object(oracle.os,'killpg',side_effect=lambda pid,sig:calls.append(('signal',pid,sig))):
            self.assertEqual(process.wait(timeout=1),0)
            self.assertFalse(process.signal_owned_group(signal.SIGTERM))
            self.assertEqual(process.poll(),0)
        self.assertEqual(calls,[('signal',12345,signal.SIGKILL),('reap',)])


if __name__=='__main__':unittest.main()
