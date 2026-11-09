"""Independent local decoder checks on invented captures, never owner evidence."""
from contextlib import closing
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
import struct
import subprocess
import sys
import tempfile
import unittest

from analyze import analyze
from fixtures import DST, SRC, eth, ipv4, pcap, tcp
from test_reconstruct import hello_record


def segment(data, sequence, flags=24, *, server=False, client_port=50000):
    header = tcp(data, sport=443 if server else client_port,
                 dport=client_port if server else 443, flags=flags)
    acknowledgment = 0 if flags == 2 else 1001 if server else 2001
    header = header[:4] + struct.pack('!II', sequence, acknowledgment) + header[12:]
    return eth(ipv4(header, 6, src=DST if server else SRC,
                    dst=SRC if server else DST))


@unittest.skipUnless(shutil.which('tshark'), 'independent local TShark unavailable')
class ReconstructTshark(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def snapshot(self, folder):
        return {p.relative_to(folder).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                for p in folder.rglob('*') if p.is_file()}

    def run_cli(self, case, source, output, *, previous=None, max_frames=32768):
        # A fresh CLI gives each job independent lifetime resource metrics.
        command = [sys.executable,
            str(Path(__file__).resolve().parents[1] / 'reconstruct.py'),
            '--case', str(case), '--source', '1=' + str(source),
            '--output', str(output), '--max-selected-frames', str(max_frames)]
        if previous is not None:
            command += ['--continue-from', str(previous)]
        completed = subprocess.run(command, capture_output=True, timeout=30)
        self.assertEqual(completed.returncode, 0,
                         completed.stdout.decode('utf-8', 'backslashreplace'))
        self.assertEqual(json.loads(completed.stdout)['status'], 'COMPLETE')
        manifest = json.loads((output / 'manifest.json').read_bytes())
        self.assertEqual(manifest['status'], 'COMPLETE', manifest.get('reason'))
        self.assertEqual(manifest['producer_version'], '1.2.0')
        self.assertEqual(manifest['schema'], 'sentinel.tls-derived/3')
        self.assertEqual(manifest['limits']['total_frames'], max_frames)
        for line in (output / 'SHA256SUMS').read_text().splitlines():
            digest, name = line.split('  ', 1)
            self.assertEqual(hashlib.sha256((output / name).read_bytes()).hexdigest(), digest)
        return manifest

    def run_capture(self, label, record, *, mode='complete', server=False):
        folder = self.root / label
        folder.mkdir()
        if server:
            frames = [segment(b'', 1000, 2), segment(b'', 2000, 18, server=True),
                      segment(b'', 1001, 16), segment(record[:20], 2001, server=True)]
        else:
            frames = [segment(b'', 1000, 2), segment(record[:20], 1001)]
        if mode == 'conflicting':
            overlap = bytearray(record[10:30])
            overlap[1] ^= 1
            frames.append(segment(bytes(overlap), 2011 if server else 1011, server=server))
        if mode != 'missing':
            frames.append(segment(record[20:], 2021 if server else 1021, server=server))
        source = folder / 'invented.pcap'
        source.write_bytes(pcap(frames))
        source_digest = hashlib.sha256(source.read_bytes()).hexdigest()
        case, output = folder / 'case', folder / 'derived'
        analyze([source], case, pseudonym_key=b'I' * 32)
        original = self.snapshot(case)
        manifest = self.run_cli(case, source, output)
        self.assertEqual(manifest['findings_generated'], 0)
        self.assertEqual(manifest['coverage']['eligible_candidates'], 1)
        self.assertEqual(manifest['coverage']['selected_candidates'], 1)
        self.assertEqual(manifest['coverage']['excluded_candidates'], {})
        self.assertIn('TShark ', manifest['tools']['tshark'])
        self.assertEqual(original, self.snapshot(case))
        self.assertEqual(source_digest, hashlib.sha256(source.read_bytes()).hexdigest())
        self.assertTrue(manifest['input_binding']['original_sources_reconciled'])
        with closing(sqlite3.connect(output / 'index.sqlite')) as db:
            db.row_factory = sqlite3.Row
            row = db.execute('SELECT * FROM derivations').fetchone()
            support = db.execute('SELECT * FROM support ORDER BY ordinal').fetchall()
        self.assertIsNotNone(row)
        for item in support:
            start, length = item['byte_offset'], item['byte_length']
            raw = source.read_bytes()[start:start + length]
            self.assertEqual(hashlib.sha256(raw).hexdigest(), item['record_sha256'])
        return manifest, output, dict(row), support

    def test_real_decoder_continuation_repeats_exact_content_in_two_families(self):
        frames = []
        names = (b'first-chain.example', b'second-chain.example')
        for port, name in enumerate(names, 50000):
            record = hello_record(name=name)
            frames += [segment(b'', 1000, 2, client_port=port),
                       segment(record[:20], 1001, client_port=port),
                       segment(record[20:], 1021, client_port=port)]
        source = self.root / 'two-invented-cohorts.pcap'
        source.write_bytes(pcap(frames))
        original_source = hashlib.sha256(source.read_bytes()).hexdigest()
        case = self.root / 'case'
        analyze([source], case, pseudonym_key=b'I' * 32)
        original_case = self.snapshot(case)
        families = []
        for family_name in ('family-a', 'family-b'):
            family = self.root / family_name
            family.mkdir()
            previous, pages, completed = None, [], set()
            for number in (1, 2):
                output = family / ('page-' + str(number))
                manifest = self.run_cli(case, source, output,
                                        previous=previous, max_frames=3)
                self.assertEqual(manifest['coverage']['selected_candidates'], 1)
                self.assertEqual(manifest['coverage']['selected_frames'], 3)
                self.assertEqual(manifest['continuation']['can_continue'], number == 1)
                cursor = json.loads((output / 'continuation.json').read_bytes())
                selected = set(cursor['state']['selected_cohorts'])
                self.assertEqual(len(selected), 1)
                self.assertFalse(selected & completed)
                completed.update(selected)
                with closing(sqlite3.connect(
                        (output / 'index.sqlite').as_uri() + '?mode=ro&immutable=1',
                        uri=True)) as db:
                    db.row_factory = sqlite3.Row
                    current = db.execute("SELECT * FROM derivations WHERE status='independently_recovered_hello'").fetchall()
                    self.assertEqual(len(current), 1)
                    data = json.loads(current[0]['data_json'])
                    self.assertEqual(data['server_name'], names[number - 1].decode())
                    self.assertEqual(data['sport'], 49999 + number)
                    prior = db.execute("SELECT * FROM derivations WHERE status='previously_evaluated'").fetchall()
                    self.assertEqual(len(prior), number - 1)
                    if prior:
                        self.assertEqual(json.loads(prior[0]['data_json']), {})
                        claim = json.loads(prior[0]['provenance_json'])['prior_evaluation']
                        self.assertIs(claim['artifact_consistency_verified'], True)
                        self.assertIs(claim['execution_authenticated'], False)
                        self.assertIs(claim['acquisition_authenticated'], False)
                        self.assertEqual(db.execute('SELECT COUNT(*) FROM support WHERE derivation_id=?',
                                                    (prior[0]['id'],)).fetchone()[0], 0)
                exported = (output / 'export/observations.jsonl').read_bytes()
                for name in names:
                    self.assertNotIn(name, exported)
                pages.append({'semantic': cursor['semantic_sha256'],
                              'export': exported,
                              'report': (output / 'export/report.md').read_bytes(),
                              'physical': (output / 'SHA256SUMS').read_bytes()})
                previous = output
            self.assertEqual(completed, {1, 2})
            families.append(pages)
        for left, right in zip(*families):
            self.assertEqual(left['semantic'], right['semantic'])
            self.assertEqual(left['export'], right['export'])
            self.assertEqual(left['report'], right['report'])
            self.assertNotEqual(left['physical'], right['physical'])
        self.assertEqual(self.snapshot(case), original_case)
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), original_source)

    def test_independent_client_and_server_fields_across_tls_versions(self):
        cases = [
            ('client12', {'name': b'independent.example', 'ciphers': (0x002f, 0x0035)},
             {'handshake_type': 'client_hello', 'legacy_version': 0x0303,
              'cipher_suite_count': 2, 'server_name': 'independent.example'}),
            ('client13', {'name': b'version13.example', 'advertised': (0x0304, 0x0303)},
             {'handshake_type': 'client_hello', 'legacy_version': 0x0303,
              'cipher_suite_count': 2, 'server_name': 'version13.example'}),
            ('server13', {'server': True, 'name': None, 'selected': 0x0304,
                          'ciphers': (0x1301,)},
             {'handshake_type': 'server_hello', 'legacy_version': 0x0303,
              'cipher_suite': 0x1301, 'selected_version': 0x0304}),
            ('no_name', {'name': None, 'ciphers': (0x002f,)},
             {'handshake_type': 'client_hello', 'legacy_version': 0x0303,
              'cipher_suite_count': 1}),
        ]
        for label, options, expected in cases:
            with self.subTest(label=label):
                server = options.get('server', False)
                record = hello_record(**options)
                if server:
                    # TLS 1.3 uses 0x0303 in the ServerHello record header;
                    # an initial ClientHello may retain the 0x0301 compatibility value.
                    record = record[:1] + b'\x03\x03' + record[3:]
                _, output, row, support = self.run_capture(label, record, server=server)
                self.assertEqual(row['status'], 'independently_recovered_hello', row['reason'])
                data = json.loads(row['data_json'])
                for name, value in expected.items():
                    self.assertEqual(data[name], value)
                self.assertIs(data['decryption'], False)
                if 'server_name' not in expected:
                    self.assertNotIn('server_name', data)
                if 'selected_version' not in expected:
                    self.assertNotIn('selected_version', data)
                expected_ordinals = (4, 5) if server else (2, 3)
                self.assertEqual({ref['ordinal'] for ref in support}, set(expected_ordinals))
                first, completion = (json.loads(row[name]) for name in
                                     ('first_time_json', 'completion_time_json'))
                self.assertEqual((first['ordinal'], completion['ordinal']), expected_ordinals)
                exported = (output / 'export/observations.jsonl').read_bytes()
                if 'server_name' in expected:
                    self.assertNotIn(expected['server_name'].encode(), exported)
                self.assertNotIn(b'I' * 32, exported)

    def test_missing_and_conflicting_original_bytes_never_become_hello(self):
        for mode, expected in (('missing', 'source_byte_range_missing'),
                               ('conflicting', 'conflicting_overlap')):
            with self.subTest(mode=mode):
                _, _, row, _ = self.run_capture(mode, hello_record(), mode=mode)
                self.assertEqual(row['status'], expected)
                data = json.loads(row['data_json'])
                for key in ('handshake_type', 'server_name', 'legacy_version', 'cipher_suite_count'):
                    self.assertNotIn(key, data)

    def test_control_or_nonascii_names_are_minimized_or_explicitly_indeterminate(self):
        # An independent decoder may reject malformed host-name syntax. Neither
        # outcome permits copying the source identifier into a shareable export.
        name = b'comma,slash\\tab\tline\n\xff.example'
        _, output, row, _ = self.run_capture('opaque-name', hello_record(name=name))
        self.assertIn(row['status'], ('independently_recovered_hello', 'reference_indeterminate'))
        data = json.loads(row['data_json'])
        exported = (output / 'export/observations.jsonl').read_bytes()
        records = [json.loads(line) for line in exported.splitlines()]
        if row['status'] == 'independently_recovered_hello':
            self.assertEqual(data['server_name'], name.decode('ascii', 'backslashreplace'))
            observation = next(x for x in records if x['entity'] == 'derived_observation')
            self.assertTrue(observation['payload']['data']['server_name'].startswith('p_'))
        else:
            self.assertNotIn('server_name', data)
        self.assertNotIn(b'comma,slash', exported)


if __name__ == '__main__':
    unittest.main(verbosity=2)
