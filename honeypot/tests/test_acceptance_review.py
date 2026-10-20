"""Exact-head independent review controls; no live lifecycle operation executes."""
import fcntl
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import compose_input
import hp
import hp_common
import ops
from test_image_startup import StartupFixture


class AcceptanceReview(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.logs = self.root / 'logs/system'
        self.logs.mkdir(parents=True)

    def test_preview_unit_environment_passes_the_single_input_policy(self):
        unit = Path(__file__).resolve().parents[1] / 'systemd/preview/honeypot-stack.service.in'
        environment = dict(line.removeprefix('Environment=').split('=', 1)
                           for line in unit.read_text().splitlines() if line.startswith('Environment='))
        with patch.dict(os.environ, environment, clear=True):
            compose_input.require_single_input(self.root, {})

    def test_operator_cli_forwards_the_external_pin_to_start_and_boot(self):
        for command in ('start', 'boot-start'):
            entry = Mock(return_value=None)
            with self.subTest(command=command), patch.object(sys, 'argv', ['hp.py', command,
                    '--image-approval-sha256', 'a' * 64]), \
                    patch.object(__import__('ops'), command.replace('-', '_'), entry):
                self.assertEqual(hp.main(), 0)
                entry.assert_called_once_with(approval_sha256='a' * 64)

    def test_contended_audit_lock_prevents_lifecycle_mutation(self):
        mutations = []
        operation = hp_common.audited('start')(lambda: mutations.append('executed'))
        held = os.open(self.logs, os.O_RDONLY | os.O_DIRECTORY)
        try:
            fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with patch.object(hp_common, 'ROOT', self.root), \
                    patch.object(hp_common, '_LOG_LOCK_TIMEOUT', 0), self.assertRaises(TimeoutError):
                operation()
        finally:
            os.close(held)
        self.assertEqual(mutations, [])
        self.assertFalse((self.logs / 'audit.jsonl').exists())

    def test_final_audit_failure_runs_the_registered_exact_identity_cleanup(self):
        events = []
        writes = 0
        real_write = os.write
        def write(fd, data):
            nonlocal writes
            writes += 1
            if writes == 2:
                raise OSError('synthetic full audit device')
            return real_write(fd, data)
        @hp_common.audited('start')
        def operation():
            getattr(hp_common, 'on_audit_failure', lambda callback: None)(lambda: events.append('stop-exact-owned-ids'))
            events.append('start-exact-owned-ids')
        with patch.object(hp_common, 'ROOT', self.root), patch.object(hp_common.os, 'write', side_effect=write), \
                self.assertRaisesRegex(OSError, 'audit device'):
            operation()
        self.assertEqual(events, ['start-exact-owned-ids', 'stop-exact-owned-ids'])
        self.assertEqual(json.loads((self.logs / 'audit.jsonl').read_text())['action'], 'start.attempt')

    def test_success_records_an_attempt_before_mutation_and_a_completion(self):
        @hp_common.audited('stop')
        def operation():
            rows = (self.logs / 'audit.jsonl').read_text().splitlines()
            self.assertEqual([json.loads(row)['action'] for row in rows], ['stop.attempt'])
            return 7
        with patch.object(hp_common, 'ROOT', self.root):
            self.assertEqual(operation(), 7)
        rows = [json.loads(row) for row in (self.logs / 'audit.jsonl').read_text().splitlines()]
        self.assertEqual([row['action'] for row in rows], ['stop.attempt', 'stop'])
        self.assertIs(rows[1]['success'], True)

    def test_lifecycle_does_not_starve_sibling_operational_writers(self):
        @hp_common.audited('start')
        def operation():
            hp_common.append_json(self.logs / 'sensor-progress.jsonl', {'progress': True})
        with patch.object(hp_common, 'ROOT', self.root), patch.object(hp_common, '_LOG_LOCK_TIMEOUT', 0):
            operation()
        self.assertEqual(json.loads((self.logs / 'sensor-progress.jsonl').read_text()), {'progress': True})

    def test_completion_lock_contention_invokes_cleanup_after_start(self):
        events = []
        held = os.open(self.logs, os.O_RDONLY | os.O_DIRECTORY)
        @hp_common.audited('start')
        def operation():
            hp_common.on_audit_failure(lambda: events.append('stop-captured-ids'))
            events.append('started')
            fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            with patch.object(hp_common, 'ROOT', self.root), patch.object(hp_common, '_LOG_LOCK_TIMEOUT', 0), \
                    self.assertRaises(TimeoutError):
                operation()
        finally:
            os.close(held)
        self.assertEqual(events, ['started', 'stop-captured-ids'])

    def test_startup_audit_device_failure_stops_only_the_captured_owned_ids(self):
        for boot in (False, True):
            fixture = StartupFixture()
            fixture.setUp()
            self.addCleanup(fixture.doCleanups)
            entry = ops.boot_start if boot else ops.start
            original = hp_common._append_log
            calls = 0
            def append(log, row):
                nonlocal calls
                calls += 1
                if calls == 2:
                    raise OSError('synthetic completion failure')
                original(log, row)
            # The fixture bypasses the decorator by default. Route this one
            # exercise through it; the decorator's captured function is intact.
            with self.subTest(boot=boot), patch.object(entry, '__wrapped__', entry), \
                    patch.object(hp_common, 'ROOT', fixture.root), \
                    patch.object(hp_common, '_append_log', side_effect=append), \
                    self.assertRaisesRegex(OSError, 'completion failure'):
                fixture.exercise(boot=boot)
            expected = {row['Id'] for name, row in fixture.containers.items()
                        if not boot or name in ('cowrie', 'opencanary')}
            self.assertTrue(fixture.starts())
            self.assertEqual(fixture.events[-1][:2], ('docker', 'stop'))
            self.assertEqual(set(fixture.events[-1][2:]), expected)


if __name__ == '__main__':
    unittest.main()
