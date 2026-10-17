#!/usr/bin/env python3
"""Target lifecycle operations. Defaults never publish externally or alter permanent rules."""
import argparse
import datetime
import ipaddress
import json
import os
from pathlib import Path
import platform
import secrets
import shutil
import subprocess
import sys
import time
from hp_common import ROOT, config, runtime_path, run, require_root, atomic_json, utc, audited
from guard_policy import DNS, require_guard, inspect_dns
from daemon_check import require_local_daemon

SERVICES=['cowrie','opencanary','suricata','loki','alloy','grafana','incidentd']

def compose(*args,check=True):
    result=run(['docker','compose',*args],timeout=1200,check=check)
    print(result.stdout,end='');print(result.stderr,end='',file=sys.stderr);return result

def secrets_generate():
    folder=ROOT/'secrets';folder.mkdir(exist_ok=True,mode=0o750)
    p=folder/'grafana_admin_password'
    if p.exists(): print('Existing Grafana secret preserved');return
    fd=os.open(p,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o640)
    with os.fdopen(fd,'w') as f: f.write(secrets.token_urlsafe(36)+'\n')
    if os.geteuid()==0: os.chown(p,0,2000)
    print('Created secrets/grafana_admin_password; read locally as root. Not printed or logged.')

def bootstrap():
    require_root()
    env=ROOT/'.env'
    if not env.exists():
        with env.open('x') as f: f.write((ROOT/'.env.example').read_text())
        os.chmod(env,0o640)
    # Ownership is numeric and confined to runtime directories. No recursive chown of evidence.
    paths={ROOT/'logs':(0,0o2750),ROOT/'state':(0,0o2750),ROOT/'secrets':(0,0o2750),ROOT/'backups':(0,0o2750)}
    for name,uid in [('cowrie',999),('opencanary',10002),('suricata',0),('firewall',0),('system',10001),('normalized',10001)]: paths[ROOT/'logs'/name]=(uid,0o2750)
    for name,uid in [('cowrie',999),('loki',10001),('alloy',10001),('grafana',472),('incidentd',10001),('trusted',0)]: paths[ROOT/'state'/name]=(uid,0o2750)
    paths[runtime_path('PCAP_PATH','captures')]=(0,0o2750)
    paths[runtime_path('INCIDENT_PATH','incidents')]=(10001,0o2750)
    paths[runtime_path('ARTIFACT_PATH','artifacts')]=(10001,0o2750)
    paths[runtime_path('ARTIFACT_PATH','artifacts')/'cowrie']=(999,0o2750)
    for p,(uid,mode) in paths.items():
        if p.is_symlink(): raise SystemExit('Runtime directories may not be symlinks; use absolute .env paths: '+str(p))
        p.mkdir(parents=True,exist_ok=True);os.chown(p,uid,2000);os.chmod(p,mode)
    boundary=ROOT/'state/trusted/boundary.jsonl'
    if not boundary.exists(): boundary.touch(mode=0o640)
    os.chown(boundary,0,2000);os.chmod(boundary,0o640)
    secrets_generate()
    import bait
    bait.ensure_inventory(ROOT)
    # Render retention into a private project file, without replacing any /etc config.
    days=int(config()['LOG_RETENTION_DAYS'])
    if not 1<=days<=90: raise SystemExit('LOG_RETENTION_DAYS must be 1..90')
    template=(ROOT/'configs/logrotate/honeypot.in').read_text().replace('@ROOT@',str(ROOT)).replace('@DAYS@',str(days))
    (ROOT/'state/logrotate.conf').write_text(template)
    print('Runtime directories ready; no services started, firewall unchanged.')

