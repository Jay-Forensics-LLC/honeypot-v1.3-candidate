"""The dashboard uses the operator entry point without starting sensor services."""
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import dashboard
import hp


class DashboardEntryPoint(unittest.TestCase):
    def test_bundled_companion_is_discovered_from_source_independent_of_runtime_root(self):
        bundled = Path(dashboard.__file__).resolve().parents[2] / 'sentinel-forensics'
        with tempfile.TemporaryDirectory() as folder:
            server = dashboard.create_server(Path(folder), port=0)
            try:
                self.assertEqual(server.sentinel_root, bundled)
                self.assertTrue(server.jobs.available())
                self.assertEqual(server.snapshot()['app']['name'], 'HoneyTrace Forensic Dashboard')
            finally:
                server.server_close()

    def test_launch_passes_operator_options_to_dashboard_only(self):
        argv = ['hp', 'dashboard', '--port', '8766', '--policy', '/private/policy.json',
                '--store', '/private/cases', '--sentinel-root', '/private/sentinel']
        with patch.object(sys, 'argv', argv), patch.object(dashboard, 'serve', return_value=0) as serve:
            self.assertEqual(hp.main(), 0)
        serve.assert_called_once_with(hp.ROOT, 8766, Path('/private/policy.json'),
                                      Path('/private/cases'), Path('/private/sentinel'))


if __name__ == '__main__':
    unittest.main()
