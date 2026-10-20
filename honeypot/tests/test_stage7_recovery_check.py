import copy
import json
import os
from pathlib import Path
import sys
import shutil
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch, Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import stage7_recovery_check as review


class StoppedRecoveryReview(unittest.TestCase):
    def fixture(self):
        return {'stopped_decoy_configuration': {'status': 'CONFIGURATION_CHECKS_PASSED'},
                'guard': {'ok': True}, 'wan_enabled': False,
                'problems': sorted(review.STOPPED_PROBLEMS)}

    def test_only_reviewed_stopped_state_accepted(self):
        row = self.fixture()
        before = copy.deepcopy(row)
        review.stopped_gate(row)
        self.assertEqual(row, before)

    def test_unknown_failures_and_incomplete_inventory_rejected(self):
        for problems in ([], None, sorted(review.STOPPED_PROBLEMS) + ['source mismatch']):
            row = self.fixture(); row['problems'] = problems
            with self.subTest(problems=problems), self.assertRaises(ValueError): review.stopped_gate(row)

    def test_configuration_guard_and_wan_failures_rejected(self):
        for key, value in [('stopped_decoy_configuration', {'status': 'BLOCKED'}),
                           ('guard', {'ok': False}), ('wan_enabled', True), ('wan_enabled', None)]:
            row = self.fixture(); row[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError): review.stopped_gate(row)

    def test_unprivileged_inspection_never_acts_or_claims_readiness(self):
        with patch.object(review.os, 'geteuid', return_value=1000), patch.object(review, 'collect') as collect:
            row = review.inspect(review.RUNTIME)
        collect.assert_not_called()
        self.assertEqual(row['STATUS'], 'BLOCKED')
        self.assertEqual(row['STAGE8_GATE'], 'BLOCKED')
        self.assertFalse(row['NEW_STAGE7_BASELINE_READY'])
        self.assertFalse(row['runtime_mutated'])
        self.assertFalse(row['traffic_generated'])

    def test_wrong_runtime_never_inspected(self):
        with patch.object(review, 'collect') as collect:
            self.assertEqual(review.inspect(Path('/another/runtime'))['STATUS'], 'BLOCKED')
        collect.assert_not_called()


