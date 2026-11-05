"""Closed case input integrity and self-resealed index forgery regressions."""
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import socket
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from analyze import analyze
from core import IngestError, canonical
from fixtures import eth, hello, ipv4, pcap, tcp
from reconstruct_input import checksum_entries, validated_case, validate_source_map


class ReconstructInput(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def case(self, count=1, config=None):
        sources = []
        for number in range(count):
            path = self.root / ('capture-' + str(number) + '.pcap')
            path.write_bytes(pcap([eth(ipv4(tcp(hello()[:20]), 6)),
                                  eth(ipv4(tcp(b'invented-conflicting-overlap'), 6)),
                                  eth(ipv4(tcp(hello()[20:]), 6))]))
            sources.append(path)
        case = self.root / 'case'
        analyze(sources, case, config=config, pseudonym_key=b'Q' * 32)
        return case, dict(enumerate(sources, 1))

    def reseal(self, case):
        path = case / 'SHA256SUMS'
        rows = []
        for line in path.read_text().splitlines():
            _, name = line.split('  ', 1)
            rows.append(hashlib.sha256((case / name).read_bytes()).hexdigest() + '  ' + name)
        path.write_text('\n'.join(rows) + '\n')

    def mutate_index(self, case, sql):
        with closing(sqlite3.connect(case / 'index.sqlite')) as db:
            db.executescript(sql)
            db.commit()
        self.reseal(case)

    def test_full_original_reconciliation_preserves_case_key_and_sources(self):
        case, sources = self.case(2, {'contexts': {'1': 'shared', '2': 'shared'}})
        before = {p: hashlib.sha256(p.read_bytes()).hexdigest()
                  for p in (case / 'index.sqlite', *sources.values())}
        with patch.object(socket, 'socket', side_effect=AssertionError('network forbidden')), \
             patch.object(socket, 'getaddrinfo', side_effect=AssertionError('resolution forbidden')):
            with validated_case(case, sources) as bound:
                self.assertTrue(bound.binding['original_sources_reconciled'])
                self.assertEqual(bound.binding['reconciled_original_packet_count'], 6)
                self.assertEqual(bound.pseudonym_key, b'Q' * 32)
                self.assertEqual(list(bound.sources), [1, 2])
                self.assertEqual([s['packet_count'] for s in bound.sources.values()], [3, 3])
                self.assertEqual(bound.db.total_changes, 0)
                with self.assertRaises(sqlite3.OperationalError):
                    bound.db.execute('DELETE FROM records')
                bound.verify_after()
                self.assertNotIn(str(self.root), json.dumps(bound.binding))
                self.assertNotIn('pseudonym.key', bound.binding['sealed_members_sha256'])
        self.assertEqual(before, {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in before})

    def test_self_resealed_omitted_conflicting_packet_cannot_establish_complete_cohort(self):
        case, sources = self.case()
        self.mutate_index(case, 'DELETE FROM packet_meta WHERE id=2; '
                                'DELETE FROM records WHERE source_id=1 AND ordinal=2;')
        with self.assertRaisesRegex(IngestError, 'reconstruct_index_packet_order_mismatch'):
            with validated_case(case, sources):
                self.fail('forged case must not reach any reference decoder')

    def test_self_resealed_tuple_flags_losses_and_times_are_checked_against_original(self):
        changes = ("sport=22", "tcp_flags=4", "losses='[]'", "utc_ns=0")
        for index, assignment in enumerate(changes):
            with self.subTest(assignment=assignment), tempfile.TemporaryDirectory() as directory:
                old_root = self.root
                self.root = Path(directory)
                try:
                    case, sources = self.case()
                    self.mutate_index(case, 'UPDATE packet_meta SET ' + assignment + ' WHERE id=1;')
                    with self.assertRaises(IngestError):
                        with validated_case(case, sources):
                            self.fail('forged tuple/time/flag/loss must not reach decoder')
                finally:
                    self.root = old_root

    def test_self_resealed_record_locations_and_extra_records_fail(self):
        case, sources = self.case()
        self.mutate_index(case, 'UPDATE records SET offset=offset+1 WHERE ordinal=1;')
        with self.assertRaisesRegex(IngestError, 'reconstruct_record_differs_from_original'):
            with validated_case(case, sources):
                pass

    def test_unmatched_record_and_source_defined_view_are_rejected(self):
        case, sources = self.case()
        self.mutate_index(case, "INSERT INTO records SELECT source_id,ordinal+100,offset,length,sha256,timestamp,kind,protocol,captured_bytes,status FROM records WHERE ordinal=1;")
        with self.assertRaisesRegex(IngestError, 'reconstruct_index_has_unmatched_record'):
            with validated_case(case, sources):
                pass
        self.mutate_index(case, 'DROP TABLE packet_meta; CREATE VIEW packet_meta AS SELECT 1 AS id;')
        with self.assertRaisesRegex(IngestError, 'reconstruct_ordinary_case_table_required'):
            with validated_case(case, sources):
                pass

    def test_unsupported_source_kind_remains_explicit(self):
        case, sources = self.case()
        manifest = json.loads((case / 'manifest.json').read_text())
        manifest['sources'][0]['kind'] = 'pcapng'
        (case / 'manifest.json').write_bytes(canonical(manifest))
        self.reseal(case)
        with self.assertRaisesRegex(IngestError, 'reconstruct_classic_sources_only'):
            with validated_case(case, sources):
                pass

    def test_checksum_reseal_does_not_make_source_mutation_valid(self):
        case, sources = self.case()
        source = sources[1]
        raw = bytearray(source.read_bytes())
        raw[-1] ^= 1
        source.write_bytes(raw)
        with self.assertRaisesRegex(IngestError, 'reconstruct_source_before_hash_mismatch'):
            with validated_case(case, sources):
                pass

    def test_mutation_and_new_sidecars_during_use_fail_final_check(self):
        case, sources = self.case()
        with self.assertRaisesRegex(IngestError, 'reconstruct_case_sidecar_present'):
            with validated_case(case, sources):
                (case / 'index.sqlite-wal').write_bytes(b'invented')
        (case / 'index.sqlite-wal').unlink()
        with self.assertRaisesRegex(IngestError, 'reconstruct_original_source_changed'):
            with validated_case(case, sources):
                with sources[1].open('ab') as stream:
                    stream.write(b'x')

    def test_sidecars_unsealed_or_missing_members_and_wrong_key_fail(self):
        case, sources = self.case()
        (case / 'index.sqlite-shm').write_bytes(b'invented')
        with self.assertRaisesRegex(IngestError, 'reconstruct_case_sidecar_present'):
            with validated_case(case, sources):
                pass
        (case / 'index.sqlite-shm').unlink()
        (case / 'pseudonym.key').write_bytes(b'bad')
        with self.assertRaisesRegex(IngestError, 'reconstruct_case_checksum_mismatch'):
            with validated_case(case, sources):
                pass
        self.reseal(case)
        with self.assertRaisesRegex(IngestError, 'reconstruct_case_key_invalid'):
            with validated_case(case, sources):
                pass

    def test_late_source_and_case_symlinks_or_hardlinks_are_rejected(self):
        for target_kind in ('source', 'case'):
            for link_kind in ('symlink', 'hardlink'):
                with self.subTest(target=target_kind, link=link_kind), tempfile.TemporaryDirectory() as directory:
                    old_root, self.root = self.root, Path(directory)
                    try:
                        case, sources = self.case()
                        target = sources[1] if target_kind == 'source' else case / 'index.sqlite'
                        code = 'reconstruct_original_source_changed' if target_kind == 'source' else 'reconstruct_case_input_changed'
                        with self.assertRaisesRegex(IngestError, code):
                            with validated_case(case, sources):
                                if link_kind == 'hardlink':
                                    os.link(target, self.root / 'added-hardlink')
                                else:
                                    original = target.with_name(target.name + '.original')
                                    target.rename(original)
                                    target.symlink_to(original)
                    finally:
                        self.root = old_root

    def test_declared_lower_packet_cap_applies_to_full_original_reconciliation(self):
        case, sources = self.case()
        with self.assertRaisesRegex(IngestError, '^reconstruct_packet_budget$'):
            with validated_case(case, sources, packet_rows=2):
                self.fail('the full native reconciliation must honor the declared cap')
        with validated_case(case, sources, packet_rows=3) as bound:
            self.assertEqual(bound.binding['reconciled_original_packet_count'], 3)
        for invalid in (0, True, 2000001):
            with self.subTest(value=invalid), self.assertRaisesRegex(IngestError, 'reconstruct_packet_budget_invalid'):
                with validated_case(case, sources, packet_rows=invalid):
                    pass

    def test_source_ids_are_canonical_and_every_occurrence_is_required(self):
        for bad in ({True: 'a'}, {'1': 'a'}, {0: 'a'}, {4097: 'a'}, {}, []):
            with self.subTest(value=bad), self.assertRaises(IngestError):
                validate_source_map(bad)
        case, sources = self.case(2)
        with self.assertRaisesRegex(IngestError, 'reconstruct_all_source_occurrences_required'):
            with validated_case(case, {1: sources[1]}):
                pass
        with validated_case(case, {2: sources[2], 1: sources[1]}) as bound:
            self.assertEqual(list(bound.sources), [1, 2])

    def test_checksum_paths_duplicates_and_budget_fail_closed(self):
        for name in ('../outside', '/absolute', 'a/../b', 'a//b', './manifest.json', 'a\\b'):
            with self.subTest(name=name), self.assertRaises(IngestError):
                checksum_entries(('a' * 64 + '  ' + name + '\n').encode())
        with self.assertRaises(IngestError):
            checksum_entries(b'x' * (1024 * 1024 + 1))
        case, sources = self.case()
        with (case / 'SHA256SUMS').open('ab') as stream:
            stream.write((case / 'SHA256SUMS').read_bytes().splitlines()[0] + b'\n')
        with self.assertRaises(IngestError):
            with validated_case(case, sources):
                pass

    def test_source_symlink_hardlink_and_guard_abort_are_rejected(self):
        case, sources = self.case()
        link = self.root / 'link.pcap'
        link.symlink_to(sources[1])
        with self.assertRaisesRegex(IngestError, 'source_symlink_rejected'):
            with validated_case(case, {1: link}):
                pass
        link.unlink()
        os.link(sources[1], link)
        with self.assertRaisesRegex(IngestError, 'source_not_regular_or_hardlinked'):
            with validated_case(case, sources):
                pass
        link.unlink()
        def cancelled():
            raise KeyboardInterrupt()
        with self.assertRaises(KeyboardInterrupt):
            with validated_case(case, sources, cancelled):
                pass


if __name__ == '__main__':
    unittest.main()