def preflight():
    report={'timestamp':utc(),'os':platform.platform(),'architecture':platform.machine(),'cpu':platform.processor(),'cpu_count':os.cpu_count(),'disk':shutil.disk_usage(ROOT)._asdict(),'checks':{},'conflicts':[]}
    commands={'ubuntu':['cat','/etc/os-release'],'cpu':['lscpu'],'memory':['free','-h'],'interfaces':['ip','-brief','address'],'routes':['ip','route'],'dns':['resolvectl','status'],'virtualization':['systemd-detect-virt'],'docker':['docker','version'],'compose':['docker','compose','version'],'nftables':['nft','--version'],'storage':['lsblk','-o','NAME,MODEL,SIZE,FSTYPE,MOUNTPOINTS'],'clock':['timedatectl'],'listeners':['ss','-lntup']}
    for key,argv in commands.items():
        try:
            result=run(argv,check=False);report['checks'][key]={'status':'PASS' if result.returncode==0 else 'NOT TESTED','output':result.stdout or result.stderr}
        except OSError as exc: report['checks'][key]={'status':'NOT TESTED','output':str(exc)}
    cfg=config()
    if Path('/etc/os-release').exists() and 'ID=ubuntu' not in Path('/etc/os-release').read_text(): report['conflicts'].append('Target OS is not Ubuntu')
    listen=report['checks'].get('listeners',{}).get('output','')
    import re
    for key in ('COWRIE_SSH_PORT','COWRIE_TELNET_PORT','CANARY_HTTP_PORT','CANARY_FTP_PORT','CANARY_REDIS_PORT','GRAFANA_PORT'):
        if re.search(r':'+re.escape(cfg[key])+r'\s',listen):report['conflicts'].append(key+' already listening')
    routes=run(['ip','-j','route'],check=False) if shutil.which('ip') else None
    if routes and routes.returncode==0:
        for row in json.loads(routes.stdout):
            dst=row.get('dst','default')
            if dst=='default':continue
            net=ipaddress.ip_network(dst,strict=False)
            for reserved in ('172.29.40.0/24','172.29.41.0/24','172.29.42.0/24'):
                if net.overlaps(ipaddress.ip_network(reserved)) and row.get('dev') not in ('br-hp-cowrie','br-hp-canary'):
                    report['conflicts'].append('Review subnet overlap: '+dst+' vs '+reserved)
    print(json.dumps(report,indent=2));(ROOT/'work').mkdir(exist_ok=True);atomic_json(ROOT/'work/preflight.json',report)
    return 1 if report['conflicts'] else 0

def install():
    require_root()
    if '--install' not in sys.argv: raise SystemExit('Review DEPLOYMENT.md. Re-run with --install to authorize package installation on Ubuntu.')
    if 'ID=ubuntu' not in Path('/etc/os-release').read_text(): raise SystemExit('Ubuntu only')
    for argv in [['apt-get','update'],['apt-get','install','-y','docker.io','docker-compose-v2','nftables','tshark','logrotate','python3','python3-yaml','yara','openssh-client','unzip','ca-certificates']]:
        r=subprocess.run(argv,env={**os.environ,'DEBIAN_FRONTEND':'noninteractive'},check=True)
    print('Packages installed; Docker package may start its local daemon. No honeypots started. No docker-group membership changed.')

def exposure_gate(host_ip, approved=False):
    try:
        addr = ipaddress.ip_address(host_ip)
        loopback = addr.is_loopback
    except ValueError:
        loopback = False
        addr = None
    if loopback:
        return
    if addr is None or addr.is_unspecified or addr.is_multicast:
        raise SystemExit('Decoy bind must be one specific address, not ' + str(host_ip))
    if not approved:
        raise SystemExit('Non-loopback decoy binding requires --exposure-approved')
    p = ROOT/'state/readiness.json'
    try:
        record = json.loads(p.read_text())
    except (OSError, ValueError):
        record = {}
    age = time.time() - record.get('checked_epoch', 0)
    if record.get('ready') is not True or not 0 <= age <= 86400:
        raise SystemExit('Readiness must PASS within 24 hours before non-loopback startup')
    from wan_criteria import enforce_nonloopback
    enforce_nonloopback(str(addr), ROOT)

def rendered_start_gate(rendered, approved=False):
    services = rendered['services']
    for name, service in services.items():
        if name in DNS and service.get('dns') != [DNS[name]]:
            raise SystemExit(name + ' must use only its expected DNS blackhole')
        for port in service.get('ports', []):
            if not isinstance(port, dict): raise SystemExit('Unexpected rendered port configuration')
            address = port.get('host_ip', '')
            if name in DNS: exposure_gate(address, approved)
            else:
                try: local = ipaddress.ip_address(address).is_loopback
                except ValueError: local = False
                if not local: raise SystemExit('Management/observability ports must stay loopback-only')
        if name in DNS and (service.get('network_mode') or service.get('privileged')):
            raise SystemExit('Decoy network_mode/privileged override refused')
        if name in DNS:
            network = 'cowrie' if name == 'cowrie' else 'canary'
            if set(service.get('networks', {})) != {network}:
                raise SystemExit(name + ' must use only its dedicated bridge')
            expected = 'br-hp-cowrie' if name == 'cowrie' else 'br-hp-canary'
            if rendered.get('networks', {}).get(network, {}).get('driver_opts', {}).get('com.docker.network.bridge.name') != expected:
                raise SystemExit('Decoy bridge differs from hp_guard policy')
    if not all(name in services for name in DNS):
        raise SystemExit('Missing decoy services')
    from wan_criteria import decoy_ports_allowed, load_matrix
    exposed = decoy_ports_allowed(rendered, load_matrix(), wan_mode=True)
    if exposed:
        raise SystemExit('WAN port matrix rejected: ' + '; '.join(exposed) + '. No router rules were changed.')

