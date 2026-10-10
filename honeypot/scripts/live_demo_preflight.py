"""Inspection only: no HTTP probes, synthetic traffic or runtime mutation."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import uuid
from hp_common import atomic_json, utc
from runtime_inventory import collect
from live_capture import readiness

SOURCE=Path(__file__).resolve().parents[1]


def inspect(root):
    row={'timestamp':utc(),'traffic_generated':False,'runtime_mutated':False,
         'stage7':'BLOCKED','stage8':'BLOCKED','reboot_capture_continuity':'UNKNOWN'}
    row['runtime']=collect(root,SOURCE,probe_readiness=False)
    row['capture_resources']=readiness(root)
    row['diagnostics']=[]
    for argv in ([ 'systemctl','show','honeypot-pcap.service',
                   '-p','ActiveState','-p','SubState','-p','MainPID','-p','Result',
                   '-p','ExecMainStatus','-p','ExecMainStartTimestamp','-p','UnitFileState',
                   '-p','ActiveEnterTimestamp','-p','InactiveEnterTimestamp'],
                 ['systemctl','cat','honeypot-pcap.service'],
                 ['journalctl','-b','-u','honeypot-pcap.service','--utc','--no-pager','-n','80'],
                 ['journalctl','--list-boots','--utc','--no-pager'],
                 ['journalctl','-b','-1','-u','honeypot-pcap.service','--utc','--no-pager','-n','80']):
        try:
            result=subprocess.run(argv,capture_output=True,text=True,timeout=15,check=False)
            row['diagnostics'].append({'argv':argv,'exit':result.returncode,'stdout':result.stdout,'stderr':result.stderr})
        except (OSError,subprocess.SubprocessError) as exc:
            row['diagnostics'].append({'argv':argv,'error':str(exc)})
    row['start_provenance']='UNKNOWN: service timestamps/enabled state alone do not identify start requester'
    row['stopped_cause']='UNKNOWN: inspect service result/journal and disk watermarks; no recovery requested'
    row['ok']=row['runtime']['ok'] and row['capture_resources']['ok']
    row['status']='READY_FOR_REVIEW' if row['ok'] else 'BLOCKED'
    return row


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime-root',type=Path,required=True)
    args=parser.parse_args();os.umask(0o077)
    row=inspect(args.runtime_root.resolve())
    folder=SOURCE/'work/live-qualification'
    path=folder/('live-demo-preflight-'+uuid.uuid4().hex[:12]+'.json')
    atomic_json(path,row)
    print(json.dumps(row,indent=2));print('REPORT: '+str(path))
    return 0 if row['ok'] else 1


if __name__=='__main__': raise SystemExit(main())
