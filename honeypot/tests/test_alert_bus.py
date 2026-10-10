import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import alert_bus


class AlertBusTests(unittest.TestCase):
    def test_disabled_by_default_and_redaction(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'configs').mkdir()
            self.assertFalse(alert_bus.load_config(root)['enabled'])
            result = alert_bus.emit({'severity': 'HIGH', 'command': 'password=s3cret', 'password': 's3cret'}, root)
            self.assertEqual(result['status'], 'disabled')
            payload = alert_bus.build_payload({'severity': 'HIGH', 'command': 'echo password=s3cret', 'password': 's3cret', 'bait_ids': ['bait-http']}, bait_tokens=('HPAKIAabcdef',))
            blob = json.dumps(payload)
            self.assertNotIn('s3cret', blob)
            self.assertNotIn('password=', blob)
            self.assertTrue(payload['password_present'])
            self.assertEqual(payload['bait_id'], 'bait-http')
            self.assertIsNone(alert_bus.health_note(root))
            token = 'HPAKIA' + 'abcdef12'
            payload = alert_bus.build_payload({
                'severity': 'HIGH',
                'username': token,
                'incident_id': 'case-' + token,
                'source_ip': '203.0.113.10',
            })
            blob = json.dumps(payload)
            self.assertNotIn(token, blob)
            self.assertIsNone(payload['username'])
            self.assertIsNone(payload['incident_id'])

    def test_rate_limit_and_failed_delivery_health(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cfg = {'enabled': True, 'configured': True, 'max_per_10min': 2, 'webhook_url': '', 'smtp_host': ''}
            now = time.time()
            first = alert_bus.emit({'severity': 'CRITICAL', 'incident_id': 'a', 'source_ip': '203.0.113.8'}, root, cfg, now)
            second = alert_bus.emit({'severity': 'HIGH', 'incident_id': 'b', 'bait_id': 'bait-cloud'}, root, cfg, now + 1)
            third = alert_bus.emit({'severity': 'HIGH', 'incident_id': 'c'}, root, cfg, now + 2)
            self.assertEqual(first['status'], 'sent')
            self.assertEqual(second['status'], 'sent')
            self.assertEqual(third['status'], 'suppressed')
            self.assertTrue((root / 'state/alerts/digest.jsonl').exists())
            (root / 'configs').mkdir(exist_ok=True)
            (root / 'configs/alert-bus.yml').write_text('enabled: true\nwebhook_url: ""\nmax_per_10min: 2\n', encoding='utf-8')
            (root / 'state/alerts/last.json').write_text(json.dumps({'status': 'FAILED'}), encoding='utf-8')
            self.assertIn('FAILED', alert_bus.health_note(root))

    def test_tty_key_and_transcript_fields_never_leave_and_delivery_is_one_attempt(self):
        payload = alert_bus.build_payload({
            'severity': 'HIGH',
            'username': '-----BEGIN ' + 'OPENSSH PRIVATE KEY-----\nleakuser',
            'tty': 'TTYDUMP',
            'session': 'transcript-body',
            'raw': {'input': 's3cret-raw'},
            'password': 's3cret-raw',
            'command': 'tty replay s3cret-raw',
            'outfile': '/cowrie/tty/1',
        })
        blob = json.dumps(payload)
        for forbidden in ('PRIVATE KEY', 'leakuser', 'TTYDUMP', 'transcript-body', 's3cret-raw', 'tty replay', '/cowrie/tty'):
            self.assertNotIn(forbidden, blob)
        self.assertTrue(payload['password_present'])
        self.assertIsNone(payload['username'])
        self.assertFalse(payload['command_included'])
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'configs').mkdir()
            (root / 'configs/alert-bus.yml').write_text('enabled: true\nwebhook_url: http://127.0.0.1:9/hook\nmax_per_10min: 5\n', encoding='utf-8')
            cfg = alert_bus.load_config(root)
            with patch('alert_bus.urllib.request.urlopen', side_effect=OSError('down')) as opened:
                result = alert_bus.emit({'severity': 'HIGH', 'incident_id': 'z', 'source_ip': '203.0.113.9'}, root, cfg)
            self.assertEqual(opened.call_count, 1)
            self.assertEqual(result['status'], 'FAILED')
            self.assertIn('FAILED', alert_bus.health_note(root))


if __name__ == '__main__':
    unittest.main()
