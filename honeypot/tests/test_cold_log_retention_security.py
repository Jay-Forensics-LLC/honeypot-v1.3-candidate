"""Offline regressions: privileged cold-log reads never follow changed names."""
import gzip
import contextlib
import importlib.util
import os
from pathlib import Path
import tempfile
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
spec = importlib.util.spec_from_file_location('cold_retention', ROOT/'scripts/cold-log-retention.py')
cold = importlib.util.module_from_spec(spec); spec.loader.exec_module(cold)


class ColdLogSecurity(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.logs = self.root/'logs'; self.logs.mkdir()
        self.state = self.root/'state'; self.state.mkdir(mode=0o700)
        self.log = self.logs/'cowrie.json.2026-10-15'; self.log.write_bytes(b'original cold log\n')
        self.victim = self.root/'simulated-root-secret'; self.victim.write_bytes(b'SYNTHETIC SECRET\n')
        self.victim.chmod(0o600)

    def test_regular_compression_retains_original_and_publishes_exact_bytes(self):
        original = self.log.read_bytes()
        self.assertEqual(cold.compress_log(self.log, self.log.lstat(), self.state), 'compressed_source_retained')
        self.assertEqual(self.log.read_bytes(), original)
        self.assertEqual(gzip.decompress(self.log.with_name(self.log.name+'.gz').read_bytes()), original)

    def test_symlink_swap_at_open_does_not_read_victim_or_publish(self):
        before = self.log.lstat(); opened = cold.os.open
        def race(path, flags, *args, **kwargs):
            if Path(path) == self.log:
                self.log.unlink(); self.log.symlink_to(self.victim)
            return opened(path, flags, *args, **kwargs)
        original = self.victim.read_bytes()
        with patch.object(cold.os, 'open', race), self.assertRaises(OSError):
            cold.compress_log(self.log, before, self.state)
        self.assertEqual(self.victim.read_bytes(), original)
        self.assertFalse(self.log.with_name(self.log.name+'.gz').exists())

    def test_replaced_regular_file_and_fifo_or_hardlink_are_rejected(self):
        before = self.log.lstat(); self.log.unlink(); self.log.write_bytes(b'new replacement')
        with self.assertRaises(ValueError): cold.compress_log(self.log, before, self.state)
        self.log.unlink(); os.mkfifo(self.log)
        with self.assertRaises(ValueError): cold.compress_log(self.log, self.log.lstat(), self.state)
        self.log.unlink(); os.link(self.victim, self.log)
        with self.assertRaises(ValueError): cold.compress_log(self.log, self.log.lstat(), self.state)

    def test_replacement_after_open_is_preserved_without_publication(self):
        before = self.log.lstat(); copy = cold._copy_pinned
        def race(source, destination, size):
            self.log.unlink(); self.log.symlink_to(self.victim)
            return copy(source, destination, size)
        with patch.object(cold, '_copy_pinned', race), self.assertRaises(ValueError):
            cold.compress_log(self.log, before, self.state)
        self.assertTrue(self.log.is_symlink())
        self.assertFalse(self.log.with_name(self.log.name+'.gz').exists())
        self.assertEqual(self.victim.read_bytes(), b'SYNTHETIC SECRET\n')

    def test_continuous_appender_cannot_extend_pinned_compression_read(self):
        before = self.log.lstat(); opened = cold.os.fdopen; reads = []
        @contextlib.contextmanager
        def growing_reader(fd, *args, **kwargs):
            with opened(fd, *args, **kwargs) as source:
                class Reader:
                    def read(inner, count):
                        reads.append(count)
                        if len(reads) > 1:
                            raise AssertionError('Compression read followed a growing EOF')
                        chunk = source.read(count)
                        with self.log.open('ab') as writer: writer.write(b'concurrent growth')
                        return chunk
                yield Reader()
        with patch.object(cold.os, 'fdopen', growing_reader), self.assertRaises(ValueError):
            cold.compress_log(self.log, before, self.state)
        self.assertEqual(reads, [before.st_size])
        self.assertFalse(self.log.with_name(self.log.name+'.gz').exists())

    def test_existing_destination_and_unprotected_staging_are_preserved(self):
        destination = self.log.with_name(self.log.name+'.gz'); destination.symlink_to(self.victim)
        with self.assertRaises(FileExistsError): cold.compress_log(self.log, self.log.lstat(), self.state)
        self.assertEqual(self.victim.read_bytes(), b'SYNTHETIC SECRET\n')
        self.state.chmod(0o777)
        with self.assertRaises(ValueError): cold.compress_log(self.log, self.log.lstat(), self.state)


if __name__ == '__main__':
    unittest.main()
