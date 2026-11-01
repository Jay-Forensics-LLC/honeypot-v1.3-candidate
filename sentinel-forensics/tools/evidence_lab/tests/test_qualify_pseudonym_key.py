"""Explicit qualification keys reach both workers; fixtures are wholly invented."""
# HoneyTrace local modification, 2026-11-01: exercise the shared bounded key loader.
from contextlib import contextmanager, redirect_stderr, redirect_stdout
import hashlib
import io
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch

import qualify
from core import IngestError
from fixtures import arp, dns_question, eth, ipv4, pcap, udp


KEY_A = b'invented-qualification-key-one!!'
KEY_B = b'invented-qualification-key-two!!'
assert len(KEY_A) == len(KEY_B) == 32


def pseudonyms(value):
    if isinstance(value, dict):
        return set().union(*(pseudonyms(item) for item in value.values()))
    if isinstance(value, list):
        return set().union(*(pseudonyms(item) for item in value))
    return {value} if isinstance(value, str) and value.startswith('p_') else set()


class QualificationKeys(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'invented.pcap'
        self.source.write_bytes(pcap([arp(), eth(ipv4(udp(dns_question())))]))

    def qualify_pair(self, name, **kwargs):
        output = self.root / name
        # This tests real analysis workers, not an external decoder or real-data gate.
        with patch('qualify.capinfos_count', return_value=None), \
                patch('qualify.shutil.which', return_value=None), \
                redirect_stderr(io.StringIO()):
            report = qualify.qualify(self.source, output, profile='synthetic',
                expected_packets=2, min_free_bytes=0, **kwargs)
        self.assertEqual(report['status'], 'SYNTHETIC_PASS',
                         (report.get('reason'), report.get('failure_details')))
        self.assertEqual(len(report['runs']), 2)
        self.assertTrue(report['checks']['reproducible_minimized_export'])
        return output, report

    def assert_pair_key(self, output, key):
        for path in [output / 'pseudonym.key',
                     *[output / name / 'pseudonym.key' for name in ('run-1', 'run-2')]]:
            self.assertEqual(path.read_bytes(), key)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)

    def test_same_key_repeats_exports_and_different_key_changes_pseudonyms(self):
        before = self.source.read_bytes()
        outputs = []
        with patch('qualify.os.urandom', side_effect=AssertionError('unexpected generated key')):
            for name, key in [('one', KEY_A), ('repeat', KEY_A), ('different', KEY_B)]:
                output, report = self.qualify_pair(name, pseudonym_key=key)
                self.assert_pair_key(output, key)
                outputs.append((output, report))
        digests = [report['runs'][0]['export_sha256'] for _, report in outputs]
        self.assertEqual(digests[0], digests[1])
        self.assertNotEqual(digests[0], digests[2])
        identifiers = []
        for output, _ in outputs:
            values = [json.loads(line) for line in (output / 'run-1/export/exchange.jsonl').read_bytes().splitlines()]
            identifiers.append(pseudonyms(values))
            public = b'\n'.join([*(path.read_bytes() for path in
                (output / 'qualification.json', output / 'qualification.md')),
                *(path.read_bytes() for path in (output / 'run-1/export').iterdir())])
            for key in (KEY_A, KEY_B):
                for secret in (key, key.hex().encode(), hashlib.sha256(key).hexdigest().encode()):
                    self.assertNotIn(secret, public)
        self.assertTrue(identifiers[0])
        self.assertEqual(identifiers[0], identifiers[1])
        self.assertTrue(identifiers[0].isdisjoint(identifiers[2]))
        self.assertEqual(self.source.read_bytes(), before)

    def test_default_generates_fresh_key_but_shares_it_within_each_pair(self):
        with patch('qualify.os.urandom', side_effect=[KEY_A, KEY_B]) as random:
            first, _ = self.qualify_pair('default-one')
            second, _ = self.qualify_pair('default-two')
        self.assertEqual(random.call_count, 2)
        self.assertTrue(all(call.args == (32,) for call in random.call_args_list))
        self.assert_pair_key(first, KEY_A)
        self.assert_pair_key(second, KEY_B)

    def test_public_run_cli_key_reaches_both_real_workers(self):
        key_path = self.root / 'invented-external-key'
        key_path.write_bytes(KEY_A)
        output = self.root / 'cli-pair'
        argv = ['qualify.py', 'run', str(self.source), '--output', str(output),
                '--profile', 'synthetic', '--expected-packets', '2',
                '--pseudonym-key', str(key_path)]
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.object(sys, 'argv', argv), patch('qualify.capinfos_count', return_value=None), \
                patch('qualify.shutil.which', return_value=None), \
                patch('qualify.os.urandom', side_effect=AssertionError('unexpected generated key')), \
                redirect_stdout(stdout), redirect_stderr(stderr):
            code = qualify.main()
        self.assertEqual(code, 0)
        report = json.loads(stdout.getvalue())
        self.assertEqual(report['status'], 'SYNTHETIC_PASS')
        self.assertEqual(len(report['runs']), 2)
        self.assert_pair_key(output, KEY_A)
        self.assertEqual(key_path.read_bytes(), KEY_A)
        for value in (str(key_path), KEY_A.decode(), KEY_A.hex(), hashlib.sha256(KEY_A).hexdigest()):
            self.assertNotIn(value, stdout.getvalue() + stderr.getvalue())

    def test_invalid_api_keys_fail_before_source_or_output_work(self):
        for index, key in enumerate((b'', b'A' * 31, b'A' * 33, b'A' * 100000,
                                     'A' * 32, bytearray(b'A' * 32), memoryview(b'A' * 32), 32)):
            with self.subTest(index=index), patch('qualify.inventory') as inventory, \
                    patch('qualify.measured_process') as worker:
                output = self.root / ('invalid-' + str(index))
                with self.assertRaisesRegex(IngestError, '^pseudonym_key_must_be_32_bytes$'):
                    qualify.qualify(self.root / 'missing-source', output, pseudonym_key=key)
                inventory.assert_not_called()
                worker.assert_not_called()
                self.assertFalse(output.exists())