class ActiveReview(unittest.TestCase):
    def fixture(self):
        from test_pcap_demo_recovery import runtime_fixture
        return runtime_fixture(True)

    def test_already_active_requires_explicit_mode(self):
        runtime = self.fixture()
        with self.assertRaisesRegex(ValueError, 'use --active'):
            review.stopped_gate(runtime)
        review.active_gate(runtime)

    def test_health_capture_guard_and_wan_failures_rejected(self):
        for key, value in [('ok', False), ('problems', ['configuration drift']),
                           ('guard', {'ok': False}), ('capture', {'ok': False}),
                           ('wan_enabled', True), ('wan_enabled', None)]:
            row = self.fixture(); row[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError): review.active_gate(row)

    def inspect(self, after=None, resources=None, evidence_error=None, service_pid='123'):
        before = self.fixture()
        after = copy.deepcopy(before) if after is None else after
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with patch.object(review, 'RUNTIME', root), patch.object(review.os, 'geteuid', return_value=0), \
                 patch.object(review, 'collect', side_effect=[before, after]) as collect, \
                 patch.object(review, 'capture_setup', return_value={'service': {'MainPID': service_pid}}), \
                 patch.object(review, 'readiness', return_value={'ok': True} if resources is None else resources), \
                 patch.object(review, 'evidence_integrity', return_value={'status': 'VERIFIED_KNOWN_DEFECT_ONLY'},
                              side_effect=evidence_error), patch.object(review, 'command') as command:
                row = review.inspect(root, active=True)
            command.assert_not_called()
            self.assertFalse(any(root.iterdir()))
            return row, collect.call_count

    def test_full_active_review_does_not_clear_qualification_or_mutate(self):
        row, calls = self.inspect()
        self.assertEqual(row['STATUS'], 'ACTIVE_PREREQUISITES_PASSED')
        self.assertEqual(calls, 2)
        self.assertEqual(row['STAGE7_GATE'], 'BLOCKED'); self.assertEqual(row['STAGE8_GATE'], 'BLOCKED')
        self.assertFalse(row['NEW_STAGE7_BASELINE_READY'])
        self.assertFalse(row['runtime_mutated']); self.assertFalse(row['traffic_generated'])

    def test_explicit_cleanroom_identity_stays_blocked_on_boot_or_source_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            context = Mock(runtime=root)
            context.check_runtime.side_effect = ValueError('Observed runtime source/boot/root differs from context')
            with patch.object(review, 'CONTEXT', context), patch.object(review.os, 'geteuid', return_value=0), \
                 patch.object(review, 'collect', return_value=self.fixture()), \
                 patch.object(review, 'capture_setup') as capture:
                row = review.inspect(root, active=True)
            self.assertEqual(row['STATUS'], 'BLOCKED')
            self.assertIn('source/boot/root differs', row['error'])
            self.assertTrue(row['historical_closeout'].startswith('UNKNOWN'))
            self.assertFalse(row['NEW_STAGE7_BASELINE_READY'])
            capture.assert_not_called()

    def test_readiness_pid_and_evidence_errors_never_pass(self):
        for args in ({'resources': {'ok': False, 'problems': ['stale capture']}},
                     {'service_pid': '456'}, {'evidence_error': PermissionError('unreadable')},
                     {'evidence_error': ValueError('historical hash changed')}):
            with self.subTest(args=args):
                row, calls = self.inspect(**args)
                self.assertEqual(row['STATUS'], 'BLOCKED'); self.assertEqual(calls, 1)

    def test_drift_during_read_only_review_rejected(self):
        for field in ('config_hash', 'guard_fingerprint'):
            after = self.fixture(); after[field] = 'changed'
            with self.subTest(field=field):
                row, calls = self.inspect(after=after)
                self.assertEqual(row['STATUS'], 'BLOCKED'); self.assertEqual(calls, 2)
                self.assertFalse(row['runtime_comparison']['ok'])
        after = self.fixture(); after['capture']['pid'] = 456
        row, _ = self.inspect(after=after)
        self.assertEqual(row['STATUS'], 'BLOCKED')


