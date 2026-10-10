import copy
import json
from pathlib import Path
import sys
import tempfile
import shutil
import struct
import subprocess
import time
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import stage7_qualification as qualification
from test_pcap_demo_recovery import runtime_fixture


class RestartCommand(unittest.TestCase):
    cid = '29a005bb96d41be3852b52ab90772ca2f67638e52834e02ab75f2de67dfb382d'

    def test_installed_cli_deprecation_on_stdout_without_any_restart(self):
        if not shutil.which('docker'):
            self.skipTest('Docker CLI unavailable; no daemon is required')
        version = subprocess.run(['docker', '--version'], capture_output=True, text=True, timeout=10)
        if '29.1.3' not in version.stdout:
            self.skipTest('Installed CLI differs from the failed run version')
        old = subprocess.run(['docker', 'restart', '--time', '15', '--help'],
                             capture_output=True, text=True, timeout=10)
        new = subprocess.run(['docker', 'restart', '--timeout', '15', '--help'],
                             capture_output=True, text=True, timeout=10)
        self.assertEqual((old.returncode, new.returncode), (0, 0))
        self.assertIn('Flag --time has been deprecated', old.stdout)
        self.assertNotIn('deprecated', new.stdout + new.stderr)

    def test_one_restart_uses_supported_flag_and_retains_both_streams(self):
        row = {'service': 'opencanary'}
        response = subprocess.CompletedProcess([], 0, self.cid + '\n', 'diagnostic\n')
        with patch.object(qualification.subprocess, 'run', return_value=response) as run:
            qualification.restart_existing(row, self.cid)
        run.assert_called_once_with(['docker', 'restart', '--timeout', '15', self.cid],
                                    cwd=qualification.RUNTIME, text=True, capture_output=True, timeout=35)
        self.assertEqual(row['restart_exit'], 0)
        self.assertEqual(row['restart_response']['stdout'], self.cid + '\n')
        self.assertEqual(row['restart_response']['stderr'], 'diagnostic\n')

    def test_wrong_short_or_warning_contaminated_response_never_passes(self):
        for stdout in ('wrong\n', self.cid[:12] + '\n', '',
                       'Flag --time has been deprecated, use --timeout instead\n' + self.cid + '\n'):
            row = {'service': 'opencanary'}
            with self.subTest(stdout=stdout), patch.object(qualification.subprocess, 'run',
                    return_value=subprocess.CompletedProcess([], 0, stdout, '')) as run:
                with self.assertRaisesRegex(ValueError, 'response identity differs'):
                    qualification.restart_existing(row, self.cid)
            run.assert_called_once()
            self.assertEqual(row['restart_response']['stdout'], stdout)

    def test_nonzero_exit_timeout_and_excess_output_cannot_pass_or_retry(self):
        cases = [subprocess.CompletedProcess([], 1, self.cid + '\n', 'denied'),
                 subprocess.TimeoutExpired('docker', 35, output=b'partial', stderr=b'timeout'),
                 subprocess.CompletedProcess([], 0, self.cid + '\n', 'x' * 16385)]
        for response in cases:
            row = {'service': 'opencanary'}
            kw = {'side_effect': response} if isinstance(response, Exception) else {'return_value': response}
            with self.subTest(response=type(response).__name__), patch.object(qualification.subprocess, 'run', **kw) as run:
                with self.assertRaises((RuntimeError, subprocess.TimeoutExpired, ValueError)):
                    qualification.restart_existing(row, self.cid)
            run.assert_called_once()
            self.assertIn('restart_response', row)
            if isinstance(response, subprocess.TimeoutExpired):
                self.assertIsNone(row['restart_exit'])
                self.assertEqual(row['restart_response']['status'], 'TIMEOUT')
                self.assertEqual(row['restart_response']['stdout'], 'partial')
                self.assertEqual(row['restart_response']['stderr'], 'timeout')

    def test_uninspected_container_reference_is_rejected_before_mutation(self):
        with patch.object(qualification.subprocess, 'run') as run:
            for cid in (self.cid[:12], 'honeypot-opencanary', ''):
                with self.assertRaisesRegex(ValueError, 'full container ID'):
                    qualification.restart_existing({'service': 'opencanary'}, cid)
        run.assert_not_called()

    def test_interrupt_during_restart_retains_intent_and_unknown_response_without_retry(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(qualification.subprocess, 'run', side_effect=KeyboardInterrupt) as run:
            folder = Path(tmp); row = {'service':'opencanary'}
            with self.assertRaises(KeyboardInterrupt):
                qualification.restart_existing(row, self.cid, folder)
            self.assertEqual(json.loads((folder/'restart-intent.json').read_text())['argv'][-1], self.cid)
            self.assertEqual(json.loads((folder/'restart-response.json').read_text())['status'], 'INTERRUPTED')
            self.assertIsNone(row['restart_exit'])
            run.assert_called_once()


class StrictRestart(unittest.TestCase):
    def fixture(self):
        result=runtime_fixture(True)
        for name,c in result['containers'].items():
            c.update(started_at='before',restart_count=0)
            c['networks']['net'].update(EndpointID=name+'-endpoint',MacAddress=name+'-mac')
        result['networks'][0]['Containers']={c['id']:{'EndpointID':c['networks']['net']['EndpointID'],
            'MacAddress':c['networks']['net']['MacAddress']} for c in result['containers'].values()}
        return result

    def restarted(self):
        before=self.fixture(); after=copy.deepcopy(before)
        c=after['containers']['cowrie']; c['started_at']='after'
        c['networks']['net'].update(EndpointID='new',MacAddress='dynamic')
        after['networks'][0]['Containers'][c['id']].update(EndpointID='new',MacAddress='dynamic')
        return before,after

    def test_only_explicit_target_lifecycle_allowed(self):
        before,after=self.restarted()
        result=qualification.strict_compare(before,after,'cowrie',True)
        self.assertEqual(result['status'],'PASS')
        self.assertEqual(len(result['documented_lifecycle_changes']),3)
        with self.assertRaises(ValueError): qualification.strict_compare(before,after,'cowrie',False)
        with self.assertRaises(ValueError): qualification.strict_compare(before,after)

    def test_identity_image_source_network_and_security_changes_rejected(self):
        before,after=self.restarted()
        mutations=[lambda r:r['containers']['cowrie'].update(id='recreated'),
                   lambda r:r['containers']['cowrie'].update(image_id='changed'),
                   lambda r:r['containers']['cowrie'].update(restart_count=1),
                   lambda r:r['containers']['alloy'].update(started_at='unrelated restart'),
                   lambda r:r['containers']['alloy']['networks']['net'].update(EndpointID='unrelated change'),
                   lambda r:r['containers']['cowrie']['networks']['net'].update(IPAddress='172.29.40.3'),
                   lambda r:r['networks'][0]['IPAM']['Config'][0].update(Subnet='10.1.0.0/16'),
                   lambda r:r.update(boot_id='reboot'),lambda r:r.update(guard_fingerprint='changed'),
                   lambda r:r.update(wan_enabled=True),lambda r:r['capture'].update(pid=456),
                   lambda r:r['deployed_source_hashes'].update({'incidentd.py':'changed'})]
        for mutate in mutations:
            current=copy.deepcopy(after); mutate(current)
            with self.subTest(mutate=mutate),self.assertRaises(ValueError):
                qualification.strict_compare(before,current,'cowrie',True)

    def test_counter_and_mount_presentation_only_are_allowed(self):
        before,after=self.restarted()
        after['guard']['counters']['host_drop']=99
        after['containers']['alloy']['mounts'].reverse()
        self.assertEqual(qualification.strict_compare(before,after,'cowrie',True)['status'],'PASS')
    def test_ssh_probe_is_literal_loopback_and_has_no_authentication(self):
        from unittest.mock import MagicMock
        connection=MagicMock(); connection.__enter__.return_value=connection
        connection.recv.return_value=b'SSH-2.0-Cowrie\r\n'
        with patch.object(qualification.socket,'create_connection',return_value=connection) as connect, \
             patch.object(qualification.time,'sleep'):
            qualification.ssh_banner(2222,'honeytrace-demo-test')
        connect.assert_called_once_with(('127.0.0.1',2222),timeout=5)
        connection.sendall.assert_called_once_with(b'SSH-2.0-honeytrace-demo-test\r\n')


class MatrixAcceptance(unittest.TestCase):
    def complete(self):
        rows=[]
        for name in qualification.ORDER:
            cid = format(len(rows) + 1, '064x')
            rows.append({'service':name,'status':'PASS','restart_exit':0,
                         'checks':{k:'PASS' for k in qualification.REQUIRED},'postflight':{'status':'PASS'},
                         'probes':[{'protocol':'ftp'}],'startup_protection':{'status':'PASS'},
                         'before': {'containers': {name: {'id': cid}}},
                         'restart_command': ['docker', 'restart', '--timeout', '15', cid],
                         'restart_response': {'status': 'RETURNED', 'exit_code': 0, 'truncated': False,
                                              'stdout': cid + '\n', 'stderr': ''}})
        rows[1]['probes'].append({'protocol':'ssh_banner'})
        return rows

    def test_exact_complete_matrix_required(self):
        good=self.complete(); qualification.complete_rows(good)
        for rows in ([],good[:1],good[:-1],good+[good[0]],list(reversed(good))):
            with self.assertRaises(ValueError): qualification.complete_rows(rows)
        for key in qualification.REQUIRED:
            rows=self.complete(); rows[0]['checks'][key]='NOT TESTED'
            with self.subTest(key=key),self.assertRaises(ValueError): qualification.complete_rows(rows)
        for missing in ('probes','startup_protection'):
            rows=self.complete(); rows[-1].pop(missing)
            with self.assertRaises(ValueError): qualification.complete_rows(rows)

    def test_summary_pass_without_exact_restart_response_is_rejected(self):
        for change in ({'status': 'TIMEOUT'}, {'exit_code': 1}, {'truncated': True}, {'stdout': 'other'}):
            rows = self.complete(); rows[0]['restart_response'].update(change)
            with self.subTest(change=change), self.assertRaisesRegex(ValueError, 'response proof incomplete'):
                qualification.complete_rows(rows)
        rows = self.complete(); rows[0].pop('restart_response')
        with self.assertRaisesRegex(ValueError, 'response proof incomplete'):
            qualification.complete_rows(rows)
        rows = self.complete(); rows[0]['restart_command'][2] = '--time'
        with self.assertRaisesRegex(ValueError, 'response proof incomplete'):
            qualification.complete_rows(rows)

    def test_failure_stops_later_restarts_and_attempts_postflight(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp); baseline={'runtime':{},'boot_id':'boot','existing_event':{},'historical_obligations':[]}
            with patch.object(qualification,'load_verified'),patch.object(qualification,'restart_row',return_value={
                    'service':'opencanary','status':'FAILED','error':'packet absent'}) as restart, \
                 patch.object(qualification,'postflight',side_effect=lambda row,*args:row.update(postflight={'status':'PASS'})) as post:
                result=qualification.execute_matrix(baseline,{'path':'baseline','sha256':'hash'},folder)
            self.assertEqual(restart.call_count,1); post.assert_called_once()
            self.assertEqual(result['STAGE7_GATE'],'BLOCKED'); self.assertEqual(result['STAGE8_GATE'],'BLOCKED')
            self.assertFalse(result['STAGE8_TESTED'])

    def test_failed_row_always_records_postflight_and_primary_failure(self):
        with tempfile.TemporaryDirectory() as tmp,patch.object(qualification,'observe',side_effect=ValueError('guard lost')), \
             patch.object(qualification,'postflight',side_effect=lambda row,*args:row.update(postflight={'status':'FAILED','error':'still lost'})) as post, \
             patch.object(qualification,'command') as command:
            row=qualification.restart_row('opencanary',{}, {},Path(tmp),[],0)
        command.assert_not_called(); post.assert_called_once()
        self.assertIn('guard lost',row['error']); self.assertEqual(row['status'],'FAILED')
        self.assertEqual(row['postflight']['status'],'FAILED')

    def test_incomplete_or_failed_prerequisites_cannot_pass(self):
        runtime=runtime_fixture(True)
        row={'STATUS':'ACTIVE_PREREQUISITES_PASSED','runtime':runtime,'runtime_after':runtime,
             'runtime_comparison':{'ok':True},'evidence_integrity':{'status':'VERIFIED_KNOWN_DEFECT_ONLY',
                'files_in_inventory':10,'files_scanned':10,'planned_total_bytes':100,'bytes_read':100}}
        qualification.prerequisite_passed(row)
        for mutation in ({'files_scanned':9},{'bytes_read':99},{'files_in_inventory':0}):
            current=copy.deepcopy(row); current['evidence_integrity'].update(mutation)
            with self.assertRaises(ValueError):qualification.prerequisite_passed(current)

    def test_complete_stable_reads_with_accounted_growth_pass_but_unexplained_bytes_do_not(self):
        runtime = runtime_fixture(True)
        row = {'STATUS':'ACTIVE_PREREQUISITES_PASSED','runtime':runtime,'runtime_after':runtime,
               'runtime_comparison':{'ok':True},'evidence_integrity':{
                   'status':'VERIFIED_KNOWN_DEFECT_ONLY','files_in_inventory':2,'files_scanned':2,
                   'planned_total_bytes':100,'bytes_read':107,'inventory_size_delta_bytes':7,
                   'read_accounting':[
                       {'path':'first','planned_event_bytes':40,'planned_metadata_bytes':10,'event_bytes':40,'metadata_bytes':10},
                       {'path':'second','planned_event_bytes':40,'planned_metadata_bytes':10,'event_bytes':45,'metadata_bytes':12}]}}
        qualification.prerequisite_passed(row)
        mutations = [lambda e:e.pop('read_accounting'), lambda e:e.update(bytes_read=106),
            lambda e:e.update(inventory_size_delta_bytes=0), lambda e:e.update(files_scanned=1),
            lambda e:e['read_accounting'].pop(), lambda e:e['read_accounting'][1].update(path='first'),
            lambda e:e['read_accounting'][1].update(event_bytes=qualification.review.EVIDENCE_FILE_LIMIT+1),
            lambda e:e['read_accounting'][0].update(event_bytes=39),
            lambda e:e.update(bytes_read=qualification.review.EVIDENCE_READ_BUDGET+1)]
        for mutate in mutations:
            current = copy.deepcopy(row); mutate(current['evidence_integrity'])
            with self.assertRaises(ValueError): qualification.prerequisite_passed(current)

    def test_interrupted_recovery_records_response_postflight_and_no_probe(self):
        before = runtime_fixture(True)
        cid = RestartCommand.cid
        before['containers']['opencanary']['id'] = cid
        current = copy.deepcopy(before)
        current.update(ok=False, problems=['opencanary: not running and healthy'])
        current['containers']['opencanary']['health'] = 'starting'
        config = {'dynamic_mac':{'opencanary':True}}
        base = {'execution_configuration':config,'routes':{},'evidence_permissions':{},'quarantine':{},
                'source_commit':'rev','implementation':{},'boot_id':before['boot_id']}
        with tempfile.TemporaryDirectory() as tmp, \
             patch.object(qualification,'observe',return_value=(before,{})), \
             patch.object(qualification,'strict_compare',return_value={'status':'PASS'}), \
             patch.object(qualification,'execution_configuration',return_value=config), \
             patch.object(qualification,'routes_and_tty',return_value={}), \
             patch.object(qualification,'evidence_permissions',return_value={}), \
             patch.object(qualification,'quarantine_state',return_value={}), \
             patch.object(qualification,'source_revision',return_value='rev'), \
             patch.object(qualification,'implementation',return_value={}), \
             patch.object(qualification,'acquire_preservation',return_value={}), \
             patch.object(qualification.subprocess,'run',return_value=subprocess.CompletedProcess([],0,cid+'\n','')) as restart, \
             patch.object(qualification,'collect',return_value=current), \
             patch.object(qualification.time,'sleep',side_effect=KeyboardInterrupt), \
             patch.object(qualification,'probe') as probe, \
             patch.object(qualification,'postflight',side_effect=lambda row,*args:row.update(postflight={'status':'FAILED','error':'still starting'})) as post:
            folder = Path(tmp)
            row = qualification.restart_row('opencanary',before,base,folder,[],0)
            self.assertEqual(json.loads((folder/'restart-response.json').read_text())['exit_code'],0)
            self.assertEqual(json.loads((folder/'recovery-observations.json').read_text())[0]['health'],'starting')
        self.assertEqual(row['status'],'ABORTED'); self.assertTrue(row['interrupted'])
        self.assertIn('health recovery',row['error'])
        probe.assert_not_called(); restart.assert_called_once(); post.assert_called_once()

    def test_interrupted_matrix_persists_row_and_never_restarts_next_service(self):
        base = {'runtime':{},'boot_id':'boot','existing_event':{},'historical_obligations':[]}
        with tempfile.TemporaryDirectory() as tmp, patch.object(qualification,'load_verified'), \
             patch.object(qualification,'restart_row',return_value={'service':'opencanary','status':'ABORTED','interrupted':True,
                                                                  'error':'cancelled','postflight':{'status':'FAILED'}}) as restart, \
             patch.object(qualification,'postflight',side_effect=lambda row,*args:row.update(postflight={'status':'FAILED','error':'unhealthy'})):
            result = qualification.execute_matrix(base,{'path':'baseline','sha256':'hash'},Path(tmp))
            self.assertEqual(json.loads((Path(tmp)/'01-opencanary/row.json').read_text())['status'],'ABORTED')
        restart.assert_called_once()
        self.assertEqual(result['STATUS'],'ABORTED')
        self.assertEqual((result['STAGE7_GATE'],result['STAGE8_GATE']),('BLOCKED','BLOCKED'))

    def test_interrupt_during_baseline_writes_final_report_with_exit_130(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(sys,'argv',['stage7', '--runtime-root',str(qualification.RUNTIME),
                '--prerequisites','previous.json','--prerequisites-sha256','hash','--validation','validation.json',
                '--validation-sha256','hash','--execute-restarts']), \
             patch.object(qualification.tempfile,'mkdtemp',return_value=tmp), \
             patch.object(qualification.os,'geteuid',return_value=0), \
             patch.object(qualification,'baseline',side_effect=KeyboardInterrupt), \
             patch.object(qualification,'execute_matrix') as matrix, \
             patch.object(qualification,'postflight',side_effect=lambda row,*args:row.update(postflight={'status':'PASS'})) as post:
            self.assertEqual(qualification.main(),130)
            report = json.loads((Path(tmp)/'report.json').read_text())
        matrix.assert_not_called(); post.assert_called_once()
        self.assertEqual(report['STATUS'],'ABORTED'); self.assertEqual(report['command_exit_code'],130)
        self.assertEqual(report['postflight']['status'],'PASS')

    def test_cli_interrupted_matrix_retains_baseline_row_hash_and_exit_130(self):
        base = {'runtime':{},'boot_id':'boot','existing_event':{},'historical_obligations':[]}
        with tempfile.TemporaryDirectory() as tmp, patch.object(sys,'argv',['stage7','--runtime-root',str(qualification.RUNTIME),
                '--prerequisites','previous.json','--prerequisites-sha256','hash','--validation','validation.json',
                '--validation-sha256','hash','--execute-restarts']), \
             patch.object(qualification.tempfile,'mkdtemp',return_value=tmp), \
             patch.object(qualification.os,'geteuid',return_value=0), \
             patch.object(qualification,'baseline',return_value=base), \
             patch.object(qualification,'restart_row',return_value={'service':'opencanary','status':'ABORTED',
                'interrupted':True,'error':'cancelled','postflight':{'status':'PASS','runtime':{}}}) as restart, \
             patch.object(qualification,'postflight',side_effect=lambda row,*args:row.update(postflight={'status':'PASS','runtime':{}})):
            self.assertEqual(qualification.main(),130)
            report = json.loads((Path(tmp)/'report.json').read_text())
            self.assertEqual(qualification.load_verified(Path(report['baseline']['path']),report['baseline']['sha256']),base)
            retained = qualification.load_verified(Path(report['rows'][0]['report']['path']),report['rows'][0]['report']['sha256'])
            self.assertEqual(retained['status'],'ABORTED')
        restart.assert_called_once()
        self.assertEqual(report['command_exit_code'],130)
        self.assertEqual((report['STAGE7_GATE'],report['STAGE8_GATE']),('BLOCKED','BLOCKED'))

    def test_postflight_interruption_is_separate_and_cannot_erase_primary_failure(self):
        row = {'error':'packet verification failed'}
        with patch.object(qualification,'observe',side_effect=KeyboardInterrupt):
            qualification.postflight(row)
        self.assertEqual(row['error'],'packet verification failed')
        self.assertTrue(row['interrupted']); self.assertEqual(row['postflight']['status'],'FAILED')
        self.assertIn('interrupted',row['postflight']['error'])

    def test_private_exclusive_report_hash_and_tamper_check(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'report.json'; link=qualification.save(path,{'status':'FAILED'})
            self.assertEqual(path.stat().st_mode&0o777,0o600)
            self.assertEqual(qualification.load_verified(path,link['sha256'])['status'],'FAILED')
            with self.assertRaises(FileExistsError):qualification.save(path,{})
            path.write_text('{}')
            with self.assertRaises(ValueError):qualification.load_verified(path,link['sha256'])


class IndependentPacketVerification(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.folder=Path(self.tmp.name); self.marker='honeytrace-demo-stage7-proof'
        event={'event_id':'one','username':self.marker}; raw={'logdata':{'USERNAME':self.marker}}
        record={'raw':raw,'normalized':event}
        payload=('USER '+self.marker+'\r\n').encode(); stamp=int(time.time())
        ethernet=b'\0'*12+b'\x08\x00'
        ip=struct.pack('!BBHHHBBH4s4s',0x45,0,40+len(payload),1,0,64,6,0,b'\xac\x1d\x29\x01',b'\xac\x1d\x29\x02')
        tcp=struct.pack('!HHIIBBHHH',41000,2121,1,0,0x50,0x18,4096,0,0)
        packet=ethernet+ip+tcp+payload; self.path=self.folder/'packet.pcapng'
        self.path.write_bytes(struct.pack('<IHHIIII',0xa1b2c3d4,2,4,0,0,65535,1)+struct.pack('<IIII',stamp,0,len(packet),len(packet))+packet)
        digest,size=qualification.sha256(self.path)
        self.probe={'status':'PASS','synthetic':True,'demo_run_id':self.marker,'protocol':'ftp',
            'event':event,'started_epoch':stamp-1,'target_ip':'172.29.41.2','target_port':2121,
            'packet':{'snapshot':str(self.path),'sha256':digest,'bytes':size}}
        for name,value in [('raw_artifact',raw),('normalized_artifact',event),('record_artifact',record)]:
            self.probe[name]=qualification.save(self.folder/(name+'.json'),value)
        self.rows=[{'probes':[self.probe]}]

    def test_real_retained_marker_passes_and_missing_marker_fails(self):
        if not shutil.which('tshark'): self.skipTest('tshark unavailable')
        self.assertEqual(qualification.verify_packets(self.rows)['verified_probe_count'],1)
        self.probe['demo_run_id']+='-missing'
        with self.assertRaisesRegex(ValueError,'marker recheck failed'):qualification.verify_packets(self.rows)

    def test_unreadable_tampered_and_duplicate_proof_cannot_pass(self):
        with patch.object(qualification.preservation,'regular',side_effect=PermissionError('unreadable')):
            with self.assertRaises(PermissionError):qualification.verify_packets(self.rows)
        original=self.path.read_bytes(); self.path.write_bytes(b'wrong')
        with self.assertRaisesRegex(ValueError,'size differs'):qualification.verify_packets(self.rows)
        self.path.write_bytes(original)
        with patch.object(qualification,'command',return_value=f'{time.time()}\t172.29.41.2\t2121\n'):
            with self.assertRaisesRegex(ValueError,'Duplicate'):qualification.verify_packets(self.rows*2)

    def test_parser_failure_and_timeout_never_pass(self):
        for error in (RuntimeError('parser failed'),subprocess.TimeoutExpired('tshark',15)):
            with patch.object(qualification,'command',side_effect=error):
                with self.assertRaises(type(error)):qualification.verify_packets(self.rows)

    def test_record_relationship_rechecked_even_when_hash_matches(self):
        self.probe['event']={'event_id':'other'}
        with self.assertRaisesRegex(ValueError,'relationship differs'):qualification.verify_packets(self.rows)


if __name__ == '__main__':unittest.main()
