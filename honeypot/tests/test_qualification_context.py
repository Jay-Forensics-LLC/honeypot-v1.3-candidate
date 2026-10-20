import copy
import datetime as dt
import hashlib
import json
from pathlib import Path
import shutil
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import qualification_context as contexts
import stage7_recovery_check as recovery
import stage7_qualification as qualification


class ContextFixture(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.source = self.base / 'source'; self.source.mkdir()
        self.runtime = self.base / 'runtime'; self.runtime.mkdir()
        self.evidence = self.base / 'evidence'; self.evidence.mkdir()
        self.boot = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
        self.document = {'schema_version': 2, 'mode': 'cleanroom', 'phase': 'acquisition',
            'issued_utc': dt.datetime.now(dt.timezone.utc).isoformat(),
            'source_root': str(self.source), 'runtime_root': str(self.runtime),
            'evidence_root': str(self.evidence), 'source_commit': 'a' * 40,
            'image_approval_sha256': 'b' * 64, 'boot_id': self.boot, 'deployment_id': 'independent-desktop-01', 'receipts': {}}

    def load(self, document=None, purpose='prerequisites'):
        value = self.document if document is None else document
        path = self.evidence / 'context.json'
        data = json.dumps(value).encode(); path.write_bytes(data)
        return contexts.Context(path, hashlib.sha256(data).hexdigest(), self.source,
                                self.runtime, purpose=purpose)

    def final(self):
        value = copy.deepcopy(self.document); value['phase'] = 'qualification'
        for name in contexts.RECEIPTS:
            path = self.evidence / name
            data = b'synthetic-test-only' if name == 'capture' else b'{}'
            path.write_bytes(data)
            value['receipts'][name] = {'path': str(path), 'sha256': hashlib.sha256(data).hexdigest()}
        return value


class ContextIdentityTests(ContextFixture):
    def test_context_requires_image_approval_pin_and_rejects_runtime_substitution(self):
        for mutation in ({'image_approval_sha256': ''}, {'schema_version': 1}):
            value = copy.deepcopy(self.document); value.update(mutation)
            with self.subTest(mutation=mutation), self.assertRaises(ValueError): self.load(value)
        context = self.load()
        runtime = {'boot_id':self.boot, 'runtime_root':str(self.runtime),
                   'candidate_source_commit':'a'*40, 'candidate_source_dirty':False,
                   'image_approval_sha256':'c'*64}
        with self.assertRaises(ValueError): context.check_runtime(runtime)

    def test_runtime_commands_use_current_context_root_not_definition_time_path(self):
        from types import SimpleNamespace
        with patch.object(qualification, 'RUNTIME', self.runtime), patch.object(
                qualification.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout='ok')) as run:
            qualification.command(['read-only-fixture'])
            self.assertEqual(run.call_args.kwargs['cwd'], self.runtime)
            qualification.command(['read-only-fixture'], root=self.source)
            self.assertEqual(run.call_args.kwargs['cwd'], self.source)

    def test_in_memory_context_cannot_diverge_from_pinned_bytes(self):
        context = self.load()
        context.value['deployment_id'] = 'changed-in-memory'
        with self.assertRaisesRegex(ValueError, 'In-memory qualification context'):
            context.validate_current()

    def test_cleanroom_permissions_use_configured_capture_directory(self):
        capture = self.runtime / 'captures'
        for name in ('secrets', 'incidents', 'artifacts', 'state/trusted', 'captures'):
            (self.runtime / name).mkdir(mode=0o700, parents=True)
        (self.runtime / '.env').write_text('PCAP_PATH=' + str(capture) + '\n')
        context = self.load()
        with patch.object(qualification, 'CONTEXT', context), patch.object(qualification, 'RUNTIME', self.runtime):
            checked = qualification.evidence_permissions()
        self.assertIn(str(capture), checked)
        self.assertNotIn('/var/lib/honeypot/captures', checked)

    def test_acquisition_can_only_acquire_and_does_not_assert_historical_pass(self):
        context = self.load()
        self.assertEqual(context.identity()['mode'], 'cleanroom')
        self.assertNotIn('historical_closeout', context.identity())
        with self.assertRaisesRegex(ValueError, 'acquisition context cannot qualify'):
            self.load(purpose='qualification')

    def test_complete_final_receipts_and_hashes_required(self):
        value = self.final()
        context = self.load(value, 'qualification')
        self.assertEqual(context.receipt('capture', parse=False), b'synthetic-test-only')
        for name in contexts.RECEIPTS:
            incomplete = copy.deepcopy(value); del incomplete['receipts'][name]
            with self.subTest(name=name), self.assertRaises(ValueError): self.load(incomplete, 'qualification')
        Path(value['receipts']['capture']['path']).write_bytes(b'tampered')
        with self.assertRaisesRegex(ValueError, 'receipt hash differs'): self.load(value, 'qualification')

    def test_missing_symlink_and_outside_receipts_rejected(self):
        for kind in ('missing', 'symlink', 'outside'):
            value = self.final()
            path = Path(value['receipts']['demo']['path'])
            if kind == 'missing': path.unlink()
            elif kind == 'symlink':
                path.unlink(); path.symlink_to(self.evidence / 'confirmation')
            else:
                outside = self.base / 'outside.json'; outside.write_bytes(b'{}')
                value['receipts']['demo']['path'] = str(outside)
            with self.subTest(kind=kind), self.assertRaises((ValueError, OSError)): self.load(value, 'qualification')
            if path.is_symlink(): path.unlink()

    def test_stale_future_cross_boot_and_unknown_schema_rejected(self):
        for change in ({'issued_utc': '2000-01-01T00:00:00Z'},
                       {'issued_utc': '2099-01-01T00:00:00Z'},
                       {'boot_id': 'another-boot'}, {'schema_version': True}, {'extra': 'unknown'},
                       {'mode': 'legacy'}, {'source_commit': 'not-a-commit'}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.load({**self.document, **change})

    def test_context_cannot_change_after_loading(self):
        context = self.load()
        Path(context.path).write_text('{}')
        with self.assertRaisesRegex(ValueError, 'changed after loading'): context.validate_current()

    def test_context_hash_and_source_root_mismatch_rejected(self):
        context = self.load()
        with self.assertRaisesRegex(ValueError, 'hash differs'):
            contexts.Context(context.path, '0' * 64, self.source, self.runtime)
        other = self.base / 'another-source'; other.mkdir()
        with self.assertRaisesRegex(ValueError, 'source root differs'):
            contexts.Context(context.path, context.sha256, other, self.runtime, purpose='prerequisites')

    def test_source_and_runtime_cannot_contain_evidence(self):
        for root in (self.source, self.runtime):
            with self.subTest(root=root), self.assertRaisesRegex(ValueError, 'outside source and runtime'):
                self.load({**self.document, 'evidence_root': str(root)})

    def test_all_roots_must_be_pairwise_disjoint_in_both_directions(self):
        nested = self.source / 'nested'; nested.mkdir()
        for runtime in (self.source, nested, self.base):
            document = {**self.document, 'runtime_root': str(runtime)}
            data = json.dumps(document).encode()
            path = self.evidence / 'context.json'; path.write_bytes(data)
            with self.subTest(runtime=runtime), self.assertRaisesRegex(ValueError, 'separate canonical roots'):
                contexts.Context(path, hashlib.sha256(data).hexdigest(), self.source,
                                 runtime, purpose='prerequisites')
        # Evidence cannot be an ancestor either: acquisition must never own a
        # directory that also contains the source or the deployment it describes.
        with self.assertRaisesRegex(ValueError, 'outside source and runtime'):
            self.load({**self.document, 'evidence_root': str(self.base)})

    def test_context_pair_and_duplicate_json_keys_rejected(self):
        self.assertIsNone(contexts.load(None, None, self.source, self.runtime))
        with self.assertRaises(ValueError): contexts.load(self.evidence / 'context.json', None, self.source, self.runtime)
        with self.assertRaisesRegex(ValueError, 'Duplicate'): contexts.json_document(b'{"mode":1,"mode":2}')

    def test_identity_and_observed_runtime_are_independently_bound(self):
        context = self.load()
        row = {'qualification_identity': context.identity(), 'timestamp': self.document['issued_utc']}
        context.check_identity(row)
        for field in ('source_commit', 'boot_id', 'deployment_id', 'runtime_root'):
            bad = copy.deepcopy(row); bad['qualification_identity'][field] = 'changed'
            with self.subTest(field=field), self.assertRaises(ValueError): context.check_identity(bad)
        runtime = {'boot_id': self.boot, 'runtime_root': str(self.runtime),
                   'candidate_source_commit': 'a' * 40, 'candidate_source_dirty': False, 'image_approval_sha256': 'b' * 64}
        context.check_runtime(runtime)
        runtime['candidate_source_dirty'] = True
        with self.assertRaises(ValueError): context.check_runtime(runtime)


class CleanStoreTests(ContextFixture):
    def test_full_clean_store_has_no_legacy_defect_exception(self):
        context = self.load()
        folder = self.runtime / 'incidents/2026-10-18/test'; folder.mkdir(parents=True)
        events = folder / 'events.jsonl'; events.write_bytes(b'{"event_id":"one"}\n')
        (folder / 'incident.json').write_text(json.dumps({'related_events': ['one']}))
        actual_retained = recovery.retained_module
        requested = []
        def retained(name):
            requested.append(name)
            return actual_retained(name)
        with patch.object(recovery, 'CONTEXT', context), patch.object(recovery, 'retained_module', side_effect=retained):
            result = recovery.evidence_integrity(self.runtime)
            self.assertEqual(result['status'], 'VERIFIED_CLEAN')
            self.assertEqual(result['files_scanned'], result['files_in_inventory'])
            self.assertEqual(result['historical_reconciliation']['status'], 'UNKNOWN')
            self.assertNotIn('stage7-reconciled-evidence', requested)
            events.write_bytes(b'{"event_id":"one"}\n\0')
            with self.assertRaisesRegex(ValueError, 'Additional evidence defects'):
                recovery.evidence_integrity(self.runtime)

    def test_empty_clean_store_does_not_meet_prerequisites(self):
        context = self.load(); (self.runtime / 'incidents').mkdir()
        with patch.object(recovery, 'CONTEXT', context), self.assertRaisesRegex(ValueError, 'inventory absent'):
            recovery.evidence_integrity(self.runtime)


class CleanPrerequisiteTests(ContextFixture):
    def row(self, context):
        from test_pcap_demo_recovery import runtime_fixture
        runtime = runtime_fixture(True)
        runtime.update(boot_id=self.boot, runtime_root=str(self.runtime),
                       candidate_source_commit='a' * 40, candidate_source_dirty=False, image_approval_sha256='b' * 64)
        return {'STATUS': 'ACTIVE_PREREQUISITES_PASSED',
            'qualification_identity': context.identity(), 'timestamp': self.document['issued_utc'],
            'runtime': runtime, 'runtime_after': copy.deepcopy(runtime), 'runtime_comparison': {'ok': True},
            'evidence_integrity': {'status': 'VERIFIED_CLEAN', 'files_in_inventory': 1,
                'event_id_uniqueness': {'status':'VERIFIED_UNIQUE','unique_event_ids':1,
                                        'limit':recovery.EVIDENCE_EVENT_ID_LIMIT},
                'files_scanned': 1, 'planned_total_bytes': 50, 'bytes_read': 50,
                'inventory_size_delta_bytes': 0, 'read_accounting': [{'path': 'one',
                    'planned_event_bytes': 30, 'planned_metadata_bytes': 20,
                    'event_bytes': 30, 'metadata_bytes': 20}]}}

    def test_clean_complete_receipt_does_not_accept_legacy_status_or_incomplete_scan(self):
        context = self.load(); row = self.row(context)
        with patch.object(qualification, 'CONTEXT', context):
            qualification.prerequisite_passed(row)
            for changes in ({'status': 'VERIFIED_KNOWN_DEFECT_ONLY'}, {'files_scanned': 0},
                            {'files_in_inventory': 0}, {'bytes_read': recovery.EVIDENCE_READ_BUDGET + 1}):
                bad = copy.deepcopy(row); bad['evidence_integrity'].update(changes)
                with self.subTest(changes=changes), self.assertRaises(ValueError):
                    qualification.prerequisite_passed(bad)

    def test_cross_boot_or_stale_prerequisite_cannot_authorize_matrix(self):
        context = self.load(); row = self.row(context)
        bad_boot = copy.deepcopy(row); bad_boot['runtime_after']['boot_id'] = 'old-boot'
        stale = copy.deepcopy(row)
        stale['timestamp'] = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=121)).isoformat()
        with patch.object(qualification, 'CONTEXT', context):
            for bad in (bad_boot, stale):
                with self.assertRaises(ValueError): qualification.prerequisite_passed(bad)


