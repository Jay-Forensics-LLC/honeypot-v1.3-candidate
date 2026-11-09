"""History boundaries independent of any capture or decoder."""
from types import SimpleNamespace
from contextlib import redirect_stdout
import io
import unittest
from unittest.mock import Mock, patch

from reconstruct_history import History
from core import IngestError
import reconstruct as driver


class EmptyHistoryTests(unittest.TestCase):
    def test_fresh_page_checks_family_without_another_parent_packet_query(self):
        history=object.__new__(History)
        history.pages=[]
        history.check_family=Mock()
        bound=SimpleNamespace(db=SimpleNamespace(execute=Mock(
            side_effect=AssertionError('fresh page repeated the parent metadata scan'))))
        history.replay(bound,{}, {},lambda *args:None)
        history.check_family.assert_called_once()
        bound.db.execute.assert_not_called()


class SelectedFrameLimitTests(unittest.TestCase):
    def test_cli_exposes_lower_total_frame_limit_without_changing_default_or_upper_cap(self):
        arguments=['reconstruct.py','--case','/invented/case','--source','1=/invented/source.pcap',
                   '--output','/invented/page-1','--max-selected-frames','32768']
        with patch.object(driver.sys,'argv',arguments), \
             patch.object(driver,'reconstruct',return_value={'status':'COMPLETE','coverage':{}}) as execute, \
             redirect_stdout(io.StringIO()):
            self.assertEqual(driver.main(),0)
        self.assertEqual(execute.call_args.kwargs['limits']['total_frames'],32768)
        self.assertEqual(driver.DEFAULT_LIMITS['total_frames'],131072)
        self.assertEqual(driver.configuration({'total_frames':32768})['total_frames'],32768)
        for value in (0,True,131073):
            with self.subTest(value=value),self.assertRaises(IngestError):
                driver.configuration({'total_frames':value})


if __name__=='__main__':unittest.main()
