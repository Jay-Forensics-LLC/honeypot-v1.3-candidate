"""Offline regressions for deployment ownership, limits and first image locks."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import evidence_group
import image_lock
import ops
import runtime_inventory as runtime
from test_demo import fixture


class NetworkPreflight(unittest.TestCase):
    def network(self, key):
        name, subnet, bridge = ops.NETWORK_POLICY[key]
        return {'Name': name, 'Id': 'a' * 64, 'Driver': 'bridge', 'Internal': key == 'observability',
                'EnableIPv6': False, 'Labels': {'com.docker.compose.project': 'honeypot',
                                                'com.docker.compose.network': key},
                'IPAM': {'Config': [{'Subnet': subnet}]},
                'Options': {'com.docker.network.bridge.name': bridge} if bridge else {}}

    def test_all_four_foreign_subnets_block(self):
        for key, (_, subnet, _) in ops.NETWORK_POLICY.items():
            with self.subTest(key=key):
                self.assertTrue(ops.route_conflicts([{'dst': subnet, 'dev': 'unrelated-vpn'}]))

    def test_exact_owned_networks_include_dynamic_observability_bridge(self):
        for key, (_, subnet, bridge) in ops.NETWORK_POLICY.items():
            with self.subTest(key=key):
                self.assertEqual(ops.route_conflicts([{'dst': subnet, 'dev': bridge or 'br-' + 'a' * 12}],
                                                     [self.network(key)]), [])

    def test_name_only_or_drifted_ownership_never_exempts(self):
        key = 'cowrie'; network = self.network(key)
        route = {'dst': '172.29.40.0/24', 'dev': 'br-hp-cowrie'}
        for field, value in [('Labels', {}), ('Driver', 'overlay'), ('Internal', True),
                             ('IPAM', {'Config': [{'Subnet': '172.29.41.0/24'}]}),
                             ('Options', {'com.docker.network.bridge.name': 'other'}), ('Id', 'invalid')]:
            with self.subTest(field=field):
                self.assertTrue(ops.route_conflicts([route], [{**network, field: value}]))
        self.assertTrue(ops.route_conflicts([{**route, 'dst': '172.29.0.0/16'}], [network]))
        self.assertTrue(ops.route_conflicts([{**route, 'dev': 'br-hp-canary'}], [network]))


class InstallerProvider(unittest.TestCase):
    def invoke(self, packages, returncode=0):
        return patch.object(ops, 'run', return_value=SimpleNamespace(returncode=returncode,
                                                                    stdout=packages, stderr=''))

    def test_ce_or_pending_packages_refuse_before_any_apt_command(self):
        for package in ('docker-ce', 'docker-ce-cli', 'containerd.io', 'docker-buildx-plugin', 'docker-compose-plugin'):
            for status in ('ii ', 'iU ', 'rc '):
                with self.subTest(package=package, status=status), self.invoke(package + '\t' + status + '\n'), \
                     patch.object(ops, 'require_root'), patch.object(sys, 'argv', ['ops.py', 'install', '--install']), \
                     patch.object(Path, 'read_text', return_value='ID=ubuntu\n'), patch.object(ops.subprocess, 'run') as apt:
                    with self.assertRaises(SystemExit):
                        ops.install()
                    apt.assert_not_called()

    def test_unknown_package_inventory_blocks(self):
        for output, code in [('', 2), ('malformed', 0)]:
            with self.invoke(output, code), self.assertRaises(SystemExit):
                ops.refuse_docker_provider_conflict()

    def test_canonical_distro_path_unchanged_without_conflict(self):
        with self.invoke('python3\tii \ndocker.io\tii \n'), patch.object(ops, 'require_root'), \
             patch.object(sys, 'argv', ['ops.py', 'install', '--install']), \
             patch.object(Path, 'read_text', return_value='ID=ubuntu\n'), patch.object(ops.subprocess, 'run') as apt:
            ops.install()
            self.assertEqual(apt.call_count, 2)
            self.assertEqual(apt.call_args_list[0].args[0], ['apt-get', 'update'])
            self.assertIn('docker.io', apt.call_args_list[1].args[0])


class RuntimeDrift(unittest.TestCase):
    def check(self, rendered, containers, networks, root):
        return runtime.validate_runtime(rendered, containers, networks, root)

    def test_reviewed_fixture_and_lower_cpu_budget_pass(self):
        rendered, containers, networks, root = fixture()
        self.assertEqual(self.check(rendered, containers, networks, root), [])
        rendered['services']['cowrie']['cpus'] = '0.5'
        containers['cowrie']['HostConfig']['NanoCpus'] = 500_000_000
        self.assertEqual(self.check(rendered, containers, networks, root), [])

    def test_native_compose_decimal_string_memory_and_four_cpu_render_pass(self):
        rendered, containers, networks, root = fixture()
        # Concrete values/types from native Compose JSON, without retained-evidence dependencies.
        native = {'cowrie': ('805306368', '0.75'), 'opencanary': ('402653184', '0.5'),
                  'suricata': ('2147483648', '1.0'), 'loki': ('2147483648', '0.5'),
                  'alloy': ('536870912', '0.25'), 'grafana': ('536870912', '0.25'),
                  'incidentd': ('536870912', '0.75')}
        for name, (memory, cpu) in native.items():
            rendered['services'][name].update(mem_limit=memory, cpus=cpu)
            containers[name]['HostConfig'].update(Memory=int(memory), NanoCpus=int(float(cpu) * 1_000_000_000))
        self.assertEqual(self.check(rendered, containers, networks, root), [])

    def test_memory_normalization_rejects_noncanonical_or_unbounded_values(self):
        for memory in ('0', '-1', '0805306368', '805306368.0', '768m', '1e9', True, 805306368.0,
                       '805306369'):
            with self.subTest(memory=memory):
                rendered, containers, networks, root = fixture()
                rendered['services']['cowrie']['mem_limit'] = memory
                self.assertTrue(self.check(rendered, containers, networks, root))
        rendered, containers, networks, root = fixture()
        rendered['services']['cowrie']['mem_limit'] = '805306368'
        containers['cowrie']['HostConfig']['Memory'] = '805306368'
        self.assertTrue(self.check(rendered, containers, networks, root))

    def test_user_group_namespace_device_and_resource_drift_block(self):
        changes = [('Config', 'User', '0:0'), ('HostConfig', 'GroupAdd', []),
                   ('HostConfig', 'PidMode', 'host'), ('HostConfig', 'IpcMode', 'host'),
                   ('HostConfig', 'UTSMode', 'host'), ('HostConfig', 'Devices', [{'PathOnHost': '/dev/sda'}]),
                   ('HostConfig', 'DeviceRequests', [{'Capabilities': [['gpu']]}]),
                   ('HostConfig', 'DeviceCgroupRules', ['a *:* rwm']),
                   ('HostConfig', 'Memory', 0), ('HostConfig', 'NanoCpus', 0),
                   ('HostConfig', 'PidsLimit', -1)]
        for section, key, value in changes:
            with self.subTest(key=key):
                rendered, containers, networks, root = fixture()
                containers['cowrie'][section][key] = value
                self.assertTrue(self.check(rendered, containers, networks, root))

    def test_rendered_and_runtime_agreement_does_not_weaken_policy(self):
        for key, value in [('user', '0:0'), ('mem_limit', 0), ('cpus', 'NaN'), ('pids_limit', -1),
                           ('pid', 'host'), ('ipc', 'host'), ('devices', ['/dev/sda'])]:
            with self.subTest(key=key):
                rendered, containers, networks, root = fixture()
                rendered['services']['cowrie'][key] = value
                if key == 'user': containers['cowrie']['Config']['User'] = value
                self.assertTrue(self.check(rendered, containers, networks, root))


class EvidenceGroup(unittest.TestCase):
    def test_existing_gid_name_is_shared_without_group_creation(self):
        fake = SimpleNamespace(getgrgid=lambda gid: SimpleNamespace(gr_name='existing-evidence'))
        with patch.dict(sys.modules, {'grp': fake}):
            self.assertEqual(evidence_group.evidence_group_name(), 'existing-evidence')
            self.assertEqual(evidence_group.render_unit_template('Group=@EVIDENCE_GROUP@', '/srv/hp', '/pcap'),
                             'Group=existing-evidence')

    def test_absent_group_and_unresolved_token(self):
        with patch.dict(sys.modules, {'grp': SimpleNamespace(getgrgid=lambda gid: (_ for _ in ()).throw(KeyError(gid)))}):
            self.assertEqual(evidence_group.evidence_group_name(), 'honeypot-evidence')
        with self.assertRaises(ValueError):
            evidence_group.render_unit_template('@UNKNOWN@', '/srv/hp', '/pcap', 'evidence')


class ReviewedImageLock(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        self.root = Path(temp.name); (self.root / 'state').mkdir()
        self.images = [{'reference': 'local:' + service, 'image_id': 'sha256:' + format(i, '064x')}
                       for i, service in enumerate(sorted(runtime.SERVICES), 1)]
        self.review = self.root / 'review.json'
        self.review.write_text(json.dumps({'schema_version': 1, 'images': self.images}))
        self.digest = hashlib.sha256(self.review.read_bytes()).hexdigest()
        self.commands = []

    def run_docker(self, argv, root):
        self.commands.append(argv)
        if argv[1:3] == ['compose', '-f']:
            value = {'services': {item['reference'].split(':')[1]: {'image': item['reference']} for item in self.images}}
        elif argv[1:3] == ['image', 'inspect']:
            value = [{'Id': item['image_id'], 'RepoTags': [item['reference']], 'RepoDigests': [],
                      'Config': {'Env': ['SECRET=must-not-be-retained']}} for item in self.images]
        else:
            raise AssertionError('Unexpected Docker operation')
        return SimpleNamespace(stdout=json.dumps(value))

    def acquire(self, owner=True):
        return image_lock.acquire_reviewed_lock(self.root, self.review, self.digest, runner=self.run_docker,
                                                ownership=lambda root: {'ok': owner})

    def test_acquires_once_without_docker_mutation_or_environment_retention(self):
        row = self.acquire()
        lock = self.root / 'state/images.lock.json'; before = lock.read_bytes()
        self.assertEqual(row['image_count'], 7); self.assertFalse(row['docker_mutated'])
        self.assertNotIn(b'SECRET', before)
        self.assertEqual(len(self.commands), 2)
        with self.assertRaises(FileExistsError): self.acquire()
        self.assertEqual(lock.read_bytes(), before)

    def test_hash_mismatch_and_ownership_fail_before_image_queries(self):
        self.digest = '0' * 64
        with self.assertRaises(ValueError): self.acquire()
        self.assertEqual(self.commands, [])
        self.digest = hashlib.sha256(self.review.read_bytes()).hexdigest()
        with self.assertRaises(ValueError): self.acquire(owner=False)
        self.assertEqual(self.commands, [])

    def test_image_identity_drift_leaves_no_lock(self):
        self.images[0]['image_id'] = 'sha256:' + 'f' * 64
        with self.assertRaises(ValueError): self.acquire()
        self.assertFalse((self.root / 'state/images.lock.json').exists())

    def test_symlinked_state_or_existing_lock_is_preserved(self):
        (self.root / 'state').rename(self.root / 'actual-state')
        (self.root / 'state').symlink_to(self.root / 'actual-state', target_is_directory=True)
        with self.assertRaises(ValueError): self.acquire()


if __name__ == '__main__':
    unittest.main()
