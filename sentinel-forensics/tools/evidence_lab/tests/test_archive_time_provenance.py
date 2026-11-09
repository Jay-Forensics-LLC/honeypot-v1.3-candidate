"""Invented archive records keep exact time, uncertainty and source provenance.

These local ZIP fixtures establish parser behavior, not genuine clock calibration.
"""
import hashlib
import json
from pathlib import Path
import plistlib
import socket
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from analyze import analyze
from contract import validate_file
from core import iso_ns
from query import timeline


MARKER = 'invented-private-archive-message-02:00:00:00:00:92'


class ArchiveTimeProvenance(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def archive(self, members, name='invented'):
        source = self.root/(name+'.zip')
        with zipfile.ZipFile(source, 'w') as archive:
            for member, data in members:
                archive.writestr(member, data)
        return source

    def case(self, source, name, config=None):
        before = hashlib.sha256(source.read_bytes()).hexdigest()
        output = self.root/name
        with patch.object(socket, 'socket', side_effect=AssertionError('network forbidden')), \
             patch.object(socket, 'getaddrinfo', side_effect=AssertionError('resolution forbidden')):
            result = analyze([source], output, config=config, pseudonym_key=b'A'*32)
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), before)
        self.assertEqual(result['status'], 'COMPLETE')
        self.assertGreater(validate_file(output/'export/exchange.jsonl'), 0)
        db = sqlite3.connect(output/'index.sqlite')
        self.addCleanup(db.close)
        self.assertEqual(db.execute('SELECT sha256 FROM sources').fetchone()[0], before)
        return db, output

    def rows(self, db):
        return [{'ordinal': ordinal, 'time': json.loads(when), 'data': json.loads(data),
                 'reference': json.loads(reference), 'timestamp': timestamp, 'status': status}
                for ordinal, when, data, reference, timestamp, status in db.execute(
                    '''SELECT o.ordinal,o.time_json,o.data_json,o.provenance_json,r.timestamp,r.status
                       FROM observations o JOIN records r
                       ON r.source_id=o.source_id AND r.ordinal=o.ordinal ORDER BY o.ordinal''')]

    def test_archive_and_plaintext_normalize_supported_spellings_without_losing_precision(self):
        values = [
            ('2026-01-01T00:00:00.123456789-0400', '2026-01-01T04:00:00.123456789Z', 9, '-04:00'),
            ('2026-01-01 00:00:00.123456789 -04:00', '2026-01-01T04:00:00.123456789Z', 9, '-04:00'),
            ('2026-01-01T00:00:00.123456789-04:00', '2026-01-01T04:00:00.123456789Z', 9, '-04:00'),
            ('2026-01-01T00:00:00.001+05:30', '2025-12-31T18:30:00.001000000Z', 3, '+05:30'),
            ('2026-01-01T00:00:00Z', '2026-01-01T00:00:00.000000000Z', 0, 'Z')]
        raw = ''.join(value+' '+MARKER+'\n' for value, _, _, _ in values).encode()
        plain = self.root/'equivalent.log'
        plain.write_bytes(raw)
        direct, _ = self.case(plain, 'direct')
        archived, _ = self.case(self.archive([('member.log', raw)]), 'archived')
        direct_rows, archive_rows = self.rows(direct), self.rows(archived)
        self.assertEqual(len(archive_rows), len(values))
        for (original, expected, digits, zone), direct_row, row in zip(values, direct_rows, archive_rows):
            with self.subTest(original=original):
                self.assertEqual(row['time']['original'], original)
                self.assertEqual(row['time']['status'], 'normalized')
                self.assertEqual(row['time']['precision'], {'decimal_digits': digits})
                self.assertEqual(row['time']['timezone'], zone)
                self.assertEqual(row['time']['clock'], 'diagnostic_unverified')
                self.assertEqual(iso_ns(row['time']['utc_ns']), expected)
                self.assertEqual(row['timestamp'], expected)
                self.assertIsNone(row['status'])
                self.assertEqual(row['time']['utc_ns'], direct_row['time']['utc_ns'])
                self.assertEqual(row['timestamp'], direct_row['timestamp'])

    def test_archive_overprecision_is_unresolved_and_following_record_continues(self):
        values = ['2026-01-01T00:00:00.1234567891-0400',
                  '2026-01-01T00:00:00.1234567891 -04:00',
                  '2026-01-01T00:00:01.000000001Z']
        raw = ''.join(value+' '+MARKER+'\n' for value in values).encode()
        db, _ = self.case(self.archive([('precision.log', raw)]), 'precision')
        rows = self.rows(db)
        self.assertEqual(len(rows), 3)
        for value, row in zip(values, rows[:2]):
            self.assertEqual(row['time']['original'], value)
            self.assertEqual(row['time']['status'], 'unresolved')
            self.assertIsNone(row['time']['utc_ns'])
            self.assertIsNone(row['time']['precision'])
            self.assertEqual(row['time']['timezone'], '-04:00')
            self.assertEqual(row['data'], {'timestamp_status': 'unsupported_precision'})
            self.assertIsNone(row['timestamp'])
            self.assertEqual(row['status'], 'timestamp_unsupported_precision')
        self.assertEqual(rows[2]['timestamp'], values[2])
        self.assertEqual([row['ordinal'] for row in timeline(db)], [3])
        self.assertEqual(len(list(timeline(db, include_unresolved=True))), 3)

    def test_invalid_missing_and_unanchored_archive_times_remain_distinct(self):
        values = [({'timestamp': '2026-01-01T00:00:00.123456789 +0199'}, 'invalid'),
                  ({'timestamp': '2026-02-30T00:00:00Z'}, 'invalid'),
                  ({'timestamp': '2026-01-01T00:00:00.123456789'}, 'timezone_unknown'),
                  ({'timestamp': 1700000000}, 'unresolved'), ({}, 'missing')]
        raw = b''.join(json.dumps({**value, 'message': MARKER}).encode()+b'\n'
                       for value, _ in values)
        db, _ = self.case(self.archive([('uncertain.jsonl', raw)]), 'uncertain')
        rows = self.rows(db)
        self.assertEqual(len(rows), len(values))
        for (value, status), row in zip(values, rows):
            self.assertEqual(row['time']['original'], value.get('timestamp'))
            self.assertEqual(row['time']['status'], status)
            self.assertEqual(row['time']['clock'], 'diagnostic_unverified')
            self.assertIsNone(row['time']['utc_ns'])
            self.assertIsNone(row['timestamp'])
            self.assertEqual(row['status'], 'timestamp_'+status)
        self.assertEqual(list(timeline(db)), [])
        self.assertEqual(len(list(timeline(db, include_unresolved=True))), len(values))

    def test_unsupported_archive_time_payloads_are_explicit_without_content_retention(self):
        values = [{'private': MARKER}, [MARKER], MARKER*4, True, 2**200]
        raw = b''.join(json.dumps({'timestamp': value, 'message': MARKER}).encode()+b'\n'
                       for value in values)
        db, output = self.case(self.archive([('payloads.jsonl', raw)]), 'payloads')
        rows = self.rows(db)
        self.assertEqual(len(rows), len(values))
        for row in rows:
            self.assertEqual(row['time']['original'], {'type': 'unsupported_representation'})
            self.assertEqual(row['time']['status'], 'unresolved')
            self.assertEqual(row['data'], {'timestamp_status': 'unsupported_representation'})
            self.assertEqual(row['status'], 'timestamp_unsupported_representation')
            self.assertIsNone(row['timestamp'])
        for path in output.rglob('*'):
            if path.is_file():
                self.assertNotIn(MARKER.encode(), path.read_bytes())

    def test_supported_structured_members_keep_source_time_and_nonfinite_plist_semantics(self):
        value = '2026-01-01T00:00:00.123456789-0400'
        members = [('timestamp.json', json.dumps({'timestamp': value}).encode()),
                   ('timestamp.ips', json.dumps({'time': value}).encode()),
                   ('timestamp.plist', plistlib.dumps({'date': value})),
                   ('nonfinite.plist', plistlib.dumps({'timestamp': float('inf')}))]
        db, _ = self.case(self.archive(members), 'structured')
        rows = self.rows(db)
        self.assertEqual(len(rows), 4)
        for row in rows[:3]:
            self.assertEqual(row['time']['original'], value)
            self.assertEqual(row['timestamp'], '2026-01-01T04:00:00.123456789Z')
            self.assertEqual(row['time']['precision'], {'decimal_digits': 9})
        self.assertEqual(rows[3]['time']['original'], {'type': 'nonfinite_number'})
        self.assertEqual(rows[3]['time']['status'], 'unresolved')
        self.assertIsNone(rows[3]['timestamp'])
        self.assertEqual(rows[3]['data'], {'timestamp_status': 'unsupported_nonfinite'})
        self.assertEqual(rows[3]['status'], 'timestamp_unsupported_nonfinite')
        self.assertEqual([row['reference']['record_sha256'] for row in rows],
                         [hashlib.sha256(raw).hexdigest() for _, raw in members])

    def test_duplicates_member_locations_and_malformed_records_keep_exact_provenance(self):
        line = ('2026-01-01T00:00:00.123456789-0400 '+MARKER+'\r\n').encode()
        valid = b'{"timestamp":"2026-01-01T00:00:01.000000001Z"}\n'
        malformed = b'{not-json}\n'
        members = [('private-first.log', line*2), ('private-second.jsonl', valid+malformed)]
        source = self.archive(members, 'private-archive-source')
        db, output = self.case(source, 'provenance')
        rows = self.rows(db)
        self.assertEqual([row['ordinal'] for row in rows], [1, 2, 3])
        archive_sha = hashlib.sha256(source.read_bytes()).hexdigest()
        for row, exact, offset, member in zip(rows, (line, line, valid), (0, len(line), 0),
                                              (members[0][1], members[0][1], members[1][1])):
            ref = row['reference']
            self.assertEqual(ref['source_id'], 1)
            self.assertEqual(ref['archive_sha256'], archive_sha)
            self.assertEqual(ref['file_sha256'], hashlib.sha256(member).hexdigest())
            self.assertEqual(ref['record_sha256'], hashlib.sha256(exact).hexdigest())
            self.assertEqual(ref['byte_offset'], offset)
            self.assertEqual(ref['byte_length'], len(exact))
            self.assertEqual(ref['precision'], 'archive_member_logical')
        self.assertEqual(rows[0]['reference']['file_id'], rows[1]['reference']['file_id'])
        self.assertNotEqual(rows[1]['reference']['file_id'], rows[2]['reference']['file_id'])
        duplicate_rows = db.execute('SELECT id,duplicate_of FROM observations ORDER BY id').fetchall()
        self.assertEqual([row[1] for row in duplicate_rows], [None, duplicate_rows[0][0], None])
        self.assertEqual(db.execute("SELECT ordinal,sha256,status FROM records WHERE kind='parse_error'").fetchall(),
                         [(4, hashlib.sha256(malformed).hexdigest(), 'malformed_record')])
        self.assertEqual(db.execute('SELECT COUNT(*) FROM records').fetchone()[0], 4)
        for path in output.rglob('*'):
            if path.is_file():
                self.assertEqual(path.stat().st_mode & 0o077, 0, path.name)
                self.assertNotIn(MARKER.encode(), path.read_bytes())
        exported = (output/'export/exchange.jsonl').read_text()
        for private in (source.name, 'private-first.log', 'private-second.jsonl', '-0400'):
            self.assertNotIn(private, exported)

    def test_archive_clock_adjustment_is_queryable_recorded_and_reversible(self):
        raw = b'{"timestamp":"2026-01-01T00:00:00.123456789-0400"}\n{}\n'
        source = self.archive([('adjusted.jsonl', raw)])
        offset = 1000000007
        config = {'clock_adjustments': {'1': {'offset_ns': offset,
                  'justification': 'Invented test calibration only'}}}
        db, _ = self.case(source, 'adjusted', config=config)
        selected = list(timeline(db, since='2026-01-01T04:00:01.123456796Z',
                                 until='2026-01-01T04:00:01.123456797Z'))
        self.assertEqual(len(selected), 1)
        event = selected[0]
        self.assertEqual(event['utc_ns'], 1767240001123456796)
        self.assertEqual(event['original_utc_ns'], 1767240000123456789)
        self.assertEqual(event['time']['utc_ns'], event['original_utc_ns'])
        self.assertEqual(event['time']['original'], '2026-01-01T00:00:00.123456789-0400')
        self.assertEqual(db.execute('SELECT source_id,offset_ns,justification FROM adjustments').fetchone(),
                         (1, offset, 'Invented test calibration only'))
        self.assertEqual(event['utc_ns']-offset, event['original_utc_ns'])
        self.assertEqual(self.rows(db)[0]['timestamp'], '2026-01-01T04:00:00.123456789Z')
        restored, _ = self.case(source, 'restored', config={'clock_adjustments': {'1': {
            'offset_ns': 0, 'justification': 'Reverse the invented adjustment'}}})
        self.assertEqual(list(timeline(restored))[0]['utc_ns'], event['original_utc_ns'])
        self.assertEqual(len(list(timeline(db, include_unresolved=True))), 2)


if __name__ == '__main__':
    unittest.main()