class CleanDemoTests(ContextFixture):
    def report_context(self, packet_marker=None, acquisition=True):
        from test_pcap_demo_recovery import runtime_fixture
        value = self.final()
        context = self.load(value, 'qualification')
        incident = self.runtime / 'incidents/2026-10-18/synthetic/events.jsonl'
        incident.parent.mkdir(parents=True, exist_ok=True)
        incident.write_text('{}\n')
        stamp = int(dt.datetime.now(dt.timezone.utc).timestamp())
        marker = 'honeytrace-demo-guarded-desktop'
        record = {'event_id': 'b' * 64,
            'normalized': {'event_id': 'b' * 64, 'source': 'opencanary', 'service': 'ftp', 'username': marker},
            'raw': {'logdata': {'USERNAME': marker}}}
        incident.write_text(json.dumps(record) + '\n')
        record_hash = hashlib.sha256(json.dumps(record, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        payload = ('USER ' + (packet_marker or marker) + '\r\n').encode()
        ethernet = b'\0' * 12 + b'\x08\x00'
        ip = struct.pack('!BBHHHBBH4s4s', 0x45, 0, 40 + len(payload), 1, 0, 64, 6, 0,
                         b'\xac\x1d\x29\x01', b'\xac\x1d\x29\x02')
        tcp = struct.pack('!HHIIBBHHH', 41000, 2121, 1, 0, 0x50, 0x18, 4096, 0, 0)
        packet = ethernet + ip + tcp + payload
        capture = (struct.pack('<IHHIIII', 0xa1b2c3d4, 2, 4, 0, 0, 65535, 1) +
                   struct.pack('<IIII', stamp, 0, len(packet), len(packet)) + packet)
        Path(value['receipts']['capture']['path']).write_bytes(capture)
        value['receipts']['capture']['sha256'] = hashlib.sha256(capture).hexdigest()
        runtime = runtime_fixture(True)
        runtime.update(boot_id=self.boot, runtime_root=str(self.runtime),
                       candidate_source_commit='a' * 40, candidate_source_dirty=False, image_approval_sha256='b' * 64)
        runtime['containers']['opencanary']['networks'] = {'honeypot-canary-net': {'IPAddress': '172.29.41.2'}}
        runtime['containers']['opencanary']['ports'] = {'2121/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '2121'}]}
        capture_receipt = {'path': value['receipts']['capture']['path'],
                           'sha256': value['receipts']['capture']['sha256'], 'bytes': len(capture)}
        report = {'status': 'PASS_LIVE', 'mode': 'live', 'synthetic': True,
            'timestamp': dt.datetime.fromtimestamp(stamp - 1, dt.timezone.utc).isoformat(),
            'postflight': {'status': 'PASS', 'read_only': True, 'problems': [],
                          'completed_utc': dt.datetime.fromtimestamp(stamp + 1, dt.timezone.utc).isoformat()},
            'steps': {step: 'PASS: synthetic unit fixture' for step in qualification.demo.STEPS},
            'implementation': qualification.demo.implementation(), 'demo_run_id': marker,
            'interaction': {'started_epoch': stamp, 'target_ip': '172.29.41.2',
                            'target_port': 2121, 'host_port': 2121, 'protocol': 'ftp'},
            'result': {'evidence_path': str(incident), 'event_id': 'b' * 64, 'record_sha256': record_hash},
            'runtime': runtime,
            'capture_evidence': {'ok': True, 'snapshot': value['receipts']['capture']['path'],
                'sha256': value['receipts']['capture']['sha256'], 'bytes': len(capture)}}
        if acquisition:
            report['capture_evidence']['acquisition'] = {'raw_snapshot': dict(capture_receipt),
                'parser_snapshot': dict(capture_receipt), 'derivation': None}
        data = json.dumps(report).encode(); Path(value['receipts']['demo']['path']).write_bytes(data)
        value['receipts']['demo']['sha256'] = hashlib.sha256(data).hexdigest()
        confirmation = {'status': 'PASS', 'qualification_identity': context.identity(),
            'timestamp': self.document['issued_utc'], 'demo_sha256': value['receipts']['demo']['sha256'],
            'capture_sha256': value['receipts']['capture']['sha256']}
        data = json.dumps(confirmation).encode(); Path(value['receipts']['confirmation']['path']).write_bytes(data)
        value['receipts']['confirmation']['sha256'] = hashlib.sha256(data).hexdigest()
        return self.load(value, 'qualification'), report

    def test_bound_receipts_explicitly_leave_legacy_history_unknown(self):
        context, report = self.report_context()
        with patch.object(qualification, 'CONTEXT', context), patch.object(qualification, 'RUNTIME', self.runtime), \
             patch.object(qualification, 'command', return_value=f'{report["interaction"]["started_epoch"]}\t172.29.41.2\t2121\n'):
            _, result = qualification.cleanroom_demo(copy.deepcopy(report['runtime']))
        self.assertEqual(result['historical_closeout'], 'UNKNOWN')
        self.assertEqual(result['packet_match']['status'], 'PASS')

    def test_replay_missing_postflight_cross_boot_and_packet_mismatch_rejected(self):
        context, original = self.report_context()
        for change in ({'status': 'PASS_REPLAY'}, {'postflight': {'status': 'FAILED'}},
                       {'timestamp': '2000-01-01T00:00:00Z'},
                       {'runtime': {**original['runtime'], 'boot_id': 'different'}},
                       {'capture_evidence': {**original['capture_evidence'], 'sha256': '0' * 64}}):
            report = {**original, **change}
            real_receipt = context.receipt
            with self.subTest(change=change), patch.object(qualification, 'CONTEXT', context), \
                 patch.object(qualification, 'RUNTIME', self.runtime), \
                 patch.object(context, 'receipt', side_effect=lambda name, **kwargs: report if name == 'demo' else real_receipt(name, **kwargs)), \
                 self.assertRaises(ValueError): qualification.cleanroom_demo(copy.deepcopy(original['runtime']))

    def test_demo_without_independently_verifiable_acquisition_never_passes(self):
        context, report = self.report_context(acquisition=False)
        with patch.object(qualification, 'CONTEXT', context), patch.object(qualification, 'RUNTIME', self.runtime), \
             self.assertRaisesRegex(ValueError, 'acquisition metadata'):
            qualification.cleanroom_demo(copy.deepcopy(report['runtime']))

    def test_same_boot_stale_inventory_cannot_authorize_demo(self):
        context, report = self.report_context()
        for field in ('config_hash', 'guard_fingerprint'):
            current = copy.deepcopy(report['runtime']); current[field] = 'drifted'
            with self.subTest(field=field), patch.object(qualification, 'CONTEXT', context), \
                 patch.object(qualification, 'RUNTIME', self.runtime), self.assertRaisesRegex(ValueError, 'runtime drift'):
                qualification.cleanroom_demo(current)

    def test_implementation_malformed_interaction_and_target_mismatch_rejected(self):
        context, original = self.report_context()
        changes = [{'implementation': {}}, {'interaction': {}}, {'steps': {}},
            {'interaction': {**original['interaction'], 'started_epoch': float('nan')}},
            {'interaction': {**original['interaction'], 'target_ip': '172.29.41.99'}},
            {'interaction': {**original['interaction'], 'target_port': 22}},
            {'interaction': {**original['interaction'], 'host_port': 2222}},
            {'interaction': {**original['interaction'], 'started_epoch': original['interaction']['started_epoch'] - 30}}]
        real_receipt = context.receipt
        for change in changes:
            changed = {**original, **change}
            with self.subTest(change=change), patch.object(qualification, 'CONTEXT', context), \
                 patch.object(qualification, 'RUNTIME', self.runtime), \
                 patch.object(context, 'receipt', side_effect=lambda name, **kwargs: changed if name == 'demo' else real_receipt(name, **kwargs)), \
                 self.assertRaises(ValueError):
                qualification.cleanroom_demo(copy.deepcopy(original['runtime']))

    def test_native_wrong_marker_packet_with_valid_matching_receipt_hashes_rejected(self):
        if not shutil.which('tshark'): self.skipTest('tshark unavailable')
        context, report = self.report_context(packet_marker='honeytrace-demo-unrelated-marker')
        with patch.object(qualification, 'CONTEXT', context), patch.object(qualification, 'RUNTIME', self.runtime), \
             self.assertRaisesRegex(ValueError, 'marker recheck failed'):
            qualification.cleanroom_demo(copy.deepcopy(report['runtime']))

    def test_native_matching_packet_does_not_clear_historical_closeout(self):
        if not shutil.which('tshark'): self.skipTest('tshark unavailable')
        context, report = self.report_context()
        with patch.object(qualification, 'CONTEXT', context), patch.object(qualification, 'RUNTIME', self.runtime):
            _, proof = qualification.cleanroom_demo(copy.deepcopy(report['runtime']))
        self.assertEqual(proof['packet_match']['status'], 'PASS')
        self.assertEqual(proof['historical_closeout'], 'UNKNOWN')

    def test_retained_incident_marker_mismatch_cannot_be_hidden_by_report_pass(self):
        context, report = self.report_context()
        path = Path(report['result']['evidence_path'])
        record = json.loads(path.read_text()); record['normalized']['username'] = 'another-marker'
        path.write_text(json.dumps(record) + '\n')
        with patch.object(qualification, 'CONTEXT', context), patch.object(qualification, 'RUNTIME', self.runtime), \
             self.assertRaisesRegex(ValueError, 'incident record linkage'):
            qualification.cleanroom_demo(copy.deepcopy(report['runtime']))


if __name__ == '__main__': unittest.main()
