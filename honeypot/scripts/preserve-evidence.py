#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path
from hp_common import ROOT, atomic_json, runtime_path, utc
from incidentd import Engine

if __name__=='__main__':
    os.umask(0o027)
    ap=argparse.ArgumentParser();ap.add_argument('incident_directory');a=ap.parse_args()
    base=runtime_path('INCIDENT_PATH','incidents').resolve();p=Path(a.incident_directory).resolve();p.relative_to(base)
    incident=json.loads((p/'incident.json').read_text())
    if incident['severity'] not in ('HIGH','CRITICAL'):raise SystemExit('Only HIGH/CRITICAL incidents preserve PCAP by this tool')
    # Stop incidentd briefly before an operator snapshot to avoid concurrent report updates.
    from hp_common import run
    status=run(['docker','inspect','-f','{{.State.Running}}','honeypot-incidentd'],check=False)
    if status.returncode==0 and status.stdout.strip()=='true':raise SystemExit('Stop incidentd briefly before operator preservation; restart after snapshot')
    meta=json.loads((p/'metadata.json').read_text());meta['pcap_snapshotted']=False;atomic_json(p/'metadata.json',meta)
    engine=Engine()
    engine.preserve(p,incident,{'sha256':''});atomic_json(p/'incident.json',incident)
    print('Closed-segment snapshot updated; review metadata.json for gaps and budget limits.')
