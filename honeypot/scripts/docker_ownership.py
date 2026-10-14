#!/usr/bin/env python3
"""Standalone GET-only Docker ownership observation; never qualification.

No Docker CLI, context, environment/config, container exec, probes or writes.
Only explicit local Unix sockets and allowlisted /proc metadata are read.
"""
import argparse
from datetime import datetime, timezone
import errno
import http.client
import json
import os
from pathlib import Path
import re
import socket
import stat
import struct
import sys
from urllib.parse import quote

SERVICES = ('alloy', 'cowrie', 'grafana', 'incidentd', 'loki', 'opencanary', 'suricata')
PLACEMENT = {'cowrie': {'honeypot-cowrie-net'}, 'opencanary': {'honeypot-canary-net'},
             'suricata': {'host'}, 'grafana': {'honeypot-observability', 'honeypot-management'},
             **{n: {'honeypot-observability'} for n in ('loki', 'alloy', 'incidentd')}}
DEFAULT_SOCKETS = ('/run/docker.sock', '/var/run/docker.sock',
                   '/run/snap.docker/docker.sock', '/var/snap/docker/common/run/docker.sock')
LABELS = ('com.docker.compose.project', 'com.docker.compose.service',
          'com.docker.compose.project.working_dir', 'com.docker.compose.container-number',
          'com.docker.compose.oneoff')
ID = re.compile(r'^[a-f0-9]{64}$')
MAX_BYTES = 8 * 1024 * 1024
MAX_ITEMS = 1024


class ObservationError(Exception):
    """Safe error with no daemon response body or sensitive exception text."""


def proc_metadata(proc=Path('/proc')):
    """Allowlist daemon/shim flags, executable and socket FDs; omit full argv/env."""
    result, issues = [], set()
    try:
        entries = list(proc.iterdir())
    except OSError:
        return [], ['process_inventory_unavailable']
    flags = {'-H': 'host', '--host': 'host', '--data-root': 'data_root',
             '--exec-root': 'exec_root', '--containerd': 'containerd',
             '-id': 'container_id', '--id': 'container_id',
             '-namespace': 'namespace', '--namespace': 'namespace',
             '-address': 'containerd', '--address': 'containerd'}
    for entry in entries:
        if not entry.name.isdigit():
            continue
        try:
            comm = (entry / 'comm').read_text().strip()
            if comm != 'dockerd' and not comm.startswith('containerd-shim'):
                continue
            args = (entry / 'cmdline').read_bytes().split(b'\0')
            args = [a.decode('utf-8', 'replace') for a in args if a]
            row = {'pid': int(entry.name), 'kind': 'dockerd' if comm == 'dockerd' else 'shim',
                   'flags': {}, 'socket_inodes': [], 'listening_socket_paths': []}
            try:
                row['executable'] = os.readlink(entry / 'exe')
            except OSError:
                row['executable'] = None
                issues.add('process_executable_incomplete')
            for i, arg in enumerate(args):
                key, sep, val = arg.partition('=')
                if key in flags:
                    if not sep and i + 1 < len(args):
                        val = args[i + 1]
                    # Hosts are used only for local socket discovery; omit TCP addresses.
                    if flags[key] == 'host' and not val.startswith('unix://'):
                        continue
                    row['flags'].setdefault(flags[key], []).append(val)
            try:
                for fd in (entry / 'fd').iterdir():
                    try:
                        target = os.readlink(fd)
                        if re.fullmatch(r'socket:\[\d+\]', target):
                            row['socket_inodes'].append(target[8:-1])
                    except OSError:
                        issues.add('process_socket_fds_incomplete')
            except OSError:
                issues.add('process_socket_fds_incomplete')
            if row['kind'] == 'dockerd':
                try:
                    for line in (entry / 'net/unix').read_text().splitlines()[1:]:
                        fields = line.split(maxsplit=7)
                        if (len(fields) == 8 and fields[6] in row['socket_inodes']
                                and fields[3] == '00010000' and fields[7].startswith('/')):
                            row['listening_socket_paths'].append(fields[7])
                except OSError:
                    issues.add('process_unix_listener_inventory_incomplete')
            result.append(row)
        except PermissionError:
            issues.add('process_inventory_permission_denied')
        except OSError:
            issues.add('process_inventory_raced_or_unavailable')
    return sorted(result, key=lambda p: p['pid']), sorted(issues)


def discover(processes, extra=()):
    candidates = list(DEFAULT_SOCKETS) + list(extra)
    for p in processes:
        if p['kind'] != 'dockerd':
            continue
        hosts = [h[7:] for h in p['flags'].get('host', [])] + p.get('listening_socket_paths', [])
        for path in hosts:
            if path.startswith('/'):
                candidates.extend([path, f"/proc/{p['pid']}/root{path}"])
        # Snap mount namespaces can hide a socket or share its apparent pathname.
        candidates.append(f"/proc/{p['pid']}/root/run/docker.sock")
    return sorted(set(candidates))


