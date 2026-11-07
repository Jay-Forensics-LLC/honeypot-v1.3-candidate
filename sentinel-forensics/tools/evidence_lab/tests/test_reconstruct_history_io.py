"""Invented file/directory lifetimes only; no capture, key or decoder input."""
import errno
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from core import IngestError
import reconstruct_history_io as io


@unittest.skipUnless(hasattr(os, 'O_PATH'), 'history descriptors require Linux')
class FamilyFilesTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.family = self.root / 'family'
        self.family.mkdir()
        self.page = self.family / 'page-1'
        self.page.mkdir()
        (self.page / 'manifest.json').write_bytes(b'invented sealed bytes')
        (self.page / 'SHA256SUMS').write_bytes(b'invented ledger')
        self.files = io.FamilyFiles(self.family)
        self.addCleanup(self.files.close)
        self.files.register_page('page-1')

    def descriptors(self):
        return len(os.listdir('/proc/self/fd'))

    def test_regular_stream_inventory_and_allowed_family_growth(self):
        export = self.page / 'export'
        export.mkdir()
        (export / 'observations.jsonl').write_bytes(b'invented observation')
        expected = {'manifest.json', 'export/observations.jsonl'}
        self.assertEqual(self.files.inventory(self.page, {'export'}), expected)
        self.assertEqual(self.files.inventory(self.page, {'export'}), expected)
        with self.files.stream(export / 'observations.jsonl') as (stream, initial):
            self.assertEqual(stream.read(), b'invented observation')
            self.assertEqual(initial.st_nlink, 1)
        (self.family / 'new-authorized-output').mkdir()
        self.files.check()  # Family mtime is allowed to change.

    def test_top_level_ledger_only_is_excluded(self):
        (self.page / 'export').mkdir()
        (self.page / 'export/SHA256SUMS').write_bytes(b'unsealed nested ledger')
        self.assertEqual(self.files.inventory(self.page, {'export'}),
                         {'manifest.json', 'export/SHA256SUMS'})

    def test_family_and_page_symlinks_are_never_followed(self):
        alias = self.root / 'alias'
        alias.symlink_to(self.family, target_is_directory=True)
        with self.assertRaises(IngestError):
            io.FamilyFiles(alias)
        (self.family / 'page-alias').symlink_to(self.page, target_is_directory=True)
        before = self.descriptors()
        with self.assertRaises(IngestError):
            self.files.register_page('page-alias')
        self.assertEqual(self.descriptors(), before)
        with self.assertRaises(IngestError):
            io.FamilyFiles(Path('/' + str(self.family)))

    def test_constructor_and_registration_guard_failure_close_all_new_anchors(self):
        before = self.descriptors()
        calls = 0
        def cancelled():
            nonlocal calls
            calls += 1
            if calls == 2:
                raise KeyboardInterrupt()
        with self.assertRaises(KeyboardInterrupt):
            io.FamilyFiles(self.family, cancelled)
        self.assertEqual(self.descriptors(), before)
        (self.family / 'page-2').mkdir()
        def reject_new_anchor():
            if len(self.files._pages) > 1:
                raise IngestError('invented guard failure')
        self.files.guard = reject_new_anchor
        with self.assertRaises(IngestError):
            self.files.register_page('page-2')
        self.assertEqual(self.descriptors(), before)
        self.files.guard = lambda: None
        self.files.register_page('page-2')
        self.files.check()

    def test_replaced_family_or_registered_page_is_rejected(self):
        saved = self.family / 'original-page'
        self.page.rename(saved)
        self.page.mkdir()
        with self.assertRaises(IngestError):
            self.files.check()
        self.page.rmdir()
        saved.rename(self.page)
        self.files.check()
        original = self.root / 'original-family'
        self.family.rename(original)
        self.family.mkdir()
        with self.assertRaises(IngestError):
            self.files.check()

    def test_member_symlink_and_hardlink_are_rejected(self):
        outside = self.root / 'unrelated'
        outside.write_bytes(b'outside must stay private')
        (self.page / 'linked').symlink_to(outside)
        os.link(outside, self.page / 'hardlinked')
        for name in ('linked', 'hardlinked'):
            before = self.descriptors()
            with self.subTest(name=name), self.assertRaises(IngestError):
                with self.files.stream(self.page / name):
                    self.fail('untrusted member was yielded')
            self.assertEqual(self.descriptors(), before)

    def test_regular_file_changed_or_hardlinked_during_read_is_rejected(self):
        member = self.page / 'manifest.json'
        for mode in ('modify', 'hardlink'):
            with self.subTest(mode=mode), self.assertRaises(IngestError):
                with self.files.stream(member) as (stream, _):
                    stream.read()
                    if mode == 'modify':
                        member.write_bytes(b'changed invented bytes')
                    else:
                        os.link(member, self.root / 'late-hardlink')

    def test_held_sqlite_descriptor_does_not_follow_late_symlink(self):
        database = self.page / 'index.sqlite'
        outside = self.root / 'unrelated.sqlite'
        for path, value in ((database, 'original'), (outside, 'outside')):
            with sqlite3.connect(path) as db:
                db.execute('CREATE TABLE observation(value TEXT)')
                db.execute('INSERT INTO observation VALUES(?)', (value,))
        with self.assertRaises(IngestError):
            with self.files.stream(database) as (stream, _):
                database.rename(self.page / 'original.sqlite')
                database.symlink_to(outside)
                db = sqlite3.connect('file:/proc/self/fd/' + str(stream.fileno())
                                     + '?mode=ro&immutable=1', uri=True)
                try:
                    self.assertEqual(db.execute('SELECT value FROM observation').fetchone()[0], 'original')
                finally:
                    db.close()

    def test_intermediate_directory_retarget_keeps_original_read_then_fails(self):
        export = self.page / 'export'
        export.mkdir()
        (export / 'report.md').write_bytes(b'original')
        foreign = self.root / 'outside-export'
        foreign.mkdir()
        (foreign / 'report.md').write_bytes(b'outside')
        with self.assertRaises(IngestError):
            with self.files.stream(export / 'report.md') as (stream, _):
                export.rename(self.page / 'original-export')
                export.symlink_to(foreign, target_is_directory=True)
                self.assertEqual(stream.read(), b'original')

    def test_nonregular_fifo_is_never_opened_for_read(self):
        pipe = self.page / 'pipe'
        os.mkfifo(pipe)
        opened = []
        real_open = os.open
        def record(path, flags, *args, **kwargs):
            opened.append((str(path), flags))
            return real_open(path, flags, *args, **kwargs)
        with patch.object(io.os, 'open', side_effect=record), self.assertRaises(IngestError):
            with self.files.stream(pipe):
                self.fail('FIFO was yielded')
        self.assertTrue(any(name == 'pipe' and flags & os.O_PATH for name, flags in opened))
        self.assertFalse(any(name.startswith('/proc/self/fd/') for name, _ in opened))
        with self.assertRaises(IngestError):
            self.files.inventory(self.page, set())

    def test_empty_directories_and_other_pages_share_one_entry_budget(self):
        for number in range(7):
            (self.page / ('empty-' + str(number))).mkdir()
        allowed = {'empty-' + str(number) for number in range(7)}
        with patch.object(io, 'MAX_ENTRIES', 8), self.assertRaisesRegex(IngestError, 'inventory_budget'):
            self.files.inventory(self.page, allowed)
        other = self.family / 'page-2'
        other.mkdir()
        (other / 'one').write_bytes(b'1')
        self.files.register_page('page-2')
        with patch.object(io, 'MAX_ENTRIES', 8), self.assertRaisesRegex(IngestError, 'inventory_budget'):
            self.files.inventory(other, set())
        self.assertLessEqual(len(self.files._entries), 8)

    def test_unknown_directories_and_invalid_paths_fail_before_data_reads(self):
        (self.page / 'unknown').mkdir()
        with self.assertRaisesRegex(IngestError, 'unknown_directory'):
            self.files.inventory(self.page, set())
        for path in (self.root / 'outside', self.page / '../escape', self.family / 'unregistered/member'):
            with self.subTest(path=path), self.assertRaises(IngestError):
                with self.files.stream(path):
                    self.fail('invalid member was yielded')
        for names in ({'../escape'}, {'/absolute'}, {'export/../escape'}, {'export\\escape'}):
            with self.subTest(names=names), self.assertRaises(IngestError):
                self.files.inventory(self.page, names)

    def test_at_most_fifteen_prior_page_anchors_and_idempotent_registration(self):
        before = self.descriptors()
        self.files.register_page('page-1')
        self.assertEqual(self.descriptors(), before)
        for number in range(2, 17):
            (self.family / ('page-' + str(number))).mkdir()
        for number in range(2, 16):
            self.files.register_page('page-' + str(number))
        with self.assertRaisesRegex(IngestError, 'page_budget'):
            self.files.register_page('page-16')
        self.files.close()
        self.files.close()
        self.assertLess(self.descriptors(), before)

    def test_inventory_detects_concurrent_directory_change(self):
        real_scandir = os.scandir
        page = self.page
        class ChangingEntries:
            def __init__(self, fd):
                self.entries = real_scandir(fd)
            def __enter__(self):
                def values():
                    for index, entry in enumerate(self.entries):
                        yield entry
                        if index == 0:
                            (page / 'late').write_bytes(b'concurrent change')
                return values()
            def __exit__(self, *args):
                self.entries.close()
        with patch.object(io.os, 'scandir', side_effect=ChangingEntries), \
             self.assertRaisesRegex(IngestError, 'inventory_changed'):
            self.files.inventory(self.page, set())

    def test_cancellation_closes_members_and_keeps_original_exception(self):
        before = self.descriptors()
        with self.assertRaises(KeyboardInterrupt):
            with self.files.stream(self.page / 'manifest.json'):
                raise KeyboardInterrupt()
        self.assertEqual(self.descriptors(), before)
        with self.assertRaisesRegex(IngestError, 'closed'):
            with self.files.stream(self.page / 'manifest.json') as (stream, _):
                self.files.close()
                self.assertTrue(stream.closed)

    def test_close_failure_closes_all_owned_handles_without_retrying_reused_fd(self):
        target = self.files._pages['page-1'][0]
        real_close = os.close
        foreign, fired = [], False
        def close(fd):
            nonlocal fired
            real_close(fd)
            if fd == target and not fired:
                fired = True
                foreign.append(os.open(self.root / 'unrelated-output', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600))
                self.assertEqual(foreign[0], fd)
                raise OSError(errno.EIO, 'invented uncertain close')
        try:
            with patch.object(io.os, 'close', side_effect=close), self.assertRaises(IngestError):
                self.files.close()
            os.write(foreign[0], b'preserved')
            self.assertEqual((self.root / 'unrelated-output').read_bytes(), b'preserved')
            self.files.close()
        finally:
            for fd in foreign:
                real_close(fd)


if __name__ == '__main__':
    unittest.main(verbosity=2)
