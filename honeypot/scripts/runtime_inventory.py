"""Read-only, fail-closed local demo inventory. Not a Stage 7/8 qualification."""
import hashlib
import ipaddress
import json
from pathlib import Path
import subprocess
from hp_common import config, utc
from guard_policy import evaluate, canonical, DNS
from capture_status import inspect_capture

SERVICES = {'cowrie', 'opencanary', 'suricata', 'loki', 'alloy', 'grafana', 'incidentd'}
PLACEMENT = {'cowrie': {'honeypot-cowrie-net'}, 'opencanary': {'honeypot-canary-net'},
             'suricata': {'host'}, 'grafana': {'honeypot-observability', 'honeypot-management'},
             **{n: {'honeypot-observability'} for n in ('loki', 'alloy', 'incidentd')}}


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def command(root, argv, timeout=20, check=True):
    return subprocess.run(argv, cwd=root, text=True, capture_output=True, timeout=timeout, check=check)


def validate_runtime(rendered, containers, networks, root):
    """Require active, healthy services before any demo probe."""
    return _validate_runtime(rendered, containers, networks, root)


def stopped_decoy_configuration(rendered, containers, networks, root):
    """Assess stopped configuration only; never authorize startup or demo traffic."""
    problems = _validate_runtime(rendered, containers, networks, root,
                                 stopped={'cowrie', 'opencanary'})
    return {'status': 'CONFIGURATION_CHECKS_PASSED' if not problems else 'BLOCKED',
            'problems': problems, 'ready_for_demo': False, 'startup_authorized': False,
            'scope': 'Cleanly stopped decoys and container/network configuration only; '
                     'capture, storage, quarantine and evidence checks remain separate'}


