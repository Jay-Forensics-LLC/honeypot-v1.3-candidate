#!/usr/bin/env python3
"""Metadata backup, safe archive verification; restoration never overwrites live data."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import tarfile
from hp_common import ROOT, runtime_path, sha256, utc, config, atomic_json, audit

def _backup(copy_evidence=False):
    directory=ROOT/'backups';directory.mkdir(exist_ok=True)
    stamp=utc().replace(':','-');dest=directory/f'honeypot-{stamp}.tar.gz'
    base=['configs','detections','dashboards','scripts','systemd','docker','docker-compose.yml','.env.example']
    files=[]
    for name in base:
        p=ROOT/name
        files.extend([p] if p.is_file() else (x for x in p.rglob('*') if x.is_file() and not x.is_symlink()))
    files.extend(ROOT.glob('*.md'))
    incidents=runtime_path('INCIDENT_PATH','incidents');artifact=runtime_path('ARTIFACT_PATH','artifacts')/'sha256-manifest.jsonl'
    # Metadata only; no .env, secrets, PCAP or sample bytes in this archive.
    with tarfile.open(dest,'x:gz',dereference=False) as tar:
        for p in sorted(set(files)):tar.add(p,arcname='honeypot/'+p.relative_to(ROOT).as_posix(),recursive=False)
        if artifact.exists():tar.add(artifact,arcname='honeypot/artifacts/sha256-manifest.jsonl',recursive=False)
        for name in ('incident.json','incident.md','metadata.json','hashes.txt'):
            for p in incidents.rglob(name):
                if not p.is_symlink():tar.add(p,arcname='honeypot/incidents/'+p.relative_to(incidents).as_posix(),recursive=False)
    digest,_=sha256(dest);dest.with_name(dest.name+'.sha256').write_text(digest+'  '+dest.name+'\n')
    if copy_evidence:
        target=Path(config().get('SECONDARY_EVIDENCE_PATH',''))
        if not target.is_absolute() or not target.is_dir() or not os.path.ismount(target):raise SystemExit('SECONDARY_EVIDENCE_PATH must be an existing separate mountpoint')
        for p in incidents.rglob('incident.json'):
            r=json.loads(p.read_text())
            if r.get('severity') not in ('HIGH','CRITICAL'):continue
            out=target/'honeypot-evidence'/stamp/p.parent.relative_to(incidents)
            # A fresh timestamped destination never overwrites a previous backup.
            for src in p.parent.rglob('*'):
                if src.is_symlink():raise SystemExit('Symlink in evidence; review before backup')
                if src.is_file():
                    dst=out/src.relative_to(p.parent);dst.parent.mkdir(parents=True,exist_ok=True)
                    with src.open('rb') as a,dst.open('xb') as b:shutil.copyfileobj(a,b)
                    if sha256(src)[0]!=sha256(dst)[0]:raise SystemExit('Evidence copy hash mismatch')
            manifest={x.relative_to(out).as_posix():sha256(x)[0] for x in out.rglob('*') if x.is_file()}
            atomic_json(out/'backup-checksums.json',manifest)
    print(dest);return dest

def backup(copy_evidence=False):
    flags=['--copy-evidence'] if copy_evidence else []
    audit('backup.start',success=True,approval_flags=flags)
    success=False
    try:
        result=_backup(copy_evidence);success=True;return result
    finally: audit('backup.finish',success=success,approval_flags=flags)

def verify(path):
    path=Path(path);expected=path.with_name(path.name+'.sha256').read_text().split()[0]
    if sha256(path)[0]!=expected:raise ValueError('Backup checksum mismatch')
    names=set()
    with tarfile.open(path,'r:gz') as tar:
        for m in tar:
            p=PurePosixPath(m.name)
            if p.is_absolute() or '..' in p.parts or m.issym() or m.islnk() or m.isdev():raise ValueError('Unsafe member: '+m.name)
            if m.name in names:raise ValueError('Duplicate member')
            names.add(m.name)
            if m.isfile():
                f=tar.extractfile(m)
                for _ in iter(lambda:f.read(1024**2),b''):pass
    if 'honeypot/docker-compose.yml' not in names:raise ValueError('Incomplete backup')
    print('PASS checksum, archive read, members and traversal safety. No live files restored.')

if __name__=='__main__':
    os.umask(0o027);ap=argparse.ArgumentParser();ap.add_argument('--verify');ap.add_argument('--copy-evidence',action='store_true');args=ap.parse_args()
    verify(args.verify) if args.verify else backup(args.copy_evidence)
