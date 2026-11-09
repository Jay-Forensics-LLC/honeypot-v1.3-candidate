"""Synthetic fixtures only; no device evidence, credentials or network required."""
from dataclasses import replace
import hashlib
import io
import json
import os
from pathlib import Path
import plistlib
import socket
import stat
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from ingest import IngestError, Limits, ingest, timestamp


class IngestionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.archive = self.root / 'input'
        self.out = self.root / 'result'

    def zip(self, entries):
        with zipfile.ZipFile(self.archive, 'w', zipfile.ZIP_DEFLATED) as z:
            for name, data in entries:
                z.writestr(name, data)

    def tar(self, entries, compress=False):
        with tarfile.open(self.archive, 'w:gz' if compress else 'w') as t:
            for name, data, kind in entries:
                info = tarfile.TarInfo(name)
                info.type = kind
                info.size = len(data)
                info.linkname = '../../escape'
                t.addfile(info, io.BytesIO(data))

    def run_import(self, **kwargs):
        manifest = ingest(self.archive, self.out, **kwargs)
        records = [json.loads(x) for x in (self.out / 'events.jsonl').read_text().splitlines()]
        return manifest, records

    def rejected(self, **kwargs):
        with self.assertRaises(IngestError):
            ingest(self.archive, self.out, **kwargs)
        self.assertFalse(self.out.exists())
        self.assertFalse((self.root / 'escape').exists())

    def test_valid_records_and_byte_provenance(self):
        data = b'{"timestamp":"2026-10-10T10:00:00-04:00","message":"normal daemon"}\n'
        self.zip([('sysdiagnose/system.jsonl', data)])
        before = self.archive.read_bytes()
        m, rows = self.run_import()
        row = rows[0]
        self.assertEqual(row['normalized']['timestamp'], '2026-10-10T14:00:00Z')
        self.assertEqual(row['provenance']['record_sha256'], hashlib.sha256(data).hexdigest())
        self.assertEqual(row['provenance']['file_sha256'], hashlib.sha256(data).hexdigest())
        self.assertEqual(m['archive']['sha256'], hashlib.sha256(before).hexdigest())
        self.assertEqual(self.archive.read_bytes(), before)
        self.assertEqual(row['provenance']['byte_length'], len(data))
        self.assertEqual(m['compromise_assessment'], 'not_performed')
        for field in ('interpretations', 'suspected_anomalies', 'unverified_conclusions'):
            self.assertEqual(m[field], [])

    def test_malformed_missing_duplicate_keys_and_unicode(self):
        self.zip([('events.jsonl', b'{}\nnot json\n{"timestamp":3}\n{"a":1,"a":2}\n\xff\n[]\n')])
        m, rows = self.run_import()
        self.assertEqual(m['counts']['observations'], 2)
        self.assertEqual(m['counts']['parse_errors'], 4)
        self.assertEqual(rows[0]['normalized']['timestamp_status'], 'missing')
        self.assertEqual(rows[2]['normalized']['timestamp_status'], 'unsupported')

    def test_timestamp_cases(self):
        for value, status in [(None, 'missing'), ('2026-01-01T12:00:00', 'timezone_missing'),
            ('2026-13-99T12:00:00Z', 'invalid'), (1720000000, 'unsupported'),
            ('0001-01-01T00:00:00+14:00', 'invalid'), ('2026-12-31T23:59:60Z', 'invalid')]:
            with self.subTest(value=value):
                self.assertEqual(timestamp(value), (None, status))
        self.assertEqual(timestamp('2099-01-01T00:00:00Z'), ('2099-01-01T00:00:00Z', 'normalized'))
        self.assertEqual(timestamp('2026-10-10 12:00:00.123 -0400')[0], '2026-10-10T16:00:00.123000Z')

    def test_duplicates_preserved_with_unique_occurrence_ids(self):
        self.zip([('a.jsonl', b'{}\n{}\n'), ('b.jsonl', b'{}\n')])
        _, rows = self.run_import()
        self.assertEqual(len({r['event_id'] for r in rows}), 3)
        self.assertIsNone(rows[0]['duplicate_of'])
        self.assertEqual(rows[1]['duplicate_of'], rows[0]['event_id'])
        self.assertEqual(rows[2]['duplicate_of'], rows[0]['event_id'])

    def test_ips_two_objects_and_exact_utf8_offsets(self):
        data = '{"name":"é","timestamp":"2026-01-01T00:00:00Z"}\n {"reason":"test"}'.encode()
        self.zip([('crash.ips', data)])
        _, rows = self.run_import(include_sensitive=True)
        self.assertEqual(len(rows), 2)
        for row in rows:
            p = row['provenance']
            raw = data[p['byte_offset']:p['byte_offset'] + p['byte_length']]
            self.assertEqual(hashlib.sha256(raw).hexdigest(), p['record_sha256'])
        self.assertEqual(rows[1]['raw']['reason'], 'test')

    def test_plist_json_and_plain_text(self):
        self.zip([('a.plist', plistlib.dumps({'name': 'test', 'blob': b'abc'}, fmt=plistlib.FMT_BINARY)),
                  ('a.json', b'{"timestamp":"2026-01-01T00:00:00Z"}'),
                  ('system.log', b'2026-01-01T00:00:00Z daemon started\nunknown line\n')])
        m, rows = self.run_import(include_sensitive=True)
        self.assertEqual(m['counts']['observations'], 3)
        self.assertEqual(m['counts']['parse_errors'], 1)
        self.assertEqual(rows[0]['raw']['blob']['hex'], '616263')

    def test_tar_and_gzip(self):
        for compressed in (False, True):
            with self.subTest(compressed=compressed):
                self.tar([('sys/a.json', b'{}', tarfile.REGTYPE)], compressed)
                m, _ = self.run_import()
                self.assertEqual(m['counts']['observations'], 1)
                import shutil
                shutil.rmtree(self.out)

    def test_hostile_zip_paths(self):
        for name in ('../escape', '/escape', 'C:/escape', 'a\\escape', 'a/../../escape', 'a//b', 'a/./b', 'a./b', 'a\nb'):
            with self.subTest(name=name):
                self.zip([(name, b'{}')])
                self.rejected()

    def test_duplicate_case_unicode_and_file_directory_conflicts(self):
        for names in [('a.json', 'a.json'), ('A.json', 'a.json'), ('é.json', 'e\u0301.json'), ('a', 'a/b'), ('a/b', 'a')]:
            with self.subTest(names=names):
                import warnings
                with warnings.catch_warnings():
                    warnings.simplefilter('ignore')
                    self.zip([(n, b'{}') for n in names])
                self.rejected()

    def test_tar_links_devices_and_traversal(self):
        for kind in (tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.FIFOTYPE, tarfile.CHRTYPE):
            with self.subTest(kind=kind):
                self.tar([('bad', b'', kind)])
                self.rejected()
        self.tar([('../escape', b'bad', tarfile.REGTYPE)])
        self.rejected()

    def test_zip_symlink(self):
        info = zipfile.ZipInfo('bad')
        info.create_system = 3
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        self.zip([(info, b'../../escape')])
        self.rejected()

    def test_budgets(self):
        self.zip([('a.jsonl', b'{}\n{}\n'), ('b.jsonl', b'{}\n')])
        for limits in (replace(Limits(), archive_bytes=1), replace(Limits(), member_bytes=2),
                       replace(Limits(), expanded_bytes=7), replace(Limits(), members=1),
                       replace(Limits(), records=1)):
            with self.subTest(limits=limits):
                self.rejected(limits=limits)
        m, _ = self.run_import(limits=replace(Limits(), record_bytes=2))
        self.assertEqual(m['counts']['parse_errors'], 3)

    def test_compression_bomb_and_pax_metadata_budget(self):
        self.zip([('big.txt', b'x' * 1000000)])
        self.rejected(limits=replace(Limits(), expanded_bytes=100))
        with tarfile.open(self.archive, 'w:gz', format=tarfile.PAX_FORMAT) as t:
            info = tarfile.TarInfo('a')
            info.pax_headers = {'comment': 'x' * 50000}
            t.addfile(info)
        self.rejected(limits=replace(Limits(), expanded_bytes=2000))

    def test_unsupported_files_are_inventoried(self):
        self.zip([('logs/system.logarchive/000.tracev3', b'binary'), ('nested.zip', b'zip'), ('empty.txt', b'')])
        m, _ = self.run_import()
        self.assertEqual(m['counts']['observations'], 0)
        self.assertEqual(m['coverage'], 'partial')
        self.assertEqual(m['files'][0]['discovery'], 'unsupported_unified_log')

    def test_privacy_and_no_network(self):
        secret = 'test-user@example.invalid TOKEN-secret SSID-personal'
        self.zip([('private-' + secret + '.jsonl', json.dumps({'timestamp': secret, 'message': secret, 'source': 'boundary'}) + '\n')])
        with patch.object(socket, 'socket', side_effect=AssertionError('network forbidden')):
            _, rows = self.run_import()
        for file in self.out.iterdir():
            self.assertNotIn(secret, file.read_text())
        self.assertIsNone(rows[0]['raw'])
        self.assertEqual(rows[0]['normalized']['source'], 'ios_sysdiagnose')
        if os.name == 'posix':
            self.assertEqual(stat.S_IMODE(self.out.stat().st_mode), 0o700)
            for file in self.out.iterdir():
                self.assertEqual(stat.S_IMODE(file.stat().st_mode), 0o600)

    def test_integrity_manifest_and_repeatability(self):
        self.zip([('a.json', b'{}')])
        self.run_import()
        for line in (self.out / 'SHA256SUMS').read_text().splitlines():
            expected, name = line.split('  ')
            self.assertEqual(hashlib.sha256((self.out / name).read_bytes()).hexdigest(), expected)
        second = self.root / 'second'
        ingest(self.archive, second)
        for file in self.out.iterdir():
            self.assertEqual(file.read_bytes(), (second / file.name).read_bytes())
        (self.out / 'events.jsonl').write_bytes(b'tampered')
        m = json.loads((self.out / 'manifest.json').read_text())
        self.assertNotEqual(hashlib.sha256(b'tampered').hexdigest(), m['events_sha256'])

    def test_existing_output_never_overwritten(self):
        self.zip([('a.json', b'{}')])
        self.out.mkdir()
        (self.out / 'keep').write_text('keep')
        with self.assertRaises(IngestError):
            ingest(self.archive, self.out)
        self.assertEqual((self.out / 'keep').read_text(), 'keep')

    def test_corrupt_archive_and_private_error(self):
        self.archive.write_bytes(b'not an archive secret-user')
        with self.assertRaises(IngestError) as exc:
            ingest(self.archive, self.out)
        self.assertNotIn('secret-user', str(exc.exception))
        self.assertFalse(self.out.exists())

    def test_gzip_trailer_corruption(self):
        self.tar([('a.json', b'{}', tarfile.REGTYPE)], True)
        data = bytearray(self.archive.read_bytes())
        data[-8] ^= 0xff
        self.archive.write_bytes(data)
        self.rejected()

    def test_symlink_source_and_output(self):
        if os.name != 'posix':
            self.skipTest('POSIX symlink behavior')
        self.zip([('a.json', b'{}')])
        link = self.root / 'link'
        link.symlink_to(self.archive)
        with self.assertRaises(IngestError):
            ingest(link, self.out)
        self.assertFalse(self.out.exists())
        self.out.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(IngestError):
            ingest(self.archive, self.out)
        self.assertTrue(self.archive.exists())

    def test_cli_smoke_and_private_failure(self):
        import subprocess
        import sys
        script = Path(__file__).resolve().parents[1] / 'ingest.py'
        self.zip([('system.txt', b'2026-01-01 12:00:00 -0400 normal daemon started\n')])
        result = subprocess.run([sys.executable, str(script), str(self.archive), '--output', str(self.out)],
                                text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['observations'], 1)
        row = json.loads((self.out / 'events.jsonl').read_text())
        self.assertEqual(row['normalized']['timestamp'], '2026-01-01T16:00:00Z')
        secret = self.root / 'secret@example.invalid'
        result = subprocess.run([sys.executable, str(script), str(secret), '--output', str(self.root / 'bad')],
                                text=True, capture_output=True)
        self.assertEqual(result.returncode, 2)
        self.assertNotIn('secret@example.invalid', result.stdout + result.stderr)
        self.assertNotIn('Traceback', result.stderr)

    def test_zip_crc_corruption(self):
        with zipfile.ZipFile(self.archive, 'w', zipfile.ZIP_STORED) as z:
            z.writestr('a.json', b'{"fixture":"unique-marker"}')
        data = self.archive.read_bytes().replace(b'unique-marker', b'changed-value')
        self.archive.write_bytes(data)
        self.rejected()

    def test_zip_encryption_flag(self):
        self.zip([('a.json', b'{}')])
        data = bytearray(self.archive.read_bytes())
        data[6] |= 1
        central = data.index(b'PK\x01\x02')
        data[central + 8] |= 1
        self.archive.write_bytes(data)
        self.rejected()

    def test_sparse_tar_and_oversized_structured_record(self):
        with tarfile.open(self.archive, 'w') as t:
            info = tarfile.TarInfo('a')
            info.type = tarfile.GNUTYPE_SPARSE
            t.addfile(info)
        self.rejected()
        self.zip([('a.json', b'{"message":"too large"}')])
        m, rows = self.run_import(limits=replace(Limits(), record_bytes=3))
        self.assertEqual(m['counts']['parse_errors'], 1)
        self.assertEqual(rows[0]['error_code'], 'record_budget_exceeded')

    def test_write_failure_removes_partial_bundle(self):
        self.zip([('a.json', b'{}')])
        with patch('ingest.os.fsync', side_effect=OSError('private-device-name')):
            self.rejected()

    def test_malformed_xml_and_plist_uid(self):
        self.zip([('bad.plist', b'<?xml version="1.0"?><plist><dict><key>bad'),
                  ('uid.plist', plistlib.dumps({'uid': plistlib.UID(42)}, fmt=plistlib.FMT_BINARY))])
        m, rows = self.run_import(include_sensitive=True)
        self.assertEqual(m['counts']['parse_errors'], 1)
        self.assertEqual(rows[1]['raw']['uid'], {'type': 'plist_uid', 'value': 42})

    def test_deep_json_nonfinite_and_bad_ips(self):
        self.zip([('deep.json', '[' * 1500 + ']' * 1500), ('nan.json', '{"a":NaN}'),
                  ('bad.ips', '{}\n{}\n{}'), ('bad.plist', '<not-plist>')])
        m, _ = self.run_import()
        self.assertEqual(m['counts']['parse_errors'], 4)


if __name__ == '__main__':
    unittest.main()
