import base64
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import unittest.mock as mock

TOOLS = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('native_target_review', TOOLS / 'native_target_review.py')
review = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(review)
VM = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
BOOT = '11111111-2222-4333-8444-555555555555'
COLLECTOR = 'a' * 64  # Synthetic external source digest, not an approval of actual tooling.
RAW_PACKAGES = b'python3\t3.12.3-0ubuntu2\tamd64\tii \npython3.12\t3.12.3-1ubuntu0.16\tamd64\tii \n'


def query(argv, stdout=b'', stderr=b'', code=0):
    row = {'command': argv, 'status': 'OK' if code == 0 else 'EXIT_NONZERO',
           'exit_code': code, 'cleanup_status': 'COMPLETE', 'process_reaped': True, 'pid': 12345}
    for name, raw in (('stdout', stdout), ('stderr', stderr)):
        row.update({name + '_base64': base64.b64encode(raw).decode('ascii'),
                    name + '_bytes': len(raw), name + '_sha256': hashlib.sha256(raw).hexdigest()})
    return row


def baseline():
    package_query = ['dpkg-query', '-W', '-f=${binary:Package}\t${Version}\t${Architecture}\t${db:Status-Abbrev}\n']
    observations = {name: {'status': 'NOT_PRESENT'} for name in (
        'python3-yaml', 'docker.io', 'docker-ce', 'docker-compose-v2', 'docker-compose-plugin',
        'chrony', 'nftables', 'tcpdump', 'tshark', 'logrotate')}
    observations.update({'python3': {'version': '3.12.3-0ubuntu2', 'architecture': 'amd64', 'status': 'ii '},
                         'python3.12': {'version': '3.12.3-1ubuntu0.16', 'architecture': 'amd64', 'status': 'ii '}})
    probes = [[{'path': path, 'device': 1, 'inode': inode, 'locked': False, 'lock_type': 2,
                'holder_pid': None, 'whence': 0, 'start': 0, 'length': 0}
               for path, inode in (('/var/lib/dpkg/lock-frontend', 10), ('/var/lib/dpkg/lock', 11))]
              for _ in range(5)]
    return {'schema': 1, 'collection_status': 'COMPLETE_BASELINE_ONLY', 'errors': [],
            'vm_uuid': VM, 'expected_vm_uuid': VM, 'machine_id': '1234567890abcdef1234567890abcdef',
            'boot_id': BOOT, 'os_release': {'ID': 'ubuntu', 'VERSION_ID': '24.04'},
            'host': {'system': 'Linux', 'machine': 'x86_64', 'implementation': 'CPython', 'python': ['3', '12', '3']},
            'commands': [query(['systemd-detect-virt', '--vm'], b'kvm\n'),
                         query(['dpkg', '--print-architecture'], b'amd64\n'),
                         query(package_query, RAW_PACKAGES), query(['dpkg', '--audit']),
                         query(package_query, RAW_PACKAGES),
                         {'command': ['docker', '--version'], 'status': 'NOT_INSTALLED', 'exit_code': None},
                         {'command': ['docker', 'compose', 'version'], 'status': 'NOT_INSTALLED', 'exit_code': None},
                         query(['findmnt', '--json', '--target', '/'], b'{"filesystems": []}\n')],
            'package_count': 2, 'required_package_observations': observations,
            'dpkg_status_sha256_before': 'b' * 64, 'dpkg_status_sha256_after': 'b' * 64,
            'package_lock_observations': probes, 'package_transaction_window_reserved': False,
            'B17_passed': False, 'phase7_gate': 'BLOCKED', 'phase8_gate': 'BLOCKED'}


def frame(report, code=0, body=None, **overrides):
    body = json.dumps(report).encode() if body is None else body
    metadata = {'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest(),
                'collector_sha256': COLLECTOR, 'exit_code': code, **overrides}
    return review.HEADER + json.dumps(metadata).encode() + b'\n' + body + review.TRAILER


def inspect(data):
    return review.review_transport(data, expected_vm_uuid=VM, expected_collector_sha256=COLLECTOR)