class UnixHTTP(http.client.HTTPConnection):
    def __init__(self, path, timeout):
        super().__init__('localhost', timeout=timeout)
        self.path = path
        self.peer = None

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(self.path)
        self.peer = dict(zip(('pid', 'uid', 'gid'), struct.unpack(
            '3i', self.sock.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))))


def get_json(path, endpoint, timeout):
    # This is the only HTTP entry point. All callers use literal GET endpoints.
    connection = UnixHTTP(path, timeout)
    try:
        connection.request('GET', endpoint, headers={'Connection': 'close'})
        response = connection.getresponse()
        if response.status != 200:
            raise ObservationError(f'http_{response.status}')
        data = response.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ObservationError('response_budget_exceeded')
        return json.loads(data), connection.peer
    finally:
        connection.close()


def error_code(exc):
    if isinstance(exc, ObservationError):
        return str(exc)
    if isinstance(exc, PermissionError):
        return 'permission_denied'
    if isinstance(exc, (TimeoutError, socket.timeout)):
        return 'timeout'
    if isinstance(exc, OSError):
        return {errno.ENOENT: 'socket_unavailable', errno.ECONNREFUSED: 'connection_refused',
                errno.EACCES: 'permission_denied', errno.EPERM: 'permission_denied'}.get(exc.errno, 'io_error')
    return 'invalid_or_inconsistent_response'


def sequence(value):
    if not isinstance(value, list) or len(value) > MAX_ITEMS:
        raise ObservationError('invalid_or_over_budget_inventory')
    return value


def labels(value):
    if not isinstance(value, dict) or any(not isinstance(value[k], str) for k in LABELS if k in value):
        raise ObservationError('invalid_compose_labels')
    return {k: value[k] for k in LABELS if k in value}


def observe(path, timeout=3, getter=get_json):
    row = {'socket': path, 'status': 'inaccessible', 'containers': [], 'networks': []}
    peers = []
    def read(endpoint):
        value, peer = getter(path, endpoint, timeout)
        peers.append(peer)
        return value
    try:
        info = read('/info')
        row['daemon'] = {'id': info['ID'], 'storage_root': info['DockerRootDir']}
        if not all(isinstance(v, str) and v for v in row['daemon'].values()):
            raise ObservationError('missing_daemon_identity')
        rows = sequence(read('/containers/json?all=1'))
        for c in rows:
            cid = c['Id']
            if not ID.fullmatch(cid):
                raise ObservationError('invalid_container_id')
            # No command, image reference, ports, mounts, arbitrary labels or env retained.
            cl = labels(c.get('Labels') or {})
            expected_names = [s.removeprefix('/honeypot-') for s in c.get('Names', [])
                              if s.startswith('/honeypot-') and s.removeprefix('/honeypot-') in SERVICES]
            minimal = {'id': cid, 'compose': cl, 'expected_name_services': expected_names, 'state': c.get('State'),
                       'networks': {}, 'pid': None, 'network_mode': None}
            row['containers'].append(minimal)
            if (cl.get('com.docker.compose.project') == 'honeypot'
                    or cl.get('com.docker.compose.service') in SERVICES
                    or expected_names):
                detail = read('/containers/' + cid + '/json')
                if detail['Id'] != cid or labels(detail['Config'].get('Labels') or {}) != cl:
                    raise ObservationError('container_identity_changed')
                minimal.update(pid=detail['State'].get('Pid'), state=detail['State'].get('Status'),
                               network_mode=detail['HostConfig'].get('NetworkMode'),
                               networks={n: {'network_id': v.get('NetworkID'), 'endpoint_id': v.get('EndpointID')}
                                         for n, v in detail['NetworkSettings']['Networks'].items()})
        relevant = set().union(*PLACEMENT.values()) - {'host'}
        for n in sequence(read('/networks')):
            if n['Name'] not in relevant:
                continue
            nid = n['Id']
            if not ID.fullmatch(nid):
                raise ObservationError('invalid_network_id')
            detail = read('/networks/' + quote(nid, safe=''))
            if detail['Id'] != nid or detail['Name'] != n['Name']:
                raise ObservationError('network_identity_changed')
            row['networks'].append({'id': nid, 'name': detail['Name'],
                                    'members': {cid: v.get('EndpointID') for cid, v in (detail.get('Containers') or {}).items()}})
        final = read('/info')
        if (final.get('ID'), final.get('DockerRootDir')) != (info['ID'], info['DockerRootDir']):
            raise ObservationError('daemon_identity_changed')
        if any(p != peers[0] for p in peers):
            raise ObservationError('socket_peer_changed')
        row['containers'].sort(key=lambda c: c['id'])
        row['networks'].sort(key=lambda n: (n['name'], n['id']))
        row.update(status='accessible', peer=peers[0])
    except (OSError, ValueError, KeyError, TypeError, AttributeError, http.client.HTTPException, ObservationError) as exc:
        row.update(status='inaccessible' if 'daemon' not in row else 'incomplete', error=error_code(exc))
    return row


