#!/usr/bin/env python3
"""Host-side reversible isolation. Only exact decoy names are allowed."""
import argparse
import json
import os
from pathlib import Path
import re
from hp_common import ROOT, atomic_json, audit, require_root, run, utc, runtime_path
from daemon_check import require_local_daemon
from runtime_inventory import STATIC_MOUNTS, tmpfs_options


def owned_decoy_id(info, name):
    service = name.removeprefix('honeypot-')
    labels = info.get('Config', {}).get('Labels') or {}
    root = Path(ROOT).resolve()
    cid = info.get('Id', '')
    if (not re.fullmatch('[0-9a-f]{64}', cid) or
            labels.get('com.docker.compose.project') != 'honeypot' or
            labels.get('com.docker.compose.service') != service or
            labels.get('com.docker.compose.project.working_dir') != str(root)):
        raise ValueError('Decoy identity or runtime ownership differs')
    expected = {target: (root/relative, False) for target, relative in STATIC_MOUNTS[service].items()}
    if service == 'cowrie':
        expected.update({'/cowrie/cowrie-git/var/lib/cowrie': (root/'state/cowrie', True),
                         '/cowrie/cowrie-git/var/log/cowrie': (root/'logs/cowrie', True),
                         '/evidence': (runtime_path('ARTIFACT_PATH', 'artifacts', root)/'cowrie', True)})
    else:
        expected['/logs'] = (root/'logs/opencanary', True)
    mounts = info.get('Mounts', [])
    actual = {mount.get('Destination'): mount for mount in mounts}
    if len(actual) != len(mounts): raise ValueError('Ambiguous decoy mounts')
    for target, (source, writable) in expected.items():
        observed = actual.get(target, {})
        if (source.resolve() != source.absolute() or observed.get('Type') != 'bind' or
                observed.get('Source') != str(source) or observed.get('RW') is not writable):
            raise ValueError('Decoy runtime bind differs: ' + target)
    allowed = set(expected)
    # Account for the entire inventory before pause/log collection or unpause.
    # Cowrie's reviewed image owns only these two additional local volumes.
    declared = set(info.get('Config', {}).get('Volumes') or {})
    known = {'/cowrie/cowrie-git/etc', '/cowrie/cowrie-git/var'} if service == 'cowrie' else set()
    if declared - known:
        raise ValueError('Unexpected decoy image-declared volume')
    for target in declared:
        mount = actual.get(target, {})
        volume = mount.get('Name', '')
        if (type(volume) is not str or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*', volume) or
                mount.get('Type') != 'volume' or mount.get('Driver') != 'local' or
                mount.get('Source') != '/var/lib/docker/volumes/'+volume+'/_data' or
                mount.get('RW') is not True):
            raise ValueError('Invalid decoy image volume: ' + target)
        allowed.add(target)
    tmpfs = info.get('HostConfig', {}).get('Tmpfs') or {}
    reviewed_tmpfs = {'/tmp': 'rw,nosuid,nodev,noexec,size=128m,mode=1777'}
    if tmpfs_options(tmpfs) != tmpfs_options(reviewed_tmpfs):
        raise ValueError('Decoy tmpfs differs from reviewed policy')
    allowed.update(tmpfs)
    if ('/tmp' in actual and actual['/tmp'].get('Type') != 'tmpfs'):
        raise ValueError('Decoy tmpfs replaced by another mount type')
    if set(actual) - allowed or any('docker.sock' in str(mount) for mount in mounts):
        raise ValueError('Unexpected decoy mount')
    return cid

def _quarantine(name,undo=False):
    require_root()
    if name not in ('honeypot-cowrie','honeypot-opencanary'): raise ValueError('Only dedicated decoys may be quarantined')
    require_local_daemon(ROOT)
    info=json.loads(run(['docker','inspect',name]).stdout)[0]
    cid=owned_decoy_id(info,name)
    if undo:
        from guard_policy import require_guard
        require_guard()
    record=ROOT/'state/quarantine'/f'{name}.json'
    if undo:
        if info['State'].get('Paused'): run(['docker','unpause',cid])
    else:
        # Save metadata/logs BEFORE pausing. No Docker socket is exposed to a decoy.
        p=ROOT/'incidents/quarantine'/utc().replace(':','-')/name;p.mkdir(parents=True,exist_ok=True)
        atomic_json(p/'container.json',info)
        (p/'docker.log').write_text(run(['docker','logs','--tail','2000',cid],check=False).stdout)
        if info['State'].get('Running') and not info['State'].get('Paused'): run(['docker','pause',cid])
    atomic_json(record,{'active':not undo,'timestamp':utc(),'container':name,'container_id':cid})
def quarantine(name,undo=False):
    success=False
    try:
        result=_quarantine(name,undo);success=True;return result
    finally:
        audit('container.unquarantine' if undo else 'container.quarantine',
              container=name if name in ('honeypot-cowrie','honeypot-opencanary') else 'invalid',success=success)

if __name__=='__main__':
    os.umask(0o027)
    ap=argparse.ArgumentParser();ap.add_argument('name');ap.add_argument('--undo',action='store_true')
    a=ap.parse_args();quarantine(a.name,a.undo)
