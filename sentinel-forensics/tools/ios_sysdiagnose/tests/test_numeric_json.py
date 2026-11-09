"""Synthetic numeric failures retain record provenance and allow later evidence."""
import hashlib
import json
from pathlib import Path
import plistlib
import tempfile
import unittest
import zipfile

from ingest import Limits, decode_json, ingest, records


class NumericJSON(unittest.TestCase):
    def test_json_and_ips_reject_overflow_and_nonzero_underflow(self):
        for literal in ('1e999','-1e999','1e-999','-1e-999'):
            for extension in ('json','jsonl','ips'):
                with self.subTest(literal=literal,extension=extension):
                    raw=('{"nested":[{"value":'+literal+'}]}').encode()
                    if extension=='ips': raw=b'{}\n'+raw
                    parsed=list(records('synthetic.'+extension,raw,Limits()))
                    self.assertEqual(len(parsed),1)
                    self.assertEqual(parsed[0][3],'malformed_record')
                    self.assertIsNone(parsed[0][2])
                    self.assertEqual(parsed[0][0]['byte_length'],len(raw))

    def test_json_zero_exponents_and_finite_fractions_remain_valid(self):
        for literal in ('0e-999','-0e-999','0.0e999','-0.000e999'):
            with self.subTest(literal=literal):
                self.assertEqual(decode_json('{"value":'+literal+'}')['value'],0)
        self.assertEqual(decode_json('{"value":-55.25}')['value'],-55.25)

    def test_archive_numeric_errors_continue_with_valid_rows_and_members(self):
        bad_line=b'{"timestamp":-1e999}\n'
        good_line=b'{"timestamp":"2026-01-01T00:00:00Z","signal":-55.25}\n'
        entries=[('bad.json',b'{"timestamp":1e999}'),
                 ('bad.ips',b'{}\n{"timestamp":1e-999}'),
                 ('lines.jsonl',bad_line+good_line),
                 ('good.json',b'{"timestamp":"2026-01-01T00:00:01Z"}'),
                 ('zero.json',b'{"number":0e-999}')]
        with tempfile.TemporaryDirectory() as name:
            root=Path(name); source=root/'synthetic.zip'
            with zipfile.ZipFile(source,'w') as archive:
                for member,raw in entries: archive.writestr(member,raw)
            before=source.read_bytes()
            manifest=ingest(source,root/'case',include_sensitive=True,preserve_time_original=True)
            rows=[json.loads(raw) for raw in (root/'case/events.jsonl').read_bytes().splitlines()]
            self.assertEqual(manifest['parser_version'],'0.2.1')
            self.assertEqual(manifest['counts'],{'observations':3,'parse_errors':3,'files':5})
            self.assertEqual(manifest['coverage'],'partial')
            valid=next(row for row in rows if row.get('raw',{}).get('signal')==-55.25)
            self.assertEqual(valid['provenance']['line'],2)
            self.assertEqual(valid['provenance']['byte_offset'],len(bad_line))
            self.assertEqual(valid['provenance']['record_sha256'],hashlib.sha256(good_line).hexdigest())
            self.assertEqual(valid['normalized']['timestamp'],'2026-01-01T00:00:00Z')
            self.assertEqual(valid['normalized']['timestamp_original'],'2026-01-01T00:00:00Z')
            self.assertEqual(source.read_bytes(),before)

    def test_nonfinite_plist_timestamps_preserve_typed_raw_without_aborting(self):
        with tempfile.TemporaryDirectory() as name:
            root=Path(name); source=root/'synthetic.zip'
            values=(float('inf'),float('-inf'),float('nan'))
            with zipfile.ZipFile(source,'w') as archive:
                for number,value in enumerate(values):
                    archive.writestr('sample-'+str(number)+'.plist',
                        plistlib.dumps({'timestamp':value},fmt=plistlib.FMT_BINARY))
                archive.writestr('valid.json','{"timestamp":"2026-01-01T00:00:00Z"}')
            before=source.read_bytes()
            manifest=ingest(source,root/'case',include_sensitive=True,preserve_time_original=True)
            rows=[json.loads(raw) for raw in (root/'case/events.jsonl').read_bytes().splitlines()]
            self.assertEqual(manifest['counts'],{'observations':4,'parse_errors':0,'files':4})
            for row in rows[:3]:
                self.assertEqual(row['raw']['timestamp'],{'type':'nonfinite_number'})
                self.assertIsNone(row['normalized']['timestamp'])
                self.assertEqual(row['normalized']['timestamp_status'],'unsupported_nonfinite')
                self.assertNotIn('timestamp_original',row['normalized'])
                self.assertEqual(row['provenance']['byte_offset'],0)
                self.assertGreater(row['provenance']['byte_length'],0)
            self.assertEqual(rows[3]['normalized']['timestamp'],'2026-01-01T00:00:00Z')
            self.assertEqual(source.read_bytes(),before)


if __name__=='__main__': unittest.main()