def correlate(observations, processes=(), runtime_root=None):
    """Deduplicate aliases only with matching daemon identity AND sanitized inventory."""
    daemons, aliases, conflicts = [], [], []
    for row in observations:
        if row['status'] != 'accessible':
            continue
        existing = next((d for d in daemons if d['daemon'] == row['daemon']), None)
        if existing:
            if (existing['containers'], existing['networks']) != (row['containers'], row['networks']):
                conflicts.append({'kind': 'daemon_alias_inventory_disagrees', 'sockets': [existing['socket'], row['socket']]})
            else:
                aliases.append({'socket': row['socket'], 'same_as': existing['socket']})
            continue
        daemons.append(row)
    results = {}
    for service in SERVICES:
        candidates = []
        for d in daemons:
            nets = {n['name']: n for n in d['networks']}
            for c in d['containers']:
                cl = c['compose']
                if (cl.get('com.docker.compose.service') != service
                        and service not in c.get('expected_name_services', [])):
                    continue
                issues = []
                if cl.get('com.docker.compose.project') != 'honeypot':
                    # Ignore unrelated Compose projects unless they claim an exact HoneyTrace name.
                    if service not in c.get('expected_name_services', []):
                        continue
                    issues.append('compose_project_mismatch')
                if cl.get('com.docker.compose.service') != service:
                    issues.append('compose_service_mismatch')
                if c.get('expected_name_services') and c['expected_name_services'] != [service]:
                    issues.append('container_name_service_mismatch')
                if cl.get('com.docker.compose.oneoff', 'False').lower() != 'false':
                    issues.append('oneoff_container')
                if runtime_root and cl.get('com.docker.compose.project.working_dir') != runtime_root:
                    issues.append('different_or_missing_runtime_root')
                if set(c['networks']) != PLACEMENT[service]:
                    issues.append('unexpected_network_placement')
                if service == 'suricata':
                    if c['network_mode'] != 'host':
                        issues.append('host_network_mode_not_established')
                else:
                    for name, endpoint in c['networks'].items():
                        net = nets.get(name, {})
                        if endpoint['network_id'] != net.get('id'):
                            issues.append('network_identity_mismatch')
                        if c['state'] == 'running' and (not endpoint['endpoint_id'] or
                                net.get('members', {}).get(c['id']) != endpoint['endpoint_id']):
                            issues.append('active_membership_not_corroborated')
                candidates.append({'socket': d['socket'], 'daemon': d['daemon'], **c, 'issues': sorted(set(issues)),
                                   'shim_pids': [p['pid'] for p in processes if p['kind'] == 'shim'
                                                 and c['id'] in p['flags'].get('container_id', [])]})
        results[service] = {'status': 'conflicting' if len(candidates) > 1 else
                           ('verified' if not candidates[0]['issues'] else 'unverified') if candidates else 'missing',
                            'candidates': candidates}
    incomplete = any(r['status'] != 'accessible' and r.get('error') != 'socket_unavailable' for r in observations)
    return {'services': results, 'aliases': aliases, 'conflicts': conflicts,
            'scope_complete': not incomplete and not conflicts,
            'ownership_verified': bool(daemons) and not incomplete and not conflicts
                                  and all(v['status'] == 'verified' for v in results.values())}


def listener_owners(path, processes):
    """Require a live dockerd listener before connecting, avoiding socket activation.

    Kernel socket inode ownership is established during /proc enumeration. Socket
    filesystem device/inode identity then correlates paths across mount namespaces.
    """
    target = os.stat(path)
    if not stat.S_ISSOCK(target.st_mode):
        raise ObservationError('not_a_unix_socket')
    owners = []
    for process in processes:
        if process['kind'] != 'dockerd':
            continue
        for listener in process.get('listening_socket_paths', []):
            try:
                source = os.stat(f"/proc/{process['pid']}/root{listener}")
                if (source.st_dev, source.st_ino) == (target.st_dev, target.st_ino):
                    owners.append(process['pid'])
                    break
            except OSError:
                continue
    return owners