class KeyBoundary(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.key = self.root / 'private-external-key-name'
        self.key.write_bytes(KEY_A)

    def cli(self, command='run', key=None):
        output = self.root / 'unused-output'
        argv = ['qualify.py', command, str(self.root / 'missing-source'), '--output', str(output)]
        if key is not None:
            argv += ['--pseudonym-key', str(key)]
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.object(sys, 'argv', argv), redirect_stdout(stdout), redirect_stderr(stderr):
            code = qualify.main()
        return code, json.loads(stdout.getvalue()), stderr.getvalue(), output

    def test_public_run_flag_forwards_loaded_bytes_without_external_path(self):
        with patch('qualify.qualify', return_value={'status': 'SYNTHETIC_PASS'}) as run:
            code, result, stderr, _ = self.cli(key=self.key)
        self.assertEqual(code, 0)
        self.assertEqual(run.call_args.kwargs['pseudonym_key'], KEY_A)
        for value in (KEY_A.decode(), str(self.key), hashlib.sha256(KEY_A).hexdigest()):
            self.assertNotIn(value, json.dumps(result) + stderr)

    def test_worker_cli_also_uses_bounded_key_loader(self):
        with patch('qualify.worker', return_value={}) as worker:
            self.assertEqual(self.cli('_worker', self.key)[0], 0)
        self.assertEqual(worker.call_args.args[3], KEY_A)
        with patch('qualify.worker') as worker:
            code, result, _, _ = self.cli('_worker')
        self.assertEqual(code, 2)
        self.assertEqual(result['reason'], 'pseudonym_key_must_be_32_bytes')
        worker.assert_not_called()

    def test_omitted_run_flag_forwards_none(self):
        with patch('qualify.qualify', return_value={'status': 'SYNTHETIC_PASS'}) as run:
            self.assertEqual(self.cli()[0], 0)
        self.assertIsNone(run.call_args.kwargs['pseudonym_key'])

    def test_invalid_cli_lengths_fail_before_qualifier_or_worker(self):
        for size in (0, 31, 33, 100000):
            self.key.write_bytes(b'A' * size)
            for command in ('run', '_worker'):
                with self.subTest(size=size, command=command), patch('qualify.qualify') as run, \
                        patch('qualify.worker') as worker:
                    code, result, stderr, output = self.cli(command, self.key)
                    self.assertEqual(code, 2)
                    self.assertEqual(result['reason'], 'pseudonym_key_must_be_32_bytes')
                    self.assertNotIn(str(self.key), json.dumps(result) + stderr)
                    run.assert_not_called()
                    worker.assert_not_called()
                    self.assertFalse(output.exists())

    def test_loader_reads_only_33_bytes(self):
        stream = io.BytesIO(b'A' * 100000)
        @contextmanager
        def held(_):
            yield stream, None
        with patch('core.source_file', held):
            with self.assertRaisesRegex(IngestError, '^pseudonym_key_must_be_32_bytes$'):
                qualify.read_pseudonym_key(self.key)
        self.assertEqual(stream.tell(), 33)

    def test_nonregular_symlink_hardlink_and_missing_keys_fail_closed(self):
        directory = self.root / 'directory'; directory.mkdir()
        symlink = self.root / 'symlink'; symlink.symlink_to(self.key)
        hardlink = self.root / 'hardlink'; os.link(self.key, hardlink)
        for path in (directory, symlink, hardlink, self.root / 'missing'):
            with self.subTest(path=path.name):
                with self.assertRaisesRegex(IngestError, '^pseudonym_key_file_unavailable$'):
                    qualify.read_pseudonym_key(path)

    def test_read_failure_and_mutation_are_sanitized_before_processing(self):
        original = qualify.source_file
        @contextmanager
        def changed(path):
            with original(path) as (stream, info):
                class Reader:
                    def read(self, size):
                        value = stream.read(size)
                        self_key.write_bytes(KEY_B)
                        return value
                self_key = Path(path)
                yield Reader(), info
        for boundary in (patch('core.source_file', side_effect=PermissionError('private-secret-path')),
                         patch('core.source_file', changed)):
            self.key.write_bytes(KEY_A)
            with boundary, patch('qualify.qualify') as run:
                code, result, stderr, output = self.cli(key=self.key)
            self.assertEqual(code, 2)
            self.assertEqual(result['reason'], 'pseudonym_key_file_unavailable')
            self.assertNotIn('private-secret-path', json.dumps(result) + stderr)
            self.assertNotIn(KEY_A.decode(), json.dumps(result) + stderr)
            self.assertFalse(output.exists())
            run.assert_not_called()

    def test_read_cancellation_is_explicit_before_any_output(self):
        with patch('core.source_file', side_effect=KeyboardInterrupt), patch('qualify.qualify') as run:
            code, result, _, output = self.cli(key=self.key)
        self.assertEqual(code, 2)
        self.assertEqual(result, {'status': 'CANCELLED', 'reason': 'operator_cancellation'})
        self.assertFalse(output.exists())
        run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
