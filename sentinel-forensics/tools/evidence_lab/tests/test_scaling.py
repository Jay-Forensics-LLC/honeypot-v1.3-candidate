"""Resource and interval regressions; these are not real capture coverage."""
from contextlib import closing
import json
from pathlib import Path
import random
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from analyze import analyze
from core import IngestError
from correlate import mapping_conflicts
from store import Store
from fixtures import arp, pcap

class MappingScaling(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.db = sqlite3.connect(self.root / 'index.sqlite')
        self.addCleanup(self.db.close)
        Store(self.db)

    def insert(self, values):
        self.db.executemany('INSERT INTO associations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            ((ident, 'arp.mapping' if start == end else 'dhcp.lease', context, 'ip', address,
              'mac', mac, start, end, ident, 'fixture', '1', 'direct_observation',
              'Synthetic test statement only', '[]') for ident, context, address, mac, start, end in values))
        self.db.commit()

    def pairs(self):
        return self.db.execute('SELECT association_a,association_b FROM conflicts ORDER BY id').fetchall()

    def bounded_steps(self, callback, budget):
        measured = [0]
        def progress():
            measured[0] += 100
            return measured[0] > budget
        self.db.set_progress_handler(progress, 100)
        try: result = callback()
        finally: self.db.set_progress_handler(None, 0)
        self.assertLessEqual(measured[0], budget)
        return result, measured[0]

    def test_points_and_exclusive_lease_endpoints(self):
        self.insert([
            (1, 'lan', '192.0.2.1', '02:00:00:00:00:01', 0, 10),
            (2, 'lan', '192.0.2.1', '02:00:00:00:00:02', 0, 0),
            (3, 'lan', '192.0.2.1', '02:00:00:00:00:03', 9, 9),
            (4, 'lan', '192.0.2.1', '02:00:00:00:00:04', 10, 10),
            (5, 'lan', '192.0.2.1', '02:00:00:00:00:05', 10, 15),
            (6, 'other-lan', '192.0.2.1', '02:00:00:00:00:06', 0, 20),
            (7, 'lan', '192.0.2.2', '02:00:00:00:00:07', 0, 20),
            (8, 'lan', '192.0.2.1', '02:00:00:00:00:08', None, None),
        ])
        mapping_conflicts(self.db)
        self.assertEqual(self.pairs(), [(1, 2), (1, 3), (4, 5)])

    def test_small_intervals_match_independent_pairwise_oracle(self):
        rng = random.Random(37471)
        values = []
        for ident in range(1, 121):
            start = rng.randint(-15, 15)
            end = start + rng.choice((0, 0, 1, 5, 20))
            if ident % 13 == 0: start = end = None
            values.append((ident, rng.choice(('lan-a', 'lan-b')),
                           rng.choice(('192.0.2.1', '2001:db8::1')),
                           f'02:00:00:00:00:{rng.randrange(4):02x}', start, end))
        expected = []
        for a in values:
            for b in values:
                if a[0] >= b[0] or a[1:3] != b[1:3] or a[3] == b[3] or a[4] is None or b[4] is None:
                    continue
                if a[4] == a[5] and b[4] == b[5]: overlap = a[4] == b[4]
                elif a[4] == a[5]: overlap = b[4] <= a[4] < b[5]
                elif b[4] == b[5]: overlap = a[4] <= b[4] < a[5]
                else: overlap = max(a[4], b[4]) < min(a[5], b[5])
                if overlap: expected.append((a[0], b[0]))
        rng.shuffle(values)
        self.insert(values)
        mapping_conflicts(self.db)
        self.assertEqual(self.pairs(), expected)
        self.db.execute('DELETE FROM conflicts')
        mapping_conflicts(self.db)
        self.assertEqual(self.pairs(), expected)

    def test_repeated_points_and_identical_leases_avoid_pairwise_work(self):
        for kind in ('points', 'leases'):
            with self.subTest(kind=kind):
                self.db.execute('DELETE FROM associations')
                count = 4000
                self.insert((i, 'lan', '192.0.2.1', '02:00:00:00:00:01',
                             i, i if kind == 'points' else i + count)
                            for i in range(1, count + 1))
                self.bounded_steps(lambda: mapping_conflicts(self.db), 2_000_000)
                self.assertEqual(self.pairs(), [])
                self.assertEqual(self.db.execute('SELECT COUNT(*) FROM associations').fetchone()[0], count)

    def test_conflict_budget_stops_before_publishing_partial_pairs(self):
        self.insert((i, 'lan', '192.0.2.1', f'02:00:00:00:00:{i:02x}', 0, 0) for i in range(1, 5))
        with patch('correlate.MAX_CONFLICT_PAIRS', 5):
            with self.assertRaisesRegex(IngestError, 'correlation_conflict_pair_budget'):
                mapping_conflicts(self.db)
        self.assertEqual(self.pairs(), [])
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM sqlite_temp_master WHERE type='table'").fetchone()[0], 0)

    def test_duplicate_lookup_cost_with_many_duplicate_occurrences(self):
        self.db.executemany('INSERT INTO duplicates VALUES (?,?,?,?)', ((2, i, 1, i) for i in range(1, 4001)))
        def lookup():
            for i in range(1, 1001):
                self.assertEqual(self.db.execute('SELECT duplicate_source,duplicate_ordinal FROM duplicates WHERE source_id=? AND ordinal=?', (2, i)).fetchone(), (1, i))
        self.bounded_steps(lookup, 100_000)

    def test_conflict_reverse_lookup_cost_with_many_pairs(self):
        self.db.executemany('INSERT INTO conflicts VALUES (NULL,?,?,?)', ((i, i+4000, 'fixture') for i in range(1, 4001)))
        def lookup():
            for i in range(1, 1001):
                rows = self.db.execute('SELECT association_a,association_b FROM conflicts WHERE association_a=? OR association_b=? ORDER BY id', (i+4000, i+4000)).fetchall()
                self.assertEqual(rows, [(i, i+4000)])
        self.bounded_steps(lookup, 150_000)

    def test_repeated_packets_keep_every_provenance_occurrence(self):
        packet = arp()
        source = self.root / 'repeated.pcap'
        source.write_bytes(pcap([(1700000000, packet)] * 250))
        output = self.root / 'case'
        manifest = analyze([source, source], output)
        with closing(sqlite3.connect(output / 'index.sqlite')) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM packet_meta').fetchone()[0], 500)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM associations').fetchone()[0], 500)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM duplicates').fetchone()[0], 499)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM conflicts').fetchone()[0], 0)
        duplicates = 0
        with (output / 'export/exchange.jsonl').open() as stream:
            for raw in stream:
                item = json.loads(raw)
                if item['entity'] == 'observation' and item['id'].startswith('packet:'):
                    ref = item['payload']['provenance']
                    self.assertEqual(ref['byte_length'], 16 + len(packet))
                    if item['payload']['duplicate_of'] is not None:
                        self.assertEqual(item['payload']['duplicate_of'], 'record:1:1')
                        duplicates += 1
        self.assertEqual(duplicates, 499)
        self.assertEqual(manifest['coverage']['counts']['duplicate_records'], 499)

if __name__ == '__main__': unittest.main()
