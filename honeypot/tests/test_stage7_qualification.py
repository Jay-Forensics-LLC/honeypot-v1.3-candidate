import copy
from contextlib import ExitStack
import datetime as dt
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import shutil
import struct
import subprocess
import time
import unittest
from unittest.mock import patch, Mock

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import stage7_qualification as qualification
from test_pcap_demo_recovery import runtime_fixture
from incidentd import Engine
from test_packet_snapshot import bind_fixture_source


class CleanStartupAudit(unittest.TestCase):
    def run_audit(self, changes=None, producer=None, since=None):
        stamp = dt.datetime.now(dt.timezone.utc).isoformat()
        audit = {'action': 'EVIDENCE_STARTUP_SCAN_COMPLETE', 'status': 'CLEAN',
            'scan_complete': True, 'locator_ready': True, 'migration_failed': False,
            'scanned_incidents': 0, 'blocked_incidents': 0, 'boot_id': 'boot',
            'producer_pid': 1, 'producer_started_ticks': 123, 'started_utc': stamp, 'timestamp': stamp}
        audit.update(changes or {})
        context = Mock(value={'boot_id': 'boot'})
        producer = producer or {'pid': 1, 'started_ticks': 123, 'boot_id': 'boot'}
        with patch.object(qualification, 'CONTEXT', context), \
             patch.object(qualification.preservation, 'stable_bytes', return_value=json.dumps(audit).encode()), \
             patch.object(qualification, 'command', side_effect=['a' * 64, json.dumps(producer)]):
            return qualification.integrity_startup(since)

    def test_positive_complete_scan_bound_to_current_process_leaves_history_unknown(self):
        self.assertEqual(self.run_audit()['historical_closeout'], 'UNKNOWN')

    def test_missing_incomplete_or_failed_scan_never_passes(self):
        for changes in ({'status': 'BLOCKED'}, {'scan_complete': False}, {'locator_ready': False},
                        {'migration_failed': True}, {'blocked_incidents': 1}, {'boot_id': 'another'},
                        {'producer_started_ticks': None}, {'timestamp': '2000-01-01T00:00:00Z'}):
            with self.subTest(changes=changes), self.assertRaises((ValueError, TypeError)):
                self.run_audit(changes)

    def test_other_producer_or_prerestart_scan_rejected(self):
        with self.assertRaisesRegex(ValueError, 'another producer'):
            self.run_audit(producer={'pid': 1, 'started_ticks': 456, 'boot_id': 'boot'})
        future = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=1)).isoformat()
        with self.assertRaisesRegex(ValueError, 'after restart'): self.run_audit(since=future)


