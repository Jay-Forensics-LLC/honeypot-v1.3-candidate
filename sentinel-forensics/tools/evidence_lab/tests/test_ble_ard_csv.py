"""Native BLE CSV observations retain source facts without inventing clock/identity.

All records here are invented. Genuine export compatibility is validated separately;
these fixtures exercise the profile's forensic semantics and hostile-input bounds.
"""
import csv
import hashlib
import io
import json
from pathlib import Path
import socket
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from adapters import BLE, BLE_ARD_PARALLEL, csv_rows, normalize_ble_ard_parallel
from analyze import analyze
from contract import validate_file
from core import IngestError, MAX_RECORD, Reader
from query import timeline


HEADER = ('Timestamp', 'DeviceName', 'AdvertisingType', 'AddressType', 'Address', 'RSSI', 'Channel')
EXAMPLE = {'Timestamp':'1600000000123', 'DeviceName':'invented-private-beacon',
           'AdvertisingType':'0', 'AddressType':'1', 'Address':'02:00:00:00:00:31',
           'RSSI':'-57', 'Channel':'37'}


def encoded_rows(rows, *, header=HEADER, ending='\n'):
    stream = io.StringIO(newline='')
    writer = csv.writer(stream, lineterminator=ending)
    writer.writerow(header)
    for row in rows:
        writer.writerow([row.get(field, '') for field in header] if isinstance(row, dict) else row)
    return stream.getvalue().encode('utf-8')


