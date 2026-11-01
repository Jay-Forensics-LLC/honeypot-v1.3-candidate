"""The dashboard uses the operator entry point without starting sensor services."""
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import dashboard
import hp


class DashboardEntryPoint(unittest.TestCase):
    def test_launch_passes_operator_options_to_dashboard_only(self):
        argv = ['hp', 'dashboard', '--port', '8766', '--policy', '/private/policy.json',
                '--store', '/private/cases', '--sentinel-root', '/private/sentinel']
        with patch.object(sys, 'argv', argv), patch.object(dashboard, 'serve', return_value=0) as serve:
            self.assertEqual(hp.main(), 0)
        serve.assert_called_once_with(hp.ROOT, 8766, Path('/private/policy.json'),
                                      Path('/private/cases'), Path('/private/sentinel'))


if __name__ == '__main__':
    unittest.main()
