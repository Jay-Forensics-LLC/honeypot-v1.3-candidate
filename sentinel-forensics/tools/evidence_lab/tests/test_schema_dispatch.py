"""Schema dispatch remains bounded and cannot replace strict evidence parsing."""
from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from adapters import BLE
from analyze import analyze
from core import IngestError, MAX_DEPTH, MAX_RECORD, json_schema_probe, strict_json


class SchemaDispatch(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.beacon = {'schema':BLE,'address':'02:00:00:00:00:01','rssi':-55.75,
                       'timestamp':'2026-01-01T00:00:00Z','service_uuids':['180f']}

    def test_first_numeric_error_does_not_hide_generic_radio_schema(self):
        for extension in ('jsonl','ndjson'):
            for token,code in ((b'1e999','nonfinite_json'),(b'1e-999','json_number_underflow')):
                with self.subTest(extension=extension,code=code):
                    first = b'{"schema":"evidence-lab.ble/1","address":"02:00:00:00:00:01","rssi":'+token+b'}\n'
                    second = json.dumps(self.beacon).encode()+b'\n'
                    source = self.root/(extension+'-'+code+'.'+extension)
                    source.write_bytes(first+second)
                    before = hashlib.sha256(source.read_bytes()).hexdigest()
                    output = self.root/(extension+'-'+code+'-case')
                    result = analyze([source],output)
                    self.assertEqual(result['sources'][0]['kind'],'radio_export')
                    self.assertEqual(result['coverage']['counts']['parse_errors'],1)
                    with closing(sqlite3.connect(output/'index.sqlite')) as db:
                        self.assertEqual(db.execute('SELECT ordinal,kind,status FROM records ORDER BY ordinal').fetchall(),
                            [(1,'parse_error',code),(2,'observation',None)])
                        kind,data,raw = db.execute('SELECT kind,data_json,provenance_json FROM observations').fetchone()
                        self.assertEqual(kind,'ble.advertisement')
                        self.assertEqual(json.loads(data)['address'],self.beacon['address'])
                        self.assertEqual(json.loads(data)['rssi'],-55.75)
                        self.assertEqual(json.loads(data)['service_uuids'],['180f'])
                        ref = json.loads(raw)
                        self.assertEqual((ref['line'],ref['byte_offset'],ref['byte_length']),(2,len(first),len(second)))
                        self.assertEqual(ref['record_sha256'],hashlib.sha256(second).hexdigest())
                        self.assertEqual(db.execute('SELECT offset,length,sha256 FROM records WHERE ordinal=1').fetchone(),
                            (0,len(first),hashlib.sha256(first).hexdigest()))
                    self.assertEqual(before,hashlib.sha256(source.read_bytes()).hexdigest())

    def test_probe_does_not_relax_json_structure_and_resource_checks(self):
        cases = [(b'{"schema":"evidence-lab.ble/1","schema":"evidence-lab.ble/1"}',IngestError,'duplicate_json_key'),
                 (b'{"schema":"evidence-lab.ble/1","value":'+b'['*(MAX_DEPTH+1)+b'0'+b']'*(MAX_DEPTH+1)+b'}',IngestError,'json_depth_exceeded'),
                 (b'{"schema":"evidence-lab.ble/1","value":"'+b'x'*MAX_RECORD+b'"}',IngestError,'record_budget_exceeded'),
                 (b'{"schema":"evidence-lab.ble/1","value":"\xff"}',UnicodeError,None),
                 (b'{"schema":"evidence-lab.ble/1","value":NaN}',IngestError,'nonfinite_json'),
                 (b'{"schema":"evidence-lab.ble/1","value":Infinity}',IngestError,'nonfinite_json'),
                 (b'{"schema":"evidence-lab.ble/1",',ValueError,None)]
        for raw,exception,code in cases:
            with self.subTest(code=code,exception=exception.__name__):
                for loader in (json_schema_probe,strict_json):
                    if code:
                        with self.assertRaisesRegex(exception,'^'+code+'$'): loader(raw)
                    else:
                        with self.assertRaises(exception): loader(raw)

    def test_probe_returns_only_dispatch_marker_and_actual_numbers_remain_strict(self):
        for token,code in ((b'1e999','nonfinite_json'),(b'1e-999','json_number_underflow')):
            raw = b'{"schema":"evidence-lab.ble/1","nested":[{"number":'+token+b'}]}'
            self.assertIs(json_schema_probe(raw),True)
            with self.assertRaisesRegex(IngestError,'^'+code+'$'): strict_json(raw)
        for raw in (b'{}',b'[]',b'{"schema":null}',b'{"timestamp":"2026-01-01T00:00:00Z"}'):
            self.assertIs(json_schema_probe(raw),False)

    def test_nonradio_fallback_and_structural_first_row_do_not_guess_a_vendor(self):
        first_rows = [b'{"timestamp":"2026-01-01T00:00:00Z","message":"schema is ordinary text"}\n',
                      b'{"schema":"evidence-lab.ble/1",\n',
                      b'{"schema":"evidence-lab.ble/1","schema":"evidence-lab.ble/1"}\n']
        for index,first in enumerate(first_rows):
            with self.subTest(index=index):
                source = self.root/(str(index)+'.ndjson')
                source.write_bytes(first+json.dumps(self.beacon).encode()+b'\n')
                output = self.root/('fallback-'+str(index))
                result = analyze([source],output)
                self.assertEqual(result['sources'][0]['kind'],'text')
                with closing(sqlite3.connect(output/'index.sqlite')) as db:
                    self.assertEqual(db.execute("SELECT COUNT(*) FROM observations WHERE kind='ble.advertisement'").fetchone()[0],0)
                    self.assertTrue(all(kind=='telemetry.record' and data=='{}' for kind,data in db.execute('SELECT kind,data_json FROM observations')))


if __name__ == '__main__': unittest.main()