@audited('start')
def start():
    require_root();require_local_daemon(ROOT);cfg=config()
    if not (ROOT/'secrets/grafana_admin_password').exists():raise SystemExit('Run bootstrap first')
    for p in (ROOT/'state/quarantine').glob('*.json'):
        if json.loads(p.read_text()).get('active'):raise SystemExit('Outstanding quarantine: investigate and explicitly unquarantine before startup')
    require_guard(cfg)
    if not ipaddress.ip_address(cfg['MANAGEMENT_BIND']).is_loopback:
        raise SystemExit('MANAGEMENT_BIND must remain loopback')
    approved = '--exposure-approved' in sys.argv
    exposure_gate(cfg['DECOY_BIND'], approved)
    rendered = json.loads(run(['docker', 'compose', 'config', '--format', 'json']).stdout)
    rendered_start_gate(rendered, approved)
    if not ipaddress.ip_address(cfg['DECOY_BIND']).is_loopback:
        from wan_criteria import source_mode_rejection
        reason = source_mode_rejection(cfg, ROOT)
        if reason:
            raise SystemExit(reason)
    try:
        compose('up','-d','--build','loki','alloy','grafana','incidentd','cowrie','opencanary')
        require_guard(cfg)
        if not all(inspect_dns().values()): raise SystemExit('Runtime DNS check failed after creation')
        compose('up','-d','--build','suricata')
    except (Exception,SystemExit):
        compose('stop','cowrie','opencanary',check=False)
        raise
    print('No router rules were changed. Run local tests, enable target timers and check readiness.')

@audited('boot-start')
def boot_start():
    """Fail-closed boot path for EXISTING loopback-only decoy containers.

    This intentionally does not build, pull, create, or recreate containers.
    """
    require_root()
    require_local_daemon(ROOT, require_existing=True)
    cfg=config()

    if not (ROOT/'secrets/grafana_admin_password').exists():
        raise SystemExit('Run bootstrap first')

    # Never auto-start through an outstanding quarantine.
    for p in (ROOT/'state/quarantine').glob('*.json'):
        if json.loads(p.read_text()).get('active'):
            raise SystemExit(
                'Outstanding quarantine: investigate and explicitly '
                'unquarantine before boot startup'
            )

    # Verify the owned containment table and every expected chain.
    require_guard(cfg)

    # Packet evidence must already be active at startup. This is a startup
    # gate only; the tested Phase-B unit does not BindsTo=PCAP.
    if run(
        ['systemctl','is-active','--quiet','honeypot-pcap.service'],
        check=False
    ).returncode != 0:
        raise SystemExit('PCAP service is not active; refusing decoy startup')

    # Automatic boot is deliberately loopback-only.
    for key in ('MANAGEMENT_BIND','DECOY_BIND'):
        try:
            addr=ipaddress.ip_address(cfg[key])
        except ValueError:
            raise SystemExit(f'{key} is not a valid IP address')
        if not addr.is_loopback:
            raise SystemExit(
                f'{key}={cfg[key]} is not loopback; automatic boot startup '
                'refuses non-loopback exposure'
            )

    compose('config','--quiet')

    # Existing containers only. Validate their actual runtime configuration
    # before they are allowed to start.
    expected_dns = {'honeypot-'+name:address for name,address in DNS.items()}

    for name, required_dns in expected_dns.items():
        result=run(['docker','inspect',name],check=False)
        if result.returncode != 0:
            raise SystemExit(
                f'{name} does not exist; refusing automatic creation/rebuild'
            )

        row=json.loads(result.stdout)[0]
        hostcfg=row.get('HostConfig') or {}

        # Reject 0.0.0.0, ::, empty HostIp, or any other non-loopback bind.
        bindings=hostcfg.get('PortBindings') or {}
        for container_port, entries in bindings.items():
            for entry in entries or []:
                host_ip=entry.get('HostIp','')
                try:
                    loopback=bool(host_ip) and ipaddress.ip_address(
                        host_ip
                    ).is_loopback
                except ValueError:
                    loopback=False

                if not loopback:
                    raise SystemExit(
                        f'{name} {container_port} has unsafe HostIp '
                        f'{host_ip!r}; refusing startup'
                    )

        # Preserve the validated DNS-blackhole configuration.
        dns=hostcfg.get('Dns') or []
        if dns != [required_dns]:
            raise SystemExit(
                f'{name} missing expected DNS blackhole {required_dns}; '
                f'actual DNS={dns!r}'
            )

    try:
        _start_existing_decoys(cfg)
    except (Exception, SystemExit):
        compose('stop','cowrie','opencanary',check=False)
        raise