class LokiRecoveryReadiness(unittest.TestCase):
    def pending_error(self):
        runtime = {'runtime_root': str(qualification.RUNTIME),
                   'candidate_source_commit': 'rev', 'candidate_source_dirty': False,
                   'image_approval_sha256': 'pin', 'guard': {'ok': True},
                   'capture': {'ok': True}, 'problems': [
                       "Command '['docker', 'exec', 'incidentd', 'python', '-B', '-c', "
                       "'http://loki:3100/ready'] returned non-zero exit status 1.",
                       'urllib.error.HTTPError: HTTP Error 503']}
        error = ValueError('Runtime observation failed before context validation')
        error.runtime_observation = runtime
        return error

    def test_only_pinned_safe_http_503_uses_existing_window(self):
        context = Mock(value={'source_commit': 'rev', 'image_approval_sha256': 'pin',
                              'boot_id': Path('/proc/sys/kernel/random/boot_id').read_text().strip()})
        with patch.object(qualification, 'CONTEXT', context):
            self.assertTrue(qualification.pending_loki_http_readiness(self.pending_error()))
            context.validate_current.assert_called_once_with()
            for field, value in [('candidate_source_commit', 'other'),
                                 ('candidate_source_dirty', True),
                                 ('image_approval_sha256', 'other'),
                                 ('guard', {'ok': False}),
                                 ('capture', {'ok': False})]:
                error = self.pending_error()
                error.runtime_observation[field] = value
                with self.subTest(field=field):
                    self.assertFalse(qualification.pending_loki_http_readiness(error))
            for problem in ('urllib.error.HTTPError: HTTP Error 500',
                            'urllib.error.HTTPError: HTTP Error 503; other failure'):
                error = self.pending_error()
                error.runtime_observation['problems'][1] = problem
                with self.subTest(problem=problem):
                    self.assertFalse(qualification.pending_loki_http_readiness(error))

    def test_failed_inventory_reports_observation_before_identity(self):
        runtime = self.pending_error().runtime_observation
        context = Mock()
        with patch.object(qualification, 'collect', return_value=runtime), \
             patch.object(qualification.live_capture, 'readiness', return_value={}), \
             patch.object(qualification, 'CONTEXT', context):
            with self.assertRaisesRegex(ValueError, 'Runtime observation failed before context validation') as caught:
                qualification.observe()
        self.assertIs(caught.exception.runtime_observation, runtime)
        with patch.object(qualification, 'CONTEXT', None):
            self.assertTrue(qualification.pending_loki_http_readiness(caught.exception))
        context.check_runtime.assert_not_called()

    def test_loki_row_waits_for_503_without_second_restart_or_probe(self):
        before = runtime_fixture(True)
        cid = 'a' * 64
        before['containers']['loki']['id'] = cid
        current = copy.deepcopy(before)
        current.update(ok=True, problems=[],
                       recovery_target={'service': 'loki', 'id': cid, 'status': 'HEALTHY'})
        config = {'dynamic_mac': {'loki': True}}
        base = {'execution_configuration': config, 'routes': {}, 'evidence_permissions': {},
                'quarantine': {}, 'source_commit': 'rev', 'implementation': {},
                'boot_id': before['boot_id']}
        with tempfile.TemporaryDirectory() as tmp, \
             patch.object(qualification, 'CONTEXT', None), \
             patch.object(qualification, 'observe', side_effect=[(before, {}), (before, {}),
                                                                 self.pending_error()]) as observe, \
             patch.object(qualification, 'strict_compare', return_value={'status': 'PASS'}), \
             patch.object(qualification, 'execution_configuration', return_value=config), \
             patch.object(qualification, 'routes_and_tty', return_value={}), \
             patch.object(qualification, 'evidence_permissions', return_value={}), \
             patch.object(qualification, 'quarantine_state', return_value={}), \
             patch.object(qualification, 'source_revision', return_value='rev'), \
             patch.object(qualification, 'implementation', return_value={}), \
             patch.object(qualification, 'acquire_preservation', return_value={}), \
             patch.object(qualification, 'restart_existing') as restart, \
             patch.object(qualification, 'collect', return_value=current), \
             patch.object(qualification.time, 'sleep', side_effect=KeyboardInterrupt) as sleep, \
             patch.object(qualification, 'probe') as probe, \
             patch.object(qualification, 'postflight', side_effect=lambda row, *args:
                          row.update(postflight={'status': 'FAILED'})):
            row = qualification.restart_row('loki', before, base, Path(tmp), [], 4)
        self.assertEqual(row['health_recovery_timeout_seconds'], 150)
        self.assertEqual(row['status'], 'ABORTED')
        self.assertEqual(observe.call_count, 3)
        self.assertIn('LOKI_HTTP_503_WITHIN_EXISTING_RECOVERY_WINDOW',
                      [item.get('status') for item in row['recovery_observations']])
        restart.assert_called_once()
        sleep.assert_called_once_with(2)
        probe.assert_not_called()


def synthetic_probe(marker='honeytrace-demo-stage7-test'):
    raw = {'utc_time':'2026-10-10 05:24:41.000000', 'src_host':'192.0.2.10', 'src_port':41000,
           'dst_port':2121, 'logtype':2000,
           'logdata':{'USERNAME':marker, 'PASSWORD':'SYNTHETIC-NOT-A-REAL-PASSWORD'}}
    event = qualification.normalize('opencanary', raw)
    event['event_id'] = 'synthetic-probe'
    rules = (qualification.SOURCE / 'detections/correlation/rules.json').read_text()
    context = qualification.classification_context(
        {event['event_id']:{'raw':raw,'normalized':event}}, event, rules, hashlib.sha256(rules.encode()).hexdigest())
    return raw, event, context


