#!/usr/bin/env python3
"""Opt-in host timer processes fixed-format CRITICAL evidence requests."""
import json
import os
from hp_common import ROOT, config, require_root, atomic_json, audit, runtime_path, utc
from quarantine import quarantine

if __name__=='__main__':
    os.umask(0o027);require_root()
    if config().get('AUTO_CONTAINMENT')!='true': raise SystemExit(0)
    for request in (ROOT/'state/incidentd/requests').glob('*.json'):
        receipt=ROOT/'state/containment-receipts'/request.name
        if receipt.exists(): continue
        r=json.loads(request.read_text())
        evidence=runtime_path('INCIDENT_PATH','incidents').resolve()
        path=(evidence/r['path']).resolve();path.relative_to(evidence)
        incident=json.loads((path/'incident.json').read_text())
        if r.get('action')!='quarantine-decoys' or incident.get('severity')!='CRITICAL': continue
        if not all((path/f).exists() for f in ('events.jsonl','incident.md','metadata.json')): continue
        for name in ('honeypot-cowrie','honeypot-opencanary'): quarantine(name)
        action={'timestamp':utc(),'action':'quarantined both decoys after evidence preservation','reversible':True}
        incident['containment_actions'].append(action)
        atomic_json(path/'incident.json',incident);atomic_json(receipt,action)
        audit('automatic.critical',success=True)
