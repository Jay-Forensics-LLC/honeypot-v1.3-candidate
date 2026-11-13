"""Offline endpoint/capture regressions for PR #51; no Docker or network calls."""
from collections import namedtuple
from contextlib import redirect_stdout
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import traceback
import unittest
import urllib.error
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import live_capture
import stage7_qualification as qualification
import test_pr21_review as image_fixtures


class ReadinessRecovery(unittest.TestCase):
    def setUp(self):
        self.fixture = image_fixtures.ImageTrust()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.statuses = {'loki': 200, 'alloy': 200, 'grafana': 200}
        self.urls = []
        self.fixture.http_response = self.execute_probe

    def execute_probe(self, argv):
        def open_url(url, timeout):
            self.assertEqual(timeout, 5)
            self.urls.append(url)
            service = url.split('//', 1)[1].split(':', 1)[0]
            status = self.statuses[service]
            if isinstance(status, Exception):
                raise status
            if status >= 400 or status == 302:
                message = 'Service Unavailable' if status == 503 else 'Synthetic response'
                raise urllib.error.HTTPError(url, status, message, {}, None)
            response = Mock(status=status)
            context = Mock()
            context.__enter__ = Mock(return_value=response)
            context.__exit__ = Mock(return_value=False)
            return context

        output = io.StringIO()
        try:
            with patch('urllib.request.build_opener', return_value=Mock(open=open_url)), redirect_stdout(output):
                # Execute the actual container probe with only its HTTP boundary stubbed.
                exec(argv[-1], {})
        except Exception:
            raise subprocess.CalledProcessError(1, argv, output=output.getvalue(), stderr=traceback.format_exc())
        return output.getvalue()

    def collect(self):
        return self.fixture.collect(probe_readiness=True)

    def observation_error(self, runtime, resources):
        with patch.object(qualification, 'CONTEXT', None), \
             patch.object(qualification, 'collect', return_value=runtime), \
             patch.object(qualification.live_capture, 'readiness', return_value=resources):
            with self.assertRaises(ValueError) as caught:
                qualification.observe()
        return caught.exception

    def retry_allowed(self, runtime, resources=None):
        error = self.observation_error(runtime, {'ok': True} if resources is None else resources)
        with patch.object(qualification, 'CONTEXT', None):
            return qualification.pending_loki_http_readiness(error)

    def test_all_healthy_preserves_boolean_readiness(self):
        runtime = self.collect()
        self.assertTrue(runtime['ok'], runtime['problems'])
        self.assertEqual(runtime['http_readiness'], dict.fromkeys(self.statuses, True))
        self.assertEqual(len(self.urls), 3)

    def test_only_loki_503_with_healthy_other_endpoints_can_retry(self):
        self.statuses['loki'] = 503
        runtime = self.collect()
        self.assertFalse(runtime['ok'])
        self.assertTrue(self.retry_allowed(runtime), runtime['problems'])
        self.assertEqual(runtime['http_readiness_status'], self.statuses)
        self.assertEqual(len(self.urls), 3)
        self.assertEqual(runtime['problems'], ['Internal HTTP readiness failed'])

    def test_alloy_and_grafana_503_never_qualify_even_with_loki_503(self):
        for service in ('alloy', 'grafana'):
            for loki in (200, 503):
                with self.subTest(service=service, loki=loki):
                    self.statuses = {'loki': loki, 'alloy': 200, 'grafana': 200}
                    self.statuses[service] = 503
                    self.assertFalse(self.retry_allowed(self.collect()))

    def test_other_http_codes_and_transport_failures_never_qualify(self):
        for service in ('loki', 'alloy', 'grafana'):
            for status in (302, 500, 502, urllib.error.URLError('synthetic refusal'), TimeoutError('synthetic timeout')):
                with self.subTest(service=service, status=status):
                    self.statuses = {'loki': 503, 'alloy': 200, 'grafana': 200}
                    self.statuses[service] = status
                    self.assertFalse(self.retry_allowed(self.collect()))

    def test_invalid_probe_output_never_qualifies(self):
        for value in (None, [], {}, {'loki': 503}, {'loki': 503, 'alloy': True, 'grafana': 200}):
            with self.subTest(value=value):
                self.fixture.http_response = lambda argv: json.dumps(value)
                self.assertFalse(self.retry_allowed(self.collect()))

    def test_real_capture_resource_failures_reject_simultaneous_loki_503(self):
        self.statuses['loki'] = 503
        runtime = self.collect()
        usage = namedtuple('usage', 'total used free')
        gib = 1024**3
        for case in ('low_disk', 'missing', 'stale', 'empty'):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                dest = root / 'captures'
                dest.mkdir()
                segment = dest / 'ring_synthetic.pcapng'
                if case != 'missing':
                    segment.write_bytes(b'' if case == 'empty' else b'SYNTHETIC')
                    stamp = 1000000 - (361 if case == 'stale' else 0)
                    os.utime(segment, (stamp, stamp))
                disk = usage(10 * gib, 2 * gib, 8 * gib)
                if case == 'low_disk':
                    disk = usage(10 * gib, 10 * gib - 128 * 1024**2, 128 * 1024**2)
                with patch.object(live_capture, 'config', return_value={'DISK_HIGH_PERCENT': '85', 'DISK_CRITICAL_PERCENT': '95'}), \
                     patch.object(live_capture, 'runtime_path', return_value=dest), \
                     patch.object(live_capture.shutil, 'disk_usage', return_value=disk), \
                     patch.object(live_capture.shutil, 'which', return_value='/synthetic/tshark'):
                    resources = live_capture.readiness(root, now=1000000)
                self.assertIs(resources['ok'], False)
                self.assertTrue(resources['problems'])
                self.assertFalse(self.retry_allowed(runtime, resources))


if __name__ == '__main__':
    unittest.main()
