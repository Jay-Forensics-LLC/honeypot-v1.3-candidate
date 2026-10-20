"""Clean-room reports stay outside the source tree and never run live by default."""
import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
import demo


class DemoOutput(unittest.TestCase):
    def test_replay_writes_unique_external_artifacts_and_fingerprints_parser(self):
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()):
            base = Path(tmp)
            self.assertEqual(demo.main(output_root=base), 0)
            self.assertEqual(demo.main(output_root=base), 0)
            reports = sorted(base.glob('run-*/report.json'))
            self.assertEqual(len(reports), 2)
            for p in reports:
                row = json.loads(p.read_text())
                self.assertEqual(row['status'], 'PASS_REPLAY')
                self.assertEqual(row['mode'], 'replay')
                self.assertIn('packet_snapshot.py', row['implementation'])
                self.assertEqual(row['stage7'], 'NOT QUALIFIED')

    def test_explicit_source_relative_absent_or_symlink_output_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            link = Path(tmp)/'linked'
            link.symlink_to(Path(tmp), target_is_directory=True)
            for path in (ROOT, Path('relative'), Path(tmp)/'absent', link):
                with self.subTest(path=str(path)), patch.object(demo, 'replay') as replay:
                    with self.assertRaises(ValueError):
                        demo.main(output_root=path)
                    replay.assert_not_called()


if __name__ == '__main__':
    unittest.main()