class ProbeClassification(unittest.TestCase):
    def engine_probe(self, previous):
        tmp = tempfile.TemporaryDirectory(); self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        shutil.copytree(qualification.SOURCE / 'detections', root / 'detections')
        (root / 'captures').mkdir()
        engine = Engine(root)
        # Synthetic isolated records only; no live state, sockets or Docker.
        with patch('incidentd.time.time', return_value=1791609881):
            for index, (source, raw) in enumerate(previous):
                engine.process(source, raw, 'prior-' + str(index))
            raw, _, _ = synthetic_probe()
            engine.process('opencanary', raw, 'synthetic-probe')
        path = next((root / 'incidents').glob('*/*/events.jsonl'))
        retained = qualification.records(path)
        event = retained['synthetic-probe']['normalized']
        rules = (root / 'detections/correlation/rules.json').read_text()
        context = qualification.classification_context(retained, event, rules, hashlib.sha256(rules.encode()).hexdigest())
        return raw, event, context, json.loads((path.parent / 'incident.json').read_text())

    def test_real_engine_service_threshold_explains_medium_probe_in_high_incident(self):
        raw, event, context, meta = self.engine_probe([
            ('firewall', {'MESSAGE':'SRC=192.0.2.10 DPT=5353'}),
            ('suricata', {'src_ip':'192.0.2.10','app_proto':'failed','event_type':'flow'})])
        self.assertEqual((event['severity'], meta['severity']), ('MEDIUM', 'HIGH'))
        proof = qualification.probe_classification(raw, event, context, 'ftp')
        self.assertEqual(proof['services_at_event'], ['firewall', 'failed', 'ftp'])
        self.assertEqual(proof['auth_attempt_count_at_event'], 1)
        self.assertEqual(proof['expected_severity'], 'MEDIUM')

    def test_real_engine_auth_threshold_and_below_threshold_remain_exact(self):
        for count, expected in [(0, 'LOW'), (6, 'LOW'), (7, 'MEDIUM')]:
            prior = [('opencanary', {'src_host':'192.0.2.10','dst_port':2121,'logtype':2000,
                      'logdata':{'USERNAME':'synthetic-prior-'+str(i),'PASSWORD':'SYNTHETIC-ONLY'}}) for i in range(count)]
            raw, event, context, _ = self.engine_probe(prior)
            self.assertEqual(event['severity'], expected)
            self.assertEqual(qualification.probe_classification(raw,event,context,'ftp')['expected_severity'],expected)

    def test_unjustified_severity_wrong_service_source_and_rules_never_pass(self):
        raw, event, context = synthetic_probe()
        for change in ({'severity':'MEDIUM'}, {'severity':'HIGH'}, {'severity':'CRITICAL'},
                       {'service':'ssh'}, {'source':'cowrie'}, {'event_type':'other'}, {'bait_ids':['unexpected']}):
            actual = {**event, **change}
            with self.subTest(change=change), self.assertRaises(ValueError):
                qualification.probe_classification(raw,actual,context,'ftp')
        invalid = copy.deepcopy(context); invalid['rules_json'] += ' '
        with self.assertRaisesRegex(ValueError,'rules hash differs'):
            qualification.probe_classification(raw,event,invalid,'ftp')

    def test_history_must_be_unique_complete_and_end_at_event_not_later_activity(self):
        raw, event, context = synthetic_probe()
        for history in ([], context['history'] * 2, [{'event_id':'missing'}]):
            invalid = {**context, 'history':history}
            with self.assertRaises(ValueError): qualification.probe_classification(raw,event,invalid,'ftp')
        later = {**event, 'event_id':'later', 'service':'network', 'severity':'HIGH'}
        retained = {event['event_id']:{'normalized':event}, 'later':{'normalized':later}}
        actual = qualification.classification_context(retained,event,context['rules_json'],context['rules_sha256'])
        self.assertEqual(len(actual['history']),1)
        self.assertEqual(qualification.probe_classification(raw,event,actual,'ftp')['expected_severity'],'LOW')

    def test_medium_history_cannot_accept_low_and_field_caps_match_engine(self):
        raw, event, context = synthetic_probe()
        history = [{'event_id':'first','service':'firewall','event_type':'egress.denied','password_present':False},
                   {'event_id':'second','service':'failed','event_type':'flow','password_present':False}] + context['history']
        context = {**context, 'history':history}
        with self.assertRaisesRegex(ValueError,'expected MEDIUM, observed LOW'):
            qualification.probe_classification(raw,event,context,'ftp')
        rules = json.loads(context['rules_json']); rules['max_field_values'] = 2
        context['rules_json'] = json.dumps(rules); context['rules_sha256'] = hashlib.sha256(context['rules_json'].encode()).hexdigest()
        self.assertEqual(qualification.probe_classification(raw,event,context,'ftp')['expected_severity'],'LOW')

    def test_ssh_banner_is_subject_to_same_retained_thresholds(self):
        raw = {'timestamp':'2026-10-10T05:24:41Z','src_ip':'192.0.2.10','session':'synthetic-session',
               'eventid':'cowrie.client.version','version':'SSH-2.0-honeytrace-demo-stage7-test'}
        event = qualification.normalize('cowrie',raw); event['event_id'] = 'ssh'
        _,_,context = synthetic_probe()
        context = qualification.classification_context({'ssh':{'normalized':event}},event,context['rules_json'],context['rules_sha256'])
        self.assertEqual(qualification.probe_classification(raw,event,context,'ssh_banner')['expected_severity'],'LOW')


