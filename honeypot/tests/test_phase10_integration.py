"""Ordinary end-to-end checks for optional operator workflows."""
import argparse
import contextlib
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from phase10 import cli, forensics, inventory, service
from phase10.model import Phase10Error
from phase10.policy import Policy
from phase10.store import Store


class OfflineFoundationIntegration(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.store = self.root / 'private-store'
        self.policy = Policy.from_dict({'enabled': True, 'plugins': ['bbot', 'forensics']})
        self.report = self.root / 'scan.jsonl'
        self.raw = (json.dumps({'id': 'fixture-record', 'type': 'DNS_NAME',
                               'data': 'asset.example.com',
                               'timestamp': '2026-11-01T12:00:00Z'}) + '\n').encode()
        self.report.write_bytes(self.raw)

    def test_worker_import_export_and_repeat_preserve_original(self):
        first = service.import_report(self.store, self.policy, 'bbot', 'jsonl', self.report)
        again = service.import_report(self.store, self.policy, 'bbot', 'jsonl', self.report)
        self.assertEqual(first['import_id'], again['import_id'])
        self.assertTrue(again['deduplicated'])
        findings = Store(self.store, self.policy).export()
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]['indicator_value'], 'asset.example.com')
        self.assertEqual(findings[0]['evidence_reference'], 'sha256:' + hashlib.sha256(self.raw).hexdigest())
        self.assertEqual(self.report.read_bytes(), self.raw)

    def test_disabled_import_does_not_read_input_or_create_store(self):
        with self.assertRaises(Phase10Error):
            service.import_report(self.store, Policy(), 'bbot', 'jsonl', self.root / 'absent')
        self.assertFalse(self.store.exists())

    def test_bad_report_and_worker_timeout_leave_no_persistent_state(self):
        self.report.write_bytes(b'{invalid json\n')
        with self.assertRaises(Phase10Error):
            service.import_report(self.store, self.policy, 'bbot', 'jsonl', self.report)
        self.assertFalse(self.store.exists())
        self.report.write_bytes(self.raw)
        with patch.object(service.subprocess, 'run', side_effect=subprocess.TimeoutExpired('worker', 1)):
            with self.assertRaisesRegex(Phase10Error, 'timed out'):
                service.import_report(self.store, self.policy, 'bbot', 'jsonl', self.report)
        self.assertFalse(self.store.exists())

    def test_specialized_imports_cannot_skip_case_or_backup_validation(self):
        policy = Policy.from_dict({'enabled': True, 'plugins': ['sentinel', 'imazing']})
        for plugin, format_name in [('sentinel', 'jsonl'), ('imazing', 'sqlite')]:
            with self.subTest(plugin=plugin), self.assertRaises(Phase10Error):
                service.import_report(self.store, policy, plugin, format_name, self.report)
        self.assertFalse(self.store.exists())

    def test_forensic_handoff_preserves_hash_and_never_runs_a_processor(self):
        with patch('subprocess.run', side_effect=AssertionError('No external processor')):
            result = forensics.export_copy(self.store, self.policy, self.report)
        self.assertFalse(result['external_upload'])
        self.assertFalse(result['processor_execution'])
        self.assertEqual(result['source_sha256'], hashlib.sha256(self.raw).hexdigest())
        self.assertEqual(self.report.read_bytes(), self.raw)

    def test_cli_disabled_status_and_private_error_messages(self):
        parser = argparse.ArgumentParser()
        cli.configure_parser(parser.add_subparsers(dest='command', required=True))
        status = parser.parse_args(['integrations', 'status'])
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            self.assertEqual(cli.dispatch(status, self.root), 0)
        self.assertFalse(json.loads(output.getvalue())['enabled'])
        (self.root / 'configs').mkdir()
        (self.root / 'configs/phase10.json').write_text('{invalid SENSITIVE_FIXTURE')
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            self.assertEqual(cli.dispatch(status, self.root), 1)
        self.assertNotIn('SENSITIVE_FIXTURE', output.getvalue())
        self.assertFalse((self.root / 'state').exists())

    def test_inventory_is_read_only_and_does_not_invoke_binaries(self):
        with patch('subprocess.run', side_effect=AssertionError('No process invocation')):
            result = inventory.inventory()
        self.assertEqual(result['containers'], 'not_inspected')
        self.assertTrue(all(row['version'] is None for row in result['tools']))
        self.assertIn('evilginx3', result['excluded'])


if __name__ == '__main__':
    unittest.main()
