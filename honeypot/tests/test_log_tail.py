import contextlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import hp
import log_tail


class BoundedLog(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory();self.addCleanup(tmp.cleanup)
        self.path=Path(tmp.name)/'source.jsonl'

    def test_reads_last_records_without_scanning_whole_history(self):
        self.path.write_bytes(b'{"older":true}\n'*10000+b'{"last":1}\n{"last":2}\n')
        row=log_tail.read_tail(self.path,2,budget=100)
        self.assertEqual([json.loads(x)['last'] for x in row['lines']],[1,2])
        self.assertTrue(row['bounded'])

    def test_boundary_at_newline_and_inside_line(self):
        self.path.write_bytes(b'{"one":1}\n{"two":2}\n')
        for budget in (10,11,15):
            self.assertEqual(log_tail.read_tail(self.path,budget=budget)['lines'],[b'{"two":2}'])

    def test_partial_oversized_and_empty_records_are_distinct(self):
        self.path.write_bytes(b'')
        self.assertTrue(log_tail.read_tail(self.path)['empty'])
        self.path.write_bytes(b'x'*10000)
        row=log_tail.read_tail(self.path,budget=100)
        self.assertFalse(row['empty']);self.assertEqual(row['lines'],[])
        self.assertTrue(row['partial_records_withheld'])
        self.path.write_bytes(b'{"complete":true}\n{"incomplete":')
        self.assertEqual(log_tail.read_tail(self.path)['lines'],[b'{"complete":true}'])

    def test_symlink_fifo_missing_and_permission_errors(self):
        self.path.write_bytes(b'{}\n')
        link=self.path.parent/'link';link.symlink_to(self.path)
        fifo=self.path.parent/'fifo';os.mkfifo(fifo)
        for path in (link,fifo,self.path.parent/'missing'):
            with self.subTest(path=path),self.assertRaises((OSError,ValueError)):
                log_tail.read_tail(path)
        with patch.object(log_tail.os,'open',side_effect=PermissionError):
            with self.assertRaises(PermissionError):log_tail.read_tail(self.path)

    def call_cli(self):
        text=io.StringIO()
        with patch.object(hp,'source_paths',return_value={'test':self.path}),contextlib.redirect_stdout(text):
            exit_code=hp.logs('test',20)
        return exit_code,text.getvalue()

    def test_cli_idle_differs_from_unavailable(self):
        code,text=self.call_cli();self.assertEqual(code,1);self.assertIn('Telemetry unavailable',text)
        self.path.touch()
        code,text=self.call_cli();self.assertEqual(code,0);self.assertIn('No activity recorded',text)

    def test_cli_redacts_and_withholds_malformed_or_unstructured_lines(self):
        self.path.write_text('{"password":"DO-NOT-SHARE","nested":{"token":"PRIVATE"}}\ninvalid private line\n"secret string"\n')
        code,text=self.call_cli();self.assertEqual(code,0)
        for secret in ('DO-NOT-SHARE','PRIVATE','invalid private line','secret string'):self.assertNotIn(secret,text)
        self.assertIn('password_present',text);self.assertIn('withheld',text)

    def test_unreadable_and_all_malformed_never_report_idle(self):
        self.path.write_bytes(b'invalid\n')
        code,text=self.call_cli();self.assertEqual(code,1);self.assertNotIn('No activity',text)
        with patch.object(log_tail,'read_tail',side_effect=PermissionError):
            code,text=self.call_cli()
        self.assertEqual(code,1);self.assertIn('Telemetry unavailable',text)


if __name__=='__main__':unittest.main()