class NativeReviewTest(unittest.TestCase):
    def assert_incomplete(self, report):
        result = inspect(frame(report))
        self.assertFalse(result['complete_baseline_only'])
        self.assertEqual(result['review_status'], 'INCOMPLETE_BASELINE')
        self.assertTrue(result['errors'])
        self.assertFalse(result['B17_passed'])
        self.assertEqual(result['phase7_gate'], 'BLOCKED')
        self.assertEqual(result['phase8_gate'], 'BLOCKED')

    def test_complete_baseline_with_missing_optional_tools_remains_unaccepted(self):
        data = frame(baseline())
        result = inspect(data)
        self.assertTrue(result['complete_baseline_only'])
        self.assertEqual(result['transport_sha256'], hashlib.sha256(data).hexdigest())
        self.assertEqual(result['package_count'], 2)
        self.assertFalse(result['B17_passed'])
        self.assertEqual(result['phase8_gate'], 'BLOCKED')

    def test_no_commands_or_native_identity_cannot_complete_baseline(self):
        report = {'schema': 1, 'vm_uuid': VM, 'collection_status': 'COMPLETE_BASELINE_ONLY',
                  'errors': [], 'B17_passed': False, 'phase7_gate': 'BLOCKED', 'phase8_gate': 'BLOCKED'}
        self.assert_incomplete(report)

    def test_missing_and_reordered_queries_are_rejected_even_with_fresh_outer_hash(self):
        for change in ('missing', 'extra', 'reorder', 'mutating'):
            with self.subTest(change=change):
                report = baseline()
                if change == 'missing': report['commands'].pop(2)
                if change == 'extra': report['commands'].append(copy.deepcopy(report['commands'][0]))
                if change == 'reorder': report['commands'][0:2] = report['commands'][1::-1]
                if change == 'mutating': report['commands'][0]['command'] = ['systemctl', 'start', 'docker']
                self.assert_incomplete(report)

    def test_wrong_native_target_os_python_and_missing_identifiers_are_rejected(self):
        for field, value in (('vm_uuid', 'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
                             ('expected_vm_uuid', None), ('machine_id', '0' * 32), ('boot_id', None),
                             ('os_release', {'ID': 'ubuntu', 'VERSION_ID': '26.04'}),
                             ('host', {'system': 'Linux', 'machine': 'x86_64', 'implementation': 'CPython', 'python': ['3', '14', '4']})):
            with self.subTest(field=field):
                report = baseline()
                report[field] = value
                self.assert_incomplete(report)

    def test_required_query_failure_cleanup_gap_or_diagnostics_blocks_completion(self):
        for field, value in (('exit_code', 1), ('status', 'TIMEOUT'), ('process_reaped', False),
                             ('cleanup_status', 'WAIT_TIMEOUT'), ('pid', None)):
            with self.subTest(field=field):
                report = baseline()
                report['commands'][2][field] = value
                self.assert_incomplete(report)
        report = baseline()
        report['commands'][2] = query(report['commands'][2]['command'], RAW_PACKAGES, b'warning')
        self.assert_incomplete(report)

    def test_nested_output_mismatch_is_not_hidden_by_rehashing_transport(self):
        for field, value in (('stdout_sha256', '0' * 64), ('stdout_bytes', True), ('stderr_base64', '%%%')):
            with self.subTest(field=field):
                report = baseline()
                report['commands'][2][field] = value
                self.assert_incomplete(report)

    def test_disagreeing_package_queries_and_nonempty_audit_are_rejected(self):
        report = baseline()
        report['commands'][4] = query(report['commands'][4]['command'], RAW_PACKAGES.replace(b'3.12.3', b'3.12.4'))
        self.assert_incomplete(report)
        report = baseline()
        report['commands'][3] = query(['dpkg', '--audit'], b'half configured\n')
        self.assert_incomplete(report)

    def test_missing_forged_count_and_required_package_observations_are_rejected(self):
        for field, value in (('package_count', 3), ('package_count', True), ('required_package_observations', {}),
                             ('dpkg_status_sha256_before', None), ('dpkg_status_sha256_after', 'c' * 64)):
            with self.subTest(field=field):
                report = baseline()
                report[field] = value
                self.assert_incomplete(report)

    def test_incomplete_and_duplicate_inventory_rows_are_rejected(self):
        for raw in (RAW_PACKAGES[:-1], RAW_PACKAGES + RAW_PACKAGES, b'python3\t3.12\tii \n', b'\xff\n'):
            with self.subTest(raw=raw):
                report = baseline()
                for index in (2, 4): report['commands'][index] = query(report['commands'][index]['command'], raw)
                self.assert_incomplete(report)

    def test_missing_active_or_misidentified_package_lock_probes_are_rejected(self):
        report = baseline()
        report['package_lock_observations'].pop()
        self.assert_incomplete(report)
        for field, value in (('locked', True), ('lock_type', 1), ('holder_pid', 55), ('inode', 0), ('path', '/tmp/lock')):
            with self.subTest(field=field):
                report = baseline()
                report['package_lock_observations'][2][0][field] = value
                self.assert_incomplete(report)
        report = baseline()
        report['package_lock_observations'][4][0]['inode'] = 99
        self.assert_incomplete(report)

    def test_current_collector_wire_format_is_compatible_using_only_synthetic_inputs(self):
        spec = importlib.util.spec_from_file_location('synthetic_native_facts', TOOLS / 'native_target_facts.py')
        facts = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(facts)
        source = baseline()
        files = {'/usr/lib/os-release': b'ID=ubuntu\nVERSION_ID="24.04"\n',
                 '/sys/devices/virtual/dmi/id/product_uuid': VM.encode(),
                 '/etc/machine-id': source['machine_id'].encode(),
                 '/proc/sys/kernel/random/boot_id': BOOT.encode(),
                 '/var/lib/dpkg/status': b'Synthetic fixture, not a real package database'}
        responses = iter(copy.deepcopy(source['commands']))

        def runner(argv, **kwargs):
            row = next(responses)
            self.assertEqual(row['command'], argv)
            return row

        report = facts.collect(VM, reader=lambda path, limit: files[path], runner=runner,
                               updates=lambda: [], lock_probe=lambda: copy.deepcopy(source['package_lock_observations'][0]),
                               host=source['host'])
        self.assertEqual(report['collection_status'], 'COMPLETE_BASELINE_ONLY')
        self.assertTrue(inspect(frame(report))['complete_baseline_only'])

    def test_optional_nonzero_is_visible_but_timeout_or_false_missing_tool_is_incomplete(self):
        report = baseline()
        report['commands'][6] = query(['docker', 'compose', 'version'], stderr=b'plugin missing', code=1)
        self.assertTrue(inspect(frame(report))['complete_baseline_only'])
        report['commands'][6]['status'] = 'OUTPUT_LIMIT'
        self.assert_incomplete(report)
        report = baseline()
        report['commands'][5]['process_reaped'] = False
        self.assert_incomplete(report)

    def test_partial_report_remains_inspectable_and_incomplete(self):
        report = baseline()
        report['collection_status'] = 'INCOMPLETE'
        report['commands'] = report['commands'][:3]
        report['errors'] = [{'type': 'PermissionError', 'message': 'synthetic unreadable lock'}]
        result = inspect(frame(report, code=2))
        self.assertEqual(result['transport'], 'COMPLETE')
        self.assertEqual(result['collector_exit_code'], 2)
        self.assertFalse(result['complete_baseline_only'])

    def test_outer_integrity_wrong_source_truncation_and_duplicate_frames_are_rejected(self):
        data = frame(baseline())
        for bad in (data[:-1], b'prefix' + data, data + data, frame(baseline(), sha256='0' * 64),
                    frame(baseline(), bytes=True), frame(baseline(), collector_sha256='b' * 64)):
            with self.subTest(size=len(bad)), self.assertRaises(ValueError): inspect(bad)

    def test_duplicate_json_keys_and_nonfinite_numbers_are_rejected(self):
        for body in (b'{"B17_passed":false,"B17_passed":true}', b'{"x":NaN}', b'{"x":Infinity}'):
            with self.subTest(body=body), self.assertRaises(ValueError): inspect(frame({}, body=body))
        data = frame(baseline()).replace(b'"bytes":', b'"exit_code": 0, "bytes":', 1)
        with self.assertRaisesRegex(ValueError, 'Duplicate JSON'): inspect(data)

    def test_report_cannot_claim_phase_acceptance_or_reserved_transaction(self):
        for field, value in (('B17_passed', True), ('phase7_gate', 'PASS'), ('phase8_gate', 'PASS')):
            report = baseline()
            report[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError): inspect(frame(report))
        report = baseline()
        report['package_transaction_window_reserved'] = True
        self.assert_incomplete(report)

    def test_large_query_bytes_are_verified_without_display_truncation(self):
        report = baseline()
        report['commands'][7] = query(['findmnt', '--json', '--target', '/'], b'x' * 16384)
        self.assertTrue(inspect(frame(report))['complete_baseline_only'])
        report['commands'][7]['stdout_bytes'] = 8192
        self.assert_incomplete(report)

    def test_closed_reader_refuses_symlink_fifo_and_changed_input(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'native.log'
            data = frame(baseline())
            path.write_bytes(data)
            self.assertEqual(review.read_closed_log(path), data)
            link = Path(folder) / 'link'
            link.symlink_to(path)
            with self.assertRaises(ValueError): review.read_closed_log(link)
            fifo = Path(folder) / 'fifo'
            os.mkfifo(fifo)
            with self.assertRaises(ValueError): review.read_closed_log(fifo)
            real_open = os.open

            def change_before_open(*args, **kwargs):
                path.write_bytes(b'changed')
                return real_open(*args, **kwargs)

            with mock.patch.object(review.os, 'open', side_effect=change_before_open):
                with self.assertRaisesRegex(ValueError, 'replaced before read'): review.read_closed_log(path)

    def test_cli_exit_status_and_json_distinguish_complete_incomplete_and_invalid(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'native.log'
            for data, expected_code in ((frame(baseline()), 0), (frame({}, code=2), 2), (b'partial', 2)):
                path.write_bytes(data)
                result = subprocess.run([sys.executable, '-I', '-B', str(TOOLS / 'native_target_review.py'),
                                         str(path), '--expected-vm-uuid', VM,
                                         '--expected-collector-sha256', COLLECTOR], capture_output=True, timeout=5)
                self.assertEqual(result.returncode, expected_code, result.stderr)
                output = json.loads(result.stdout)
                self.assertFalse(output['B17_passed'])
                self.assertEqual(output['phase7_gate'], 'BLOCKED')


if __name__ == '__main__':
    unittest.main()
