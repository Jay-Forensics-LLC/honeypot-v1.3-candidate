"""Qualification rejects unavailable live RSS; invented process metadata only."""
# HoneyTrace local addition, 2026-11-01.
import errno
import io
from pathlib import Path
import unittest
from unittest.mock import patch

from qualify import process_rss
from reconstruct_resource import ResourceSamplingFailure


class QualificationSamplingTests(unittest.TestCase):
    def metadata(self, snapshots, *, state='R'):
        snapshots=iter(snapshots)
        identity='123 (synthetic) '+' '.join([state]+['0']*18+['7'])+'\n'
        def opened(path,*args,**kwargs):
            if path.name=='stat':return io.StringIO(identity)
            if path.name=='status':
                value=next(snapshots)
                if isinstance(value,Exception):raise value
                return io.StringIO(value)
            raise AssertionError('Unexpected metadata read')
        return patch.object(Path,'open',new=opened)

    def test_missing_live_rss_does_not_become_zero(self):
        with self.metadata(['State:\tR (running)\n']*3), \
                self.assertRaisesRegex(ResourceSamplingFailure,'live_process_memory_unavailable') as caught:
            process_rss(123)
        self.assertEqual(caught.exception.details['attempts'],3)

    def test_permission_failure_is_not_a_valid_zero_sample(self):
        with self.metadata([PermissionError(errno.EACCES,'private metadata path')]), \
                self.assertRaisesRegex(ResourceSamplingFailure,'process_status_unavailable') as caught:
            process_rss(123)
        self.assertEqual(caught.exception.details['errno'],errno.EACCES)
        self.assertNotIn('private',str(caught.exception.details))

    def test_transient_missing_rss_requires_a_later_real_value(self):
        with self.metadata(['State:\tR (running)\n','State:\tR (running)\nVmRSS:\t4 kB\n']):
            self.assertEqual(process_rss(123),4096)

    def test_positive_terminal_observations_can_contribute_zero(self):
        with self.metadata([],state='Z'):
            self.assertEqual(process_rss(123),0)
        absent=FileNotFoundError(errno.ENOENT,'synthetic process finished')
        with patch.object(Path,'open',side_effect=absent),patch.object(Path,'stat',side_effect=absent):
            self.assertEqual(process_rss(123),0)


if __name__=='__main__':
    unittest.main()