def _validate_runtime(rendered, containers, networks, root, stopped=frozenset()):
    """Share configuration checks while retaining strict live health gates."""
    problems = []
    if set(containers) != SERVICES or set(rendered.get('services', {})) != SERVICES:
        return ['Exactly the seven expected services must be present']
    for name, c in containers.items():
        spec = rendered['services'][name]
        host = c['HostConfig']
        if c['Config'].get('Image') != spec.get('image'):
            problems.append(name + ': image reference differs from rendered configuration')
        state = c['State']
        if name in stopped:
            if (state.get('Status'), state.get('Running'), state.get('Pid'),
                state.get('ExitCode'), state.get('Error')) != ('exited', False, 0, 0, ''):
                problems.append(name + ': cleanly stopped state not established')
            for endpoint in c['NetworkSettings']['Networks'].values():
                if any(endpoint.get(k) for k in ('EndpointID', 'IPAddress', 'GlobalIPv6Address',
                                                'MacAddress', 'Gateway', 'IPv6Gateway',
                                                'IPPrefixLen', 'GlobalIPv6PrefixLen')):
                    problems.append(name + ': stopped container has active network identity')
        elif not state.get('Running') or state.get('Health', {}).get('Status') != 'healthy':
            problems.append(name + ': not running and healthy')
        if any(c['State'].get(k) for k in ('Paused','Restarting','Dead','OOMKilled')):
            problems.append(name + ': abnormal runtime state')
        if host.get('Privileged') or not host.get('ReadonlyRootfs') or 'ALL' not in (host.get('CapDrop') or []):
            problems.append(name + ': security settings differ')
        if set(c['NetworkSettings']['Networks']) != PLACEMENT[name]:
            problems.append(name + ': unexpected network placement')
        if name in DNS and host.get('Dns') != [DNS[name]]:
            problems.append(name + ': DNS blackhole differs')
        caps={v.removeprefix('CAP_') for v in (host.get('CapAdd') or [])}
        if caps != ({'NET_RAW','NET_ADMIN','SETUID','SETGID'} if name=='suricata' else set()):
            problems.append(name + ': unexpected capabilities')
        if not any(v in ('no-new-privileges:true','no-new-privileges') for v in (host.get('SecurityOpt') or [])):
            problems.append(name + ': no-new-privileges missing')
        expected = {}
        for port in spec.get('ports', []):
            address = port.get('host_ip', '')
            if address != '127.0.0.1':
                problems.append(name + ': non-loopback or unspecified binding')
            key = str(port['target']) + '/' + port.get('protocol', 'tcp')
            expected.setdefault(key, []).append({'HostIp': address, 'HostPort': str(port['published'])})
        def bindings(value):
            return {k: sorted(v, key=lambda x: (x['HostIp'], x['HostPort'])) for k, v in (value or {}).items() if v}
        if bindings(expected) != bindings(host.get('PortBindings')):
            problems.append(name + ': configured port bindings differ')
        active_bindings = bindings(c['NetworkSettings'].get('Ports'))
        if name in stopped:
            if active_bindings:
                problems.append(name + ': stopped container has active port bindings')
        elif bindings(expected) != active_bindings:
            problems.append(name + ': active published ports differ')
        allowed_targets = {'cowrie': {'2222/tcp', '2223/tcp'}, 'opencanary': {'8080/tcp', '2121/tcp', '16379/tcp'}, 'grafana': {'3000/tcp'}}.get(name, set())
        if set(expected) != allowed_targets:
            problems.append(name + ': unexpected published service')
        mounts = {v['Destination']: v for v in c.get('Mounts', [])}
        expected_mounts = set()
        for volume in spec.get('volumes', []):
            target = volume['target']; expected_mounts.add(target)
            actual = mounts.get(target, {})
            if volume['type'] != 'bind' or actual.get('Type') != 'bind' or actual.get('Source') != volume['source'] or actual.get('RW') != (not volume.get('read_only', False)):
                problems.append(name + ': mount differs at ' + target)
        expected_mounts.update((host.get('Tmpfs') or {}).keys())
        if name=='cowrie':
            declared=set(c['Config'].get('Volumes') or {})
            known={'/cowrie/cowrie-git/etc','/cowrie/cowrie-git/var'}
            if declared-known: problems.append('cowrie: unexpected image-declared volume')
            for target in declared & known:
                mount=mounts.get(target,{})
                volume_name=mount.get('Name','')
                if not volume_name or volume_name in ('.','..') or '/' in volume_name or mount.get('Type')!='volume' or mount.get('Driver')!='local' or mount.get('Source')!='/var/lib/docker/volumes/'+volume_name+'/_data':
                    problems.append('cowrie: invalid image volume '+target)
                else: expected_mounts.add(target)
        if name == 'grafana':
            target = '/run/secrets/grafana_admin_password'; expected_mounts.add(target)
            if mounts.get(target, {}).get('Source') != str(root / 'secrets/grafana_admin_password') or mounts.get(target, {}).get('RW') is not False:
                problems.append('grafana: secret mount differs')
        if set(mounts) - expected_mounts or any('docker.sock' in str(v) for v in mounts.values()):
            problems.append(name + ': unexpected mount')
        labels = c['Config'].get('Labels') or {}
        if labels.get('com.docker.compose.project') != 'honeypot' or labels.get('com.docker.compose.service') != name:
            problems.append(name + ': Compose identity differs')
        if labels.get('com.docker.compose.project.working_dir') != str(root):
            problems.append(name + ': belongs to a different runtime tree')
    expected_nets = {n['name']: n for n in rendered.get('networks', {}).values()}
    actual_nets = {n['Name']: n for n in networks}
    if set(expected_nets) != {'honeypot-cowrie-net', 'honeypot-canary-net', 'honeypot-observability', 'honeypot-management'} or set(actual_nets) != set(expected_nets):
        problems.append('Unexpected network inventory')
    cidrs = {'honeypot-cowrie-net': '172.29.40.0/24', 'honeypot-canary-net': '172.29.41.0/24',
             'honeypot-observability': '172.29.42.0/24', 'honeypot-management': '172.29.43.0/24'}
    for name, expected in expected_nets.items():
        actual = actual_nets.get(name, {})
        subnets = [x.get('Subnet') for x in actual.get('IPAM', {}).get('Config', [])]
        gateways = [x.get('Gateway') for x in actual.get('IPAM', {}).get('Config', [])]
        expected_gateway = str(ipaddress.ip_network(cidrs[name]).network_address + 1) if name in cidrs else None
        if gateways != [expected_gateway]: problems.append(name + ': gateway differs')
        members = set(actual.get('Containers', {}))
        intended = {c['Id'] for service, c in containers.items()
                    if service not in stopped and name in PLACEMENT[service]}
        if subnets != [cidrs.get(name)]:
            problems.append(name + ': CIDR differs')
        if members != intended:
            problems.append(name + ': active membership differs')
        if actual.get('Internal') != (name == 'honeypot-observability') or actual.get('EnableIPv6') or actual.get('Driver') != 'bridge':
            problems.append(name + ': network isolation or driver differs')
        for key, value in expected.get('driver_opts', {}).items():
            if actual.get('Options', {}).get(key) != value: problems.append(name + ': bridge options differ')
        if name in ('honeypot-cowrie-net','honeypot-canary-net'):
            bridge={'honeypot-cowrie-net':'br-hp-cowrie','honeypot-canary-net':'br-hp-canary'}[name]
            if actual.get('Options',{}).get('com.docker.network.bridge.name') != bridge:
                problems.append(name + ': expected sensor bridge differs')
    return problems


