"""Constructed Docker responses only: no live daemon, traffic or qualification."""
import copy
import errno
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import docker_ownership as own

PEER = {'pid': 123, 'uid': 0, 'gid': 0}
ROOT = '/opt/honeypot'


def fixture(daemon='system', services=own.SERVICES):
    containers, details, networks = [], {}, {}
    for i, name in enumerate(services, 1):
        cid = f'{i:064x}'
        labels = {'com.docker.compose.project': 'honeypot', 'com.docker.compose.service': name,
                  'com.docker.compose.project.working_dir': ROOT, 'arbitrary.secret': 'DO_NOT_RETAIN'}
        endpoints = {}
        for n in own.PLACEMENT[name]:
            nid = f'{100 + sorted(set().union(*own.PLACEMENT.values())).index(n):064x}'
            endpoints[n] = {'NetworkID': nid, 'EndpointID': 'endpoint-' + cid}
            if n != 'host':
                net = networks.setdefault(n, {'Id': nid, 'Name': n, 'Containers': {}})
                net['Containers'][cid] = {'EndpointID': 'endpoint-' + cid, 'IPv4Address': 'PRIVATE'}
        containers.append({'Id': cid, 'Labels': labels, 'Names': ['/honeypot-' + name],
                           'Command': 'DO_NOT_RETAIN', 'State': 'running'})
        details[cid] = {'Id': cid, 'Config': {'Labels': labels, 'Env': ['PASSWORD=DO_NOT_RETAIN']},
                        'HostConfig': {'NetworkMode': 'host' if name == 'suricata' else 'bridge'},
                        'State': {'Pid': 400 + i, 'Status': 'running'},
                        'NetworkSettings': {'Networks': endpoints}, 'Mounts': ['DO_NOT_RETAIN']}
    responses = {'/info': {'ID': daemon, 'DockerRootDir': '/data/' + daemon, 'Name': 'DO_NOT_RETAIN'},
                 '/containers/json?all=1': containers, '/networks': list(networks.values())}
    responses.update({'/containers/' + cid + '/json': value for cid, value in details.items()})
    responses.update({'/networks/' + n['Id']: n for n in networks.values()})
    return responses


def observed(path='/system', responses=None):
    responses = fixture() if responses is None else responses
    return own.observe(path, getter=lambda p, e, t: (copy.deepcopy(responses[e]), PEER))


