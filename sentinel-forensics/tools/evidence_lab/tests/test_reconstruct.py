"""Invented TLS metadata/provenance tests; fake reference fields are not decoder validation."""
from contextlib import closing
import hashlib
import importlib
import io
import errno
import os
import json
from pathlib import Path
import socket
import sqlite3
import struct
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from analyze import analyze
from capture import classic
from core import IngestError, MAX_RECORD, Reader
from fixtures import eth, ipv4, tcp
from network import tls
import reconstruct_pipeline as pipeline


PRIVATE_NAME = b'private.test'
BASE_NS = 1700000000 * 10**9


def hello_record(*, server=False, name=PRIVATE_NAME, selected=None,
                 ciphers=(0x1301, 0x1302), advertised=()):
    body = b'\x03\x03' + b'\0'*32 + b'\0'
    if server:
        body += struct.pack('!H', ciphers[0]) + b'\0'
    else:
        values = b''.join(struct.pack('!H', v) for v in ciphers)
        body += struct.pack('!H', len(values)) + values + b'\x01\0'
    extensions = b''
    if name is not None and not server:
        names = b'\0' + struct.pack('!H',len(name)) + name
        value = struct.pack('!H',len(names)) + names
        extensions += struct.pack('!HH',0,len(value)) + value
    if server and selected is not None:
        extensions += struct.pack('!HHH',43,2,selected)
    if not server and advertised:
        versions = b''.join(struct.pack('!H',v) for v in advertised)
        value = bytes([len(versions)]) + versions
        extensions += struct.pack('!HH',43,len(value)) + value
    if extensions:
        body += struct.pack('!H',len(extensions)) + extensions
    handshake = bytes([2 if server else 1]) + len(body).to_bytes(3,'big') + body
    return b'\x16\x03\x01' + struct.pack('!H',len(handshake)) + handshake


def reference_fields(*, server=False, name=PRIVATE_NAME, selected=None,
                     ciphers=(0x1301, 0x1302), advertised=()):
    return {
        'tls.handshake.cipher_suites_length': '' if server else str(2*len(ciphers)),
        'tls.handshake.ciphersuite': ','.join(hex(v) for v in ciphers),
        'tls.handshake.extensions.supported_version':
            (hex(selected) if selected is not None else '') if server else ','.join(hex(v) for v in advertised),
        'sentinel_tls_scope.legacy_version_hex':'0303',
        'sentinel_tls_scope.server_name_hex': name.hex() if name is not None and not server else '',
        'sentinel_tls_scope.server_name_count': '1' if name is not None and not server else '0',
    }