def collect(root, source_root, probe_readiness=True):
    root = Path(root).resolve()
    run = lambda argv, **kw: command(root, argv, **kw)
    row = {'timestamp': utc(), 'runtime_root': str(root), 'ok': False, 'problems': [],
           'qualification': 'UNQUALIFIED_CURRENT_OBSERVATION; prior Stage 7 invalidated by host reboot'}
    try:
        cfg = config(root)
        if cfg.get('WAN_CRITERIA', 'false') != 'false' or cfg.get('WAN_SOURCE_MODE', 'off') != 'off':
            raise ValueError('WAN must be disabled for the local demo')
        if cfg.get('DECOY_BIND') != '127.0.0.1' or cfg.get('MANAGEMENT_BIND') != '127.0.0.1':
            raise ValueError('The local demo requires explicit 127.0.0.1 decoy and management binds')
        rendered = json.loads(run(['docker', 'compose', '-f', str(root / 'docker-compose.yml'), 'config', '--format', 'json']).stdout)
        ids = run(['docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=honeypot']).stdout.split()
        if len(ids) != 7: raise ValueError('Expected exactly seven project containers')
        inspected = json.loads(run(['docker', 'inspect', *ids]).stdout)
        containers = {c['Config']['Labels']['com.docker.compose.service']: c for c in inspected}
        nets = json.loads(run(['docker', 'network', 'inspect', 'honeypot-cowrie-net', 'honeypot-canary-net', 'honeypot-observability', 'honeypot-management']).stdout)
        row['problems'] += validate_runtime(rendered, containers, nets, root)
        row['stopped_decoy_configuration'] = stopped_decoy_configuration(rendered, containers, nets, root)
        nft = json.loads(run(['nft', '-j', 'list', 'table', 'inet', 'hp_guard']).stdout)
        row['guard'] = evaluate(nft, cfg)
        if not row['guard']['ok']: row['problems'].append('hp_guard policy failed validation')
        def policy(value):
            if isinstance(value, dict): return {k: policy(v) for k, v in value.items() if k not in ('handle', 'counter', 'metainfo')}
            if isinstance(value, list): return [policy(x) for x in value if not isinstance(x, dict) or not set(x) <= {'counter', 'metainfo'}]
            return value
        row['guard_fingerprint'] = fingerprint(canonical(policy(nft)))
        row['capture'] = inspect_capture(root, run)
        if not row['capture']['ok']: row['problems'].append('PCAP identity/interface verification failed')
        modules = ['incidentd.py', 'evidence_store.py', 'hp_common.py', 'bait.py']
        code = 'import hashlib,json,pathlib; print(json.dumps({n:hashlib.sha256(pathlib.Path("/app",n).read_bytes()).hexdigest() for n in '+repr(modules)+'}))'
        hashes = json.loads(run(['docker', 'exec', containers['incidentd']['Id'], 'python', '-B', '-c', code]).stdout)
        expected = {n: hashlib.sha256((source_root / 'scripts' / n).read_bytes()).hexdigest() for n in modules}
        row['deployed_source_hashes'] = hashes
        row['candidate_source_hashes'] = expected
        if hashes != expected: row['problems'].append('Deployed incident pipeline differs from this checkout')
        code='''import json,urllib.request
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
result={}
for name,url in [('loki','http://loki:3100/ready'),('alloy','http://alloy:12345/-/ready'),('grafana','http://grafana:3000/api/health')]:
    with opener.open(url,timeout=5) as response: result[name]=response.status==200
print(json.dumps(result))
'''
        if probe_readiness and not row['problems']:
            row['http_readiness']=json.loads(run(['docker','exec',containers['incidentd']['Id'],'python','-B','-c',code]).stdout)
            if not all(row['http_readiness'].get(n) is True for n in ('loki','alloy','grafana')):
                row['problems'].append('Internal HTTP readiness failed')
        else:
            row['http_readiness']='NOT TESTED: inspection only or failed safety gate'
        row['containers'] = {n: {'id': c['Id'], 'image_id': c['Image'], 'created': c['Created'], 'started_at': c['State']['StartedAt'],
                               'health': c['State']['Health']['Status'], 'restart_count': c['RestartCount'],
                               'networks': c['NetworkSettings']['Networks'], 'ports': c['NetworkSettings']['Ports'],
                               'mounts': c['Mounts'], 'environment_hash': fingerprint(c['Config'].get('Env', []))} for n,c in containers.items()}
        row['networks'] = nets
        row['compose_hash'] = hashlib.sha256((root / 'docker-compose.yml').read_bytes()).hexdigest()
        row['rendered_config_hash'] = fingerprint(rendered)
        row['config_hash'] = fingerprint(cfg)
        row['boot_id'] = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
        row['candidate_source_commit'] = command(source_root, ['git', 'rev-parse', 'HEAD']).stdout.strip()
        row['candidate_source_dirty'] = bool(command(source_root, ['git', 'status', '--porcelain']).stdout)
        row['deployed_source_commit']='UNKNOWN: selected deployed module hashes verified; image revision label not established'
        row['network_fingerprint']=fingerprint({n['Name']:{'driver':n['Driver'],'internal':n['Internal'],'ipam':n['IPAM'],'options':n.get('Options'),
                 'members':sorted(service for service in containers if n['Name'] in PLACEMENT[service])} for n in nets})
        mounted={}
        from hp_common import sha256
        for service in rendered['services'].values():
            for volume in service.get('volumes',[]):
                path=Path(volume['source'])
                if not any(path.is_relative_to(root/name) for name in ('configs','detections','dashboards')): continue
                if path.is_symlink(): raise ValueError('Static config symlink requires review')
                files=sorted(path.rglob('*')) if path.is_dir() else [path]
                if len(files)>500: raise ValueError('Static config inventory budget exceeded')
                for file in files:
                    if file.is_file(): mounted[str(file.relative_to(root))]=sha256(file)[0]
        row['mounted_config_hashes']=mounted
        row['observation_fingerprint']=fingerprint({k:row[k] for k in ('config_hash','rendered_config_hash','deployed_source_hashes','guard_fingerprint','network_fingerprint','mounted_config_hashes')})
        row['wan_enabled'] = False
        row['ok'] = not row['problems']
    except (OSError, ValueError, KeyError, IndexError, TypeError, subprocess.SubprocessError) as exc:
        row['problems'].append(str(exc))
        if isinstance(exc,subprocess.CalledProcessError) and exc.stderr:
            row['problems'].append(exc.stderr.strip()[-600:])
    return row
