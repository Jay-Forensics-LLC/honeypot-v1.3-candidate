"""Bounded, read-only Docker ownership checks for the supported local host.

Never reconcile sockets, start services, or treat an empty API as lost evidence.
Only allowlisted metadata reaches the report; Docker environment values do not.
"""
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

from hp_common import utc
from health_snapshot import boot_id

class OwnershipError(ValueError):
    """Trusted diagnostic text; never echo exception text from untrusted output."""


ENDPOINT = 'unix:///run/docker.sock'
SERVICES = {'cowrie', 'opencanary', 'suricata', 'alloy', 'loki', 'grafana', 'incidentd'}


def command(argv, root):
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        try:
            result = subprocess.run(argv, cwd=root, stdout=out, stderr=err, timeout=15)
        except (OSError, subprocess.TimeoutExpired) as exc:
            return {'exit': None, 'error': type(exc).__name__, 'error_category': 'TIMEOUT' if isinstance(exc, subprocess.TimeoutExpired) else 'CLIENT_UNAVAILABLE', 'stdout': ''}
        if out.tell() > 2 * 1024**2 or err.tell() > 64 * 1024:
            return {'exit': result.returncode, 'error': 'OutputBudgetExceeded', 'error_category': 'OUTPUT_BUDGET', 'stdout': ''}
        out.seek(0); err.seek(0)
        message = err.read().decode('utf-8', errors='replace').lower()
        category = classify_error(message) if result.returncode else None
        return {'exit': result.returncode, 'error_category': category,
                'stdout': out.read().decode('utf-8', errors='strict')}


def classify_error(message):
    if 'permission denied' in message: return 'PERMISSION_DENIED'
    if 'no such file or directory' in message: return 'MISSING_SOCKET_OR_CLIENT_PATH'
    if 'connection refused' in message: return 'CONNECTION_REFUSED'
    if 'timeout' in message or 'deadline exceeded' in message: return 'TIMEOUT'
    if 'client version' in message and ('too old' in message or 'too new' in message): return 'API_INCOMPATIBLE'
    if 'error response from daemon' in message: return 'API_OPERATION_ERROR'
    return 'COMMAND_ERROR'


