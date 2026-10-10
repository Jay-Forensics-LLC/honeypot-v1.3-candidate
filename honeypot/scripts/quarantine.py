#!/usr/bin/env python3
"""Host-side reversible isolation. Only exact decoy names are allowed."""
import argparse
import json
import os
from hp_common import ROOT, atomic_json, audit, require_root, run, utc

def _quarantine(name,undo=False):
    require_root()
    if name not in ('honeypot-cowrie','honeypot-opencanary'): raise ValueError('Only dedicated decoys may be quarantined')
    info=json.loads(run(['docker','inspect',name]).stdout)[0]
    if info['Config'].get('Labels',{}).get('com.docker.compose.project')!='honeypot': raise ValueError('Container is not owned by this project')
    if undo:
        from guard_policy import require_guard
        require_guard()
    record=ROOT/'state/quarantine'/f'{name}.json'
    if undo:
        if info['State'].get('Paused'): run(['docker','unpause',name])
    else:
        # Save metadata/logs BEFORE pausing. No Docker socket is exposed to a decoy.
        p=ROOT/'incidents/quarantine'/utc().replace(':','-')/name;p.mkdir(parents=True,exist_ok=True)
        atomic_json(p/'container.json',info)
        (p/'docker.log').write_text(run(['docker','logs','--tail','2000',name],check=False).stdout)
        if info['State'].get('Running') and not info['State'].get('Paused'): run(['docker','pause',name])
    atomic_json(record,{'active':not undo,'timestamp':utc(),'container':name})
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
