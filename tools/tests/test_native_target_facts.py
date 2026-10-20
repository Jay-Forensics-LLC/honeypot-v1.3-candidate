import base64
import hashlib
import importlib.util
from pathlib import Path
import sys
import tempfile
import selectors
import unittest
from unittest import mock

TOOLS = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('native_target_facts', TOOLS / 'native_target_facts.py')
facts = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(facts)

# Deliberately synthetic identities, unrelated to an acquired VM or host boot.
VM_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
BOOT_ID = '11111111-2222-4333-8444-555555555555'
HOST = {'system': 'Linux', 'machine': 'x86_64', 'implementation': 'CPython', 'python': ['3', '12', '3']}
PACKAGES = b'python3\t3.12.3-0ubuntu2\tamd64\tii \npython3.12\t3.12.3-1ubuntu0.16\tamd64\tii \n'


def result(argv, raw=b'', status='OK'):
    return {'command': argv, 'status': status, 'exit_code': 0 if status == 'OK' else None,
            'stdout_base64': base64.b64encode(raw).decode('ascii'),
            'stdout_sha256': hashlib.sha256(raw).hexdigest(), 'stdout_bytes': len(raw)}


class NativeFactsTest(unittest.TestCase):
    def setUp(self):
        self.files = {'/usr/lib/os-release': b'ID=ubuntu\nVERSION_ID="24.04"\n',
                      '/sys/devices/virtual/dmi/id/product_uuid': VM_UUID.upper().encode() + b'\n',
                      '/etc/machine-id': b'0123456789abcdef0123456789abcdef\n',
                      '/proc/sys/kernel/random/boot_id': BOOT_ID.encode() + b'\n',
                      '/var/lib/dpkg/status': b'Package: python3\nStatus: install ok installed\n'}
        self.commands = []
        self.package_reads = 0

    def read(self, path, limit):
        return self.files[path]

    def query(self, argv, **kwargs):
        self.commands.append(argv)
        if argv == ['systemd-detect-virt', '--vm']:
            return result(argv, b'kvm\n')
        if argv == ['dpkg', '--print-architecture']:
            return result(argv, b'amd64\n')
        if argv == facts.PACKAGE_QUERY:
            self.package_reads += 1
            return result(argv, PACKAGES)
        if argv == ['dpkg', '--audit']:
            return result(argv)
        return result(argv, status='NOT_INSTALLED')

    def collect(self, **kwargs):
        return facts.collect(VM_UUID, reader=kwargs.get('reader', self.read),
                             runner=kwargs.get('runner', self.query),
                             updates=kwargs.get('updates', lambda: []),
                             lock_probe=kwargs.get('lock_probe', lambda: [{'path': p, 'locked': False} for p in facts.PACKAGE_LOCKS]),
                             host=kwargs.get('host', HOST))

    def assert_incomplete(self, report, text):
        self.assertEqual(report['collection_status'], 'INCOMPLETE')
        self.assertIn(text, report['errors'][0]['message'])
        self.assertFalse(report['B17_passed'])
        self.assertEqual(report['phase7_gate'], 'BLOCKED')
        self.assertEqual(report['phase8_gate'], 'BLOCKED')

    def test_complete_baseline_retains_full_query_and_explicit_missing_tools_without_acceptance(self):
        report = self.collect()
        self.assertEqual(report['collection_status'], 'COMPLETE_BASELINE_ONLY')
        self.assertEqual(report['package_count'], 2)
        self.assertEqual(self.package_reads, 2)
        inventories = [row for row in report['commands'] if row['command'] == facts.PACKAGE_QUERY]
        self.assertEqual(facts.output(inventories[0]), PACKAGES)
        self.assertEqual(inventories[0]['stdout_sha256'], hashlib.sha256(PACKAGES).hexdigest())
        self.assertEqual(report['required_package_observations']['docker.io']['status'], 'NOT_PRESENT')
        self.assertEqual(report['commands'][-1]['status'], 'NOT_INSTALLED')
        self.assertFalse(report['B17_passed'])
        self.assertEqual(report['phase8_gate'], 'BLOCKED')

    def test_other_os_and_substring_spoof_are_rejected_before_commands(self):
        for release in (b'ID=ubuntu\nVERSION_ID="26.04"\n',
                        b'ID=debian\nVERSION_ID="24.04"\nCOMMENT="ID=ubuntu"\n'):
            with self.subTest(release=release):
                self.files['/usr/lib/os-release'] = release
                self.assert_incomplete(self.collect(), 'Requires native Ubuntu')
                self.assertEqual(self.commands, [])

    def test_wrong_python_or_architecture_is_rejected_before_commands(self):
        for changed in ({'python': ['3', '14', '4']}, {'machine': 'aarch64'}):
            with self.subTest(changed=changed):
                self.assert_incomplete(self.collect(host={**HOST, **changed}), 'Requires native Ubuntu')
                self.assertEqual(self.commands, [])

    def test_wrong_vm_and_inaccessible_uuid_do_not_collect_other_machine_packages(self):
        self.files['/sys/devices/virtual/dmi/id/product_uuid'] = b'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
        self.assert_incomplete(self.collect(), 'differs from reviewed target')
        self.assertEqual(self.commands, [])

        def unreadable(path, limit):
            if path.endswith('product_uuid'):
                raise PermissionError('UUID permission denied')
            return self.read(path, limit)

        self.assert_incomplete(self.collect(reader=unreadable), 'permission denied')
        self.assertEqual(self.commands, [])

    def test_container_virtualization_is_rejected_before_package_inventory(self):
        def runner(argv, **kwargs):
            return result(argv, b'docker\n')
        self.assert_incomplete(self.collect(runner=runner), 'not a QEMU/KVM VM')
        self.assertEqual(self.package_reads, 0)

    def test_pending_dpkg_transaction_and_nonempty_audit_are_incomplete(self):
        self.assert_incomplete(self.collect(updates=lambda: ['0000']), 'Pending dpkg')
        self.assertEqual(self.package_reads, 0)

        def runner(argv, **kwargs):
            if argv == ['dpkg', '--audit']:
                return result(argv, b'The following packages are only half configured\n')
            return self.query(argv, **kwargs)

        self.assert_incomplete(self.collect(runner=runner), 'audit reports incomplete')

    def test_changed_query_or_database_preserves_partial_inventory_and_blocks_completion(self):
        def changed_query(argv, **kwargs):
            response = self.query(argv, **kwargs)
            if argv == facts.PACKAGE_QUERY and self.package_reads == 2:
                return result(argv, PACKAGES.replace(b'3.12.3-0ubuntu2', b'3.12.3-0ubuntu3'))
            return response

        report = self.collect(runner=changed_query)
        self.assert_incomplete(report, 'database changed')
        self.assertEqual(len([r for r in report['commands'] if r['command'] == facts.PACKAGE_QUERY]), 2)
        reads = 0

        def changed_status(path, limit):
            nonlocal reads
            if path == '/var/lib/dpkg/status':
                reads += 1
                return b'first' if reads == 1 else b'second'
            return self.read(path, limit)

        self.assert_incomplete(self.collect(reader=changed_status), 'database changed')

    def test_malformed_duplicate_and_incomplete_package_rows_are_rejected(self):
        for raw in (b'', PACKAGES[:-1], PACKAGES + PACKAGES,
                    b'python3\t3.12\tii \n', b'python3\t3.12\tamd64\tii\n'):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                facts.parse_packages(raw)

    def test_duplicate_os_release_and_empty_machine_id_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'duplicate OS'):
            facts.parse_release(b'ID=ubuntu\nID=debian\n')
        self.files['/etc/machine-id'] = b'0' * 32
        self.assert_incomplete(self.collect(), 'Invalid native machine_id')

    def test_source_command_surface_contains_only_read_queries(self):
        self.collect()
        self.assertEqual({tuple(row) for row in self.commands}, {
            ('systemd-detect-virt', '--vm'), ('dpkg', '--print-architecture'),
            tuple(facts.PACKAGE_QUERY), ('dpkg', '--audit'), ('docker', '--version'),
            ('docker', 'compose', 'version'), ('findmnt', '--json', '--target', '/')})

    def test_required_query_failure_and_optional_output_limit_block_complete_baseline(self):
        for command, status in ((facts.PACKAGE_QUERY, 'EXIT_NONZERO'),
                                (['docker', '--version'], 'OUTPUT_LIMIT')):
            with self.subTest(command=command):
                def runner(argv, **kwargs):
                    return result(argv, b'partial', status) if argv == command else self.query(argv, **kwargs)
                report = self.collect(runner=runner)
                self.assertEqual(report['collection_status'], 'INCOMPLETE')
                self.assertIn('partial', facts.output(next(r for r in report['commands'] if r['command'] == command)).decode())

    def test_changed_boot_or_late_package_change_blocks_complete_baseline(self):
        counts = {}

        def changing(path, limit):
            counts[path] = counts.get(path, 0) + 1
            if path == '/proc/sys/kernel/random/boot_id' and counts[path] == 2:
                return b'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\n'
            return self.read(path, limit)

        self.assert_incomplete(self.collect(reader=changing), 'Boot identity changed')
        counts.clear()

        def late_package_change(path, limit):
            counts[path] = counts.get(path, 0) + 1
            if path == '/var/lib/dpkg/status' and counts[path] == 3:
                return b'late package update'
            return self.read(path, limit)

        self.assert_incomplete(self.collect(reader=late_package_change), 'before collection completed')

    def test_active_package_lock_before_or_after_first_query_preserves_partials(self):
        for active_probe in (1, 2):
            with self.subTest(active_probe=active_probe):
                self.package_reads = 0
                probes = 0

                def locks():
                    nonlocal probes
                    probes += 1
                    return [{'path': p, 'locked': probes == active_probe} for p in facts.PACKAGE_LOCKS]

                report = self.collect(lock_probe=locks)
                self.assert_incomplete(report, 'package-manager lock')
                self.assertEqual(self.package_reads, active_probe - 1)
                self.assertTrue(any(row['locked'] for row in report['package_lock_observations'][-1]))

    def test_unavailable_lock_probe_and_unreaped_query_are_explicitly_incomplete(self):
        def unavailable():
            raise PermissionError('Package lock unreadable')
        self.assert_incomplete(self.collect(lock_probe=unavailable), 'Package lock unreadable')

        def runner(argv, **kwargs):
            row = self.query(argv, **kwargs)
            if argv == facts.PACKAGE_QUERY:
                row['cleanup_status'] = 'WAIT_TIMEOUT'
                row['process_reaped'] = False
            return row

        report = self.collect(runner=runner)
        self.assert_incomplete(report, 'cleanup incomplete')
        self.assertEqual(facts.output(report['commands'][-1]), PACKAGES)


