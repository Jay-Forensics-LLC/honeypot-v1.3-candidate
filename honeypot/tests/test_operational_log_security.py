"""Privileged operational writers must not follow less-trusted log aliases."""
import json
import fcntl
import hashlib
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import hp_common


class OperationalLogSecurity(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.protected = self.root / 'synthetic-protected.txt'
        self.protected.write_text('SYNTHETIC protected bytes\n')
        self.original = self.protected.read_bytes()

    def test_append_and_rotation_preserve_expected_json_and_private_mode(self):
        log = self.root / 'logs/system/audit.jsonl'
        hp_common.append_json(log, {'first': True})
        self.assertEqual(json.loads(log.read_text()), {'first': True})
        self.assertFalse(log.stat().st_mode & 0o007)
        with log.open('ab') as stream:
            stream.truncate(20 * 1024**2 + 1)
        hp_common.append_json(log, {'second': True}, rotate=True)
        self.assertEqual(json.loads(log.read_text()), {'second': True})
        self.assertEqual(Path(str(log) + '.1').stat().st_size, 20 * 1024**2 + 1)

    def test_existing_file_symlink_cannot_append_to_protected_target(self):
        log = self.root / 'audit.jsonl'; log.symlink_to(self.protected)
        with self.assertRaises((ValueError, OSError)):
            hp_common.append_json(log, {'untrusted': 'input'}, rotate=True)
        self.assertEqual(self.protected.read_bytes(), self.original)

    def test_existing_hardlink_cannot_append_to_protected_target(self):
        log = self.root / 'audit.jsonl'; os.link(self.protected, log)
        with self.assertRaises(ValueError):
            hp_common.append_json(log, {'untrusted': 'input'})
        self.assertEqual(self.protected.read_bytes(), self.original)

    def test_ancestor_symlink_cannot_create_or_write_outside_log_tree(self):
        linked = self.root / 'logs'; linked.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(OSError):
            hp_common.append_json(linked / 'new-directory/audit.jsonl', {'untrusted': 'input'})
        self.assertFalse((self.root / 'new-directory').exists())

    def test_swap_after_inspection_is_rejected_without_following_link(self):
        log = self.root / 'audit.jsonl'; log.write_text('original log\n')
        opened = hp_common.os.open
        def swap(name, flags, *args, **kwargs):
            if name == 'audit.jsonl' and flags & os.O_APPEND:
                log.unlink(); log.symlink_to(self.protected)
            return opened(name, flags, *args, **kwargs)
        with patch.object(hp_common.os, 'open', side_effect=swap):
            with self.assertRaises(OSError):
                hp_common.append_json(log, {'untrusted': 'input'})
        self.assertEqual(self.protected.read_bytes(), self.original)

    def test_nonregular_log_and_rotated_symlink_are_rejected(self):
        fifo = self.root / 'audit.jsonl'; os.mkfifo(fifo)
        with self.assertRaises(ValueError):
            hp_common.append_json(fifo, {'untrusted': 'input'})
        fifo.unlink()
        with fifo.open('wb') as stream:
            stream.truncate(20 * 1024**2 + 1)
        Path(str(fifo) + '.1').symlink_to(self.protected)
        with self.assertRaises(ValueError):
            hp_common.append_json(fifo, {'untrusted': 'input'}, rotate=True)
        self.assertEqual(self.protected.read_bytes(), self.original)

    def test_overlapping_rotations_preserve_original_and_both_records(self):
        log = self.root / 'audit.jsonl'
        with log.open('wb') as stream:
            stream.write(b'SYNTHETIC original operational log\n')
            stream.truncate(20 * 1024**2 + 1)
        digest = hashlib.sha256(log.read_bytes()).hexdigest()
        original_regular, original_flock = hp_common._log_regular, fcntl.flock
        paused, contender, release = threading.Event(), threading.Event(), threading.Event()
        calls, errors = {}, []

        def regular(parent, name):
            thread = threading.current_thread().name
            calls[thread] = calls.get(thread, 0) + 1
            # Before the fix both writers could finish the archive-shift loop
            # before either moved the active log. The stale writer then lost
            # the newly retained .1 archive. Pause at exactly that boundary.
            if thread == 'stale-writer' and name == log.name + '.1' and calls[thread] == 11:
                paused.set()
                if not release.wait(5):
                    raise RuntimeError('Rotation test rendezvous timed out')
            return original_regular(parent, name)

        def lock(fd, operation):
            if threading.current_thread().name == 'contending-writer' and operation & fcntl.LOCK_EX:
                contender.set()
            return original_flock(fd, operation)

        def writer(name):
            try:
                hp_common.append_json(log, {'writer': name}, rotate=True)
            except BaseException as error:
                errors.append(error)
            finally:
                if name == 'contending':
                    # Also reaches the rendezvous on the unfixed implementation,
                    # which returns without taking a directory lock.
                    contender.set()

        with patch.object(hp_common, '_log_regular', side_effect=regular), \
             patch.object(fcntl, 'flock', side_effect=lock):
            stale = threading.Thread(target=writer, args=('stale',), name='stale-writer')
            fresh = threading.Thread(target=writer, args=('contending',), name='contending-writer')
            stale.start()
            try:
                self.assertTrue(paused.wait(5))
                fresh.start()
                self.assertTrue(contender.wait(5))
            finally:
                release.set(); stale.join(5)
                if fresh.ident is not None:
                    fresh.join(5)
            self.assertFalse(stale.is_alive()); self.assertFalse(fresh.is_alive())
        self.assertEqual(errors, [])
        self.assertEqual(hashlib.sha256(Path(str(log) + '.1').read_bytes()).hexdigest(), digest)
        self.assertEqual({json.loads(line)['writer'] for line in log.read_text().splitlines()},
                         {'stale', 'contending'})

    def test_held_directory_lock_times_out_before_creating_or_writing_log(self):
        held = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY)
        log = self.root / 'audit.jsonl'
        try:
            fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with patch.object(hp_common, '_LOG_LOCK_TIMEOUT', 0.02), \
                 patch.object(hp_common.time, 'monotonic', side_effect=[10.0, 10.03]), \
                 self.assertRaisesRegex(TimeoutError, 'lock deadline'):
                hp_common.append_json(log, {'blocked': True})
            self.assertFalse(log.exists())
        finally:
            os.close(held)
        hp_common.append_json(log, {'after_release': True})
        self.assertEqual(json.loads(log.read_text()), {'after_release': True})


if __name__ == '__main__':
    unittest.main()
