"""Invented plaintext/JSON timestamps preserve original precision and offset.

These are bounded local log fixtures, not decoder or real-source qualification.
"""
import hashlib
import json
from pathlib import Path
import socket
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from analyze import analyze
from contract import validate_file
from core import iso_ns, time_info
from query import timeline


MARKER = 'invented-private-message-02:00:00:00:00:91'


class TextTimeProvenance(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def case(self, data, *, name='case', suffix='.log'):
        source = self.root/(name+suffix)
        source.write_bytes(data)
        output = self.root/name
        result = analyze([source],output,pseudonym_key=b'K'*32)
        db = sqlite3.connect(output/'index.sqlite')
        self.addCleanup(db.close)
        return result,db,output,source

    def observations(self, db):
        return [(ordinal,json.loads(when),json.loads(data),json.loads(ref))
                for ordinal,when,data,ref in db.execute(
                    'SELECT ordinal,time_json,data_json,provenance_json FROM observations ORDER BY id')]

    def test_recognized_plaintext_offset_spellings_retain_exact_original_and_nanoseconds(self):
        cases = [
            ('2026-01-01T00:00:00.123456789-04:00','2026-01-01T04:00:00.123456789Z',9,'-04:00'),
            ('2026-01-01 00:00:00.123456789 -0400','2026-01-01T04:00:00.123456789Z',9,'-04:00'),
            ('2026-01-01T00:00:00.123456789-0400','2026-01-01T04:00:00.123456789Z',9,'-04:00'),
            ('2026-01-01T00:00:00.123456789 -04:00','2026-01-01T04:00:00.123456789Z',9,'-04:00'),
            ('2026-01-01T00:00:00.001+05:30','2025-12-31T18:30:00.001000000Z',3,'+05:30'),
            ('2026-01-01T00:00:00Z','2026-01-01T00:00:00.000000000Z',0,'Z')]
        raw = ''.join(value+' '+MARKER+'\n' for value,_,_,_ in cases).encode('utf-8')
        result,db,_,_ = self.case(raw)
        rows = self.observations(db)
        self.assertEqual(len(rows),len(cases))
        self.assertEqual(result['coverage']['counts']['parse_errors'],0)
        indexed_times = [row[0] for row in db.execute('SELECT timestamp FROM records ORDER BY ordinal')]
        for (value,expected,digits,zone),(_,when,_,_),indexed in zip(cases,rows,indexed_times):
            with self.subTest(original=value):
                self.assertEqual(when['original'],value)
                self.assertEqual(when['status'],'normalized')
                self.assertEqual(iso_ns(when['utc_ns']),expected)
                self.assertEqual(when['precision'],{'decimal_digits':digits})
                self.assertEqual(when['timezone'],zone)
                self.assertEqual(iso_ns(time_info(indexed)['utc_ns']),expected)

    def test_generic_json_uses_original_time_values_without_microsecond_normalization(self):
        values = [('timestamp','2026-01-01T00:00:00.123456789-04:00'),
                  ('time','2026-01-01T00:00:00.001Z'),
                  ('date','2026-01-01T00:00:00Z'),
                  ('captureTime','2026-01-01T00:00:00.000000001+00:00')]
        raw = b''.join(json.dumps({key:value,'message':MARKER}).encode()+b'\n' for key,value in values)
        _,db,_,_ = self.case(raw,suffix='.jsonl')
        expected = [('2026-01-01T04:00:00.123456789Z',9),
                    ('2026-01-01T00:00:00.001000000Z',3),
                    ('2026-01-01T00:00:00.000000000Z',0),
                    ('2026-01-01T00:00:00.000000001Z',9)]
        observations = self.observations(db)
        self.assertEqual(len(observations),len(values))
        for (_,value),(_,when,_,_),(utc,digits) in zip(values,observations,expected):
            self.assertEqual(when['original'],value)
            self.assertEqual(iso_ns(when['utc_ns']),utc)
            self.assertEqual(when['precision'],{'decimal_digits':digits})

    def test_plaintext_invalid_offset_and_timezone_free_values_are_not_repaired(self):
        values = [('2026-01-01T00:00:00.123456789+01:99','invalid'),
                  ('2026-01-01T00:00:00.123456789 +0199','invalid'),
                  ('2026-01-01T00:00:00.123456789','timezone_unknown'),
                  ('2026-02-30T00:00:00Z','invalid')]
        raw = ''.join(value+' '+MARKER+'\n' for value,_ in values).encode()
        _,db,_,_ = self.case(raw)
        rows = self.observations(db)
        self.assertEqual(len(rows),len(values))
        for (value,status),(_,when,_,_) in zip(values,rows):
            self.assertEqual(when['original'],value)
            self.assertEqual(when['status'],status)
            self.assertIsNone(when['utc_ns'])
        self.assertEqual(list(timeline(db)),[])
        self.assertEqual(len(list(timeline(db,include_unresolved=True))),len(values))

    def test_excessive_fraction_precision_is_explicit_and_never_truncated(self):
        value = '2026-01-01T00:00:00.1234567891-04:00'
        following = '2026-01-01T00:00:01.000000001Z'
        for suffix,raw in (('.log',(value+' '+MARKER+'\n'+following+' '+MARKER+'\n').encode()),
                           ('.jsonl',(''.join(json.dumps({'timestamp':timestamp,'message':MARKER})+'\n'
                                for timestamp in (value,following))).encode())):
            with self.subTest(suffix=suffix):
                result,db,output,_ = self.case(raw,name='excessive'+suffix[1:],suffix=suffix)
                self.assertEqual(result['status'],'COMPLETE')
                rows = self.observations(db)
                self.assertEqual(len(rows),2)
                _,when,data,_ = rows[0]
                self.assertEqual(when['original'],value)
                self.assertEqual(when['status'],'unresolved')
                self.assertIsNone(when['utc_ns'])
                self.assertIsNone(when['precision'])
                self.assertEqual(when['timezone'],'-04:00')
                self.assertEqual(data.get('timestamp_status'),'unsupported_precision')
                status = db.execute('SELECT status FROM records ORDER BY ordinal').fetchone()[0]
                self.assertIn('unsupported_precision',status)
                self.assertEqual(iso_ns(rows[1][1]['utc_ns']),following)
                self.assertGreater(validate_file(output/'export/exchange.jsonl'),0)

    def test_unsupported_timestamp_payloads_are_typed_without_retaining_arbitrary_content(self):
        values = [{'nested-payload':MARKER},[MARKER],MARKER*8,True,2**200]
        valid = {'timestamp':'2026-01-01T00:00:00.000000001Z','message':MARKER}
        raw = b''.join(json.dumps({'timestamp':value,'message':MARKER}).encode()+b'\n' for value in values)
        raw += json.dumps(valid).encode()+b'\n'
        result,db,output,source = self.case(raw,suffix='.jsonl')
        observations = self.observations(db)
        self.assertEqual(len(observations),len(values)+1)
        self.assertEqual(result['coverage']['counts']['parse_errors'],0)
        for _,when,data,ref in observations[:-1]:
            self.assertEqual(when['original'],{'type':'unsupported_representation'})
            self.assertEqual(when['status'],'unresolved')
            self.assertIsNone(when['utc_ns'])
            self.assertEqual(data.get('timestamp_status'),'unsupported_representation')
            original = raw[ref['byte_offset']:ref['byte_offset']+ref['byte_length']]
            self.assertEqual(hashlib.sha256(original).hexdigest(),ref['record_sha256'])
        self.assertEqual(iso_ns(observations[-1][1]['utc_ns']),'2026-01-01T00:00:00.000000001Z')
        self.assertEqual(source.read_bytes(),raw)
        for path in output.rglob('*'):
            if path.is_file():
                self.assertNotIn(MARKER.encode(),path.read_bytes())
        self.assertGreater(validate_file(output/'export/exchange.jsonl'),0)

    def test_missing_and_numeric_json_time_keep_uncertainty_and_later_rows_continue(self):
        rows = [{'message':MARKER},{'timestamp':1700000000,'message':MARKER},
                {'timestamp':'2026-01-01T00:00:00.000000001Z','message':MARKER}]
        raw = b'\n'.join(json.dumps(row).encode() for row in rows)
        _,db,_,_ = self.case(raw,suffix='.jsonl')
        observations = self.observations(db)
        self.assertEqual(len(observations),3)
        self.assertEqual(observations[0][1]['status'],'missing')
        self.assertIsNone(observations[0][1]['original'])
        self.assertIsNone(observations[0][1]['utc_ns'])
        self.assertEqual(observations[1][1]['original'],1700000000)
        self.assertEqual(observations[1][1]['status'],'unresolved')
        self.assertIsNone(observations[1][1]['utc_ns'])
        self.assertEqual(iso_ns(observations[2][1]['utc_ns']),'2026-01-01T00:00:00.000000001Z')

    def test_crlf_eof_and_duplicate_rows_keep_exact_byte_provenance_and_occurrences(self):
        value = '2026-01-01T00:00:00.123456789-04:00'
        line = (value+' '+MARKER).encode()
        chunks = [line+b'\r\n',line+b'\r\n',line]
        raw = b''.join(chunks)
        result,db,_,source = self.case(raw)
        self.assertEqual(source.read_bytes(),raw)
        self.assertEqual(result['coverage']['counts']['duplicate_records'],1)
        rows = self.observations(db)
        self.assertEqual([row[0] for row in rows],[1,2,3])
        offset = 0
        for expected,(ordinal,when,_,ref) in zip(chunks,rows):
            self.assertEqual(ref['line'],ordinal)
            self.assertEqual(ref['byte_offset'],offset)
            self.assertEqual(ref['byte_length'],len(expected))
            self.assertEqual(hashlib.sha256(expected).hexdigest(),ref['record_sha256'])
            self.assertEqual(raw[offset:offset+len(expected)],expected)
            self.assertEqual(when['original'],value)
            self.assertEqual(iso_ns(when['utc_ns']),'2026-01-01T04:00:00.123456789Z')
            offset += len(expected)
        duplicate_rows = db.execute('SELECT id,duplicate_of FROM observations ORDER BY id').fetchall()
        self.assertEqual([row[1] for row in duplicate_rows],[None,duplicate_rows[0][0],None])
        selected = list(timeline(db))
        self.assertEqual([row['ordinal'] for row in selected],[1,2,3])
        self.assertEqual(len({row['event_id'] for row in selected}),3)
        self.assertEqual(db.execute('SELECT COUNT(*) FROM records').fetchone()[0],3)

    def test_offline_analysis_retains_only_timestamp_representation_and_minimized_export(self):
        value = '2026-01-01T00:00:00.123456789-04:00'
        raw = (value+' '+MARKER+'\n').encode()
        with patch.object(socket,'socket',side_effect=AssertionError('network forbidden')), \
             patch.object(socket,'getaddrinfo',side_effect=AssertionError('name resolution forbidden')):
            _,db,output,source = self.case(raw,name='invented-private-source')
        when = json.loads(db.execute('SELECT time_json FROM observations').fetchone()[0])
        self.assertEqual(when['original'],value)
        self.assertEqual(source.read_bytes(),raw)
        for path in output.rglob('*'):
            if path.is_file():
                self.assertNotIn(MARKER.encode(),path.read_bytes())
                self.assertEqual(path.stat().st_mode & 0o077,0,path.name)
        for path in (output/'export').iterdir():
            content = path.read_text()
            self.assertNotIn(value,content)
            self.assertNotIn(source.name,content)
            self.assertNotIn('02:00:00:00:00:91',content)
        self.assertGreater(validate_file(output/'export/exchange.jsonl'),0)


if __name__=='__main__':
    unittest.main()
