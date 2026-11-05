"""Solo-cohort API semantics using invented captures and fake reference fields.

This module runs neither TShark nor owner evidence. Fake fields exercise the
pipeline contract; they do not independently validate TLS decoding.
"""
from contextlib import closing, redirect_stderr, redirect_stdout
import hashlib
import importlib
import io
import json
from pathlib import Path
import socket
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from core import IngestError
import reconstruct_pipeline as pipeline
from reconstruct_profile import STANDARD, SOLO
import test_reconstruct as fixture
import test_reconstruct_continuation as continuation_fixture


class SoloCohortSemantics(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.record = fixture.hello_record()
        self.mode = 'positive'
        self.field_mutation = {}

    def case(self, count=3):
        return continuation_fixture.ContinuationSemantics.case(self, count)

    def fake_decoder(self, *args, **kwargs):
        return fixture.ReconstructionEndToEndTests.fake_decoder(self, *args, **kwargs)

    def invoke(self, case, sources, output, **kwargs):
        driver = importlib.import_module('reconstruct')
        with patch.object(pipeline.oracle, 'decoder_process', side_effect=self.fake_decoder) as decoder, \
             patch.object(pipeline, 'tool_version', return_value='TShark synthetic-reference'), \
             patch.object(socket, 'socket', side_effect=AssertionError('network forbidden')), \
             patch.object(socket, 'getaddrinfo', side_effect=AssertionError('resolution forbidden')):
            self.last_decoder = decoder
            return driver.reconstruct(case, sources, output, **kwargs)

    def read(self, output, name):
        return json.loads((output / name).read_bytes())

    def rows(self, output):
        with closing(sqlite3.connect((output / 'index.sqlite').as_uri() + '?mode=ro&immutable=1', uri=True)) as db:
            db.row_factory = sqlite3.Row
            return [dict(row) for row in db.execute('SELECT * FROM derivations ORDER BY id')]

    def snapshot(self, root):
        return fixture.ReconstructionEndToEndTests.snapshot(self, root)

    def assert_not_complete(self, output):
        for name in ('state.json', 'manifest.json'):
            if (output / name).exists():
                try:
                    result = self.read(output, name)
                except ValueError:
                    continue
                self.assertNotEqual(result.get('status'), 'COMPLETE')

    def reject(self, case, sources, output, **kwargs):
        try:
            result = self.invoke(case, sources, output, **kwargs)
        except IngestError:
            pass
        else:
            self.assertEqual(result['status'], 'FAILED')
        self.last_decoder.assert_not_called()
        self.assert_not_complete(output)

    def test_selected_cohort_only_has_fresh_metadata_support_and_original_provenance(self):
        case, sources = self.case()
        before = self.snapshot(case)
        originals = {ident: path.read_bytes() for ident, path in sources.items()}
        output = self.root / 'solo-second'
        result = self.invoke(case, sources, output, profile=SOLO, cohort_id=2)
        self.assertEqual(result['status'], 'COMPLETE', result.get('reason'))
        self.assertEqual(self.last_decoder.call_count, 1)
        expected = {'schema': 'sentinel.tls-analysis-profile/1', 'profile': SOLO,
                    'cohort_id': 2, 'continuation_supported': False}
        self.assertEqual(result['analysis_profile'], expected)
        coverage = result['coverage']
        self.assertEqual(coverage['eligible_candidates'], 3)
        self.assertEqual(coverage['selected_candidates'], 1)
        self.assertEqual(coverage['selected_cohorts'], [2])
        self.assertEqual(coverage['selected_frames'], 3)
        self.assertEqual(coverage['other_profile_candidates'], {'not_selected_by_profile': 2})
        self.assertEqual(coverage['permanent_candidates'], {})
        self.assertEqual(coverage['deferred_candidates'], {})
        self.assertEqual(coverage['disjoint_candidate_accounting']['other_profile_not_evaluated'], 2)
        rows = self.rows(output)
        self.assertEqual([row['source_id'] for row in rows], [1, 2, 3])
        for row in rows:
            provenance = json.loads(row['provenance_json'])
            self.assertEqual(provenance['cohort_id'], row['source_id'])
            if row['source_id'] == 2:
                self.assertEqual(row['status'], 'independently_recovered_hello')
                self.assertEqual(json.loads(row['data_json'])['server_name'], fixture.PRIVATE_NAME.decode())
            else:
                self.assertEqual(row['status'], 'not_evaluated')
                self.assertEqual(row['reason'], 'not_selected_by_profile')
                self.assertEqual(json.loads(row['data_json']), {})
                self.assertIsNone(json.loads(row['completion_time_json']))
        with closing(sqlite3.connect(output / 'index.sqlite')) as db:
            support = db.execute('SELECT DISTINCT source_id,ordinal FROM support ORDER BY ordinal').fetchall()
            self.assertEqual(support, [(2, 2), (2, 3)])
        self.assertFalse(result['raw_case_modified'])
        self.assertFalse(result['raw_decoding_losses_modified'])
        self.assertEqual(result['findings_generated'], 0)
        self.assertEqual(result['compromise_assessment'], 'not_performed')
        self.assertEqual(self.snapshot(case), before)
        self.assertEqual({ident: path.read_bytes() for ident, path in sources.items()}, originals)

    def test_twin_solo_exports_are_exact_minimized_and_profile_bound(self):
        case, sources = self.case()
        exports, semantics = [], []
        for name in ('one', 'two'):
            output = self.root / name
            result = self.invoke(case, sources, output, profile=SOLO, cohort_id=2)
            self.assertEqual(result['status'], 'COMPLETE', result.get('reason'))
            records = [json.loads(line) for line in (output / 'export/observations.jsonl').read_bytes().splitlines()]
            self.assertTrue(all(record['schema'] == 'sentinel.tls-derived/3' for record in records))
            coverage = next(record for record in records if record['entity'] == 'coverage')
            self.assertEqual(coverage['payload']['analysis_profile'], result['analysis_profile'])
            self.assertIs(type(coverage['payload']['analysis_profile']['cohort_id']), int)
            self.assertEqual(coverage['payload']['analysis_profile']['cohort_id'], 2)
            self.assertEqual(sum(record['entity'] == 'derived_observation' for record in records), 1)
            hello = next(record for record in records if record['entity'] == 'derived_observation')
            self.assertIs(type(hello['payload']['provenance']['cohort_id']), int)
            self.assertEqual(hello['payload']['provenance']['cohort_id'], 2)
            self.assertTrue(hello['payload']['data']['server_name'].startswith('p_'))
            for path in (output / 'export').iterdir():
                raw = path.read_bytes()
                for private in (fixture.PRIVATE_NAME, b'192.0.2.10', b'198.51.100.20', b'Q' * 32,
                                hashlib.sha256(b'Q' * 32).hexdigest().encode(),
                                str(case).encode(), *(str(path).encode() for path in sources.values())):
                    self.assertNotIn(private, raw)
            exports.append({path.name: path.read_bytes() for path in (output / 'export').iterdir()})
            semantics.append(self.read(output, 'continuation.json')['semantic_sha256'])
        self.assertEqual(exports[0], exports[1])
        self.assertEqual(semantics[0], semantics[1])

    def test_unknown_cohort_fails_after_inventory_without_any_decoder_or_success_bundle(self):
        case, sources = self.case()
        before = self.snapshot(case)
        output = self.root / 'unknown'
        self.reject(case, sources, output, profile=SOLO, cohort_id=4)
        self.assertEqual(self.snapshot(case), before)
        if (output / 'manifest.json').exists():
            self.assertEqual(self.read(output, 'manifest.json')['reason'], 'tls_solo_cohort_not_found')

    def test_selected_cohort_over_lower_caps_is_explicit_and_does_not_select_another(self):
        case, sources = self.case()
        output = self.root / 'capped'
        result = self.invoke(case, sources, output, profile=SOLO, cohort_id=2,
                             limits={'batch_frames': 2, 'total_frames': 2})
        self.assertEqual(result['status'], 'COMPLETE', result.get('reason'))
        self.last_decoder.assert_not_called()
        self.assertEqual(result['coverage']['selected_candidates'], 0)
        self.assertEqual(result['coverage']['permanent_candidates'], {'whole_cohort_frame_cap': 1})
        self.assertEqual(result['coverage']['other_profile_candidates'], {'not_selected_by_profile': 2})
        self.assertTrue(all(row['status'] == 'not_evaluated' for row in self.rows(output)))
        self.assertEqual([row['reason'] for row in self.rows(output)],
                         ['not_selected_by_profile', 'whole_cohort_frame_cap', 'not_selected_by_profile'])

    def test_solo_cannot_continue_or_be_replayed_as_a_standard_prior(self):
        case, sources = self.case()
        family = self.root / 'family'
        family.mkdir()
        prior = family / 'prior'
        self.assertEqual(self.invoke(case, sources, prior, profile=SOLO, cohort_id=2)['status'], 'COMPLETE')
        before = self.snapshot(prior)
        output = family / 'solo-next'
        with patch.object(pipeline.oracle, 'decoder_process') as decoder:
            with self.assertRaisesRegex(IngestError, 'tls_solo_continuation_unsupported'):
                importlib.import_module('reconstruct').reconstruct(case, sources, output,
                    profile=SOLO, cohort_id=2, continue_from=prior)
            decoder.assert_not_called()
        self.assertFalse(output.exists())
        self.reject(case, sources, family / 'standard-next', continue_from=prior)
        self.assertEqual(self.snapshot(prior), before)

    def test_old_schema_two_bundle_is_rejected_without_automatic_upgrade(self):
        case, sources = self.case(count=1)
        family = self.root / 'legacy'
        family.mkdir()
        prior = family / 'prior'
        self.assertEqual(self.invoke(case, sources, prior)['status'], 'COMPLETE')
        for name in ('state.json', 'manifest.json'):
            value = self.read(prior, name)
            if name == 'manifest.json':
                value['producer_version'] = '1.1.0'
                value['schema'] = 'sentinel.tls-derived/2'
            else:
                value['version'] = '1.1.0'
            (prior / name).write_text(json.dumps(value))
        continuation_fixture.ContinuationSemantics.seal_ledger(self, prior)
        before = self.snapshot(prior)
        self.reject(case, sources, family / 'next', continue_from=prior)
        self.assertEqual(self.snapshot(prior), before)

    def test_decoder_cancel_or_failure_never_publishes_complete_solo_checkpoint(self):
        case, sources = self.case(count=1)
        for mode, status in [('cancel', 'CANCELLED'), ('failure', 'FAILED')]:
            self.mode = mode
            output = self.root / mode
            result = self.invoke(case, sources, output, profile=SOLO, cohort_id=1)
            self.assertEqual(result['status'], status)
            self.assert_not_complete(output)
            if (output / 'continuation.json').exists():
                self.reject(case, sources, self.root / (mode + '-next'), continue_from=output)

    def test_cli_forwards_named_profile_selector_and_keeps_failure_nonzero(self):
        driver = importlib.import_module('reconstruct')
        argv = ['reconstruct.py', '--case', '/invented/case', '--source', '1=/invented/source',
                '--output', '/invented/new-output', '--profile', SOLO, '--cohort-id', '2']
        for status, code in [('COMPLETE', 0), ('FAILED', 2), ('CANCELLED', 2)]:
            with self.subTest(status=status), patch.object(driver, 'reconstruct', return_value={
                    'status': status, 'coverage': {'selected_candidates': 1}}) as invoke, \
                    patch('sys.argv', argv), redirect_stdout(io.StringIO()) as output:
                self.assertEqual(driver.main(), code)
                self.assertEqual(invoke.call_args.kwargs['profile'], SOLO)
                self.assertEqual(invoke.call_args.kwargs['cohort_id'], 2)
                self.assertIsNone(invoke.call_args.kwargs['continue_from'])
                self.assertEqual(invoke.call_args.kwargs['limits']['rss_bytes'], 536870912)
                self.assertEqual(invoke.call_args.kwargs['limits']['timeout_seconds'], 120)
                self.assertEqual(json.loads(output.getvalue())['status'], status)


    def test_invalid_cli_profiles_and_selectors_reject_before_input_or_output(self):
        driver = importlib.import_module('reconstruct')
        output = self.root / 'never-created'
        argv = ['reconstruct.py', '--case', str(self.root / 'unopened-case'),
                '--source', '1=' + str(self.root / 'unopened-source'),
                '--output', str(output)]
        invalid_parse = [(['--profile', SOLO, '--cohort-id', 'True']),
                         (['--profile', SOLO, '--cohort-id', '1.0']),
                         (['--profile', 'unknown-profile'])]
        invalid_semantics = [(['--profile', SOLO], 'tls_solo_cohort_id_invalid'),
            (['--cohort-id', '1'], 'tls_cohort_selector_requires_solo_profile'),
            (['--profile', SOLO, '--cohort-id', '1', '--continue-from',
              str(self.root / 'unopened-prior')], 'tls_solo_continuation_unsupported')]
        with patch.object(driver, 'validated_case', side_effect=AssertionError('input forbidden')) as opened, \
             patch.object(pipeline.oracle, 'decoder_process', side_effect=AssertionError('decoder forbidden')) as decoder:
            for options in invalid_parse:
                with self.subTest(options=options), patch('sys.argv', argv + options), \
                        redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                    with self.assertRaises(SystemExit) as stopped:
                        driver.main()
                    self.assertEqual(stopped.exception.code, 2)
            for options, reason in invalid_semantics:
                with self.subTest(options=options), patch('sys.argv', argv + options), \
                        redirect_stdout(io.StringIO()) as captured:
                    self.assertEqual(driver.main(), 2)
                    self.assertEqual(json.loads(captured.getvalue()), {'status': 'FAILED', 'reason': reason})
            opened.assert_not_called()
            decoder.assert_not_called()
        self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