def inspect(root, require_existing=False, runner=None, environ=None):
    root = Path(root).resolve()
    runner = command if runner is None else runner
    env = os.environ if environ is None else environ
    report = {'timestamp': utc(), 'boot_id': boot_id(), 'runtime_root': str(root),
              'ok': False, 'status': 'BLOCKED', 'read_only': True,
              'traffic_generated': False, 'runtime_mutated': False,
              'qualification': 'Docker ownership only; health, containment and packet evidence NOT TESTED',
              'endpoint': ENDPOINT, 'checks': {}, 'problems': [], 'containers': []}

    def call(label, argv):
        result = runner(argv, root)
        report['checks'][label] = {'exit': result.get('exit'), 'error': result.get('error'), 'error_category': result.get('error_category')}
        if result.get('exit') != 0 or result.get('error'):
            raise OwnershipError(label + ' unavailable (' + str(result.get('error_category') or result.get('error') or 'COMMAND_ERROR') + '); no valid API inventory established')
        return result['stdout']

    try:
        host = env.get('DOCKER_HOST', '')
        if host not in ('', ENDPOINT, 'unix:///var/run/docker.sock'):
            raise OwnershipError('Nonlocal or unreviewed DOCKER_HOST; no connection attempted')
        if env.get('DOCKER_CONTEXT', '') not in ('', 'default'):
            raise OwnershipError('Nondefault DOCKER_CONTEXT; no connection attempted')
        # DOCKER_CONTEXT takes precedence over DOCKER_HOST for later CLI calls.
        # Inspect it even when the supplied host looks local.
        if not host or env.get('DOCKER_CONTEXT') == 'default':
            selected = json.loads(call('selected_context', ['docker', 'context', 'inspect',
                                                          '--format', '{{json .Endpoints.docker.Host}}']))
            if selected not in (ENDPOINT, 'unix:///var/run/docker.sock'):
                raise OwnershipError('Selected Docker context is not the reviewed local socket; no API connection attempted')
        text = call('daemon_processes', ['ps', '-C', 'dockerd', '-o', 'pid='])
        pids = [int(v) for v in text.split()]
        if len(pids) > 32 or len(pids) != len(set(pids)) or any(p <= 0 for p in pids):
            raise OwnershipError('Invalid Docker process inventory')
        report['daemon_pids'] = pids
        if len(pids) != 1:
            report['problems'].append('Expected one local Docker daemon; concurrent or missing daemons block startup')
        units = {}
        for name in ('docker.service', 'snap.docker.dockerd.service'):
            # A not-found Snap unit is valid on a host with only system Docker.
            result = runner(['systemctl', 'show', name, '-p', 'LoadState', '-p', 'ActiveState',
                             '-p', 'SubState', '-p', 'MainPID', '-p', 'NeedDaemonReload'], root)
            report['checks'][name] = {'exit': result.get('exit'), 'error': result.get('error'), 'error_category': result.get('error_category')}
            unit = dict(line.split('=', 1) for line in result.get('stdout', '').splitlines() if '=' in line)
            if result.get('error') or (result.get('exit') != 0 and unit.get('LoadState') != 'not-found'):
                raise OwnershipError('Docker service identity unavailable')
            units[name] = {k: unit.get(k) for k in ('LoadState', 'ActiveState', 'SubState', 'MainPID', 'NeedDaemonReload')}
            if units[name]['NeedDaemonReload'] not in (None, 'no', 'yes'):
                units[name]['NeedDaemonReload'] = 'WITHHELD_OR_UNAVAILABLE'
            if unit.get('LoadState') != 'not-found':
                if unit.get('NeedDaemonReload') == 'yes':
                    report['problems'].append(name + ': systemd unit definitions require review (NeedDaemonReload=yes); this does not establish a daemon restart')
                elif unit.get('NeedDaemonReload') != 'no':
                    report['problems'].append(name + ': systemd unit-definition freshness is unverified; startup remains blocked')
        report['units'] = units
        system, snap = units['docker.service'], units['snap.docker.dockerd.service']
        if system.get('ActiveState') != 'active' or system.get('SubState') != 'running' or int(system.get('MainPID') or 0) not in pids:
            report['problems'].append('Supported system Docker service/process identity is not established')
        if snap.get('ActiveState') not in ('inactive', 'failed'):
            report['problems'].append('Snap Docker inactivity is not established; no daemon recovery authorized by this check')
        fmt = '{"id":{{json .ID}},"data_root":{{json .DockerRootDir}},"containers":{{.Containers}},"driver":{{json .Driver}}}'
        api = json.loads(call('local_api', ['docker', '--host', ENDPOINT, 'info', '--format', fmt]))
        if (not isinstance(api, dict) or not re.fullmatch(r'[A-Za-z0-9:._-]{1,128}', api.get('id', '')) or
                type(api.get('containers')) is not int or not 0 <= api['containers'] <= 4000):
            raise OwnershipError('Malformed Docker API identity or inventory exceeds 4000-container read budget')
        report['api'] = {k: api.get(k) for k in ('id', 'data_root', 'containers', 'driver')}
        versions = json.loads(call('api_versions', ['docker', '--host', ENDPOINT, 'version', '--format', '{{json .}}']))
        client, server = versions.get('Client'), versions.get('Server')
        if not isinstance(client, dict) or not isinstance(server, dict):
            raise OwnershipError('Client/server version exchange incomplete')
        for part in (client, server):
            if any(not isinstance(part.get(k), str) or not re.fullmatch(r'[0-9]+\.[0-9]+(?:\.[0-9]+)?(?:[-+][A-Za-z0-9.-]+)?', part[k])
                   for k in ('Version', 'ApiVersion')):
                raise OwnershipError('Client/server version metadata invalid or unavailable')
        report['versions'] = {name: {k: part.get(k) for k in ('Version', 'ApiVersion', 'MinAPIVersion')}
                              for name, part in (('client', client), ('server', server))}
        if api.get('data_root') != '/var/lib/docker':
            report['problems'].append('API data root differs from the reviewed system store; ownership must be reconciled')
        ids = call('project_inventory', ['docker', '--host', ENDPOINT, 'ps', '-aq', '--no-trunc',
                                        '--filter', 'label=com.docker.compose.project=honeypot']).split()
        if len(ids) > 4000 or len(ids) != len(set(ids)) or any(not re.fullmatch('[0-9a-f]{64}', v) for v in ids):
            raise OwnershipError('Malformed project container inventory')
        report['project_container_count'] = len(ids)
        if ids:
            rows = json.loads(call('project_ownership', ['docker', '--host', ENDPOINT, 'inspect', *ids]))
            if not isinstance(rows, list) or len(rows) != len(ids) or {c.get('Id') for c in rows} != set(ids):
                raise OwnershipError('Docker inspect identities differ from inventory')
            for c in rows:
                labels = c.get('Config', {}).get('Labels') or {}
                service = labels.get('com.docker.compose.service')
                owner = labels.get('com.docker.compose.project.working_dir')
                if labels.get('com.docker.compose.project') != 'honeypot' or service not in SERVICES or owner != str(root):
                    raise OwnershipError('Project-labelled container belongs to another or unreviewed working copy')
                report['containers'].append({'id': c['Id'], 'service': service,
                                             'runtime_root': owner, 'image_id': c.get('Image')})
            if len({c['service'] for c in report['containers']}) != len(ids):
                raise OwnershipError('Duplicate project service ownership')
        if require_existing and (len(ids) != 7 or {c['service'] for c in report['containers']} != SERVICES):
            report['problems'].append('Existing seven-service ownership incomplete; empty API does not prove containers or evidence were deleted')
        if not report['problems']:
            report.update(ok=True, status='PASS_DAEMON_OWNERSHIP')
    except (OSError, ValueError, TypeError, KeyError, AttributeError, UnicodeError, subprocess.SubprocessError) as exc:
        # Never echo raw Docker stderr, argv/context values, config or environment.
        report['problems'].append(str(exc) if isinstance(exc, OwnershipError)
                                  else type(exc).__name__ + ': Docker observation could not be verified')
    return report


def require_local_daemon(root, require_existing=False):
    result = inspect(root, require_existing=require_existing)
    if not result['ok']:
        raise SystemExit('Docker ownership gate: ' + '; '.join(result['problems']) +
                         '. Run hp.py doctor --runtime-root PATH; do not recreate or stop a daemon to bypass this gate.')
    return result
