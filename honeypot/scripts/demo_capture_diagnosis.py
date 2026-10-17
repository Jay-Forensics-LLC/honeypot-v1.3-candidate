"""Offline inspection of a prior demo marker; no traffic or runtime changes."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import tempfile
import subprocess
from hp_common import atomic_json, runtime_path, sha256, utc
from live_capture import packet_proof, capture_segments

SOURCE=Path(__file__).resolve().parents[1]


def finding(proof, candidates):
    if proof.get('ok'):
        return 'PACKET_FOUND_IN_RETAINED_SEGMENT'
    if not candidates:
        return 'REQUIRED_SEGMENTS_UNAVAILABLE'
    inspections=proof.get('inspections',[])
    if not inspections or any(v.get('status')!='PARSED_NO_MARKER' for v in inspections):
        return 'ANALYSIS_INCOMPLETE'
    return 'NO_MATCH_IN_AVAILABLE_INSPECTED_SEGMENTS'


def diagnose(report_path,folder):
    report_path=Path(report_path)
    if report_path.is_symlink():raise ValueError('Demo report symlink refused')
    report_path.resolve().relative_to(SOURCE/'work/demo')
    if report_path.stat().st_size>2*1024**2:raise ValueError('Demo report read budget exceeded')
    original=json.loads(report_path.read_text())
    if original.get('mode')!='live' or original.get('synthetic') is not True:
        raise ValueError('Expected a synthetic live-demo report')
    root=Path(original['runtime']['runtime_root'])
    if root!=Path('/home/joe/honeypot-staging/honeypot'):raise ValueError('Unexpected runtime root')
    begin=dt.datetime.fromisoformat(original['timestamp'].replace('Z','+00:00')).timestamp()
    target=original['runtime']['containers']['opencanary']['networks']['honeypot-canary-net']['IPAddress']
    dest=runtime_path('PCAP_PATH','captures',root)
    inventory=capture_segments(dest)
    candidates=[Path(v['path']) for v in original['capture_preflight']['recent_segments'] if Path(v['path']) in inventory]
    if len(inventory)>5000:raise ValueError('Capture inventory exceeds bound')
    candidates.extend(p for p in inventory if begin<=p.stat().st_mtime<=begin+420)
    proof=packet_proof(root,folder,original['demo_run_id'],target,begin,candidate_paths=candidates)
    return {'timestamp':utc(),'status':finding(proof,candidates),
            'original_report':str(report_path),'original_report_sha256':sha256(report_path)[0],
            'demo_run_id':original['demo_run_id'],'packet_proof':proof,'traffic_generated':False,
            'services_changed':False,'original_report_changed':False,'stage7':'BLOCKED','stage8':'BLOCKED',
            'qualification':'Retrospective packet inspection only; does not convert the failed run into PASS_LIVE'}


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--report',type=Path,required=True)
    args=parser.parse_args();os.umask(0o077)
    folder=Path(tempfile.mkdtemp(prefix='capture-diagnosis-',dir=SOURCE/'work/live-qualification'))
    try:row=diagnose(args.report,folder)
    except (OSError,ValueError,KeyError,TypeError,subprocess.SubprocessError) as exc:row={'status':'INSPECTION_FAILED','error':str(exc),'traffic_generated':False}
    path=folder/'report.json';atomic_json(path,row)
    print(json.dumps(row,indent=2));print('REPORT: '+str(path))
    return 0 if row['status']=='PACKET_FOUND_IN_RETAINED_SEGMENT' else 1


if __name__=='__main__':raise SystemExit(main())
