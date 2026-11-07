"""Continuation semantics on invented captures and fake reference transport.

No TShark, owner evidence or network is used. Prior self-sealed artifacts can
report an outcome; these tests never treat their execution as authenticated.
"""
from contextlib import closing
import hashlib
import importlib
import json
from pathlib import Path
import socket
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from analyze import analyze
from core import IngestError, canonical
import reconstruct_pipeline as pipeline
import test_reconstruct as fixture


class ContinuationSemantics(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.record = fixture.hello_record()
        self.mode = 'positive'
        self.field_mutation = {}
        self.limits = {'max_batches': 1, 'batch_cohorts': 1}

    def case(self, count=3):
        sources = {}
        for ident in range(1, count + 1):
            source = self.root / ('invented-source-' + str(ident) + '.pcap')
            source.write_bytes(fixture.split_capture(self.record, 'positive'))
            sources[ident] = source
        case = self.root / 'case'
        analyze(list(sources.values()), case, pseudonym_key=b'Q' * 32)
        return case, sources

    def fake_decoder(self, *args, **kwargs):
        return fixture.ReconstructionEndToEndTests.fake_decoder(self, *args, **kwargs)

    def invoke(self, case, sources, output, previous=None, revision=None):
        driver = importlib.import_module('reconstruct')
        revision = revision or {'commit': 'a' * 40, 'dirty': False,
                                'matches_revision': True, 'status': 'git'}
        with patch.object(pipeline.oracle, 'decoder_process', side_effect=self.fake_decoder) as decoder, \
             patch.object(pipeline, 'tool_version', return_value='TShark synthetic-reference'), \
             patch.object(driver, 'revision_provenance', return_value=revision), \
             patch.object(socket, 'socket', side_effect=AssertionError('network forbidden')), \
             patch.object(socket, 'getaddrinfo', side_effect=AssertionError('resolution forbidden')):
            self.last_decoder = decoder
            return driver.reconstruct(case, sources, output, limits=self.limits,
                                      continue_from=previous)

    def read(self, folder, name):
        return json.loads((folder / name).read_bytes())

    def rows(self, folder):
        with closing(sqlite3.connect((folder / 'index.sqlite').as_uri() + '?mode=ro&immutable=1', uri=True)) as db:
            db.row_factory = sqlite3.Row
            return [dict(row) for row in db.execute('SELECT * FROM derivations ORDER BY id')]

    def logical(self, folder):
        result = {}
        for path in sorted(folder.glob('*.sqlite')):
            with closing(sqlite3.connect(path.as_uri() + '?mode=ro&immutable=1', uri=True)) as db:
                tables = db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").fetchall()
                result[path.name] = {}
                for (name,) in tables:
                    columns = db.execute('PRAGMA table_info(' + name + ')').fetchall()
                    result[path.name][name] = db.execute('SELECT * FROM ' + name + ' ORDER BY ' +
                        ','.join(str(i) for i in range(1, len(columns) + 1))).fetchall()
        return result

    def family(self, name):
        path = self.root / name
        path.mkdir()
        return path

    def chain(self, case, sources, family, count=3, revision=None):
        pages, previous = [], None
        for number in range(1, count + 1):
            output = family / ('page-' + str(number))
            result = self.invoke(case, sources, output, previous, revision)
            self.assertEqual(result['status'], 'COMPLETE', result.get('reason'))
            pages.append(output)
            previous = output
        return pages

    def reseal(self, folder):
        """An attacker can recompute consistency hashes; they are not signatures."""
        history = importlib.import_module('reconstruct_history')
        manifest, cursor = self.read(folder, 'manifest.json'), self.read(folder, 'continuation.json')
        proof = history.semantic_proof(folder, manifest, cursor['state'], lambda: None)
        semantic = history.digest(proof)
        cursor.update(semantic_proof=proof, semantic_sha256=semantic)
        manifest['continuation']['semantic_sha256'] = semantic
        (folder / 'continuation.json').write_bytes(canonical(cursor) + b'\n')
        (folder / 'manifest.json').write_bytes(canonical(manifest) + b'\n')
        self.seal_ledger(folder)

    def seal_ledger(self, folder):
        # Only this invented fixture is resealed. Production remains exclusive
        # write/no-overwrite; the attacker-controlled fixture can replace its
        # own ledger without authenticating any execution or acquisition.
        lines = [hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + path.relative_to(folder).as_posix()
                 for path in sorted(folder.rglob('*')) if path.is_file() and path.name != 'SHA256SUMS']
        (folder / 'SHA256SUMS').write_bytes(('\n'.join(lines) + '\n').encode())

    def assert_not_checkpoint(self, output):
        for name in ('state.json', 'manifest.json'):
            path = output / name
            if path.exists():
                try:
                    value = json.loads(path.read_bytes())
                except ValueError:
                    continue
                self.assertNotEqual(value.get('status'), 'COMPLETE')

    def reject(self, case, sources, output, previous, private=b''):
        try:
            result = self.invoke(case, sources, output, previous)
        except IngestError as exc:
            if private:
                self.assertNotIn(private, str(exc).encode())
        else:
            self.assertEqual(result['status'], 'FAILED')
            if private:
                self.assertNotIn(private, canonical(result))
        self.last_decoder.assert_not_called()
        self.assert_not_checkpoint(output)

    def test_equivalent_three_page_chains_have_identical_semantics_and_exports(self):
        case, sources = self.case()
        alpha = self.chain(case, sources, self.family('alpha'))
        beta = self.chain(case, sources, self.family('beta'), revision={
            'commit': 'b' * 40, 'dirty': True, 'matches_revision': True, 'status': 'git'})
        for number, (left, right) in enumerate(zip(alpha, beta), 1):
            with self.subTest(page=number):
                a, b = self.read(left, 'continuation.json'), self.read(right, 'continuation.json')
                self.assertEqual(a, b)
                self.assertEqual(a['state']['page_number'], number)
                self.assertEqual(a['state']['completed_before'], list(range(1, number)))
                self.assertEqual(a['state']['selected_cohorts'], [number])
                self.assertEqual(a['state']['completed_after'], list(range(1, number + 1)))
                self.assertEqual(self.logical(left), self.logical(right))
                for name in ('observations.jsonl', 'report.md'):
                    self.assertEqual((left / 'export' / name).read_bytes(), (right / 'export' / name).read_bytes())
                self.assertNotEqual((left / 'SHA256SUMS').read_bytes(), (right / 'SHA256SUMS').read_bytes())
        self.assertEqual(len(self.read(alpha[-1], 'continuation.json')['state']['prior_claims']), 2)

    def test_prior_hello_is_only_a_reported_reference_with_no_fresh_support(self):
        case, sources = self.case()
        first, second = self.chain(case, sources, self.family('claims'), count=2)
        rows = self.rows(second)
        prior = rows[0]
        self.assertEqual(prior['status'], 'previously_evaluated')
        self.assertEqual(prior['kind'], 'tls.prior_evaluation_reference')
        self.assertEqual(json.loads(prior['data_json']), {})
        self.assertIsNone(json.loads(prior['completion_time_json']))
        self.assertEqual(json.loads(prior['first_time_json'])['basis'], 'candidate_capture')
        claim = json.loads(prior['provenance_json'])['prior_evaluation']
        self.assertEqual(claim['semantic_page_sha256'], self.read(first, 'continuation.json')['semantic_sha256'])
        self.assertEqual(claim['reported_status'], 'independently_recovered_hello')
        self.assertTrue(claim['artifact_consistency_verified'])
        self.assertIs(claim['execution_authenticated'], False)
        self.assertIs(claim['acquisition_authenticated'], False)
        with closing(sqlite3.connect(second / 'index.sqlite')) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM support WHERE derivation_id=?', (prior['id'],)).fetchone()[0], 0)
        records = [json.loads(line) for line in (second / 'export/observations.jsonl').read_bytes().splitlines()]
        self.assertEqual(sum(row['entity'] == 'derived_observation' for row in records), 1)
        for path in (second / 'export').iterdir():
            raw = path.read_bytes()
            for secret in (fixture.PRIVATE_NAME, b'Q' * 32, hashlib.sha256(b'Q' * 32).hexdigest().encode(),
                           str(case).encode(), str(second.parent).encode(), b'192.0.2.10', b'198.51.100.20',
                           hashlib.sha256((first / 'SHA256SUMS').read_bytes()).hexdigest().encode()):
                self.assertNotIn(secret, raw)

    def test_resealed_conflicting_manifest_binding_or_coverage_is_rejected(self):
        case, sources = self.case()
        for kind in ('configuration', 'coverage', 'reported-counts', 'remaining', 'authentication'):
            with self.subTest(kind=kind):
                family = self.family('bad-' + kind)
                (prior,) = self.chain(case, sources, family, count=1)
                manifest = self.read(prior, 'manifest.json')
                if kind == 'configuration':
                    manifest['source_configuration'] = {'clock_adjustments': {'1': {'offset_ns': 9}}}
                elif kind == 'coverage':
                    manifest['coverage']['selected_candidates'] += 1
                elif kind == 'reported-counts':
                    manifest['coverage']['cumulative_reported_classifications']['independently_recovered_hello'] += 1
                elif kind == 'remaining':
                    manifest['continuation']['remaining_fitting_cohorts'] += 1
                else:
                    manifest['continuation']['prior_execution_authenticated'] = True
                (prior / 'manifest.json').write_bytes(canonical(manifest) + b'\n')
                self.reseal(prior)
                self.reject(case, sources, family / 'rejected', prior)

    def test_arbitrary_prior_reason_is_rejected_even_after_resealing(self):
        case, sources = self.case()
        family = self.family('reason')
        (prior,) = self.chain(case, sources, family, count=1)
        cursor = self.read(prior, 'continuation.json')
        marker = 'private prior instruction or identifier'
        cursor['state']['selected_outcomes'][0][2] = marker
        (prior / 'continuation.json').write_bytes(canonical(cursor) + b'\n')
        self.reseal(prior)
        self.reject(case, sources, family / 'rejected', prior, marker.encode())

    def test_noncomplete_prior_state_never_advances(self):
        case, sources = self.case()
        family = self.family('incomplete')
        (prior,) = self.chain(case, sources, family, count=1)
        state = self.read(prior, 'state.json')
        state['status'] = 'CANCELLED'
        (prior / 'state.json').write_bytes(canonical(state) + b'\n')
        self.reseal(prior)
        self.reject(case, sources, family / 'rejected', prior)

    def test_prior_state_shape_version_and_manifest_invariants_are_fixed(self):
        case, sources = self.case()
        marker = 'private untrusted prior assertion'
        changes = [('state.json', 'version', '0.0.0'), ('state.json', 'version', None),
                   ('state.json', 'unexpected', marker),
                   ('manifest.json', 'raw_case_modified', True),
                   ('manifest.json', 'raw_decoding_losses_modified', True),
                   ('manifest.json', 'findings_generated', 1),
                   ('manifest.json', 'findings_generated', False),
                   ('manifest.json', 'payload_retention', True),
                   ('manifest.json', 'limitations', [marker]),
                   ('manifest.json', 'compromise_assessment', marker)]
        for number, (member, field, value) in enumerate(changes):
            with self.subTest(member=member, field=field, value=value):
                family = self.family('invariant-' + str(number))
                (prior,) = self.chain(case, sources, family, count=1)
                changed = self.read(prior, member)
                if value is None:
                    changed.pop(field)
                else:
                    changed[field] = value
                (prior / member).write_bytes(canonical(changed) + b'\n')
                self.reseal(prior)
                self.reject(case, sources, family / 'rejected', prior, marker.encode())

    def test_resealed_prior_resource_types_and_negative_values_are_rejected(self):
        case, sources = self.case()
        changes = [(('peaks', name), value)
                   for name in ('sampled_tree_rss_bytes', 'own_lifetime_rss_bytes', 'scratch_bytes')
                   for value in (-1, True, 1.25)]
        changes += [(('child_lifetime_peak_rss_bytes',), value) for value in (-1, False, 1.25)]
        changes += [(('wall_seconds',), value) for value in (-0.25, True, '0.25')]
        for number, (path, value) in enumerate(changes):
            with self.subTest(path=path, value=value):
                family = self.family('resource-' + str(number))
                (prior,) = self.chain(case, sources, family, count=1)
                original_semantic = self.read(prior, 'continuation.json')['semantic_sha256']
                manifest = self.read(prior, 'manifest.json')
                target = manifest['resources']
                for field in path[:-1]:
                    target = target[field]
                target[path[-1]] = value
                (prior / 'manifest.json').write_bytes(canonical(manifest) + b'\n')
                self.reseal(prior)
                self.assertEqual(self.read(prior, 'continuation.json')['semantic_sha256'], original_semantic)
                self.reject(case, sources, family / 'rejected', prior)

    def test_nonfinite_prior_measurement_is_rejected_before_advancement(self):
        case, sources = self.case()
        family = self.family('nonfinite')
        (prior,) = self.chain(case, sources, family, count=1)
        manifest = self.read(prior, 'manifest.json')
        manifest['resources']['wall_seconds'] = 'NONFINITE_EXPONENT'
        # Valid JSON number syntax overflows binary float. The strict reader
        # rejects it; no NaN literal or invalid physical checksum masks the case.
        raw = canonical(manifest).replace(b'"NONFINITE_EXPONENT"', b'1e309')
        (prior / 'manifest.json').write_bytes(raw + b'\n')
        self.seal_ledger(prior)
        self.reject(case, sources, family / 'rejected', prior)

    def test_prior_terminal_confirmation_must_report_complete_success(self):
        case, sources = self.case()
        valid = {'code': 'live_process_memory_unavailable', 'stage': 'status',
                 'exception_type': 'ResourceSamplingFailure', 'errno': None, 'state': 'R',
                 'rss_field_count': 0, 'attempts': 3,
                 'confirmation': 'original_child_reaped_and_group_absent'}
        changes = [('confirmation', value) for value in
                   ('pending', 'still_live', 'interval_expired', 'group_still_live')]
        changes += [('attempts', True), ('rss_field_count', False), ('counts', 0)]
        for number, (field, value) in enumerate(changes):
            with self.subTest(field=field, value=value):
                family = self.family('terminal-' + str(number))
                (prior,) = self.chain(case, sources, family, count=1)
                manifest = self.read(prior, 'manifest.json')
                detail = dict(valid)
                if field != 'counts':
                    detail[field] = value
                manifest['resources']['sampling_terminal_confirmations'] = [detail]
                manifest['resources']['sampling_transitions'] = {
                    'positive_terminal_observations': 0 if field == 'counts' else 1,
                    'missing_rss_rereads': 0 if field == 'counts' else 2}
                (prior / 'manifest.json').write_bytes(canonical(manifest) + b'\n')
                self.reseal(prior)
                self.reject(case, sources, family / 'rejected', prior)

    def test_positive_but_changed_selection_budget_cannot_resume(self):
        case, sources = self.case()
        family = self.family('changed-limit')
        self.limits['total_frames'] = 32768
        (prior,) = self.chain(case, sources, family, count=1)
        before = (prior / 'continuation.json').read_bytes()
        # Both limits admit these tiny cohorts; the rejection must preserve
        # the exact predeclared chain binding, not merely detect oversized work.
        self.limits['total_frames'] = 16384
        self.reject(case, sources, family / 'rejected', prior)
        self.assertEqual((prior / 'continuation.json').read_bytes(), before)

    def test_resealed_wrong_duplicate_and_boolean_cohort_sets_are_rejected(self):
        case, sources = self.case()
        for name, selected in (('other-fitting', [2]), ('duplicate', [1, 1]), ('boolean', [True])):
            with self.subTest(name=name):
                family = self.family('forged-' + name)
                (prior,) = self.chain(case, sources, family, count=1)
                cursor = self.read(prior, 'continuation.json')
                manifest = self.read(prior, 'manifest.json')
                cursor['state']['selected_cohorts'] = selected
                cursor['state']['completed_after'] = selected
                manifest['coverage']['selected_cohorts'] = selected
                (prior / 'continuation.json').write_bytes(canonical(cursor) + b'\n')
                (prior / 'manifest.json').write_bytes(canonical(manifest) + b'\n')
                self.reseal(prior)
                self.reject(case, sources, family / 'rejected', prior)

    def test_decoder_cancellation_and_failure_cannot_advance_a_chain(self):
        case, sources = self.case()
        for mode, status in (('cancel', 'CANCELLED'), ('failure', 'FAILED')):
            with self.subTest(mode=mode):
                self.mode = 'positive'
                family = self.family(mode)
                (prior,) = self.chain(case, sources, family, count=1)
                initial = (prior / 'continuation.json').read_bytes()
                self.mode = mode
                failed = family / 'failed'
                result = self.invoke(case, sources, failed, prior)
                self.assertEqual(result['status'], status)
                self.assert_not_checkpoint(failed)
                self.assertEqual((prior / 'continuation.json').read_bytes(), initial)
                self.mode = 'positive'
                self.reject(case, sources, family / 'cannot-skip', failed)
                retry = family / 'retry'
                result = self.invoke(case, sources, retry, prior)
                self.assertEqual(result['status'], 'COMPLETE', result.get('reason'))
                self.assertEqual(self.read(retry, 'continuation.json')['state']['selected_cohorts'], [2])

    def test_family_mismatch_and_inherited_foreign_path_are_rejected(self):
        case, sources = self.case()
        family = self.family('bounded')
        (prior,) = self.chain(case, sources, family, count=1)
        foreign = self.family('foreign')
        self.reject(case, sources, foreign / 'other-family', prior)
        execution = self.read(prior, 'continuation-execution-private.json')
        execution['previous_page'] = str(foreign / 'private-outside-page')
        execution['previous_ledger_sha256'] = '0' * 64
        (prior / 'continuation-execution-private.json').write_bytes(canonical(execution) + b'\n')
        self.reseal(prior)
        self.reject(case, sources, family / 'rejected', prior, b'private-outside-page')

    def test_sixteen_page_limit_rejects_a_seventeenth_without_decoder_work(self):
        case, sources = self.case(count=17)
        family = self.family('bounded-pages')
        pages = self.chain(case, sources, family, count=16)
        self.assertEqual(self.read(pages[-1], 'continuation.json')['state']['page_number'], 16)
        previous = (pages[-1] / 'continuation.json').read_bytes()
        self.reject(case, sources, family / 'page-17', pages[-1])
        self.assertEqual((pages[-1] / 'continuation.json').read_bytes(), previous)

    def test_resealed_missing_nonsupport_record_breaks_whole_cohort_proof(self):
        case, sources = self.case()
        family = self.family('missing-original')
        (prior,) = self.chain(case, sources, family, count=1)
        # Remove the initial control record, keeping both Hello support records.
        # A payload-only check would miss this loss of an original occurrence.
        with closing(sqlite3.connect(prior / 'batch-1.sqlite')) as db:
            self.assertEqual(db.execute('DELETE FROM original_references WHERE mini_frame=1').rowcount, 1)
            db.commit()
        self.reseal(prior)
        self.reject(case, sources, family / 'rejected', prior)

    def test_resealed_nested_original_provenance_ids_must_match_fresh_case(self):
        case, sources = self.case()
        for field in ('source_id', 'ordinal', 'packet_number'):
            with self.subTest(field=field):
                family = self.family('provenance-' + field)
                (prior,) = self.chain(case, sources, family, count=1)
                with closing(sqlite3.connect(prior / 'index.sqlite')) as db:
                    ident, raw = db.execute('SELECT id,provenance_json FROM derivations ORDER BY id LIMIT 1').fetchone()
                    provenance = json.loads(raw)
                    provenance[field] += 1
                    db.execute('UPDATE derivations SET provenance_json=? WHERE id=?',
                               (canonical(provenance).decode(), ident))
                    db.commit()
                self.reseal(prior)
                self.reject(case, sources, family / 'rejected', prior)

    def test_changed_current_code_or_decoder_profile_cannot_reuse_prior_claims(self):
        case, sources = self.case()
        driver = importlib.import_module('reconstruct')
        family = self.family('stale-binding')
        (prior,) = self.chain(case, sources, family, count=1)
        paths, hashes = driver.executing_code()
        stale = dict(hashes, **{'reconstruct.py': '0' * 64})
        with patch.object(driver, 'executing_code', return_value=(paths, stale)):
            self.reject(case, sources, family / 'wrong-code', prior)
        original = dict(pipeline.PREFERENCES)
        with patch.dict(pipeline.PREFERENCES, {'tcp.desegment_tcp_streams': 'FALSE'}):
            self.reject(case, sources, family / 'wrong-profile', prior)
        self.assertEqual(pipeline.PREFERENCES, original)
        self.assertEqual(driver.executing_code()[1], hashes)

    def test_midjob_unsealed_prior_file_prevents_checkpoint_completion(self):
        case, sources = self.case()
        family = self.family('changed-prior')
        (prior,) = self.chain(case, sources, family, count=1)
        previous = (prior / 'continuation.json').read_bytes()
        regular_fake = self.fake_decoder
        marker = prior / 'unsealed-added.txt'
        def add_member(*args, **kwargs):
            result = regular_fake(*args, **kwargs)
            marker.write_bytes(b'invented unsealed member')
            return result
        output = family / 'must-fail'
        with patch.object(self, 'fake_decoder', new=add_member):
            result = self.invoke(case, sources, output, prior)
        self.assertEqual(result['status'], 'FAILED')
        self.assertEqual(self.last_decoder.call_count, 1)
        self.assertTrue(marker.is_file())
        self.assert_not_checkpoint(output)
        self.assertEqual((prior / 'continuation.json').read_bytes(), previous)


if __name__ == '__main__':
    unittest.main(verbosity=2)