class NativeBleCsv(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def case(self, raw, *, name='case'):
        source = self.root/(name+'.csv')
        source.write_bytes(raw)
        output = self.root/name
        result = analyze([source], output, pseudonym_key=b'K'*32)
        db = sqlite3.connect(output/'index.sqlite')
        self.addCleanup(db.close)
        return result, db, output, source

    def test_native_facts_do_not_invent_absolute_time_or_hardware_semantics(self):
        raw = encoded_rows([dict(EXAMPLE, AdvertisingType='91', AddressType='92', Channel='93')])
        result, db, output, source = self.case(raw)
        self.assertEqual(result['sources'][0]['metadata']['adapter_profile'], BLE_ARD_PARALLEL)
        self.assertEqual(result['sources'][0]['metadata']['source_origin'], 'unverified')
        self.assertEqual(result['sources'][0]['sha256'], hashlib.sha256(raw).hexdigest())
        kind, data_raw, when_raw = db.execute('SELECT kind,data_json,time_json FROM observations').fetchone()
        data, when = json.loads(data_raw), json.loads(when_raw)
        self.assertEqual(kind, 'ble.advertisement')
        self.assertEqual(data['source_profile'], BLE_ARD_PARALLEL)
        self.assertEqual(data['address'], EXAMPLE['Address'])
        self.assertEqual(data['rssi'], -57)
        self.assertIs(type(data['rssi']), int)
        self.assertEqual(data['address_type'], 'unknown')
        for field, value in (('advertising_type_code_uninterpreted', 91),
                             ('address_type_code_uninterpreted', 92),
                             ('channel_code_uninterpreted', 93)):
            self.assertEqual(data[field], value)
        self.assertEqual(when['original'], EXAMPLE['Timestamp'])
        self.assertEqual(when['status'], 'unresolved')
        self.assertIsNone(when['utc_ns'])
        self.assertIsNone(when['precision'])
        self.assertIsNone(when['timezone'])
        self.assertIsNone(data['scanner'])
        self.assertIsNone(data['manufacturer_id'])
        self.assertIsNone(data['manufacturer_data'])
        self.assertIsNone(data['service_data'])
        self.assertIsNone(data['tx_power'])
        self.assertEqual(data['service_uuids'], [])
        self.assertIn('no_physical_device_inference', data['identity_limit'])
        self.assertEqual(db.execute('SELECT COUNT(*) FROM associations').fetchone()[0], 0)
        self.assertEqual(list(timeline(db)), [])
        unresolved = list(timeline(db, include_unresolved=True, identifier=EXAMPLE['Address']))
        self.assertEqual(len(unresolved), 1)
        self.assertIsNone(unresolved[0]['utc_ns'])
        self.assertGreater(validate_file(output/'export/exchange.jsonl'), 0)
        self.assertEqual(source.read_bytes(), raw)

    def test_unanchored_native_clock_stays_unresolved_after_configured_offset(self):
        source = self.root/'clock.csv'
        source.write_bytes(encoded_rows([EXAMPLE]))
        output = self.root/'clock-case'
        analyze([source], output, config={'clock_adjustments':{'1':{
            'offset_ns':10**9, 'justification':'invented fixture offset without an epoch anchor'}}})
        with sqlite3.connect(output/'index.sqlite') as db:
            original, adjusted = db.execute('SELECT original_utc_ns,utc_ns FROM timeline_index').fetchone()
            self.assertIsNone(original)
            self.assertIsNone(adjusted)

    def test_duplicate_multiline_crlf_rows_keep_exact_byte_references(self):
        row = dict(EXAMPLE, DeviceName='invented-name, quoted "line"\r\nsecond line')
        raw = encoded_rows([row, row], ending='\r\n')
        result, db, _, _ = self.case(raw)
        observations = db.execute('SELECT data_json,provenance_json,duplicate_of FROM observations ORDER BY id').fetchall()
        self.assertEqual(len(observations), 2)
        self.assertIsNone(observations[0][2])
        self.assertIsNotNone(observations[1][2])
        self.assertEqual(result['coverage']['counts']['duplicate_records'], 1)
        previous_end = len(encoded_rows([], ending='\r\n'))
        for data_raw, provenance_raw, _ in observations:
            self.assertEqual(json.loads(data_raw)['name'], row['DeviceName'])
            ref = json.loads(provenance_raw)
            self.assertEqual(ref['byte_offset'], previous_end)
            original = raw[ref['byte_offset']:ref['byte_offset']+ref['byte_length']]
            self.assertTrue(original.endswith(b'\r\n'))
            self.assertEqual(hashlib.sha256(original).hexdigest(), ref['record_sha256'])
            self.assertGreater(ref['last_line'], ref['line'])
            previous_end += ref['byte_length']
        self.assertEqual(previous_end, len(raw))

    def test_profile_header_is_exact_and_declared_exchange_csv_still_works(self):
        headers = [HEADER[::-1], HEADER+('Extra',), HEADER[:-1],
                   ('timestamp',)+HEADER[1:], HEADER[:-1]+('RSSI',)]
        for header in headers:
            with self.subTest(header=header):
                reader = Reader(io.BytesIO(encoded_rows([EXAMPLE], header=header)))
                with self.assertRaises(IngestError):
                    list(csv_rows(reader))
        declared = {'schema':BLE, 'address':EXAMPLE['Address'], 'rssi':'-55.75',
                    'timestamp':'2026-01-01T00:00:00Z', 'name':'invented-declared-name'}
        result, db, _, _ = self.case(encoded_rows([declared], header=tuple(declared)), name='declared')
        self.assertNotEqual(result['sources'][0]['metadata'].get('adapter_profile'), BLE_ARD_PARALLEL)
        data_raw, utc_ns = db.execute('SELECT data_json,utc_ns FROM observations').fetchone()
        self.assertEqual(json.loads(data_raw)['rssi'], -55.75)
        self.assertIsNotNone(utc_ns)

    def test_invalid_native_fields_and_column_counts_do_not_hide_later_rows(self):
        invalid = [dict(EXAMPLE, Timestamp='-1'), dict(EXAMPLE, Timestamp='1.25'),
                   dict(EXAMPLE, Timestamp='١٢٣'), dict(EXAMPLE, Timestamp='1'*129),
                   dict(EXAMPLE, RSSI='-55.75'), dict(EXAMPLE, RSSI='1e2'),
                   dict(EXAMPLE, RSSI=str(2**31)), dict(EXAMPLE, AddressType='-1'),
                   dict(EXAMPLE, AdvertisingType='2.0'), dict(EXAMPLE, Channel=str(2**31)),
                   dict(EXAMPLE, Address='invented-invalid-address'),
                   [EXAMPLE[field] for field in HEADER[:-1]]]
        rows = invalid+[dict(EXAMPLE, DeviceName='')]
        raw = encoded_rows(rows)
        result, db, _, _ = self.case(raw)
        self.assertEqual(result['coverage']['counts']['parse_errors'], len(invalid))
        self.assertEqual(db.execute('SELECT COUNT(*) FROM records').fetchone()[0], len(rows))
        self.assertEqual(db.execute('SELECT COUNT(*) FROM observations').fetchone()[0], 1)
        ordinal, data_raw = db.execute('SELECT ordinal,data_json FROM observations').fetchone()
        self.assertEqual(ordinal, len(rows))
        self.assertIsNone(json.loads(data_raw)['name'])
        for offset, length, digest in db.execute('SELECT offset,length,sha256 FROM records'):
            self.assertEqual(hashlib.sha256(raw[offset:offset+length]).hexdigest(), digest)
        statuses = [row[0] for row in db.execute("SELECT status FROM records WHERE kind='parse_error'")]
        self.assertTrue(all(status and EXAMPLE['Address'] not in status for status in statuses))

    def test_native_integer_boundaries_remain_codes_and_digits_remain_original(self):
        row = dict(EXAMPLE, Timestamp='0'*128, RSSI=str(-2**31),
                   AddressType='0', AdvertisingType=str(2**31-1), Channel='0')
        _, data, when = normalize_ble_ard_parallel(row)
        self.assertEqual(data['rssi'], -2**31)
        self.assertEqual(data['advertising_type_code_uninterpreted'], 2**31-1)
        self.assertEqual(data['address_type'], 'unknown')
        self.assertEqual(when['original'], '0'*128)
        self.assertEqual(when['status'], 'unresolved')
        for changed in (dict(row, Timestamp=''), dict(row, RSSI=''), dict(row, AddressType=''),
                        dict(row, Channel='１２'), dict(row, Unexpected='invented')):
            with self.subTest(changed=changed):
                with self.assertRaises(IngestError):
                    normalize_ble_ard_parallel(changed)

    def test_csv_framing_remains_bounded_and_malformed_quotes_fail(self):
        header = encoded_rows([])
        for raw in (header+b'"unterminated\n',
                    header+b'1,"'+b'x'*(MAX_RECORD+1)+b'",0,1,02:00:00:00:00:31,-57,37\n'):
            with self.subTest(size=len(raw)):
                with self.assertRaises(IngestError):
                    list(csv_rows(Reader(io.BytesIO(raw))))

    def test_ingestion_is_offline_and_export_minimizes_native_identifiers(self):
        raw = encoded_rows([EXAMPLE])
        with patch.object(socket, 'socket', side_effect=AssertionError('network forbidden')), \
             patch.object(socket, 'getaddrinfo', side_effect=AssertionError('name resolution forbidden')):
            _, db, output, source = self.case(raw)
        private = db.execute('SELECT data_json,time_json FROM observations').fetchone()
        self.assertIn(EXAMPLE['DeviceName'], private[0])
        self.assertIn(EXAMPLE['Address'], private[0])
        for path in (output/'export').iterdir():
            content = path.read_text()
            for sensitive in (EXAMPLE['DeviceName'], EXAMPLE['Address'], EXAMPLE['Timestamp'], source.name):
                self.assertNotIn(sensitive, content)
        for path in output.rglob('*'):
            self.assertEqual(path.stat().st_mode & 0o077, 0, path.name)


if __name__ == '__main__':
    unittest.main()