class BoundedQueryTest(unittest.TestCase):
    def test_cleanup_timeout_retains_command_status_and_partial_bytes(self):
        real_popen = facts.subprocess.Popen
        real_wait = facts.subprocess.Popen.wait
        processes = []

        def factory(*args, **kwargs):
            process = real_popen(*args, **kwargs)
            processes.append(process)

            def wait(timeout=None):
                if timeout == 5:
                    raise facts.subprocess.TimeoutExpired(process.args, timeout)
                return real_wait(process, timeout=timeout)

            process.wait = wait
            return process

        try:
            with mock.patch.object(facts.subprocess, 'Popen', side_effect=factory):
                row = facts.run_command([sys.executable, '-c', 'import os,time; os.write(1,b"partial"); time.sleep(30)'], timeout=0.2)
            self.assertEqual(row['status'], 'TIMEOUT')
            self.assertEqual(row['cleanup_status'], 'WAIT_TIMEOUT')
            self.assertFalse(row['process_reaped'])
            self.assertEqual(facts.output(row), b'partial')
        finally:
            for process in processes:
                real_wait(process, timeout=5)
                process.stdout.close()
                process.stderr.close()

    def test_no_clock_service_activation_query_is_issued(self):
        fixture = NativeFactsTest()
        fixture.setUp()
        fixture.collect()
        self.assertNotIn(['timedatectl', 'show', '-p', 'NTPSynchronized', '-p', 'NTP', '-p', 'Timezone'], fixture.commands)

    def test_stdout_and_stderr_are_lossless_with_digest_and_nonzero_status(self):
        row = facts.run_command([sys.executable, '-c',
                                 'import os; os.write(1,b"a\\x00b"); os.write(2,b"diagnostic"); raise SystemExit(3)'])
        self.assertEqual(row['status'], 'EXIT_NONZERO')
        self.assertEqual(row['exit_code'], 3)
        self.assertEqual(facts.output(row), b'a\x00b')
        self.assertEqual(base64.b64decode(row['stderr_base64']), b'diagnostic')

    def test_output_over_8192_bytes_is_retained_in_full(self):
        row = facts.run_command([sys.executable, '-c', 'import os; os.write(1,b"a"*16384)'])
        self.assertEqual(row['status'], 'OK')
        self.assertEqual(facts.output(row), b'a' * 16384)

    def test_byte_bound_preserves_partial_and_refuses_complete_output_claim(self):
        for target in (1, 2):
            with self.subTest(target=target):
                row = facts.run_command([sys.executable, '-c', f'import os; os.write({target},b"a"*16384)'],
                                        stdout_limit=1024, stderr_limit=1024)
                self.assertEqual(row['status'], 'OUTPUT_LIMIT')
                name = 'stdout' if target == 1 else 'stderr'
                self.assertEqual(row[name + '_bytes'], 1025)

    def test_deadline_returns_partial_output_and_stops_only_new_query(self):
        row = facts.run_command([sys.executable, '-c', 'import os,time; os.write(1,b"partial"); time.sleep(30)'], timeout=0.2)
        self.assertEqual(row['status'], 'TIMEOUT')
        self.assertEqual(facts.output(row), b'partial')

    def test_file_bound_and_symlink_do_not_return_truncated_fact(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'fact'
            path.write_bytes(b'abcdef')
            self.assertEqual(facts.read_file(path, 6), b'abcdef')
            with self.assertRaisesRegex(ValueError, 'oversized'):
                facts.read_file(path, 5)
            link = Path(directory) / 'alias'
            link.symlink_to(path)
            with self.assertRaisesRegex(ValueError, 'Unsafe'):
                facts.read_file(link, 6)


class PackageLockTest(unittest.TestCase):
    def test_real_frontend_and_database_writer_locks_are_detected_without_changing_files(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = [str(Path(directory) / name) for name in ('lock-frontend', 'lock')]
            for path in paths:
                Path(path).write_bytes(b'unchanged lock-file bytes')
            for locked_path in paths:
                with self.subTest(locked_path=locked_path):
                    child = facts.subprocess.Popen([sys.executable, '-c',
                        'import fcntl,sys; f=open(sys.argv[1],"r+b"); fcntl.lockf(f,fcntl.LOCK_EX|fcntl.LOCK_NB); print("LOCKED",flush=True); sys.stdin.buffer.read(1)',
                        locked_path], stdin=facts.subprocess.PIPE, stdout=facts.subprocess.PIPE, stderr=facts.subprocess.PIPE)
                    try:
                        with selectors.DefaultSelector() as selector:
                            selector.register(child.stdout, selectors.EVENT_READ)
                            self.assertTrue(selector.select(5), 'Synthetic writer did not become ready')
                        self.assertEqual(child.stdout.readline(), b'LOCKED\n')
                        real_fcntl = facts.fcntl.fcntl
                        with mock.patch.object(facts.fcntl, 'fcntl', wraps=real_fcntl) as calls:
                            rows = facts.probe_package_locks(paths)
                        self.assertTrue(all(call.args[1] == facts.fcntl.F_GETLK for call in calls.call_args_list))
                        held, = [row for row in rows if row['locked']]
                        self.assertEqual(held['path'], locked_path)
                        self.assertEqual(held['holder_pid'], child.pid)
                        fixture = NativeFactsTest()
                        fixture.setUp()
                        fixture.assert_incomplete(fixture.collect(lock_probe=lambda: facts.probe_package_locks(paths)), 'package-manager lock')
                        self.assertEqual(fixture.package_reads, 0)
                    finally:
                        if child.poll() is None:
                            child.kill()
                        child.wait(timeout=5)
                        child.stdin.close()
                        child.stdout.close()
                        child.stderr.close()
            self.assertFalse(any(row['locked'] for row in facts.probe_package_locks(paths)))
            for path in paths:
                self.assertEqual(Path(path).read_bytes(), b'unchanged lock-file bytes')

    def test_missing_and_symlinked_lock_inputs_are_not_created_or_followed(self):
        with tempfile.TemporaryDirectory() as directory:
            absent = Path(directory) / 'absent'
            with self.assertRaises(FileNotFoundError):
                facts.probe_package_locks([str(absent)])
            self.assertFalse(absent.exists())
            target = Path(directory) / 'target'
            target.write_bytes(b'original')
            link = Path(directory) / 'link'
            link.symlink_to(target)
            with self.assertRaisesRegex(ValueError, 'Unsafe'):
                facts.probe_package_locks([str(link)])
            self.assertEqual(target.read_bytes(), b'original')

    def test_required_operator_block_is_saved_labeled_and_syntax_valid_without_execution(self):
        path = TOOLS / 'PROPOSED-NATIVE-TARGET-FACTS.sh'
        text = path.read_text()
        self.assertIn('PROPOSED — NOT APPLIED / NOT EXECUTED', text)
        self.assertIn('OPERATOR MUST RUN IN TERMINAL', text)
        self.assertIn('--expected-vm-uuid "$reviewed_vm_uuid"', text)
        row = facts.subprocess.run(['bash', '-n', str(path)], capture_output=True, text=True, timeout=5)
        self.assertEqual(row.returncode, 0, row.stderr)


if __name__ == '__main__':
    unittest.main()