class ProbeFailureRetention(unittest.TestCase):
    def runtime(self):
        return {'containers':{'opencanary':{'ports':{'2121/tcp':[{'HostIp':'127.0.0.1','HostPort':'2121'}]},
                    'networks':{'honeypot-canary-net':{'IPAddress':'172.29.41.2'}}}},
                'mounted_config_hashes':{'detections/correlation/rules.json':synthetic_probe()[2]['rules_sha256']}}

    def test_correlated_medium_probe_reaches_exact_loki_and_packet_checks(self):
        raw,event,_ = synthetic_probe(); event['severity'] = 'MEDIUM'
        retained = {str(i):{'normalized':{'service':service,'event_type':'flow','password_present':False}}
                    for i,service in enumerate(('firewall','failed'))}
        retained[event['event_id']] = {'raw':raw,'normalized':event}
        with tempfile.TemporaryDirectory() as tmp, patch.object(qualification.demo,'ftp_interaction') as interaction, \
             patch.object(qualification.demo,'rows',side_effect=lambda p:[event] if 'normalized' in str(p) else [raw]), \
             patch.object(qualification.demo,'evidence_for',return_value={'evidence_path':'synthetic'}), \
             patch.object(qualification.preservation,'regular'), patch.object(qualification,'records',return_value=retained), \
             patch.object(qualification.preservation,'stable_bytes',return_value=(qualification.SOURCE/'detections/correlation/rules.json').read_bytes()), \
             patch.object(qualification,'loki_event',return_value={'status':'PASS'}) as loki, \
             patch.object(qualification.live_capture,'packet_proof',return_value={'ok':True}) as packet:
            qualification.preservation.regular.return_value.st_size = 100
            folder = Path(tmp)/'probe'
            proof = qualification.probe(self.runtime(),folder,'honeytrace-demo-stage7-test')
            # The live rules reader is mocked in this scope. Verify the new
            # private artifact directly rather than mocking away its hash.
            data = Path(proof['classification_artifact']['path']).read_bytes()
            self.assertEqual(hashlib.sha256(data).hexdigest(),proof['classification_artifact']['sha256'])
            context = json.loads(data)
            self.assertEqual(qualification.probe_classification(raw,event,context,'ftp'),proof['classification'])
            self.assertEqual(proof['classification']['expected_severity'],'MEDIUM')
            self.assertEqual(proof['status'],'PASS')
            self.assertFalse((folder/'failed-probe.json').exists())
        interaction.assert_called_once(); loki.assert_called_once(); packet.assert_called_once()

    def test_classification_failure_retains_exact_observation_without_packet_attempt(self):
        raw,event,_ = synthetic_probe(); event['severity'] = 'HIGH'
        with tempfile.TemporaryDirectory() as tmp, patch.object(qualification.demo,'ftp_interaction'), \
             patch.object(qualification.demo,'rows',side_effect=lambda p:[event] if 'normalized' in str(p) else [raw]), \
             patch.object(qualification.demo,'evidence_for',return_value={'evidence_path':'synthetic'}), \
             patch.object(qualification.preservation,'regular'), \
             patch.object(qualification,'records',return_value={event['event_id']:{'raw':raw,'normalized':event}}), \
             patch.object(qualification.preservation,'stable_bytes',return_value=(qualification.SOURCE/'detections/correlation/rules.json').read_bytes()), \
             patch.object(qualification.live_capture,'packet_proof') as packet:
            # Explicit finite synthetic size, no real evidence read.
            qualification.preservation.regular.return_value.st_size = 100
            folder = Path(tmp)/'probe'
            with self.assertRaisesRegex(ValueError,'expected LOW, observed HIGH') as caught:
                qualification.probe(self.runtime(),folder,'honeytrace-demo-stage7-test')
            failure = json.loads((folder/'failed-probe.json').read_text())
            self.assertEqual(failure['observed_records']['normalized'][0]['severity'],'HIGH')
            self.assertEqual(caught.exception.probe_failure['status'],'FAILED')
            packet.assert_not_called()

    def test_missing_incident_times_out_and_records_primary_error(self):
        raw,event,_ = synthetic_probe()
        with tempfile.TemporaryDirectory() as tmp, patch.object(qualification.demo,'ftp_interaction'), \
             patch.object(qualification.demo,'rows',side_effect=lambda p:[event] if 'normalized' in str(p) else [raw]), \
             patch.object(qualification.demo,'evidence_for',return_value=None), \
             patch.object(qualification.time,'monotonic',side_effect=[0,0,61]), patch.object(qualification.time,'sleep'), \
             patch.object(qualification.live_capture,'packet_proof') as packet:
            folder = Path(tmp)/'probe'
            with self.assertRaisesRegex(TimeoutError,'incident'):
                qualification.probe(self.runtime(),folder,'honeytrace-demo-stage7-test')
            self.assertIn('incident',json.loads((folder/'failed-probe.json').read_text())['missing'])
            packet.assert_not_called()

    def test_unreadable_source_or_interrupted_interaction_never_pass(self):
        for error in (PermissionError('source unreadable'), KeyboardInterrupt()):
            with tempfile.TemporaryDirectory() as tmp, \
                 patch.object(qualification.demo,'ftp_interaction',side_effect=error if isinstance(error,KeyboardInterrupt) else None), \
                 patch.object(qualification.demo,'rows',side_effect=error):
                folder = Path(tmp)/'probe'
                with self.assertRaises(type(error)):
                    qualification.probe(self.runtime(),folder,'honeytrace-demo-stage7-test')
                self.assertEqual(json.loads((folder/'failed-probe.json').read_text())['status'],'FAILED')

    def test_failed_diagnostic_write_is_reported_without_replacing_primary_error(self):
        with tempfile.TemporaryDirectory() as tmp, \
             patch.object(qualification.demo,'ftp_interaction',side_effect=TimeoutError('interaction timed out')), \
             patch.object(qualification,'save',side_effect=[{'path':'intent'},PermissionError('diagnostic denied')]):
            with self.assertRaisesRegex(TimeoutError,'interaction timed out') as caught:
                qualification.probe(self.runtime(),Path(tmp)/'probe','honeytrace-demo-stage7-test')
        self.assertIn('diagnostic denied',caught.exception.probe_failure['retention_error'])


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

    def run_completed_matrix(self, cleanroom, postflight_status='PASS'):
        before = StrictRestart().fixture()
        for index, name in enumerate(qualification.ORDER):
            before['containers'][name]['id'] = format(index + 1, '064x')
        before['networks'][0]['Containers'] = {container['id']: {
            'EndpointID': container['networks']['net']['EndpointID'],
            'MacAddress': container['networks']['net']['MacAddress']}
            for container in before['containers'].values()}
        before['mounted_config_hashes']['detections/correlation/rules.json'] = 'rules'
        rows = self.complete(); anchor = before
        for index, row in enumerate(rows):
            row['before'] = copy.deepcopy(anchor)
            after = copy.deepcopy(anchor)
            after['containers'][row['service']]['started_at'] = 'after-' + str(index)
            row['postflight']['runtime'] = after
            row['restart_requested_utc'] = qualification.utc()
            row['preservation_after'] = {}
            anchor = after
        configuration = {'dynamic_mac': {name: False for name in qualification.ORDER}}
        base = {'boot_id': before['boot_id'], 'runtime': before, 'existing_event': {},
                'execution_configuration': configuration, 'routes': {}, 'evidence_permissions': {},
                'quarantine': {}, 'preservation': {}, 'source_commit': 'source', 'implementation': {},
                'historical_obligations': []}
        mocks = [(qualification, 'CONTEXT', {'new': Mock() if cleanroom else None}),
            (qualification, 'restart_row', {'side_effect': rows}),
            (qualification.review, 'inspect', {'return_value': {}}),
            (qualification, 'prerequisite_passed', {'return_value': None}),
            (qualification, 'observe', {'return_value': (anchor, {})}),
            (qualification, 'execution_configuration', {'return_value': configuration}),
            (qualification, 'routes_and_tty', {'return_value': {}}),
            (qualification, 'evidence_permissions', {'return_value': {}}),
            (qualification, 'quarantine_state', {'return_value': {}}),
            (qualification, 'acquire_preservation', {'return_value': {}}),
            (qualification.preservation, 'compare', {'return_value': {'status': 'PASS'}}),
            (qualification, 'loki_event', {'return_value': {'status': 'PASS'}}),
            (qualification, 'verify_packets', {'return_value': {'status': 'PASS'}}),
            (qualification, 'integrity_startup', {'return_value': {'status': 'PASS'}}),
            (qualification, 'source_revision', {'return_value': 'source'}),
            (qualification, 'implementation', {'return_value': {}}),
            (qualification, 'postflight', {'side_effect': lambda result, *_: result.update(
                postflight={'status': postflight_status})})]
        with tempfile.TemporaryDirectory() as tmp, ExitStack() as stack:
            for module, name, options in mocks:
                stack.enter_context(patch.object(module, name, **options))
            folder = Path(tmp)
            link = qualification.save(folder / 'baseline.json', base)
            return qualification.execute_matrix(base, link, folder)

    def test_cleanroom_matrix_pass_does_not_clear_stage7_or_stage8(self):
        result = self.run_completed_matrix(True)
        self.assertEqual((result['STATUS'], result['MATRIX_GATE'], result['STAGE7_GATE'], result['STAGE8_GATE']),
                         ('PASS', 'PASS', 'BLOCKED', 'BLOCKED'))
        self.assertIn('B17', result['qualification_disposition'])
        self.assertTrue(result['historical_closeout'].startswith('UNKNOWN'))

    def test_legacy_completed_matrix_disposition_is_preserved(self):
        result = self.run_completed_matrix(False)
        self.assertEqual((result['STATUS'], result['STAGE7_GATE'], result['STAGE8_GATE']),
                         ('PASS', 'PASS', 'READY_FOR_OPERATOR_DIRECTION'))

    def test_cleanroom_final_postflight_failure_blocks_matrix_gate(self):
        result = self.run_completed_matrix(True, 'FAILED')
        self.assertEqual((result['STATUS'], result['MATRIX_GATE'], result['STAGE7_GATE'], result['STAGE8_GATE']),
                         ('FAILED', 'BLOCKED', 'BLOCKED', 'BLOCKED'))

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

    def failed_recovered_row(self):
        before = StrictRestart().fixture(); after = copy.deepcopy(before)
        container = after['containers']['opencanary']; container['started_at'] = 'restarted'
        container['networks']['net'].update(EndpointID='new',MacAddress='dynamic')
        after['networks'][0]['Containers'][container['id']].update(EndpointID='new',MacAddress='dynamic')
        row = {'service':'opencanary','status':'FAILED','error':'Controlled probe classification differs',
               'before':before,'restart_command':['docker','restart','--timeout','15',container['id']],
               'postflight':{'status':'PASS','runtime':after}}
        base = {'runtime':before,'boot_id':before['boot_id'],'existing_event':{},'historical_obligations':[],
                'execution_configuration':{'dynamic_mac':{'opencanary':True}}}
        return base, row

    def test_failed_probe_uses_verified_target_lifecycle_for_final_postflight_only(self):
        base,row = self.failed_recovered_row()
        def postflight(result, expected):
            comparison = qualification.strict_compare(expected,row['postflight']['runtime'])
            result['postflight'] = {'status':'PASS','comparison':comparison}
        with tempfile.TemporaryDirectory() as tmp, patch.object(qualification,'load_verified'), \
             patch.object(qualification,'restart_row',return_value=row) as restart, \
             patch.object(qualification,'postflight',side_effect=postflight):
            result = qualification.execute_matrix(base,{'path':'baseline','sha256':'hash'},Path(tmp))
        restart.assert_called_once()
        self.assertEqual((result['STATUS'],result['STAGE7_GATE'],result['STAGE8_GATE']),('FAILED','BLOCKED','BLOCKED'))
        self.assertEqual(result['postflight']['status'],'PASS')
        self.assertFalse(result['ROLLBACK_REQUIRED'])
        self.assertIn('classification differs',result['rows'][0]['error'])
        self.assertEqual(len(result['postflight_anchor']['comparison']['documented_lifecycle_changes']),3)

    def test_failed_row_cannot_supply_anchor_with_unintended_security_or_identity_drift(self):
        for mutate in (lambda r:r['containers']['loki'].update(image_id='unexpected'),
                       lambda r:r['containers']['opencanary'].update(id='recreated'),
                       lambda r:r.update(guard_fingerprint='changed'),lambda r:r.update(wan_enabled=True),
                       lambda r:r['capture'].update(pid=456)):
            base,row = self.failed_recovered_row(); mutate(row['postflight']['runtime'])
            anchors = []
            def postflight(result, expected):
                anchors.append(expected)
                result['postflight'] = {'status':'FAILED','error':'current drift remains unresolved'}
            with tempfile.TemporaryDirectory() as tmp, patch.object(qualification,'load_verified'), \
                 patch.object(qualification,'restart_row',return_value=row) as restart, \
                 patch.object(qualification,'postflight',side_effect=postflight):
                result = qualification.execute_matrix(base,{'path':'baseline','sha256':'hash'},Path(tmp))
            self.assertEqual(anchors,[base['runtime']]); self.assertNotIn('postflight_anchor',result)
            self.assertEqual(result['STAGE7_GATE'],'BLOCKED'); restart.assert_called_once()

    def test_no_planned_restart_cannot_authorize_new_target_start(self):
        base,row = self.failed_recovered_row(); row.pop('restart_command')
        with tempfile.TemporaryDirectory() as tmp, patch.object(qualification,'load_verified'), \
             patch.object(qualification,'restart_row',return_value=row), \
             patch.object(qualification,'postflight',side_effect=lambda result,*args:result.update(postflight={'status':'FAILED'})):
            result = qualification.execute_matrix(base,{'path':'baseline','sha256':'hash'},Path(tmp))
        self.assertNotIn('postflight_anchor',result); self.assertEqual(result['STAGE7_GATE'],'BLOCKED')

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
        current.update(ok=False, problems=[], recovery_target={'service':'opencanary','id':cid,'status':'TARGET_STARTING'})
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
             patch.object(qualification,'collect',return_value=current) as collect, \
             patch.object(qualification.time,'sleep',side_effect=KeyboardInterrupt), \
             patch.object(qualification,'probe') as probe, \
             patch.object(qualification,'postflight',side_effect=lambda row,*args:row.update(postflight={'status':'FAILED','error':'still starting'})) as post:
            folder = Path(tmp)
            row = qualification.restart_row('opencanary',before,base,folder,[],0)
            self.assertEqual(json.loads((folder/'restart-response.json').read_text())['exit_code'],0)
            self.assertEqual(json.loads((folder/'recovery-observations.json').read_text())[0]['health'],'starting')
        self.assertEqual(row['status'],'ABORTED'); self.assertTrue(row['interrupted'])
        self.assertIn('health recovery',row['error'])
        collect.assert_called_once_with(qualification.RUNTIME,qualification.SOURCE,probe_readiness=False,
                                        recovery_target={'service':'opencanary','id':cid})
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

    def test_failed_comparison_retains_observed_runtime_without_qualifying_it(self):
        before = StrictRestart().fixture(); after = copy.deepcopy(before)
        after['containers']['opencanary']['started_at'] = 'changed'
        row = {'error':'original classification failure'}; resources = {'ok':True}
        with patch.object(qualification,'observe',return_value=(after,resources)):
            qualification.postflight(row,before)
        self.assertEqual(row['postflight']['status'],'FAILED')
        self.assertEqual(row['postflight']['runtime'],after)
        self.assertEqual(row['postflight']['capture_resources'],resources)
        self.assertEqual(row['error'],'original classification failure')

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
        raw,event,context=synthetic_probe(self.marker)
        self.rules_hash=context['rules_sha256']
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
        self.probe['classification_artifact']=qualification.save(self.folder/'classification-context.json',context)
        self.probe['classification']=qualification.probe_classification(raw,event,context,'ftp')
        self.rows=[{'probes':[self.probe]}]

    def test_cleanroom_requires_acquisition_and_rechecks_supplied_legacy_metadata(self):
        with patch.object(qualification, 'CONTEXT', Mock()), self.assertRaisesRegex(ValueError, 'acquisition metadata'):
            qualification.verify_packets(self.rows, self.rules_hash)
        packet = self.probe['packet']
        receipt = {'path': packet['snapshot'], 'sha256': packet['sha256'], 'bytes': packet['bytes']}
        packet['acquisition'] = {'raw_snapshot': dict(receipt), 'parser_snapshot': dict(receipt), 'derivation': None}
        bind_fixture_source(packet,packet['snapshot'])
        with patch.object(qualification, 'CONTEXT', Mock()), \
             patch.object(qualification, 'command', return_value=f'{time.time()}\t172.29.41.2\t2121\n'):
            result = qualification.verify_packets(self.rows, self.rules_hash)
        self.assertEqual(result['artifacts'][0]['packet_acquisition']['status'], 'PASS')
        packet['acquisition']['raw_snapshot']['sha256'] = '0' * 64
        with patch.object(qualification, 'CONTEXT', None), self.assertRaisesRegex(ValueError, 'hash or size differs'):
            qualification.verify_packets(self.rows, self.rules_hash)

    def test_real_retained_marker_passes_and_missing_marker_fails(self):
        if not shutil.which('tshark'): self.skipTest('tshark unavailable')
        self.assertEqual(qualification.verify_packets(self.rows,self.rules_hash)['verified_probe_count'],1)
        self.probe['demo_run_id']+='-missing'
        with self.assertRaisesRegex(ValueError,'marker recheck failed'):qualification.verify_packets(self.rows,self.rules_hash)

    def test_offline_parser_uses_source_checkout_without_runtime_directory(self):
        response = subprocess.CompletedProcess([], 0,
            f'{time.time()}\t172.29.41.2\t2121\n', '')
        with patch.object(qualification.subprocess, 'run', return_value=response) as run:
            self.assertEqual(qualification.verify_packets(self.rows, self.rules_hash)['verified_probe_count'], 1)
        self.assertEqual(run.call_args.kwargs['cwd'], qualification.SOURCE)
        self.assertIn('-r', run.call_args.args[0])
        self.assertNotIn('-i', run.call_args.args[0])

    def test_offline_parser_stays_in_private_tmp_when_tempdir_overridden(self):
        inputs = []
        def runner(argv, **kwargs):
            path = Path(argv[argv.index('-r') + 1])
            inputs.append(path)
            self.assertEqual(path.parent.parent, Path('/tmp'))
            self.assertEqual(path.parent.stat().st_mode & 0o777, 0o700)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(path.read_bytes(), self.path.read_bytes())
            return subprocess.CompletedProcess(argv, 0,
                f'{time.time()}\t172.29.41.2\t2121\n', '')
        with patch.object(tempfile, 'tempdir', str(self.folder)), \
             patch.object(qualification.subprocess, 'run', side_effect=runner):
            self.assertEqual(qualification.verify_packets(self.rows, self.rules_hash)['verified_probe_count'], 1)
        self.assertTrue(inputs)
        self.assertFalse(inputs[0].parent.exists())

    def test_unreadable_tampered_and_duplicate_proof_cannot_pass(self):
        with patch.object(qualification.preservation,'regular',side_effect=PermissionError('unreadable')):
            with self.assertRaises(PermissionError):qualification.verify_packets(self.rows,self.rules_hash)
        original=self.path.read_bytes(); self.path.write_bytes(b'wrong')
        with self.assertRaisesRegex(ValueError,'size differs'):qualification.verify_packets(self.rows,self.rules_hash)
        self.path.write_bytes(original)
        with patch.object(qualification,'command',return_value=f'{time.time()}\t172.29.41.2\t2121\n'):
            with self.assertRaisesRegex(ValueError,'Duplicate'):qualification.verify_packets(self.rows*2,self.rules_hash)

    def test_parser_failure_and_timeout_never_pass(self):
        for error in (RuntimeError('parser failed'),subprocess.TimeoutExpired('tshark',15)):
            with patch.object(qualification,'command',side_effect=error):
                with self.assertRaises(type(error)):qualification.verify_packets(self.rows,self.rules_hash)

    def test_record_relationship_rechecked_even_when_hash_matches(self):
        self.probe['event']={'event_id':'other'}
        with self.assertRaisesRegex(ValueError,'relationship differs'):qualification.verify_packets(self.rows,self.rules_hash)

    def test_classification_context_and_baseline_rules_rechecked_independently(self):
        with self.assertRaisesRegex(ValueError,'differ from baseline'):
            qualification.verify_packets(self.rows,'wrong-baseline-hash')
        self.probe['classification']['expected_severity']='MEDIUM'
        with self.assertRaisesRegex(ValueError,'classification differs'):
            qualification.verify_packets(self.rows,self.rules_hash)
        path=Path(self.probe['classification_artifact']['path']); path.write_text('{}')
        with self.assertRaisesRegex(ValueError,'report hash differs'):
            qualification.verify_packets(self.rows,self.rules_hash)


if __name__ == '__main__':unittest.main()
