"""Radio number semantics and safely framed records after invalid JSON numbers."""
from contextlib import closing
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import sqlite3
import tempfile
import unittest

from adapters import BLE, TETRA, normalize
from analyze import analyze
from core import IngestError, MAX_RECORD, strict_json


class RadioNumbers(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.ble = {'schema':BLE,'address':'02:00:00:00:00:01'}
        self.ap = {'schema':TETRA,'bssid':'02:00:00:00:00:02'}

    def test_integral_fields_accept_only_bounded_integers_and_signed_digit_strings(self):
        for base,field in ((self.ap,'channel'),(self.ap,'frequency'),(self.ble,'manufacturer_id')):
            for value,expected in ((0,0),(2**31-1,2**31-1),(-2**31,-2**31),(' +76 ',76),('-12',-12)):
                with self.subTest(field=field,value=value):
                    _,data,_ = normalize(dict(base,**{field:value}))
                    self.assertEqual(data[field],expected)
                    self.assertIs(type(data[field]),int)
            for value in (6.0,6.5,'6.0','6e0','76.9',True,2**31,-2**31-1,float('inf'),float('nan')):
                with self.subTest(field=field,value=value):
                    with self.assertRaisesRegex(IngestError,'^invalid_'+field+'$'):
                        normalize(dict(base,**{field:value}))
        # The lexical fraction would round to 6.0 as a native float. It must not
        # become an apparently integral manufacturer identifier after parsing.
        obj = strict_json(b'{"schema":"evidence-lab.ble/1","address":"02:00:00:00:00:01","manufacturer_id":6.0000000000000001}')
        with self.assertRaisesRegex(IngestError,'^invalid_manufacturer_id$'): normalize(obj)

    def test_signal_fractions_are_preserved_without_integer_coercion(self):
        for base,field in ((self.ap,'rssi'),(self.ble,'rssi'),(self.ble,'tx_power')):
            for value,expected in ((-55.75,-55.75),(' -55.75 ',-55.75),('-.125e2',-12.5),(6.0,6.0),(0,0),('-12',-12)):
                with self.subTest(field=field,value=value):
                    _,data,_ = normalize(dict(base,**{field:value}))
                    self.assertEqual(data[field],expected)
                    if type(value) is float or value == ' -55.75 ' or value == '-.125e2':
                        self.assertIs(type(data[field]),float)
            for value in (True,float('nan'),float('inf'),float('-inf'),'NaN','Infinity','1e999','-1e-999','1_0',[],2**31):
                with self.subTest(field=field,value=value):
                    with self.assertRaisesRegex(IngestError,'^invalid_'+field+'$'):
                        normalize(dict(base,**{field:value}))
            for value in ('0e-999','-0e-999'):
                self.assertEqual(normalize(dict(base,**{field:value}))[1][field],0)

    def test_missing_optional_numbers_and_existing_bounds_remain_explicit(self):
        for base,fields in ((self.ap,('channel','frequency','rssi')),(self.ble,('manufacturer_id','rssi','tx_power'))):
            data = normalize(base)[1]
            self.assertTrue(all(data[field] is None for field in fields))
            for field in fields:
                self.assertIsNone(normalize(dict(base,**{field:''}))[1][field])
        for value in (-2**31,2**31-1):
            self.assertEqual(normalize(dict(self.ble,rssi=value))[1]['rssi'],value)

    def test_strict_json_rejects_nested_overflow_and_nonzero_underflow(self):
        for token,code in ((b'1e999','nonfinite_json'),(b'-1e999','nonfinite_json'),
                           (b'1e-999','json_number_underflow'),(b'-1e-999','json_number_underflow')):
            with self.subTest(token=token):
                with self.assertRaisesRegex(IngestError,'^'+code+'$'):
                    strict_json(b'{"nested":[{"value":'+token+b'}]}')
        for token in (b'0e-999',b'-0e-999',b'0e999',b'-0.000e999'):
            self.assertEqual(strict_json(token),0)
        self.assertEqual(math.copysign(1,strict_json(b'-0e-999')),-1)
        self.assertEqual(strict_json(b'{"fraction":-55.75}')['fraction'],-55.75)

    def test_invalid_numeric_jsonl_records_keep_locations_and_following_valid_rows(self):
        prefix = b'{"schema":"evidence-lab.ble/1","address":"02:00:00:00:00:01","rssi":'
        rows = [prefix+b'1e999}\n',prefix+b'-55.75}\n',prefix+b'1e-999}\n',
                json.dumps(dict(self.ble,manufacturer_id=76.9)).encode()+b'\n',prefix+b'-12.5}\n']
        source = self.root/'numbers.ble.jsonl'; source.write_bytes(b''.join(rows))
        before = hashlib.sha256(source.read_bytes()).digest()
        result = analyze([source],self.root/'case')
        self.assertEqual(result['coverage']['counts']['parse_errors'],3)
        with closing(sqlite3.connect(self.root/'case/index.sqlite')) as db:
            self.assertEqual(db.execute('SELECT ordinal,status FROM records ORDER BY ordinal').fetchall(),
                [(1,'nonfinite_json'),(2,'timestamp_missing'),(3,'json_number_underflow'),
                 (4,'invalid_manufacturer_id'),(5,'timestamp_missing')])
            values = db.execute('SELECT ordinal,data_json,provenance_json FROM observations ORDER BY id').fetchall()
            self.assertEqual([json.loads(data)['rssi'] for _,data,_ in values],[-55.75,-12.5])
            for ordinal,_,raw in values:
                ref = json.loads(raw)
                self.assertEqual(ref['line'],ordinal)
                original = source.read_bytes()[ref['byte_offset']:ref['byte_offset']+ref['byte_length']]
                self.assertEqual(original,rows[ordinal-1])
                self.assertEqual(hashlib.sha256(original).hexdigest(),ref['record_sha256'])
            # Malformed records retain exact byte locations and source hashes too.
            for ordinal,offset,length,digest in db.execute("SELECT ordinal,offset,length,sha256 FROM records WHERE kind='parse_error'"):
                self.assertEqual(source.read_bytes()[offset:offset+length],rows[ordinal-1])
                self.assertEqual(hashlib.sha256(rows[ordinal-1]).hexdigest(),digest)
        self.assertEqual(before,hashlib.sha256(source.read_bytes()).digest())

    def test_csv_fractional_signals_and_invalid_integer_row_do_not_stop_next_row(self):
        text = io.StringIO(); writer = csv.DictWriter(text,fieldnames=['schema','address','manufacturer_id','rssi','tx_power'])
        writer.writeheader()
        writer.writerow(dict(self.ble,manufacturer_id='76.9',rssi='-55.75',tx_power='-12.5'))
        writer.writerow(dict(self.ble,manufacturer_id='+76',rssi='-55.75',tx_power='-12.5'))
        source = self.root/'numbers.csv'; source.write_text(text.getvalue())
        result = analyze([source],self.root/'csv-case')
        self.assertEqual(result['coverage']['counts']['parse_errors'],1)
        with closing(sqlite3.connect(self.root/'csv-case/index.sqlite')) as db:
            data = json.loads(db.execute('SELECT data_json FROM observations').fetchone()[0])
            self.assertEqual((data['manufacturer_id'],data['rssi'],data['tx_power']),(76,-55.75,-12.5))

    def test_sqlite_real_signal_retains_fraction_and_source_hash(self):
        source = self.root/'signals.db'
        with closing(sqlite3.connect(source)) as db:
            db.executescript('''CREATE TABLE aps(id INT,scan_id INT,ssid TEXT,bssid TEXT,encryption INT,
                hidden INT,channel INT,signal REAL,wps INT,last_seen TEXT);
                CREATE TABLE clients(id INT,scan_id INT,mac TEXT,bssid TEXT,last_seen TEXT);''')
            db.execute('INSERT INTO aps VALUES (1,1,NULL,?,NULL,NULL,6,?,NULL,NULL)',(self.ap['bssid'],-55.75))
            db.commit()
        before = hashlib.sha256(source.read_bytes()).digest()
        result = analyze([source],self.root/'sqlite-case')
        self.assertEqual(result['coverage']['counts']['parse_errors'],0)
        with closing(sqlite3.connect(self.root/'sqlite-case/index.sqlite')) as db:
            data = json.loads(db.execute('SELECT data_json FROM observations').fetchone()[0])
            self.assertEqual(data['rssi'],-55.75)
        self.assertEqual(before,hashlib.sha256(source.read_bytes()).digest())

    def test_unsupported_sqlite_values_stop_partial_source_and_keep_other_sources(self):
        for field,value in (('signal',float('inf')),('scan_id',b'unsupported blob'),('hidden',b'unsupported extra')):
            with self.subTest(field=field):
                source = self.root/(field+'.db')
                with closing(sqlite3.connect(source)) as db:
                    db.executescript('''CREATE TABLE aps(id INT,scan_id INT,ssid TEXT,bssid TEXT,encryption INT,
                        hidden INT,channel INT,signal REAL,wps INT,last_seen TEXT);
                        CREATE TABLE clients(id INT,scan_id INT,mac TEXT,bssid TEXT,last_seen TEXT);''')
                    db.executemany('INSERT INTO aps VALUES (?,1,NULL,?,NULL,0,6,-55.75,NULL,NULL)',
                        [(ident,self.ap['bssid']) for ident in (1,2,3)])
                    # Column names are fixed synthetic fixture choices, not evidence.
                    db.execute('UPDATE aps SET '+field+'=? WHERE id=2',(value,))
                    db.commit()
                following = self.root/(field+'.ble.jsonl')
                following.write_text(json.dumps(dict(self.ble,rssi=-9.25))+'\n')
                before = hashlib.sha256(source.read_bytes()).hexdigest()
                output = self.root/(field+'-case')
                result = analyze([source,following],output)
                metadata = result['sources'][0]['metadata']
                self.assertEqual(result['status'],'COMPLETE')
                self.assertEqual(result['coverage']['counts']['parse_errors'],1)
                self.assertEqual(metadata['compatibility'],'unsupported_or_partial')
                self.assertEqual(metadata['error'],'unsupported_sqlite_record_value')
                self.assertTrue(metadata['partial_source'])
                self.assertEqual(metadata['stopped_at'],{'table':'aps','rowid':2})
                self.assertIn('subsequent rows',metadata['unexamined_rows'])
                with closing(sqlite3.connect(output/'index.sqlite')) as db:
                    self.assertEqual(db.execute('SELECT source_id,COUNT(*) FROM observations GROUP BY source_id').fetchall(),[(1,1),(2,1)])
                    # The error points to the complete source hash; there is no
                    # fabricated canonical hash for the unsupported SQLite row.
                    self.assertEqual(db.execute("SELECT ordinal,sha256,status FROM records WHERE kind='parse_error'").fetchall(),
                        [(2,before,'unsupported_sqlite_record_value')])
                self.assertEqual(before,hashlib.sha256(source.read_bytes()).hexdigest())
                self.assertFalse(any(Path(str(source)+suffix).exists() for suffix in ('-wal','-shm','-journal')))

    def test_invalid_json_envelopes_are_source_errors_with_exact_hashes(self):
        cases = [(b'[]','radio_envelope_required'),(b'{}','radio_envelope_required'),
                 (b'{"schema":"future/99","observations":[]}','unsupported_radio_schema'),
                 (b'{"schema":"evidence-lab.ble/1","observations":[{"rssi":1e999}]}','nonfinite_json'),
                 (b'{"schema":"evidence-lab.ble/1","observations":[{"rssi":1e-999}]}','json_number_underflow'),
                 (b'{not-json','malformed_json'),(b' '*(MAX_RECORD+1)+b'{}','record_budget_exceeded')]
        following = self.root/'following.ble.jsonl'
        following.write_text(json.dumps(dict(self.ble,rssi=-55.75))+'\n')
        for index,(raw,code) in enumerate(cases):
            with self.subTest(code=code,index=index):
                source = self.root/(str(index)+'.json'); source.write_bytes(raw)
                output = self.root/('envelope-'+str(index))
                result = analyze([source,following],output)
                self.assertEqual(result['status'],'COMPLETE')
                self.assertEqual(result['coverage']['counts']['parse_errors'],1)
                self.assertEqual(result['sources'][0]['size'],len(raw))
                self.assertEqual(result['sources'][0]['sha256'],hashlib.sha256(raw).hexdigest())
                with closing(sqlite3.connect(output/'index.sqlite')) as db:
                    self.assertEqual(db.execute('SELECT source_id FROM observations').fetchall(),[(2,)])
                    self.assertEqual(db.execute("SELECT source_id,offset,length,sha256,status FROM records WHERE kind='parse_error'").fetchall(),
                        [(1,0,len(raw),hashlib.sha256(raw).hexdigest(),code)])


if __name__ == '__main__': unittest.main()