class HelloFieldComparisonTests(unittest.TestCase):
    def native(self, **kwargs):
        return tls(hello_record(**kwargs))[0][1]

    def test_client_and_server_tls12_and_tls13_metadata(self):
        cases = [dict(name=None,ciphers=(0xc02f,)),
                 dict(advertised=(0x304,0x303)),
                 dict(server=True,ciphers=(0xc02f,)),
                 dict(server=True,ciphers=(0x1301,),selected=0x304)]
        for args in cases:
            with self.subTest(args=args):
                native = self.native(**args)
                self.assertTrue(pipeline.hello_matches(native,reference_fields(**args)))
                self.assertEqual(native['legacy_version'],0x303)
                if args.get('server') and args.get('selected'):
                    self.assertEqual(native['selected_version'],0x304)

    def test_missing_empty_and_hostile_names_remain_distinct(self):
        for name in (None,b'',b'private,\x00\n\t.test',b'\xffprivate.test'):
            with self.subTest(name=name):
                native = self.native(name=name)
                self.assertTrue(pipeline.hello_matches(native,reference_fields(name=name)))
                self.assertEqual('server_name' in native,name is not None)
                if name is not None:
                    self.assertEqual(native['server_name'],name.decode('ascii','backslashreplace'))

    def test_each_client_reference_field_mutation_blocks_verified_metadata(self):
        baseline = reference_fields()
        changes = {
            'sentinel_tls_scope.legacy_version_hex':'0304',
            'tls.handshake.cipher_suites_length':'2',
            'tls.handshake.ciphersuite':'0x1301',
            'sentinel_tls_scope.server_name_hex':b'another.test'.hex(),
            'sentinel_tls_scope.server_name_count':'0',
        }
        for key,value in changes.items():
            with self.subTest(field=key):
                changed = {**baseline,key:value}
                self.assertFalse(pipeline.hello_matches(self.native(),changed))

    def test_server_cipher_selected_version_and_legacy_are_independently_required(self):
        args = dict(server=True,ciphers=(0x1301,),selected=0x304)
        native,baseline = self.native(**args),reference_fields(**args)
        for key,value in [('tls.handshake.ciphersuite','0x1302'),
                          ('tls.handshake.extensions.supported_version','0x303'),
                          ('tls.handshake.extensions.supported_version',''),
                          ('sentinel_tls_scope.legacy_version_hex','0304')]:
            with self.subTest(field=key,value=value):
                self.assertFalse(pipeline.hello_matches(native,{**baseline,key:value}))

    def test_absence_is_not_an_unchecked_optional_reference_value(self):
        native = self.native(name=None)
        for key,value in [('sentinel_tls_scope.server_name_count','1'),
                          ('sentinel_tls_scope.server_name_hex','61')]:
            self.assertFalse(pipeline.hello_matches(native,{**reference_fields(name=None),key:value}))
        native = self.native(server=True,ciphers=(0xc02f,))
        baseline = reference_fields(server=True,ciphers=(0xc02f,))
        self.assertFalse(pipeline.hello_matches(native,{**baseline,
            'tls.handshake.extensions.supported_version':'0x304'}))

    def test_duplicate_missing_and_malformed_reference_fields_are_indeterminate(self):
        baseline = reference_fields()
        cases = [dict(baseline, **{'sentinel_tls_scope.legacy_version_hex':'0303,0303'}),
                 dict(baseline, **{'sentinel_tls_scope.server_name_count':'1,1'}),
                 dict(baseline, **{'sentinel_tls_scope.server_name_hex':'70,72'}),
                 dict(baseline, **{'tls.handshake.ciphersuite':'0x1301,'}),
                 dict(baseline, **{'tls.handshake.ciphersuite':','.join(['1']*513)}),
                 dict(baseline, **{'sentinel_tls_scope.server_name_hex':None})]
        for field in baseline:
            changed = dict(baseline);del changed[field];cases.append(changed)
        for changed in cases:
            self.assertFalse(pipeline.hello_matches(self.native(),changed))

    def test_uncompared_native_fields_and_coerced_numbers_cannot_escape_verification(self):
        baseline = self.native()
        for change in ({'unchecked_payload':'private'}, {'decryption':True},
                       {'legacy_version':True}, {'cipher_suite_count':True},
                       {'selected_version':0x304}):
            self.assertFalse(pipeline.hello_matches({**baseline,**change},reference_fields()))

    def test_client_advertised_versions_are_not_a_selected_server_version(self):
        args = dict(advertised=(0x304,0x303))
        native = self.native(**args)
        self.assertNotIn('selected_version',native)
        self.assertTrue(pipeline.hello_matches(native,reference_fields(**args)))
        self.assertFalse(pipeline.hello_matches({**native,'selected_version':0x304},reference_fields(**args)))


def split_capture(record, mode='positive'):
    def segment(data,seq,flags=24):
        raw = tcp(data,sport=443 if mode=='selftuple' else 50000,flags=flags)
        return eth(ipv4(raw[:4]+struct.pack('!I',seq)+raw[8:],6,
                        dst='192.0.2.10' if mode=='selftuple' else '198.51.100.20'))
    frames = [segment(b'',1000,2),segment(record[:20],1001)]
    if mode == 'duplicate':frames.append(segment(record[:20],1001))
    if mode == 'conflict':
        overlap = bytearray(record[10:30]);overlap[1] ^= 1
        frames.append(segment(overlap,1011))
    if mode != 'missing':frames.append(segment(record[20:],1021))
    if mode == 'noeligible':frames = [segment(b'',1000,2)]
    header = b'\x4d\x3c\xb2\xa1'+struct.pack('<HHiiII',2,4,0,0,65535,1)
    result = [header]
    for i,frame in enumerate(frames,1):
        result.extend([struct.pack('<IIII',1700000000,i*111111111,len(frame),len(frame)),frame])
    return b''.join(result)


class ReconstructionEndToEndTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.record = hello_record()
        self.mode = 'positive'
        self.field_mutation = {}

    def case(self, mode='positive', offset=0):
        self.mode = mode
        source = self.root/('private-source-'+mode+'.pcap')
        source.write_bytes(split_capture(self.record,mode))
        config = {'clock_adjustments':{'1':{'offset_ns':offset,'justification':'private-clock-reason'}}} if offset else None
        case = self.root/('case-'+mode)
        analyze([source],case,config=config,pseudonym_key=b'K'*32)
        return case,source

    def snapshot(self, root):
        return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest()
                for p in root.rglob('*') if p.is_file()}

    def fake_decoder(self, command, input_stream, destination, config, **kwargs):
        self.assertIn('-n',command)
        self.assertEqual(command[command.index('-r')+1],'-')
        if self.mode == 'cancel':raise KeyboardInterrupt()
        if self.mode == 'failure':raise pipeline.ReconstructionError('invented_decoder_failure')
        raw = bytearray()
        while True:
            chunk = input_stream.read(MAX_RECORD)
            if not chunk:break
            raw.extend(chunk)
            self.assertLess(len(raw),1024*1024)
        packets = list(classic(Reader(io.BytesIO(raw))))
        fields = [command[i+1] for i,value in enumerate(command[:-1]) if value == '-e']
        for frame,packet in enumerate(packets,1):
            payload = packet.payload
            po = 54
            length = len(payload)-po
            row = {'frame.number':str(frame),'frame.protocols':'eth:ethertype:ip:tcp',
                'frame.cap_len':str(len(payload)),'frame.len':str(packet.original),
                'ip.src':'192.0.2.10','ip.dst':'198.51.100.20',
                'tcp.srcport':'50000','tcp.dstport':'443','tcp.stream':'0',
                'tcp.seq_raw':str(int.from_bytes(payload[38:42],'big')),
                'tcp.len':str(length),'tcp.flags':str(payload[47])}
            if length and self.mode != 'unavailable':
                row.update({'sentinel_tls_scope.offset':str(po),'sentinel_tls_scope.length':str(length)})
            if frame == len(packets) and self.mode != 'missing':
                row.update({'frame.protocols':'eth:ethertype:ip:tcp:tls',
                    'tcp.segment':f'2,{frame}','tcp.reassembled.length':str(len(self.record)),
                    'tls.record.content_type':'22','tls.record.length':str(len(self.record)-5),
                    'tls.handshake.type':'1','tls.handshake.length':str(int.from_bytes(self.record[6:9],'big')),
                    **reference_fields(),**self.field_mutation})
                if self.mode == 'ambiguous':row['tls.record.content_type']='22,22'
            destination.write(('\t'.join(row.get(field,'') for field in fields)+'\n').encode())
        return SimpleNamespace(returncode=0)

    def invoke(self, case, source, output, **kwargs):
        driver = importlib.import_module('reconstruct')
        with patch.object(pipeline.oracle,'decoder_process',side_effect=self.fake_decoder) as decoder, \
             patch.object(pipeline,'tool_version',return_value='TShark (Wireshark) synthetic-reference'), \
             patch.object(socket,'socket',side_effect=AssertionError('network forbidden')), \
             patch.object(socket,'getaddrinfo',side_effect=AssertionError('resolution forbidden')):
            self.last_decoder = decoder
            result = driver.reconstruct(case,{1:source},output,**kwargs)
        return result,decoder

    def test_original_support_times_offsets_and_multirecord_provenance(self):
        offset = -987654321
        case,source = self.case(offset=offset)
        before,source_hash = self.snapshot(case),hashlib.sha256(source.read_bytes()).hexdigest()
        output = self.root/'derived'
        result,decoder = self.invoke(case,source,output)
        self.assertEqual(result['status'],'COMPLETE');self.assertEqual(decoder.call_count,1)
        self.assertFalse(result['raw_case_modified'])
        self.assertFalse(result['raw_decoding_losses_modified'])
        self.assertEqual(result['findings_generated'],0)
        self.assertEqual(result['compromise_assessment'],'not_performed')
        with closing(sqlite3.connect(output/'index.sqlite')) as db:
            db.row_factory = sqlite3.Row
            row = db.execute("SELECT * FROM derivations WHERE status='independently_recovered_hello'").fetchone()
            self.assertIsNotNone(row)
            data = json.loads(row['data_json'])
            self.assertEqual(data['handshake_type'],'client_hello')
            self.assertEqual(data['legacy_version'],0x303)
            self.assertEqual(data['cipher_suite_count'],2)
            self.assertEqual(data['server_name'],PRIVATE_NAME.decode())
            self.assertFalse(data['decryption'])
            for field,basis,ordinal,fraction in [('first_time_json','first_support_capture',2,222222222),
                                                ('completion_time_json','completion_support_capture',3,333333333)]:
                when = json.loads(row[field]);self.assertEqual(when['basis'],basis)
                self.assertEqual((when['source_id'],when['ordinal'],when['packet_number']),(1,ordinal,ordinal))
                self.assertEqual(when['original_utc_ns'],BASE_NS+fraction)
                self.assertEqual(when['utc_ns'],BASE_NS+fraction+offset)
                self.assertEqual(when['time']['original']['ticks'],BASE_NS+fraction)
                self.assertEqual(when['time']['original']['units_per_second'],10**9)
                self.assertEqual(when['uncertainty'],'capture_clock_unverified_no_calibration')
            support = db.execute('SELECT * FROM support WHERE derivation_id=? ORDER BY ordinal',(row['id'],)).fetchall()
            self.assertEqual([item['ordinal'] for item in support],[2,3])
            raw = source.read_bytes()
            for item in support:
                self.assertEqual(hashlib.sha256(raw[item['byte_offset']:item['byte_offset']+item['byte_length']]).hexdigest(),item['record_sha256'])
        self.assertEqual(self.snapshot(case),before)
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),source_hash)

    def test_minimized_exports_omit_raw_identifiers_keys_and_private_clock_text(self):
        case,source = self.case(offset=1)
        outputs = []
        for name in ('derived-one','derived-two'):
            output = self.root/name
            result,_ = self.invoke(case,source,output)
            self.assertEqual(result['status'],'COMPLETE')
            for path in (output/'export').iterdir():
                text = path.read_bytes()
                for private in (PRIVATE_NAME,b'192.0.2.10',b'198.51.100.20',b'K'*32,
                                str(source).encode(),str(case).encode(),b'private-clock-reason'):
                    self.assertNotIn(private,text)
            records = [json.loads(line) for line in (output/'export/observations.jsonl').read_text().splitlines()]
            hello = next(row for row in records if row['entity']=='derived_observation')
            self.assertEqual(hello['schema'],'sentinel.tls-derived/3')
            for field in ('src','dst','server_name'):
                self.assertTrue(hello['payload']['data'][field].startswith('p_'))
            def inspect_keys(value):
                if isinstance(value,dict):
                    self.assertNotIn('original',value)
                    self.assertNotIn('justification',value)
                    for item in value.values():inspect_keys(item)
                elif isinstance(value,list):
                    for item in value:inspect_keys(item)
            inspect_keys(hello['payload'])
            outputs.append((output/'export/observations.jsonl').read_bytes())
        self.assertEqual(outputs[0],outputs[1])

    def test_negative_ambiguous_and_duplicate_occurrences_are_explicit(self):
        for mode,want in [('missing',{'source_byte_range_missing':1}),
                          ('conflict',{'conflicting_overlap':1}),
                          ('ambiguous',{'reference_indeterminate':1}),
                          ('duplicate',{'independently_recovered_hello':1,'reference_indeterminate':1})]:
            with self.subTest(mode=mode):
                case,source = self.case(mode)
                result,_ = self.invoke(case,source,self.root/('derived-'+mode))
                self.assertEqual(result['status'],'COMPLETE')
                with closing(sqlite3.connect(self.root/('derived-'+mode)/'index.sqlite')) as db:
                    counts = dict(db.execute('SELECT status,COUNT(*) FROM derivations GROUP BY status'))
                    self.assertEqual(counts,want)
                    if mode == 'duplicate':
                        self.assertEqual([row[0] for row in db.execute('SELECT ordinal FROM derivations ORDER BY ordinal')],[2,3])

    def test_unavailable_reference_ranges_keep_candidate_time_basis_explicit(self):
        case,source = self.case('unavailable')
        output = self.root/'unavailable-reference'
        result,_ = self.invoke(case,source,output)
        self.assertEqual(result['status'],'COMPLETE')
        with closing(sqlite3.connect(output/'index.sqlite')) as db:
            status,first,completion = db.execute('SELECT status,first_time_json,completion_time_json FROM derivations').fetchone()
            self.assertEqual(status,'reference_indeterminate')
            self.assertEqual(json.loads(first)['basis'],'candidate_capture')
            self.assertEqual(json.loads(first)['ordinal'],2)
            self.assertIsNone(json.loads(completion))
            self.assertEqual(db.execute('SELECT COUNT(*) FROM support').fetchone()[0],0)

    def test_mismatched_independent_hello_fields_never_emit_native_hello_metadata(self):
        case,source = self.case()
        changes = [('sentinel_tls_scope.legacy_version_hex','0304'),
                   ('tls.handshake.cipher_suites_length','2'),
                   ('sentinel_tls_scope.server_name_hex',b'another.test'.hex()),
                   ('sentinel_tls_scope.server_name_count','1,1'),
                   ('tls.handshake.type','2')]
        for i,(field,value) in enumerate(changes):
            with self.subTest(field=field):
                self.field_mutation = {field:value}
                output = self.root/('mismatch-'+str(i))
                result,_ = self.invoke(case,source,output)
                self.assertEqual(result['status'],'COMPLETE')
                with closing(sqlite3.connect(output/'index.sqlite')) as db:
                    status,data = db.execute('SELECT status,data_json FROM derivations').fetchone()
                self.assertEqual(status,'reference_indeterminate')
                self.assertNotIn('handshake_type',json.loads(data))
                self.assertNotIn('server_name',json.loads(data))

    def test_existing_output_is_preserved_without_a_decoder_call(self):
        case,source = self.case();output = self.root/'occupied';output.mkdir()
        (output/'keep').write_bytes(b'keep')
        with self.assertRaises(IngestError):self.invoke(case,source,output)
        self.assertEqual((output/'keep').read_bytes(),b'keep')

    def test_no_eligible_candidate_is_explicit_and_does_not_start_reference_decoder(self):
        case,source = self.case('noeligible')
        result,decoder = self.invoke(case,source,self.root/'no-eligible')
        self.assertEqual(result['status'],'COMPLETE')
        self.assertEqual(result['coverage']['eligible_candidates'],0)
        self.assertEqual(result['coverage']['evaluation'],'NO_ELIGIBLE_CANDIDATES')
        self.assertEqual(decoder.call_count,0)

    def test_whole_cohort_exclusion_does_not_silently_decode_a_partial_cohort(self):
        case,source = self.case();output = self.root/'excluded'
        result,decoder = self.invoke(case,source,output,limits={'batch_frames':2})
        self.assertEqual(result['status'],'COMPLETE');self.assertEqual(decoder.call_count,0)
        with closing(sqlite3.connect(output/'index.sqlite')) as db:
            self.assertEqual(db.execute('SELECT status FROM derivations').fetchall(),[('not_evaluated',)])

    def reseal(self, case):
        entries = []
        for line in (case/'SHA256SUMS').read_text().splitlines():
            _, name = line.split('  ',1)
            entries.append(hashlib.sha256((case/name).read_bytes()).hexdigest()+'  '+name)
        (case/'SHA256SUMS').write_text('\n'.join(entries)+'\n')

    def test_self_resealed_packet_time_forgery_fails_before_reference_decoding(self):
        case,source = self.case()
        with closing(sqlite3.connect(case/'index.sqlite')) as db:
            db.execute('UPDATE packet_meta SET utc_ns=utc_ns+1 WHERE ordinal=2')
            db.commit()
        self.reseal(case)
        try:
            result,_ = self.invoke(case,source,self.root/'forged-packet-time')
        except IngestError:
            result = {'status':'FAILED'}
        self.assertEqual(result['status'],'FAILED')
        self.assertEqual(self.last_decoder.call_count,0)

    def test_self_resealed_unused_clock_tables_cannot_override_configured_source_times(self):
        offset = 37
        case,source = self.case(offset=offset)
        with closing(sqlite3.connect(case/'index.sqlite')) as db:
            db.execute('UPDATE adjustments SET offset_ns=999999999,justification=?',('forged-clock-table',))
            db.execute('UPDATE timeline_index SET utc_ns=1,original_utc_ns=2')
            db.commit()
        self.reseal(case)
        before = self.snapshot(case)
        output = self.root/'forged-clock-tables'
        try:
            result,_ = self.invoke(case,source,output)
        except IngestError:
            result = {'status':'FAILED'}
        if result['status']=='COMPLETE':
            with closing(sqlite3.connect(output/'index.sqlite')) as db:
                original = json.loads(db.execute('SELECT first_time_json FROM derivations').fetchone()[0])
            self.assertEqual(original['original_utc_ns'],BASE_NS+222222222)
            self.assertEqual(original['utc_ns'],BASE_NS+222222222+offset)
            self.assertEqual(original['time']['original']['ticks'],BASE_NS+222222222)
        else:
            self.assertEqual(result['status'],'FAILED')
            self.assertEqual(self.last_decoder.call_count,0)
        self.assertEqual(self.snapshot(case),before)

    def test_identical_endpoint_tuple_is_explicitly_excluded_without_decoder(self):
        case,source = self.case('selftuple');before = self.snapshot(case)
        output = self.root/'ambiguous-direction'
        result,decoder = self.invoke(case,source,output)
        self.assertEqual(result['status'],'COMPLETE')
        self.assertEqual(decoder.call_count,0)
        self.assertEqual(result['coverage']['eligible_candidates'],1)
        self.assertEqual(result['coverage']['selected_candidates'],0)
        self.assertEqual(result['coverage']['excluded_candidates'],{'unsupported_cohort_direction':1})
        with closing(sqlite3.connect(output/'index.sqlite')) as db:
            self.assertEqual(db.execute('SELECT status,reason FROM derivations').fetchall(),
                             [('not_evaluated','unsupported_cohort_direction')])
        self.assertEqual(self.snapshot(case),before)

    def assert_late_failure(self, result, output):
        self.assertEqual(result['status'],'FAILED')
        self.assertEqual(json.loads((output/'state.json').read_text())['status'],'FAILED')
        saved = json.loads((output/'manifest.json').read_text())
        self.assertEqual(saved['status'],'FAILED')
        self.assertFalse(saved['resources']['resource_checks_passed'])
        # A stale checksum ledger may remain as failure evidence, but neither
        # completion marker may still advertise a completed bundle.
        if (output/'SHA256SUMS').exists():
            self.assertNotEqual(saved['status'],'COMPLETE')

    def test_post_checksum_resource_failure_downgrades_actual_publication_markers(self):
        case,source = self.case();output = self.root/'late-sample'
        driver = importlib.import_module('reconstruct')
        original = driver.Budget.sample
        def sample(budget):
            if (budget.output/'SHA256SUMS').exists():
                raise IngestError('invented_post_checksum_resource_failure')
            return original(budget)
        with patch.object(driver.Budget,'sample',sample):
            result,_ = self.invoke(case,source,output)
        self.assert_late_failure(result,output)

    def test_post_checksum_cleanup_failure_downgrades_actual_publication_markers(self):
        case,source = self.case();output = self.root/'late-cleanup'
        driver = importlib.import_module('reconstruct')
        original = driver.Budget.stop
        def stop(budget):
            original(budget)
            if (budget.output/'SHA256SUMS').exists():
                raise IngestError('invented_post_checksum_cleanup_failure')
        with patch.object(driver.Budget,'stop',stop):
            result,_ = self.invoke(case,source,output)
        self.assert_late_failure(result,output)

    def test_early_state_open_failure_restores_embedding_process_environment(self):
        case,source = self.case();output = self.root/'state-open-failure'
        driver = importlib.import_module('reconstruct')
        original_open = driver.os.open
        def current_umask():
            return next(line.split()[1] for line in Path('/proc/self/status').read_text().splitlines()
                        if line.startswith('Umask:'))
        before_mask = current_umask()
        before_environment = {name:os.environ.get(name) for name in ('TMPDIR','SQLITE_TMPDIR')}
        def blocked(path,*args,**kwargs):
            if Path(path)==output/'state.json':
                raise PermissionError(errno.EACCES,'invented private state-open failure',str(path))
            return original_open(path,*args,**kwargs)
        try:
            with patch.object(driver.os,'open',side_effect=blocked),self.assertRaises(IngestError) as caught:
                self.invoke(case,source,output)
            self.assertNotIn(str(output),str(caught.exception))
            self.assertEqual(current_umask(),before_mask)
            self.assertEqual({name:os.environ.get(name) for name in before_environment},before_environment)
            self.assertEqual(self.last_decoder.call_count,0)
            self.assertFalse((output/'SHA256SUMS').exists())
        finally:
            # Even a regressed producer must not change the test runner's mask.
            os.umask(int(before_mask,8))

    def output_descriptors(self, output):
        result = []
        for entry in Path('/proc/self/fd').iterdir():
            try:target = os.readlink(entry)
            except FileNotFoundError:continue
            if target.startswith(str(output)+os.sep):result.append(int(entry.name))
        return result

    def check_terminal_writer_failure(self, *, oversized=False):
        case,source = self.case();before_case = self.snapshot(case)
        output = self.root/('oversized-terminal' if oversized else 'failed-terminal-writer')
        driver = importlib.import_module('reconstruct')
        original_sample,original_write = driver.Budget.sample,driver.write_owned
        before_mask = next(line.split()[1] for line in Path('/proc/self/status').read_text().splitlines()
                           if line.startswith('Umask:'))
        before_environment = {name:os.environ.get(name) for name in ('TMPDIR','SQLITE_TMPDIR')}
        def sample(budget):
            if (output/'SHA256SUMS').exists():
                if oversized:
                    budget.failure_details = {'invented_oversized_failure':'q'*(MAX_RECORD+1)}
                raise IngestError('invented_after_complete_publication_failure')
            return original_sample(budget)
        def writer(fd, value):
            if not oversized and value.get('status')=='FAILED' and (output/'SHA256SUMS').exists():
                raise OSError('invented_terminal_writer_unavailable')
            return original_write(fd,value)
        try:
            with patch.object(driver.Budget,'sample',sample),patch.object(driver,'write_owned',writer):
                try:result,_ = self.invoke(case,source,output)
                except (IngestError,OSError):result = None
            if result is not None:self.assertEqual(result['status'],'FAILED')
            for name in ('state.json','manifest.json'):
                path = output/name
                if not path.exists():continue
                self.assertLessEqual(path.stat().st_size,MAX_RECORD)
                try:marker = json.loads(path.read_text())
                except json.JSONDecodeError:continue
                self.assertNotEqual(marker.get('status'),'COMPLETE')
            after_mask = next(line.split()[1] for line in Path('/proc/self/status').read_text().splitlines()
                              if line.startswith('Umask:'))
            self.assertEqual(after_mask,before_mask)
            self.assertEqual({name:os.environ.get(name) for name in before_environment},before_environment)
            self.assertEqual(self.output_descriptors(output),[])
            self.assertEqual(self.snapshot(case),before_case)
        finally:
            # A failing implementation must not pollute later tests.
            for fd in self.output_descriptors(output):os.close(fd)
            os.umask(int(before_mask,8))
            for name,value in before_environment.items():
                if value is None:os.environ.pop(name,None)
                else:os.environ[name]=value

    def test_failed_terminal_writer_cannot_leave_readable_complete_markers(self):
        self.check_terminal_writer_failure()

    def test_oversized_failure_manifest_invalidates_old_completion_and_restores_process(self):
        self.check_terminal_writer_failure(oversized=True)

    def test_real_close_then_eio_downgrades_markers_without_touching_reused_unrelated_fd(self):
        case,source = self.case();before_case = self.snapshot(case)
        output = self.root/'terminal-close-error'
        driver = importlib.import_module('reconstruct')
        original_close = driver.os.close
        unrelated = self.root/'unrelated-descriptor'
        sentinel = b'unrelated descriptor content must remain unchanged'
        unrelated.write_bytes(sentinel)
        control = os.open(unrelated,os.O_RDWR)
        before_identity = os.fstat(control)
        before_mask = next(line.split()[1] for line in Path('/proc/self/status').read_text().splitlines()
                           if line.startswith('Umask:'))
        before_environment = {name:os.environ.get(name) for name in ('TMPDIR','SQLITE_TMPDIR')}
        fault = {}
        def close_then_error(fd):
            try:target = os.readlink('/proc/self/fd/'+str(fd))
            except FileNotFoundError:target = None
            if not fault and (output/'SHA256SUMS').exists() and target in (
                    str(output/'state.json'),str(output/'manifest.json')):
                original_close(fd)
                replacement = os.open(unrelated,os.O_RDWR)
                fault.update(original_fd=fd,replacement_fd=replacement)
                raise OSError(errno.EIO,'invented error reported after successful close')
            return original_close(fd)
        try:
            with patch.object(driver.os,'close',side_effect=close_then_error):
                result,_ = self.invoke(case,source,output)
            self.assertTrue(fault)
            self.assertEqual(fault['replacement_fd'],fault['original_fd'])
            self.assertEqual(result['status'],'FAILED')
            for name in ('state.json','manifest.json'):
                marker = json.loads((output/name).read_text())
                self.assertEqual(marker['status'],'FAILED')
            ledger_valid = True
            for line in (output/'SHA256SUMS').read_text().splitlines():
                digest,name = line.split('  ',1)
                ledger_valid &= hashlib.sha256((output/name).read_bytes()).hexdigest()==digest
            self.assertFalse(ledger_valid)
            for fd in (control,fault['replacement_fd']):
                stat = os.fstat(fd)
                self.assertEqual((stat.st_dev,stat.st_ino),(before_identity.st_dev,before_identity.st_ino))
                os.lseek(fd,0,0)
                self.assertEqual(os.read(fd,len(sentinel)+1),sentinel)
            self.assertEqual(unrelated.read_bytes(),sentinel)
            after_mask = next(line.split()[1] for line in Path('/proc/self/status').read_text().splitlines()
                              if line.startswith('Umask:'))
            self.assertEqual(after_mask,before_mask)
            self.assertEqual({name:os.environ.get(name) for name in before_environment},before_environment)
            self.assertEqual(self.output_descriptors(output),[])
            self.assertEqual(self.snapshot(case),before_case)
        finally:
            for fd in {control,fault.get('replacement_fd')}|set(self.output_descriptors(output)):
                if fd is not None:
                    try:original_close(fd)
                    except OSError:pass
            os.umask(int(before_mask,8))
            for name,value in before_environment.items():
                if value is None:os.environ.pop(name,None)
                else:os.environ[name]=value

    def test_runtime_failure_and_cancellation_cannot_publish_complete_outputs(self):
        for mode,want in [('failure','FAILED'),('cancel','CANCELLED')]:
            case,source = self.case(mode)
            before = self.snapshot(case);output = self.root/('derived-'+mode)
            result,_ = self.invoke(case,source,output)
            self.assertEqual(result['status'],want)
            self.assertEqual(json.loads((output/'state.json').read_text())['status'],want)
            self.assertFalse((output/'SHA256SUMS').exists())
            self.assertEqual(self.snapshot(case),before)


if __name__=='__main__':unittest.main(verbosity=2)