def collect(extra=(), timeout=3, runtime_root=None):
    processes, issues = proc_metadata()
    observations = []
    for path in discover(processes, extra):
        try:
            owners = listener_owners(path, processes)
            if not owners:
                raise ObservationError('active_daemon_listener_not_established')
            row = observe(path, timeout)
            row['listener_owner_pids'] = owners
        except (OSError, ObservationError) as exc:
            row = {'socket': path, 'status': 'inaccessible', 'error': error_code(exc),
                   'containers': [], 'networks': [], 'listener_owner_pids': []}
        observations.append(row)
    # SO_PEERCRED associates each successful connection with a host process;
    # systemd peers require a uniquely corroborated existing dockerd listener.
    by_pid = {p['pid']: p for p in processes}
    for row in observations:
        peer = row.get('peer') or {}
        owners = row['listener_owner_pids']
        direct = peer.get('pid') if peer.get('pid') in owners else None
        associated = direct or (owners[0] if len(owners) == 1 else None)
        row['daemon_process'] = by_pid.get(associated)
        row['process_association'] = ('peer_and_listener' if direct else
                                      'unique_active_listener' if associated else 'unresolved')
    correlation = correlate(observations, processes, runtime_root)
    connected_pids = {(r.get('daemon_process') or {}).get('pid') for r in observations if r['status'] == 'accessible'}
    unresolved = [p['pid'] for p in processes if p['kind'] == 'dockerd' and p['pid'] not in connected_pids]
    # A running daemon with no successful peer/listener association must remain unresolved,
    # even when all well-known paths are absent or lead to the other installation.
    if unresolved or issues or any(r['status'] == 'accessible' and not r['daemon_process'] for r in observations):
        correlation['scope_complete'] = False
        correlation['ownership_verified'] = False
    return {'schema': 1, 'observed_utc': datetime.now(timezone.utc).isoformat(),
            'qualification': 'NOT_PERFORMED', 'runtime_root_filter': runtime_root,
            'observations': observations,
            'processes': [p for p in processes if p['kind'] == 'dockerd' or any(
                cid in {c['id'] for v in correlation['services'].values() for c in v['candidates']}
                for cid in p['flags'].get('container_id', []))], 'process_visibility_issues': issues,
            'unresolved_daemon_pids': unresolved, **correlation}


def human(report):
    lines = ['HoneyTrace Docker ownership — read-only observation; NOT qualification',
             'All seven ownership identities verified: ' + str(report['ownership_verified'])]
    for row in report['observations']:
        d = row.get('daemon', {})
        proc = row.get('daemon_process') or {}
        lines.append(f"{row['socket']}: {row['status']} {row.get('error', '')} "
                     f"daemon={d.get('id', '?')} root={d.get('storage_root', '?')} "
                     f"peer_pid={(row.get('peer') or {}).get('pid', '?')} dockerd_pid={proc.get('pid', '?')} "
                     f"containers={len(row['containers'])}")
    for service, result in report['services'].items():
        lines.append(f"{service}: {result['status']}" + ''.join(
            f" [{c['id'][:12]} {c['state']} via {c['socket']}; issues={','.join(c['issues']) or 'none'}]"
            for c in result['candidates']))
    for alias in report['aliases']:
        lines.append(f"alias: {alias['socket']} = {alias['same_as']}")
    if report.get('unresolved_daemon_pids'):
        lines.append('Unresolved dockerd PIDs: ' + ', '.join(map(str, report['unresolved_daemon_pids'])))
    if report['conflicts']:
        lines.append('Conflicts: ' + json.dumps(report['conflicts'], sort_keys=True))
    for p in report['processes']:
        if p['kind'] == 'dockerd':
            lines.append(f"dockerd pid={p['pid']} executable={p['executable']} flags={json.dumps(p['flags'], sort_keys=True)}")
    if report['process_visibility_issues']:
        lines.append('Process visibility: ' + ', '.join(report['process_visibility_issues']))
    lines.append('Missing means not found in accessible inventories; inaccessible endpoints remain unresolved.')
    return '\n'.join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--socket', action='append', default=[], help='Additional absolute Unix socket path (repeatable)')
    parser.add_argument('--runtime-root', help='Exact Compose working_dir to match; no file contents read')
    parser.add_argument('--timeout', type=float, default=3, help='Per-request timeout seconds (0 < n <= 30)')
    parser.add_argument('--json', action='store_true', help='Structured report on stdout; default is human-readable')
    args = parser.parse_args(argv)
    if not 0 < args.timeout <= 30 or any(not p.startswith('/') for p in args.socket):
        parser.error('Use absolute Unix socket paths and a timeout in (0, 30]')
    report = collect(args.socket, args.timeout, args.runtime_root)
    print(json.dumps(report, indent=2, sort_keys=True) if args.json else human(report))
    return 0 if report['ownership_verified'] else 2


if __name__ == '__main__':
    sys.exit(main())
