"""Independent invented whole-cohort check across the standard frame boundary.

This module invokes local TShark. Source preparation alone does not run it.
"""
from contextlib import closing
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest

from analyze import analyze
from fixtures import pcap
import test_reconstruct as fixture
import test_reconstruct_tshark as reference_fixture


@unittest.skipUnless(shutil.which('tshark'), 'independent local TShark unavailable')
class SoloLargeCohortTshark(unittest.TestCase):
    def test_complete_cohort_crosses_old_frame_boundary_without_dropping_occurrences(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            record=fixture.hello_record()
            ack=reference_fixture.segment(b'',1001,16)
            # The split record starts at the old last frame and completes in
            # frame16,385. All16,382 byte-identical ACK records must survive.
            frames=[reference_fixture.segment(b'',1000,2)]+[ack]*16382+[
                reference_fixture.segment(record[:20],1001),
                reference_fixture.segment(record[20:],1021)]
            raw=pcap([(1700000000,frame) for frame in frames])
            source=root/'invented.pcap';source.write_bytes(raw)
            original=[];offset=24
            for ordinal,frame in enumerate(frames,1):
                length=16+len(frame)
                original.append((ordinal,ordinal,offset,length,
                                 hashlib.sha256(raw[offset:offset+length]).hexdigest()))
                offset+=length
            self.assertEqual(len(original),16385)
            self.assertEqual(len(set(row[4] for row in original[1:16383])),1)
            case=root/'case';analyze([source],case,pseudonym_key=b'G'*32)
            before={p.relative_to(case).as_posix():hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in case.rglob('*') if p.is_file()}
            source_digest=hashlib.sha256(raw).hexdigest()

            def run(output,extra=()):
                command=[sys.executable,str(Path(__file__).resolve().parents[1]/'reconstruct.py'),
                    '--case',str(case),'--source','1='+str(source),'--output',str(output),*extra]
                # Producer retains120s including validation/finalization and
                # its owned decoder retains60s;5s is outer cleanup grace only.
                completed=subprocess.run(command,capture_output=True,timeout=125)
                self.assertEqual(completed.returncode,0,completed.stdout.decode('utf-8','backslashreplace'))
                self.assertEqual(json.loads(completed.stdout)['status'],'COMPLETE')
                manifest=json.loads((output/'manifest.json').read_bytes())
                self.assertEqual(manifest['status'],'COMPLETE',manifest.get('reason'))
                self.assertEqual(manifest['producer_version'],'1.2.0')
                self.assertEqual(manifest['schema'],'sentinel.tls-derived/3')
                for line in (output/'SHA256SUMS').read_text().splitlines():
                    digest,name=line.split('  ',1)
                    self.assertEqual(hashlib.sha256((output/name).read_bytes()).hexdigest(),digest)
                return manifest

            standard=root/'standard';ordinary=run(standard)
            self.assertEqual(ordinary['coverage']['selected_candidates'],0)
            self.assertEqual(ordinary['coverage']['permanent_candidates'],{'whole_cohort_frame_cap':1})
            self.assertEqual(ordinary['batches'],[])
            self.assertIsNone(ordinary['tools']['tshark'])
            self.assertEqual(ordinary['resources']['sampling_terminal_confirmations'],[])

            output=root/'solo';result=run(output,('--profile','solo-large-cohort-v1','--cohort-id','1'))
            self.assertEqual(result['analysis_profile']['profile'],'solo-large-cohort-v1')
            self.assertIs(type(result['analysis_profile']['cohort_id']),int)
            self.assertEqual(result['analysis_profile']['cohort_id'],1)
            self.assertEqual(result['coverage']['selected_frames'],16385)
            self.assertEqual(result['coverage']['selected_cohorts'],[1])
            self.assertEqual(result['coverage']['selected_candidates'],1)
            self.assertEqual(result['coverage']['classifications'],{'independently_recovered_hello':1})
            self.assertEqual(result['coverage']['excluded_candidates'],{})
            self.assertEqual(result['limits']['batch_frames'],32768)
            self.assertEqual(result['limits']['batch_bytes'],33554432)
            self.assertEqual(result['limits']['rss_bytes'],536870912)
            self.assertEqual(result['limits']['timeout_seconds'],120)
            self.assertEqual(result['limits']['decoder_seconds'],60)
            self.assertEqual(result['limits']['scratch_bytes'],67108864)
            self.assertEqual(len(result['batches']),1)
            self.assertFalse(result['continuation']['can_continue'])
            self.assertEqual(result['continuation']['maximum_pages'],1)
            self.assertTrue(result['resources']['resource_checks_passed'])

            with closing(sqlite3.connect((output/'index.sqlite').as_uri()+'?mode=ro&immutable=1',uri=True)) as db:
                db.row_factory=sqlite3.Row
                references=[tuple(row) for row in db.execute('''SELECT ordinal,packet_number,offset,length,sha256
                    FROM packet_references ORDER BY mini_frame''')]
                self.assertEqual(references,original)
                self.assertEqual(db.execute('SELECT COUNT(DISTINCT mini_frame) FROM packet_references').fetchone()[0],16385)
                row=db.execute('SELECT * FROM derivations').fetchone()
                self.assertEqual(row['ordinal'],16384)
                self.assertEqual(json.loads(row['provenance_json'])['cohort_id'],1)
                native=json.loads(row['data_json'])
                self.assertEqual(native['handshake_type'],'client_hello')
                self.assertEqual(native['legacy_version'],0x303)
                self.assertEqual(native['cipher_suite_count'],2)
                self.assertEqual(native['server_name'],fixture.PRIVATE_NAME.decode())
                self.assertIs(native['decryption'],False)
                self.assertEqual(json.loads(row['first_time_json'])['ordinal'],16384)
                self.assertEqual(json.loads(row['completion_time_json'])['ordinal'],16385)
                supports=list(db.execute('SELECT * FROM support ORDER BY ordinal,window_offset'))
                self.assertEqual([row['ordinal'] for row in supports],[16384,16385])
                union=bytearray()
                for part in supports:
                    reference=original[part['ordinal']-1]
                    self.assertEqual((part['byte_offset'],part['byte_length'],part['record_sha256']),reference[2:])
                    packet=raw[part['byte_offset']:part['byte_offset']+part['byte_length']]
                    start=16+part['payload_offset']
                    self.assertEqual(part['window_offset'],len(union))
                    union.extend(packet[start:start+part['slice_length']])
                self.assertEqual(bytes(union),record)
            with closing(sqlite3.connect((output/'batch-1.sqlite').as_uri()+'?mode=ro&immutable=1',uri=True)) as db:
                self.assertEqual([row[0] for row in db.execute('SELECT mini_frame FROM original_references ORDER BY mini_frame')],
                                 list(range(1,16386)))
                self.assertEqual(db.execute('SELECT COUNT(*) FROM assignments').fetchone()[0],16385)
            self.assertEqual(source_digest,hashlib.sha256(source.read_bytes()).hexdigest())
            after={p.relative_to(case).as_posix():hashlib.sha256(p.read_bytes()).hexdigest()
                   for p in case.rglob('*') if p.is_file()}
            self.assertEqual(before,after)
            self.assertFalse(result['raw_case_modified'])
            self.assertFalse(result['raw_decoding_losses_modified'])
            for path in (output/'export').iterdir():
                minimized=path.read_bytes()
                for marker in (fixture.PRIVATE_NAME,b'192.0.2.10',b'198.51.100.20',b'G'*32,str(source).encode()):
                    self.assertNotIn(marker,minimized)


if __name__=='__main__':unittest.main()