class EvidenceReview(unittest.TestCase):
    def inspect_existing(self, root, progress=None):
        sweep = review.retained_module('stage7-evidence-integrity-sweep')
        reconciliation = SimpleNamespace(ORIGINAL=root / 'historical.jsonl', ORIGINAL_HASH='known',
            verify=lambda: {'original_sha256': 'known', 'bundle_hashes': {'fixture': 'hash'},
                            'recovery_bundle': 'retained', 'recorded_recovery_bundle': 'recorded',
                            'normalized_source': {'rotation_verified': True}, 'raw_source': {'qualified_prefix_verified': True}})
        with patch.object(review, 'retained_module', side_effect=[reconciliation, sweep]):
            return review.evidence_integrity(root, progress)

    def run_review(self, root, data, ids, progress=None):
        folder = root / 'incidents/2026-10-09/fixture'
        folder.mkdir(parents=True)
        (folder / 'events.jsonl').write_bytes(data)
        (folder / 'incident.json').write_text(json.dumps({'related_events': ids}))
        return self.inspect_existing(root, progress)

    def test_clean_fixture_verified_without_writes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            result = self.run_review(root, b'{"event_id":"one"}\n', ['one'])
            self.assertEqual(result['files_scanned'], 1)
            self.assertTrue(result['source_provenance']['normalized']['rotation_verified'])
            self.assertEqual((root / 'incidents/2026-10-09/fixture/events.jsonl').read_bytes(),
                             b'{"event_id":"one"}\n')

    def test_additional_nul_and_count_mismatch_rejected(self):
        for data, ids in [(b'{"event_id":"one"}\n\0', ['one']),
                          (b'{"event_id":"one"}\n', ['one', 'missing'])]:
            with self.subTest(data=data), tempfile.TemporaryDirectory() as tmp:
                with self.assertRaises(ValueError): self.run_review(Path(tmp), data, ids)
                self.assertEqual((Path(tmp) / 'incidents/2026-10-09/fixture/events.jsonl').read_bytes(), data)

    def test_missing_or_symlink_evidence_never_verified(self):
        for symlink in (False, True):
            with self.subTest(symlink=symlink), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                self.run_review(root, b'{"event_id":"one"}\n', ['one'])
                path = root / 'incidents/2026-10-09/fixture/events.jsonl'
                path.unlink()
                if symlink: path.symlink_to(root / 'missing')
                with self.assertRaises((ValueError, FileNotFoundError)):
                    self.inspect_existing(root)

    def test_growth_past_old_allowance_scans_every_file_with_finite_new_allowance(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.run_review(root, b'{"event_id":"one"}\n', ['one'])
            other = root/'incidents/2026-10-09/second'
            other.mkdir()
            (other/'events.jsonl').write_bytes(b'{"event_id":"two"}\n')
            (other/'incident.json').write_text(json.dumps({'related_events':['two']}))
            before = {p: p.read_bytes() for p in (root/'incidents').glob('*/*/*')}
            total = sum(len(data) for data in before.values())
            progress = {}
            # Scaled byte budgets reproduce aggregate growth without allocating 256 MiB.
            with patch.object(review, 'EVIDENCE_READ_BUDGET', total-1):
                with self.assertRaisesRegex(ValueError, 'no incident files scanned'):
                    self.inspect_existing(root, progress)
            self.assertEqual(progress['status'], 'INCOMPLETE')
            self.assertEqual(progress['files_scanned'], 0)
            self.assertEqual(progress['planned_total_bytes'], total)
            with patch.object(review, 'EVIDENCE_READ_BUDGET', 2*total):
                result = self.inspect_existing(root)
            self.assertEqual(result['files_scanned'], result['files_in_inventory'])
            self.assertEqual(result['files_scanned'], 2)
            self.assertEqual(result['bytes_read'], total)
            self.assertEqual(result['planned_total_bytes'], total)
            self.assertEqual({p:p.read_bytes() for p in before}, before)

    def test_exact_budget_accepts_complete_sweep_and_oversized_file_still_blocks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            initial = self.run_review(root, b'{"event_id":"one"}\n', ['one'])
            with patch.object(review, 'EVIDENCE_READ_BUDGET', initial['bytes_read']):
                self.assertEqual(self.inspect_existing(root)['status'], 'VERIFIED_KNOWN_DEFECT_ONLY')
            for name in ('EVIDENCE_FILE_LIMIT', 'EVIDENCE_METADATA_LIMIT'):
                with self.subTest(name=name), patch.object(review, name, 1):
                    with self.assertRaisesRegex(ValueError, 'Individual evidence read budget'):
                        self.inspect_existing(root)

    def test_clean_growth_between_inventory_and_stable_read_is_fully_accounted(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.run_review(root, b'{"event_id":"one"}\n', ['one'])
            other = root/'incidents/2026-10-09/second'
            other.mkdir()
            (other/'events.jsonl').write_bytes(b'{"event_id":"two"}\n')
            (other/'incident.json').write_text(json.dumps({'related_events':['two']}))
            first_metadata = root/'incidents/2026-10-09/fixture/incident.json'
            original_read = review.read_evidence
            def grow(path, before):
                data = original_read(path, before)
                if path == first_metadata:
                    with (other/'events.jsonl').open('ab') as stream:
                        stream.write(b'{"event_id":"three"}\n')
                    (other/'incident.json').write_text(json.dumps({'related_events':['two','three']}))
                return data
            with patch.object(review, 'read_evidence', side_effect=grow):
                result = self.inspect_existing(root)
            self.assertEqual(result['status'], 'VERIFIED_KNOWN_DEFECT_ONLY')
            self.assertEqual((result['files_scanned'], result['files_in_inventory']), (2,2))
            self.assertGreater(result['bytes_read'], result['planned_total_bytes'])
            self.assertEqual(result['inventory_size_delta_bytes'], result['bytes_read']-result['planned_total_bytes'])
            entries = result['read_accounting']
            self.assertEqual(sum(v['event_bytes']+v['metadata_bytes'] for v in entries), result['bytes_read'])
            self.assertEqual(sum(v['planned_event_bytes']+v['planned_metadata_bytes'] for v in entries), result['planned_total_bytes'])

    def test_change_during_actual_read_still_blocks_growth_accounting(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.run_review(root, b'{"event_id":"one"}\n', ['one'])
            original_pread = review.os.pread
            def grow(fd, amount, offset):
                data = original_pread(fd, amount, offset)
                with (root/'incidents/2026-10-09/fixture/events.jsonl').open('ab') as stream:
                    stream.write(b'{"event_id":"two"}\n')
                return data
            progress = {}
            with patch.object(review.os, 'pread', side_effect=grow):
                with self.assertRaisesRegex(ValueError, 'changed during bounded read'):
                    self.inspect_existing(root, progress)
            self.assertEqual(progress['status'], 'INCOMPLETE')
            self.assertEqual(progress['files_scanned'], 0)

    def test_partial_read_progress_does_not_convert_budget_exhaustion_to_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            initial = self.run_review(root, b'{"event_id":"one"}\n', ['one'])
            other = root/'incidents/2026-10-09/second'
            other.mkdir()
            (other/'events.jsonl').write_bytes(b'{"event_id":"two"}\n')
            (other/'incident.json').write_text(json.dumps({'related_events':['two']}))
            first = root/'incidents/2026-10-09/fixture/events.jsonl'
            original_read = review.read_evidence
            def append_after_read(path, before):
                result = original_read(path, before)
                if path == first:
                    with (other/'events.jsonl').open('ab') as stream: stream.write(b' '*256)
                return result
            progress = {}
            with patch.object(review, 'read_evidence', side_effect=append_after_read), \
                 patch.object(review, 'EVIDENCE_READ_BUDGET', initial['bytes_read']*2):
                with self.assertRaisesRegex(ValueError, 'during sweep; collection grew'):
                    self.inspect_existing(root, progress)
            self.assertEqual(progress['files_scanned'], 1)
            self.assertEqual(progress['bytes_read'], initial['bytes_read'])
            self.assertEqual(progress['status'], 'INCOMPLETE')

    def test_unreadable_inventory_and_evidence_never_skip_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.run_review(root, b'{"event_id":"one"}\n', ['one'])
            day = root/'incidents/2026-10-09'
            real_iterdir = review.scan_directory
            def unreadable(path):
                if path == day: raise PermissionError('unreadable day')
                return real_iterdir(path)
            with patch.object(review, 'scan_directory', unreadable):
                with self.assertRaises(PermissionError): self.inspect_existing(root)
            with patch.object(review.os, 'open', side_effect=PermissionError('unreadable evidence')):
                with self.assertRaises(PermissionError): self.inspect_existing(root)

    def test_inventory_change_and_nonregular_evidence_are_blocked(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.run_review(root, b'{"event_id":"one"}\n', ['one'])
            original = review.incident_inventory(root/'incidents')
            with patch.object(review, 'incident_inventory', side_effect=[original, original | {root/'new.jsonl'}]):
                with self.assertRaisesRegex(ValueError, 'inventory changed'): self.inspect_existing(root)
            path = next(iter(original)); path.unlink(); os.mkfifo(path)
            real_open = os.open
            def directories_only(source, flags, *args, **kwargs):
                self.assertTrue(flags & os.O_DIRECTORY, 'Nonregular evidence must never be opened')
                return real_open(source, flags, *args, **kwargs)
            with patch.object(review.os, 'open', side_effect=directories_only) as opened:
                with self.assertRaisesRegex(ValueError, 'regular and non-symlink'): self.inspect_existing(root)
            self.assertNotIn(path, [Path(call.args[0]) for call in opened.call_args_list])

    def test_changed_read_and_timeout_never_claim_integrity(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.run_review(root, b'{"event_id":"one"}\n', ['one'])
            path = root/'incidents/2026-10-09/fixture/events.jsonl'
            before = path.stat()
            real_read = os.pread
            def mutate(fd, count, offset):
                data = real_read(fd, count, offset)
                path.write_bytes(b'{"event_id":"two"}\n')
                return data
            with patch.object(review.os, 'pread', side_effect=mutate):
                with self.assertRaisesRegex(ValueError, 'changed during bounded read'):
                    review.read_evidence(path, before)
            progress = {}
            with patch.object(review, 'read_evidence', side_effect=TimeoutError('deadline')):
                with self.assertRaises(TimeoutError): self.inspect_existing(root, progress)
            self.assertEqual(progress['status'], 'INCOMPLETE')
            self.assertEqual(progress['files_scanned'], 0)

    def test_defect_is_recorded_before_any_other_file_is_scanned(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); progress = {}
            with self.assertRaisesRegex(ValueError, 'Additional evidence defects'):
                self.run_review(root, b'{"event_id":"one"}\n\0', ['one'], progress)
            self.assertEqual(progress['status'], 'INCOMPLETE')
            self.assertIn('NUL_CORRUPTION', progress['additional_defects'][0]['findings'])

    def test_file_count_directory_count_and_directory_symlinks_remain_bounded(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.run_review(root, b'{"event_id":"one"}\n', ['one'])
            day = root/'incidents/2026-10-09'
            (day/'second').mkdir()
            (day/'second/incident.json').write_text('{}')
            with patch.object(review, 'EVIDENCE_COUNT_LIMIT', 1):
                with self.assertRaisesRegex(ValueError, 'inventory exceeds bound'):
                    review.incident_inventory(root/'incidents')
            (root/'incidents/alias').symlink_to(day, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, 'symlink requires review'):
                review.incident_inventory(root/'incidents')
            (root/'incidents/alias').unlink()
            for index in range(129): (day/'second'/str(index)).touch()
            with self.assertRaisesRegex(ValueError, 'Individual incident directory inventory'):
                review.incident_inventory(root/'incidents')

    def test_file_descriptor_is_closed_after_failed_read(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/'fixture.jsonl'
            path.write_bytes(b'{"event_id":"fixture"}\n')
            descriptors = []
            def expired(fd, count, offset):
                descriptors.append(fd); raise TimeoutError('bounded deadline')
            with patch.object(review.os, 'pread', side_effect=expired):
                with self.assertRaises(TimeoutError): review.read_evidence(path, path.stat())
            self.assertEqual(len(descriptors), 1)
            with self.assertRaises(OSError): os.fstat(descriptors[0])


class CaptureSetupReview(unittest.TestCase):
    def fixture(self, root):
        (root / 'scripts').mkdir()
        (root / 'captures').mkdir()
        (root / '.env').write_text('PCAP_PATH=captures\n')
        for name in ('pcap.py', 'hp_common.py', 'ops.py'):
            shutil.copyfile(review.SOURCE / 'scripts' / name, root / 'scripts' / name)
        expected = (review.SOURCE / 'systemd/honeypot-pcap.service.in').read_text().replace(
            '@ROOT@', str(root)).replace('@PCAP@', str(root / 'captures')).replace(
            '@EVIDENCE_GROUP@', 'honeypot-evidence')
        service = {'ActiveState': 'inactive', 'SubState': 'dead', 'MainPID': '0',
                   'Result': 'success', 'ExecMainStatus': '0', 'ExecMainStartTimestamp': '',
                   'ActiveEnterTimestamp': '', 'FragmentPath': '/etc/systemd/system/honeypot-pcap.service',
                   'DropInPaths': '', 'ExecStart': '{ argv[]=/usr/bin/python3 ' + str(root / 'scripts/pcap.py') + ' ; }'}
        return service, expected

    def run_review(self, root, service, unit, journal='', storage_error=None, active=False):
        def command(argv):
            self.assertIn(argv[:2], [['systemctl', 'show'], ['systemctl', 'cat'], ['journalctl', '-b']])
            stdout = '\n'.join(k + '=' + v for k, v in service.items()) if argv[1] == 'show' else (
                unit if argv[1] == 'cat' else journal)
            return SimpleNamespace(stdout=stdout)
        with patch.object(review, 'command', side_effect=command), \
             patch.object(review, 'storage_gate', side_effect=storage_error):
            return review.capture_setup(root, active=active)

    def test_inactive_setup_inspection_issues_only_read_commands(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); service, unit = self.fixture(root)
            result = self.run_review(root, service, unit)
            self.assertEqual(result['status'], 'SETUP_CHECKS_PASSED')
            self.assertFalse(result['current_capture_active'])
            self.assertEqual(result['capture_continuity'], 'UNKNOWN')

    def test_override_activity_command_and_unit_drift_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); service, unit = self.fixture(root)
            for key, value in [('DropInPaths', '/override.conf'), ('ActiveState', 'active'),
                               ('ExecMainStartTimestamp', 'earlier'), ('ExecStart', 'another command')]:
                with self.subTest(key=key), self.assertRaises(ValueError):
                    self.run_review(root, {**service, key: value}, unit)
            with self.assertRaises(ValueError): self.run_review(root, service, unit, journal='{}')
            with self.assertRaises(ValueError): self.run_review(root, service, unit.replace('Restart=no', 'Restart=always'))

    def test_watermark_failure_and_changed_deployed_source_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); service, unit = self.fixture(root)
            with self.assertRaisesRegex(ValueError, 'watermark'):
                self.run_review(root, service, unit, storage_error=ValueError('watermark exceeded'))
            (root / 'scripts/pcap.py').write_text('# changed deployed source\n')
            with self.assertRaisesRegex(ValueError, 'implementation differs'):
                self.run_review(root, service, unit)

    def test_active_capture_keeps_unit_source_and_disk_gates(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); service, unit = self.fixture(root)
            service.update(ActiveState='active', SubState='running', MainPID='123',
                           ExecMainStartTimestamp='current boot', ActiveEnterTimestamp='current boot')
            result = self.run_review(root, service, unit, journal='{}', active=True)
            self.assertTrue(result['current_capture_active'])
            self.assertEqual(result['capture_continuity'], 'UNKNOWN')
            self.assertEqual(result['journal_json'], '{}')
            for key, value in [('MainPID', '0'), ('ExecMainStartTimestamp', ''), ('Result', 'exit-code'),
                               ('DropInPaths', '/override')]:
                with self.subTest(key=key), self.assertRaises(ValueError):
                    self.run_review(root, {**service, key: value}, unit, active=True)
            with self.assertRaises(ValueError): self.run_review(root, service, unit,
                active=True, storage_error=ValueError('watermark exceeded'))
            with self.assertRaises(ValueError): self.run_review(root, service,
                unit.replace('Restart=no', 'Restart=always'), active=True)
            (root / 'scripts/pcap.py').write_text('# changed deployed source\n')
            with self.assertRaises(ValueError): self.run_review(root, service, unit, active=True)
