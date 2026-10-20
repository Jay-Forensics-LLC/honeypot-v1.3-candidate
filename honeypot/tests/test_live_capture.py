import os
import hashlib
from pathlib import Path
import shutil
import struct
import sys
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import live_capture as capture
import live_demo_preflight as preflight
import demo_capture_diagnosis as diagnosis


class CaptureProof(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.dest=self.root/'captures';self.dest.mkdir()
        self.folder=self.root/'report';self.folder.mkdir()
        (self.root/'.env').write_text('PCAP_PATH=captures\nDISK_HIGH_PERCENT=90\nDISK_CRITICAL_PERCENT=95\n')
        self.path=self.dest/'ring_00001.pcapng';self.path.write_bytes(b'capture')
        self.marker='honeytrace-demo-packet-test';self.started=time.time()-1
    def proof(self,runner):
        return capture.packet_proof(self.root,self.folder,self.marker,'172.29.41.2',self.started,runner)

    def pcapng(self,partial_tail=True):
        payload=('USER '+self.marker+'\r\n').encode();stamp=int(time.time());self.started=stamp-1
        ethernet=b'\0'*12+b'\x08\x00'
        ip=struct.pack('!BBHHHBBH4s4s',0x45,0,40+len(payload),1,0,64,6,0,b'\xac\x1d\x29\x01',b'\xac\x1d\x29\x02')
        tcp=struct.pack('!HHIIBBHHH',41000,2121,1,0,0x50,0x18,4096,0,0)
        packet=ethernet+ip+tcp+payload;padded=packet+b'\0'*((-len(packet))%4)
        micros=stamp*1000000;size=32+len(padded)
        section=struct.pack('<IIIHHqI',0x0a0d0d0a,28,0x1a2b3c4d,1,0,-1,28)
        interface=struct.pack('<IIHHII',1,20,1,0,65535,20)
        enhanced=(struct.pack('<IIIIIII',6,size,0,micros>>32,micros&0xffffffff,len(packet),len(packet))+
                  padded+struct.pack('<I',size))
        complete=section+interface+enhanced
        return complete+(enhanced[:12] if partial_tail else b''),complete

    def test_partial_pcapng_retains_raw_and_exact_complete_prefix_with_provenance(self):
        raw,complete=self.pcapng();self.path.write_bytes(raw)
        def runner(argv,**kwargs):
            self.assertEqual(Path(argv[argv.index('-r')+1]).read_bytes(),complete)
            return SimpleNamespace(returncode=0,stdout=f'{time.time()}\t172.29.41.2\t2121\n')
        result=self.proof(runner);acquisition=result['acquisition']
        self.assertTrue(result['ok']);self.assertEqual(self.path.read_bytes(),raw)
        self.assertEqual(Path(acquisition['raw_snapshot']['path']).read_bytes(),raw)
        self.assertEqual(Path(result['snapshot']).read_bytes(),complete)
        self.assertEqual(acquisition['parser_snapshot'],{
            'path':result['snapshot'],'sha256':hashlib.sha256(complete).hexdigest(),'bytes':len(complete)})
        self.assertEqual(acquisition['raw_snapshot']['sha256'],hashlib.sha256(raw).hexdigest())
        self.assertEqual(acquisition['derivation']['discarded_tail_bytes'],12)
        self.assertEqual(acquisition['derivation']['source_sha256'],acquisition['raw_snapshot']['sha256'])
        for artifact in ('raw_snapshot','parser_snapshot'):
            self.assertEqual(Path(acquisition[artifact]['path']).stat().st_mode&0o777,0o600)

    def test_partial_derivative_no_match_and_parser_error_never_pass_or_leave_copies(self):
        raw,_=self.pcapng();self.path.write_bytes(raw)
        for outcome in (SimpleNamespace(returncode=0,stdout=''),
                        SimpleNamespace(returncode=14,stdout=f'{time.time()}\t172.29.41.2\t2121\n')):
            self.assertFalse(self.proof(lambda *a,**k:outcome)['ok'])
            self.assertEqual(self.path.read_bytes(),raw)
            self.assertFalse((self.folder/'capture-match.pcapng').exists())
            self.assertFalse((self.folder/'capture-complete-prefix.pcapng').exists())

    def test_partial_derivative_timeout_cleans_only_new_copies(self):
        raw,_=self.pcapng();self.path.write_bytes(raw)
        def runner(*args,**kwargs):raise capture.subprocess.TimeoutExpired('tshark',15)
        with self.assertRaises(capture.subprocess.TimeoutExpired):self.proof(runner)
        self.assertEqual(self.path.read_bytes(),raw)
        self.assertFalse((self.folder/'capture-match.pcapng').exists())
        self.assertFalse((self.folder/'capture-complete-prefix.pcapng').exists())

    def test_raw_snapshot_tampering_during_derivative_parse_cannot_pass(self):
        raw,_=self.pcapng();self.path.write_bytes(raw)
        def runner(*args,**kwargs):
            (self.folder/'capture-match.pcapng').write_bytes(raw+b'changed')
            return SimpleNamespace(returncode=0,stdout=f'{time.time()}\t172.29.41.2\t2121\n')
        with self.assertRaisesRegex(ValueError,'Acquired packet snapshot changed during verification'):
            self.proof(runner)
        self.assertEqual(self.path.read_bytes(),raw)
        self.assertFalse((self.folder/'capture-match.pcapng').exists())
        self.assertFalse((self.folder/'capture-complete-prefix.pcapng').exists())

    def test_existing_derived_evidence_cannot_be_overwritten_or_deleted(self):
        raw,_=self.pcapng();self.path.write_bytes(raw)
        existing=self.folder/'capture-complete-prefix.pcapng';existing.write_bytes(b'preserve')
        with self.assertRaises(FileExistsError):self.proof(lambda *a,**k:None)
        self.assertEqual(existing.read_bytes(),b'preserve');self.assertEqual(self.path.read_bytes(),raw)
        self.assertFalse((self.folder/'capture-match.pcapng').exists())

    def test_malformed_complete_interior_block_fails_before_parser_without_source_change(self):
        raw,complete=self.pcapng();broken=complete[:-4]+struct.pack('<I',12)+raw[len(complete):]
        self.path.write_bytes(broken)
        with patch.object(capture.subprocess,'run',side_effect=AssertionError('Malformed snapshot must not be parsed')):
            with self.assertRaisesRegex(ValueError,'block trailer'):self.proof(capture.subprocess.run)
        self.assertEqual(self.path.read_bytes(),broken)
        self.assertFalse((self.folder/'capture-match.pcapng').exists())

    def test_raw_and_derived_bytes_both_consume_aggregate_budget(self):
        raw,complete=self.pcapng();self.path.write_bytes(raw)
        # Exactly enough for the raw bytes, one byte too little for both copies.
        with patch.object(capture,'SNAPSHOT_TOTAL_LIMIT',len(raw)+len(complete)-1):
            with self.assertRaisesRegex(ValueError,'budget exceeded by complete-prefix'):
                self.proof(lambda *a,**k:None)
        self.assertEqual(self.path.read_bytes(),raw);self.assertFalse((self.folder/'capture-match.pcapng').exists())

    def test_native_tshark_partial_pcapng_matches_only_exact_complete_marker(self):
        if not shutil.which('tshark'):self.skipTest('tshark unavailable')
        raw,complete=self.pcapng();self.path.write_bytes(raw)
        result=self.proof(capture.subprocess.run)
        self.assertTrue(result['ok']);self.assertEqual(Path(result['snapshot']).read_bytes(),complete)
        for artifact in ('raw_snapshot','parser_snapshot'):
            Path(result['acquisition'][artifact]['path']).unlink()
        self.marker+='-absent'
        self.assertFalse(self.proof(capture.subprocess.run)['ok'])
        self.assertEqual(self.path.read_bytes(),raw)
    def test_matching_packet_retained_and_source_unchanged(self):
        original=self.path.read_bytes()
        def runner(argv,**kw):
            self.assertIn('-r',argv);self.assertNotIn('-i',argv)
            return SimpleNamespace(returncode=0,stdout=f'{time.time()}\t172.29.41.2\t2121\n')
        row=self.proof(runner)
        self.assertTrue(row['ok']);self.assertTrue(Path(row['snapshot']).exists())
        self.assertEqual(self.path.read_bytes(),original);self.assertEqual(len(row['sha256']),64)
    def test_private_parser_copy_and_cleanup_on_failure(self):
        inputs=[]
        def runner(argv,**kw):
            path=Path(argv[argv.index('-r')+1]);inputs.append(path)
            self.assertEqual(path.parent.parent,Path('/tmp'))
            self.assertEqual(path.stat().st_mode&0o777,0o600)
            self.assertEqual(path.parent.stat().st_mode&0o777,0o700)
            self.assertEqual(path.read_bytes(),self.path.read_bytes())
            raise capture.subprocess.TimeoutExpired('tshark',15)
        with self.assertRaises(capture.subprocess.TimeoutExpired):self.proof(runner)
        self.assertTrue(inputs)
        self.assertFalse(inputs[0].parent.exists())
        self.assertFalse((self.folder/'capture-match.pcapng').exists())
    def test_failed_parser_or_no_match_cleans_snapshot(self):
        for result in (SimpleNamespace(returncode=1,stdout=''),SimpleNamespace(returncode=0,stdout='')):
            self.assertFalse(self.proof(lambda *a,**kw:result)['ok'])
            self.assertFalse((self.folder/'capture-match.pcapng').exists())
    def test_timeout_cleans_snapshot(self):
        import subprocess
        def runner(*a,**kw):raise subprocess.TimeoutExpired('tshark',15)
        with self.assertRaises(subprocess.TimeoutExpired):self.proof(runner)
        self.assertFalse((self.folder/'capture-match.pcapng').exists())
    def test_existing_snapshot_never_deleted(self):
        snapshot=self.folder/'capture-match.pcapng';snapshot.write_bytes(b'preserve')
        with self.assertRaises(FileExistsError): self.proof(lambda *a,**kw:None)
        self.assertEqual(snapshot.read_bytes(),b'preserve')
    def test_parser_errors_are_reported_without_false_pass(self):
        result=SimpleNamespace(returncode=1,stdout='',stderr='incomplete capture block')
        row=self.proof(lambda *a,**kw:result)
        self.assertFalse(row['ok']);self.assertEqual(row['inspections'][0]['status'],'PARSER_FAILED')
        self.assertEqual(row['inspections'][0]['parser_error'],'incomplete capture block')
    def test_unreadable_segment_cannot_pass(self):
        original=os.open
        def guarded(path,*args,**kwargs):
            if Path(path)==self.path:raise PermissionError('unreadable capture')
            return original(path,*args,**kwargs)
        with patch.object(capture.os,'open',guarded):
            with self.assertRaises(PermissionError):self.proof(lambda *a,**kw:None)
        self.assertFalse((self.folder/'capture-match.pcapng').exists())
    def test_unreadable_directory_is_not_empty_inventory(self):
        with patch.object(capture.os,'scandir',side_effect=PermissionError('capture directory denied')):
            with self.assertRaisesRegex(PermissionError,'directory denied'):
                self.proof(lambda *a,**kw:None)
    def test_retrospective_findings_distinguish_missing_and_incomplete(self):
        self.assertEqual(diagnosis.finding({'ok':False},[]),'REQUIRED_SEGMENTS_UNAVAILABLE')
        for status in ('PARSER_FAILED','SKIPPED: predates interaction or empty'):
            self.assertEqual(diagnosis.finding({'ok':False,'inspections':[{'status':status}]},[self.path]),'ANALYSIS_INCOMPLETE')
        self.assertEqual(diagnosis.finding({'ok':False,'inspections':[{'status':'PARSED_NO_MARKER'}]},[self.path]),'NO_MATCH_IN_AVAILABLE_INSPECTED_SEGMENTS')
    def test_diagnostic_can_read_old_segment_but_keeps_packet_time_gate(self):
        os.utime(self.path,(1,1));queries=[]
        def runner(argv,**kw):
            queries.append(argv[argv.index('-Y')+1])
            return SimpleNamespace(returncode=0,stdout=f'{self.started-1}\t172.29.41.2\t2121\n')
        row=capture.packet_proof(self.root,self.folder,self.marker,'172.29.41.2',self.started,runner,candidate_paths=[self.path])
        self.assertFalse(row['ok']);self.assertEqual(len(queries),1)
        self.assertIn('frame.time_epoch >=',queries[0])
    def test_diagnostic_paths_cannot_escape_capture_directory(self):
        with self.assertRaisesRegex(ValueError,'outside capture'):
            capture.packet_proof(self.root,self.folder,self.marker,'172.29.41.2',self.started,candidate_paths=[self.root/'.env'])
    def test_retrospective_diagnosis_preserves_original_report(self):
        import json
        import datetime as dt
        report_dir=self.root/'work/demo/run-test';report_dir.mkdir(parents=True)
        path=report_dir/'report.json'
        row={'mode':'live','synthetic':True,'timestamp':dt.datetime.now(dt.timezone.utc).isoformat(),
             'demo_run_id':self.marker,'runtime':{'runtime_root':'/home/joe/honeypot-staging/honeypot',
             'containers':{'opencanary':{'networks':{'honeypot-canary-net':{'IPAddress':'172.29.41.2'}}}}},
             'capture_preflight':{'recent_segments':[{'path':str(self.path)}]},'status':'FAILED'}
        path.write_text(json.dumps(row));original=path.read_bytes()
        with patch.object(diagnosis,'SOURCE',self.root),patch.object(diagnosis,'runtime_path',return_value=self.dest), \
             patch.object(diagnosis,'packet_proof',return_value={'ok':True}) as proof, \
             patch('socket.create_connection',side_effect=AssertionError('No network permitted')):
            result=diagnosis.diagnose(path,self.folder)
        self.assertEqual(result['status'],'PACKET_FOUND_IN_RETAINED_SEGMENT')
        self.assertEqual(path.read_bytes(),original);self.assertFalse(result['original_report_changed'])
        self.assertIn(self.path,proof.call_args.kwargs['candidate_paths'])
    def test_diagnosis_rejects_report_outside_demo_workspace(self):
        path=self.root/'report.json';path.write_text('{}')
        with self.assertRaises(ValueError):diagnosis.diagnose(path,self.folder)
    def test_external_target_and_filter_injection_refused(self):
        with self.assertRaises(ValueError):capture.packet_proof(self.root,self.folder,self.marker,'8.8.8.8',self.started)
        with self.assertRaises(ValueError):capture.packet_proof(self.root,self.folder,'x || true','172.29.41.2',self.started)
    def test_ssh_banner_proof_requires_cowrie_target_and_exact_payload_filter(self):
        def runner(argv, **kwargs):
            query=argv[argv.index('-Y')+1]
            self.assertIn('tcp.dstport == 2222',query)
            self.assertIn(('SSH-2.0-'+self.marker).encode().hex(':'),query)
            return SimpleNamespace(returncode=0,stdout=f'{time.time()}\t172.29.40.2\t2222\n')
        row=capture.packet_proof(self.root,self.folder,self.marker,'172.29.40.2',self.started,
                                 runner,protocol='ssh_banner')
        self.assertTrue(row['ok']); self.assertEqual(row['target_port'],2222)
        for target, protocol in [('172.29.41.2','ssh_banner'),('172.29.40.2','ftp'),('172.29.40.2','unknown')]:
            with self.assertRaises(ValueError):
                capture.packet_proof(self.root,self.folder,self.marker,target,self.started,protocol=protocol)
    def test_wrong_packet_time_target_or_port_cannot_pass(self):
        for line in (f'{self.started-1}\t172.29.41.2\t2121',
                     f'{time.time()}\t172.29.40.2\t2121', f'{time.time()}\t172.29.41.2\t21'):
            self.assertFalse(self.proof(lambda *a,**kw: SimpleNamespace(returncode=0,stdout=line))['ok'])
    def test_stale_output_blocks_readiness(self):
        os.utime(self.path,(1,1));self.assertFalse(capture.readiness(self.root)['ok'])
    def test_disk_full_blocks_readiness(self):
        with patch.object(capture.shutil,'disk_usage',return_value=SimpleNamespace(total=100,used=96,free=4)):
            self.assertFalse(capture.readiness(self.root)['ok'])
    def test_native_tshark_matches_marker_not_unrelated_packet(self):
        if not shutil.which('tshark'):self.skipTest('tshark unavailable')
        payload=('USER '+self.marker+'\r\n').encode()
        ethernet=b'\0'*12+b'\x08\x00'
        ip=struct.pack('!BBHHHBBH4s4s',0x45,0,40+len(payload),1,0,64,6,0,b'\xac\x1d\x29\x01',b'\xac\x1d\x29\x02')
        tcp=struct.pack('!HHIIBBHHH',41000,2121,1,0,0x50,0x18,4096,0,0)
        packet=ethernet+ip+tcp+payload;stamp=int(time.time())
        self.started=stamp-1
        self.path.write_bytes(struct.pack('<IHHIIII',0xa1b2c3d4,2,4,0,0,65535,1)+struct.pack('<IIII',stamp,0,len(packet),len(packet))+packet)
        # Retain evidence under the actual workspace, where Ubuntu's tshark
        # profile denies direct reads (the old /tmp-only fixture missed this).
        workspace=Path(__file__).resolve().parents[1]/'work'
        with tempfile.TemporaryDirectory(prefix='packet-regression-',dir=workspace) as output:
            self.folder=Path(output)
            row=self.proof(capture.subprocess.run)
            self.assertTrue(row['ok'])
            self.assertEqual(Path(row['snapshot']).parent,self.folder)
            (self.folder/'capture-match.pcapng').unlink()
            self.marker='honeytrace-demo-unrelated'
            self.assertFalse(self.proof(capture.subprocess.run)['ok'])
    def test_native_tshark_proves_exact_cowrie_client_banner(self):
        if not shutil.which('tshark'): self.skipTest('tshark unavailable')
        payload=('SSH-2.0-'+self.marker+'\r\n').encode()
        ethernet=b'\0'*12+b'\x08\x00'
        ip=struct.pack('!BBHHHBBH4s4s',0x45,0,40+len(payload),1,0,64,6,0,b'\xac\x1d\x28\x01',b'\xac\x1d\x28\x02')
        tcp=struct.pack('!HHIIBBHHH',41000,2222,1,0,0x50,0x18,4096,0,0)
        packet=ethernet+ip+tcp+payload; stamp=int(time.time()); self.started=stamp-1
        self.path.write_bytes(struct.pack('<IHHIIII',0xa1b2c3d4,2,4,0,0,65535,1)+struct.pack('<IIII',stamp,0,len(packet),len(packet))+packet)
        row=capture.packet_proof(self.root,self.folder,self.marker,'172.29.40.2',self.started,protocol='ssh_banner')
        self.assertTrue(row['ok']); (self.folder/'capture-match.pcapng').unlink()
        row=capture.packet_proof(self.root,self.folder,self.marker+'-absent','172.29.40.2',self.started,protocol='ssh_banner')
        self.assertFalse(row['ok'])
    def test_preflight_never_opens_socket_and_is_inspection_only(self):
        with patch.object(preflight,'collect',return_value={'ok':False}) as collect, \
             patch.object(preflight,'readiness',return_value={'ok':False}), \
             patch.object(preflight.subprocess,'run',return_value=SimpleNamespace(returncode=1,stdout='',stderr='denied')) as run, \
             patch('socket.create_connection',side_effect=AssertionError('No sockets')):
            row=preflight.inspect(self.root)
        collect.assert_called_once_with(self.root,preflight.SOURCE,probe_readiness=False)
        self.assertFalse(row['ok']);self.assertFalse(row['traffic_generated'])
        self.assertEqual(run.call_count,5)
        commands=[call.args[0] for call in run.call_args_list]
        self.assertIn(['journalctl','--list-boots','--utc','--no-pager'],commands)
        self.assertTrue(all(cmd[0] in ('systemctl','journalctl') for cmd in commands))
        self.assertFalse(any(verb in cmd for cmd in commands for verb in ('start','stop','restart','enable')))


if __name__=='__main__':unittest.main()