def _start_existing_decoys(cfg):
    # Start existing decoys only. No build, pull, create, or recreate.
    result=compose('start','cowrie','opencanary',check=False)

    if result.returncode != 0:
        compose('stop','cowrie','opencanary',check=False)
        raise SystemExit(
            'Decoy startup failed; both decoys were stopped fail-closed'
        )

    # Require both containers to become healthy.
    names=('honeypot-cowrie','honeypot-opencanary')
    deadline=time.time()+90

    while time.time() < deadline:
        healthy=True

        for name in names:
            row=json.loads(
                run(['docker','inspect',name]).stdout
            )[0]

            state=row.get('State') or {}
            running=bool(state.get('Running'))
            health=(state.get('Health') or {}).get('Status')

            if not running or health != 'healthy':
                healthy=False
                break

        if healthy:
            require_guard(cfg)
            print(
                'Boot decoy startup PASS: existing containers healthy; '
                'no build/recreate performed.'
            )
            return

        time.sleep(2)

    compose('stop','cowrie','opencanary',check=False)
    raise SystemExit(
        'Decoys failed health deadline; stopped fail-closed'
    )

@audited('stop')
def stop(): compose('stop')
def status():
    from hp import status as summary
    return summary()
def update():
    require_root()
    if '--apply' not in sys.argv:raise SystemExit('Review pinned image/package versions and release notes first. --apply performs backup, stops stack, pulls/builds, validates and restarts.')
    require_local_daemon(ROOT, require_existing=True)
    import grafana_backup
    ids=compose('ps','--all','--quiet','grafana').stdout.split()
    if len(ids)!=1 or len(ids[0])!=64 or any(c not in '0123456789abcdef' for c in ids[0]):
        raise ValueError('Expected one Grafana container; update has not begun')
    current=json.loads(run(['docker','inspect',ids[0]]).stdout)
    if len(current)!=1 or current[0].get('Id')!=ids[0]:
        raise ValueError('Grafana inspection ambiguous; update has not begun')
    identity=grafana_backup.container_identity(ROOT,current[0])
    run(['bash','scripts/backup.sh'],timeout=1200)
    stop()
    before=json.loads(run(['docker','inspect',ids[0]]).stdout)
    if len(before)!=1 or grafana_backup.stopped_identity(ROOT,before[0])!=identity:
        raise ValueError('Grafana identity changed or did not stop; update remains stopped')
    snapshot=grafana_backup.create_backup(ROOT,before[0])
    after=json.loads(run(['docker','inspect',ids[0]]).stdout)
    if len(after)!=1 or grafana_backup.stopped_identity(ROOT,after[0])!=identity:
        raise ValueError('Grafana identity/state changed during backup; update remains stopped')
    print('Verified private Grafana state backup: '+str(snapshot)+'; restore acceptance NOT TESTED')
    compose('pull','--ignore-buildable');compose('build','--pull')
    run(['bash','scripts/validate.sh'],timeout=1200);start()
    # Docker's content digests form the deployment lock; retain old images for rollback.
    atomic_json(ROOT/'state/images.lock.json',json.loads(run(['docker','image','inspect',*['honeypot-opencanary:0.9.10-local','honeypot-suricata:ubuntu24.04-local','honeypot-incidentd:v1-local',config()['COWRIE_IMAGE'],config()['LOKI_IMAGE'],config()['GRAFANA_IMAGE'],config()['ALLOY_IMAGE']]]).stdout))

if __name__=='__main__':
    os.umask(0o027)
    actions={'preflight':preflight,'bootstrap':bootstrap,'secrets':secrets_generate,'install':install,'start':start,'boot-start':boot_start,'stop':stop,'status':status,'update':update}
    if len(sys.argv)<2 or sys.argv[1] not in actions:raise SystemExit('Choose '+', '.join(actions))
    try: raise SystemExit(actions[sys.argv[1]]() or 0)
    except (ValueError,subprocess.CalledProcessError,OSError) as exc: raise SystemExit(str(exc))
