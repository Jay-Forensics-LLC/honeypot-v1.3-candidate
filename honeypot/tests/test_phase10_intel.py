"""Mock intelligence policy checks; no real provider or network is contacted."""
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from phase10.intel import MockEnricher, PROVIDERS
from phase10.model import Phase10Error
from phase10.policy import Policy


class IntelligenceMocks(unittest.TestCase):
    def setUp(self):
        self.now = 1000
        self.policy = Policy.from_dict({'enabled': True, 'plugins': ['mock-ti']})

    def enricher(self, **limits):
        return MockEnricher(self.policy, clock=lambda: self.now, **limits)

    def test_each_provider_uses_typed_sanitized_mock_fields(self):
        responses = {
            'otx': {'pulse_info': {'count': 3}},
            'abuseipdb': {'data': {'abuseConfidenceScore': 20, 'totalReports': 4}},
            'greynoise': {'noise': True, 'riot': False, 'classification': 'unknown'},
            'virustotal': {'data': {'attributes': {'last_analysis_stats': {'malicious': 2}}}},
            'threatfox': {'data': [{'id': 'synthetic'}]},
            'certificate-transparency': [{'name_value': 'example.com'}],
        }
        enrich = self.enricher()
        self.assertEqual(tuple(responses), PROVIDERS)
        for provider, response in responses.items():
            with self.subTest(provider=provider):
                row = enrich.enrich(provider, 'domain', 'example.com', response)
                self.assertEqual(row['status'], 'ok')
                self.assertEqual(row['source'], provider)
                self.assertEqual(row['assessment'], 'possible')
                self.assertIsNone(row['confidence'])
                self.assertTrue(row['mock'])
                self.assertEqual(row['sharing'], 'none')
                self.assertEqual(row['checked_at'], '1970-01-01T00:16:40Z')
                self.assertTrue(row['details'])

    def test_disabled_is_graceful_without_processing_mock_body(self):
        disabled = MockEnricher(Policy(), clock=lambda: self.now)
        self.assertEqual(disabled.enrich('otx', 'ip', '8.8.8.8', object())['status'], 'disabled')
        self.assertEqual(disabled.calls, 0)
        self.assertFalse(disabled.cache)

    def test_private_local_unsupported_and_secret_bearing_indicators_refused(self):
        enrich = self.enricher()
        values = [('ip', '127.0.0.1'), ('ip', '10.2.3.4'), ('ip', '169.254.1.1'),
                  ('ip', '192.0.2.10'), ('ip', '224.0.0.1'), ('ip', '::1'),
                  ('domain', 'localhost'), ('domain', 'service.internal'),
                  ('domain', 'singlelabel'), ('url', 'http://127.0.0.1/'),
                  ('url', 'https://name:private@example.com/'),
                  ('url', 'https://example.com/?token=synthetic'),
                  ('url', 'https://example.com/#synthetic'),
                  ('email', 'person@example.com'), ('file', '/private/example.txt')]
        for kind, value in values:
            with self.subTest(kind=kind, value=value):
                row = enrich.enrich('otx', kind, value, {'pulse_info': {'count': 1}})
                self.assertEqual(row['status'], 'refused')
                self.assertNotIn('indicator_value', row)
        self.assertEqual(enrich.calls, 0)

    def test_public_ip_url_and_digest_are_eligible(self):
        enrich = self.enricher()
        for kind, value in [('ip', '8.8.8.8'), ('ip', '2606:4700:4700::1111'),
                            ('url', 'https://example.com/path'), ('file', 'ab' * 32)]:
            with self.subTest(kind=kind):
                self.assertEqual(enrich.enrich('otx', kind, value, {'pulse_info': {'count': 1}})['status'], 'ok')

    def test_cache_is_canonical_detached_bounded_and_expires(self):
        enrich = self.enricher(ttl_seconds=10, max_cache_entries=1)
        first = enrich.enrich('otx', 'domain', 'EXAMPLE.COM', {'pulse_info': {'count': 1}})
        first['details']['pulse_count'] = 999
        cached = enrich.enrich('otx', 'domain', 'example.com', {'pulse_info': {'count': 2}})
        self.assertTrue(cached['cached'])
        self.assertEqual(cached['details']['pulse_count'], 1)
        self.assertEqual(enrich.calls, 1)
        enrich.enrich('otx', 'domain', 'example.org', {'pulse_info': {'count': 3}})
        self.assertEqual(len(enrich.cache), 1)
        self.now += 10
        row = enrich.enrich('otx', 'domain', 'example.org', {'pulse_info': {'count': 4}})
        self.assertFalse(row['cached'])
        self.assertEqual(row['details']['pulse_count'], 4)

    def test_rate_and_total_mock_quotas_allow_cached_results(self):
        enrich = self.enricher(rate_limit=1, max_calls=2, ttl_seconds=1000)
        enrich.enrich('otx', 'domain', 'example.com', {})
        self.assertEqual(enrich.enrich('otx', 'domain', 'example.org', {})['status'], 'rate-limited')
        self.assertTrue(enrich.enrich('otx', 'domain', 'example.com', {})['cached'])
        self.now += 60
        self.assertEqual(enrich.enrich('otx', 'domain', 'example.org', {})['status'], 'ok')
        self.assertEqual(enrich.enrich('greynoise', 'domain', 'example.net', {})['status'], 'quota-exhausted')
        self.assertTrue(enrich.enrich('otx', 'domain', 'example.com', {})['cached'])

    def test_timeouts_unavailable_rate_limit_backoff_and_recovery(self):
        enrich = self.enricher(backoff_seconds=2, max_backoff_seconds=4)
        row = enrich.enrich('otx', 'domain', 'example.com', status='timeout')
        self.assertEqual((row['status'], row['retry_after_seconds']), ('timeout', 2))
        self.assertEqual(enrich.enrich('otx', 'domain', 'example.com', {})['status'], 'backoff')
        self.now += 2
        row = enrich.enrich('otx', 'domain', 'example.com', status=503)
        self.assertEqual((row['status'], row['retry_after_seconds']), ('unavailable', 4))
        self.now += 4
        row = enrich.enrich('otx', 'domain', 'example.com', status=429)
        self.assertEqual((row['status'], row['retry_after_seconds']), ('rate-limited', 4))
        self.now += 4
        self.assertEqual(enrich.enrich('otx', 'domain', 'example.com', {})['status'], 'ok')
        self.assertNotIn('otx', enrich.failures)
        self.assertEqual(enrich.enrich('greynoise', 'domain', 'example.com')['status'], 'unavailable')

    def test_unknown_data_is_not_copied_and_scores_are_not_proof(self):
        enrich = self.enricher()
        row = enrich.enrich('abuseipdb', 'ip', '8.8.8.8', {
            'api_key': 'SYNTHETIC_DO_NOT_EXPORT', 'password': 'SYNTHETIC_DO_NOT_EXPORT',
            'confidence': 0.4,
            'data': {'abuseConfidenceScore': 95, 'totalReports': 2, 'description': 'SYNTHETIC_DO_NOT_EXPORT'},
        })
        self.assertNotIn('SYNTHETIC_DO_NOT_EXPORT', json.dumps(row))
        self.assertEqual(row['confidence'], 0.4)
        self.assertEqual(row['assessment'], 'possible')

    def test_invalid_controls_and_oversized_mock_structures_rejected(self):
        for limits in ({'max_cache_entries': 0}, {'rate_limit': True}, {'ttl_seconds': -1},
                       {'backoff_seconds': 4, 'max_backoff_seconds': 2}):
            with self.assertRaises(Phase10Error):
                self.enricher(**limits)
        enrich = self.enricher()
        for status in (True, 999, 'anything'):
            with self.assertRaises(Phase10Error):
                enrich.enrich('otx', 'ip', '8.8.8.8', {}, status)
        with self.assertRaises(Phase10Error):
            enrich.enrich('unknown', 'ip', '8.8.8.8', {})
        with self.assertRaises(Phase10Error):
            enrich.enrich('otx', 'ip', '8.8.8.8', {'description': 'x' * 4097})
        with self.assertRaises(Phase10Error):
            enrich.enrich('otx', 'ip', '8.8.8.8', {'confidence': float('nan')})


if __name__ == '__main__':
    unittest.main()