class OwnershipTests(unittest.TestCase):
    def test_empty_default_and_snap_owner(self):
        report = own.correlate([observed(responses=fixture(services=())),
                                observed('/snap', fixture('snap'))], runtime_root=ROOT)
        self.assertTrue(report['ownership_verified'])
        self.assertTrue(all(r['candidates'][0]['socket'] == '/snap' for r in report['services'].values()))

    def test_aliases_not_duplicate_owners(self):
        report = own.correlate([observed('/run/docker.sock'), observed('/var/run/docker.sock')])
        self.assertTrue(report['ownership_verified'])
        self.assertEqual(len(report['aliases']), 1)

    def test_duplicate_services_across_daemons_even_same_container_ids(self):
        report = own.correlate([observed(), observed('/snap', fixture('snap'))])
        self.assertFalse(report['ownership_verified'])
        self.assertTrue(all(r['status'] == 'conflicting' for r in report['services'].values()))

    def test_duplicate_service_within_daemon(self):
        data = fixture(services=('cowrie', 'cowrie'))
        report = own.correlate([observed(responses=data)])
        self.assertEqual(report['services']['cowrie']['status'], 'conflicting')

    def test_missing_is_not_verified(self):
        report = own.correlate([observed(responses=fixture(services=('cowrie',)))])
        self.assertEqual(report['services']['loki']['status'], 'missing')
        self.assertFalse(report['ownership_verified'])

    def test_unavailable_permission_and_timeout(self):
        for exc, code in [(FileNotFoundError(errno.ENOENT, 'SECRET'), 'socket_unavailable'),
                          (PermissionError(errno.EACCES, 'SECRET'), 'permission_denied'),
                          (ConnectionRefusedError(errno.ECONNREFUSED, 'SECRET'), 'connection_refused'),
                          (TimeoutError('SECRET'), 'timeout')]:
            with self.subTest(code=code):
                def fail(*args): raise exc
                row = own.observe('/unavailable', getter=fail)
                self.assertEqual(row['error'], code)
                self.assertNotIn('SECRET', json.dumps(row))
                report = own.correlate([observed(), row])
                self.assertEqual(report['ownership_verified'], code == 'socket_unavailable')

    def test_partial_failure_invalidates_full_ownership(self):
        data = fixture()
        def getter(p, e, t):
            if e == '/networks': raise PermissionError(errno.EACCES, 'SECRET')
            return copy.deepcopy(data[e]), PEER
        row = own.observe('/partial', getter=getter)
        self.assertEqual(row['status'], 'incomplete')
        self.assertFalse(own.correlate([observed(), row])['ownership_verified'])

    def test_network_membership_and_ids_required(self):
        for failure in ('member', 'id', 'host'):
            data = fixture()
            if failure == 'member': data['/networks'][0]['Containers'].clear()
            elif failure == 'id': data['/networks'][0]['Id'] = 'f' * 64
            else:
                cid = data['/containers/json?all=1'][-1]['Id']
                data['/containers/' + cid + '/json']['HostConfig']['NetworkMode'] = 'bridge'
            self.assertFalse(own.correlate([observed(responses=data)])['ownership_verified'])

    def test_runtime_root_and_wrong_labels(self):
        row = observed()
        self.assertFalse(own.correlate([row], runtime_root='/elsewhere')['ownership_verified'])
        row['containers'][0]['compose']['com.docker.compose.service'] = 'wrong'
        self.assertEqual(own.correlate([row])['services']['alloy']['status'], 'unverified')
        row['containers'][0]['compose']['com.docker.compose.project'] = 'other'
        self.assertEqual(own.correlate([row])['services']['alloy']['status'], 'unverified')

    def test_unrelated_projects_are_ignored(self):
        row = observed()
        extra = copy.deepcopy(row['containers'][0])
        extra['compose']['com.docker.compose.project'] = 'unrelated'
        extra['expected_name_services'] = []
        row['containers'].append(extra)
        self.assertTrue(own.correlate([row])['ownership_verified'])

    def test_sensitive_fields_excluded(self):
        row = observed()
        self.assertNotIn('DO_NOT_RETAIN', json.dumps(row))
        self.assertNotIn('PRIVATE', json.dumps(row))
        self.assertEqual(row['peer'], PEER)
        data = fixture()
        data['/containers/json?all=1'][0]['Labels']['com.docker.compose.oneoff'] = True
        self.assertEqual(observed(responses=data)['error'], 'invalid_compose_labels')

    def test_daemon_alias_inventory_disagreement(self):
        a, b = observed('/a'), observed('/b')
        b['containers'][0]['pid'] += 1
        report = own.correlate([a, b])
        self.assertFalse(report['ownership_verified'])
        self.assertTrue(report['conflicts'])

    def test_identity_races(self):
        for race in ('daemon', 'container', 'peer'):
            data = fixture()
            calls = 0
            def getter(p, e, t):
                nonlocal calls
                calls += 1
                value = copy.deepcopy(data[e])
                if race == 'daemon' and e == '/info' and calls > 1: value['ID'] = 'changed'
                if race == 'container' and e.startswith('/containers/') and e.endswith('/json'): value['Id'] = 'f' * 64
                peer = PEER if race != 'peer' or calls == 1 else dict(PEER, pid=999)
                return value, peer
            self.assertEqual(own.observe('/race', getter=getter)['status'], 'incomplete')

    def test_get_only_explicit_socket_and_bounded_response(self):
        class Response:
            status = 200
            def read(self, budget):
                self.budget = budget
                return b'{"ok":true}'
        response = Response()
        class Connection:
            peer = PEER
            def __init__(self, path, timeout): self.path = path; self.timeout = timeout
            def request(self, method, endpoint, headers):
                self.method = method; self.endpoint = endpoint
            def getresponse(self): return response
            def close(self): self.closed = True
        conn = Connection('/explicit', 2)
        with patch.object(own, 'UnixHTTP', return_value=conn) as factory:
            value, peer = own.get_json('/explicit', '/info', 2)
        factory.assert_called_once_with('/explicit', 2)
        self.assertEqual(conn.method, 'GET')
        self.assertEqual(response.budget, own.MAX_BYTES + 1)
        self.assertTrue(conn.closed)
        self.assertTrue(value['ok'])

    def test_discovery_mount_namespace_and_flags(self):
        processes = [{'pid': 4847, 'kind': 'dockerd', 'flags': {'host': ['unix:///run/docker.sock']}}]
        paths = own.discover(processes, ['/custom/docker.sock'])
        self.assertIn('/proc/4847/root/run/docker.sock', paths)
        self.assertIn('/custom/docker.sock', paths)
        self.assertNotIn('tcp://anything', paths)

    def test_process_allowlist_and_shim_correlation(self):
        with tempfile.TemporaryDirectory() as folder:
            proc = Path(folder)
            for pid, comm, args in [(123, 'dockerd', '/usr/bin/dockerd\0--data-root=/data/system\0--secret=DO_NOT_RETAIN\0'),
                                    (456, 'containerd-shim', 'containerd-shim\0-id\0' + f'{1:064x}' + '\0-namespace\0moby\0')]:
                d = proc / str(pid); d.mkdir(); (d/'fd').mkdir()
                (d/'comm').write_text(comm); (d/'cmdline').write_bytes(args.encode())
                (d/'exe').symlink_to('/usr/bin/' + comm)
                (d/'net').mkdir(); (d/'net/unix').write_text('header\n000: 2 0 00010000 0001 01 12345 /custom/docker.sock\n')
                (d/'fd'/'1').symlink_to('socket:[12345]')
            rows, issues = own.proc_metadata(proc)
            self.assertFalse(issues)
            self.assertNotIn('DO_NOT_RETAIN', json.dumps(rows))
            self.assertEqual(rows[0]['flags']['data_root'], ['/data/system'])
            report = own.correlate([observed()], rows)
            self.assertEqual(report['services']['alloy']['candidates'][0]['shim_pids'], [456])

    def test_unresolved_live_daemon_and_proc_permission_incomplete(self):
        processes = [{'pid': 123, 'kind': 'dockerd', 'flags': {}, 'executable': '/usr/bin/dockerd'},
                     {'pid': 456, 'kind': 'dockerd', 'flags': {}, 'executable': '/snap/docker/dockerd'}]
        with patch.object(own, 'proc_metadata', return_value=(processes, [])), \
                patch.object(own, 'discover', return_value=['/a']), \
                patch.object(own, 'listener_owners', return_value=[123]), \
                patch.object(own, 'observe', return_value=observed('/a')):
            report = own.collect()
        self.assertFalse(report['ownership_verified'])
        self.assertEqual(report['unresolved_daemon_pids'], [456])
        with patch.object(own, 'proc_metadata', return_value=(processes[:1], ['process_inventory_permission_denied'])), \
                patch.object(own, 'discover', return_value=['/a']), \
                patch.object(own, 'listener_owners', return_value=[123]), \
                patch.object(own, 'observe', return_value=observed('/a')):
            self.assertFalse(own.collect()['ownership_verified'])

    def test_listener_file_identity_across_namespaces(self):
        process = {'pid': 123, 'kind': 'dockerd', 'listening_socket_paths': ['/run/docker.sock']}
        def stat(path):
            return SimpleNamespace(st_mode=own.stat.S_IFSOCK, st_dev=5,
                                   st_ino=99 if path in ('/alias', '/proc/123/root/run/docker.sock') else 100)
        with patch.object(own.os, 'stat', side_effect=stat):
            self.assertEqual(own.listener_owners('/alias', [process]), [123])
            self.assertEqual(own.listener_owners('/different', [process]), [])
        with patch.object(own.os, 'stat', return_value=SimpleNamespace(st_mode=own.stat.S_IFREG)):
            with self.assertRaises(own.ObservationError):
                own.listener_owners('/file', [process])

    def test_no_active_daemon_does_not_connect_or_activate_socket(self):
        with patch.object(own, 'proc_metadata', return_value=([], [])), \
                patch.object(own, 'discover', return_value=['/systemd/socket']), \
                patch.object(own, 'listener_owners', return_value=[]), \
                patch.object(own, 'observe') as observe:
            report = own.collect()
        observe.assert_not_called()
        self.assertFalse(report['ownership_verified'])
        self.assertEqual(report['observations'][0]['error'], 'active_daemon_listener_not_established')

    def test_socket_activation_peer_uses_existing_dockerd_listener(self):
        process = {'pid': 123, 'kind': 'dockerd', 'flags': {}, 'executable': '/usr/bin/dockerd'}
        row = observed(); row['peer'] = dict(PEER, pid=1)
        with patch.object(own, 'proc_metadata', return_value=([process], [])), \
                patch.object(own, 'discover', return_value=['/a']), \
                patch.object(own, 'listener_owners', return_value=[123]), \
                patch.object(own, 'observe', return_value=row):
            report = own.collect()
        self.assertTrue(report['ownership_verified'])
        self.assertEqual(report['observations'][0]['process_association'], 'unique_active_listener')

    def test_oneoff_is_not_verified_and_stopped_identity_is_distinct_from_health(self):
        row = observed()
        row['containers'][0]['compose']['com.docker.compose.oneoff'] = 'True'
        self.assertFalse(own.correlate([row])['ownership_verified'])
        row['containers'][0]['compose']['com.docker.compose.oneoff'] = 'False'
        row['containers'][0]['state'] = 'exited'
        self.assertTrue(own.correlate([row])['ownership_verified'])

    def test_http_error_and_budget_are_redacted(self):
        class Response:
            status = 403
            def read(self, budget): return b'SECRET'
        class Connection:
            peer = PEER
            def request(self, *args, **kwargs): pass
            def getresponse(self): return Response()
            def close(self): pass
        with patch.object(own, 'UnixHTTP', return_value=Connection()):
            self.assertEqual(own.observe('/a')['error'], 'http_403')
        Response.status = 200
        with patch.object(own, 'MAX_BYTES', 2), patch.object(own, 'UnixHTTP', return_value=Connection()):
            self.assertEqual(own.observe('/a')['error'], 'response_budget_exceeded')

    def test_human_and_cli_exit_codes(self):
        report = dict(own.correlate([observed()]), observations=[observed()], processes=[], process_visibility_issues=[])
        self.assertIn('alloy: verified', own.human(report))
        with patch.object(own, 'collect', return_value=report), patch('builtins.print'):
            self.assertEqual(own.main(['--json']), 0)
            report['ownership_verified'] = False
            self.assertEqual(own.main([]), 2)


if __name__ == '__main__':
    unittest.main()
