#!/usr/bin/env python3
"""Hash stable regular payloads. Metadata is append-only; contents never executed."""
import argparse
import json
import os
from pathlib import Path
import time
from hp_common import ROOT, append_json, runtime_path, sha256, utc

def _scan(root=None, specific=None):
    root = Path(root or runtime_path('ARTIFACT_PATH', 'artifacts')).resolve()
    root.mkdir(parents=True, exist_ok=True)
    manifest = root / 'sha256-manifest.jsonl'
    seen = set()
    unchanged = set()
    if manifest.exists():
        with manifest.open(encoding='utf-8') as stream:
            for line in stream:
                try:
                    r=json.loads(line); seen.add((r['evidence_path'], r['sha256']))
                    unchanged.add((r['evidence_path'],r.get('file_size'),r.get('mtime_ns'),r.get('ctime_ns')))
                except (ValueError, KeyError):
                    # A truncated record is visible for review, never silently overwritten.
                    continue
    candidates = [Path(specific)] if specific else root.rglob('*')
    results=[]
    for p in candidates:
        try:
            if p.is_symlink() or not p.is_file() or p == manifest or p.name=='.hash-lock': continue
            rel = p.resolve().relative_to(root).as_posix()
            if not specific and time.time() - p.stat().st_mtime < 5: continue
            st=p.stat()
            if (rel,st.st_size,st.st_mtime_ns,st.st_ctime_ns) in unchanged:continue
            digest, size = sha256(p)
            if (rel,digest) in seen: continue
            row={'timestamp':utc(),'sha256':digest,'file_size':size,'original_filename':p.name,'evidence_path':rel,'mtime_ns':st.st_mtime_ns,'ctime_ns':st.st_ctime_ns}
            append_json(manifest,row); results.append(row); seen.add((rel,digest))
        except (OSError,ValueError):
            continue
    return results

def scan(root=None,specific=None):
    directory=Path(root or runtime_path('ARTIFACT_PATH','artifacts'))
    directory.mkdir(parents=True,exist_ok=True)
    with (directory/'.hash-lock').open('a') as lock:
        if os.name=='posix':
            import fcntl
            fcntl.flock(lock.fileno(),fcntl.LOCK_EX)
        return _scan(directory,specific)

if __name__ == '__main__':
    os.umask(0o027)
    ap=argparse.ArgumentParser(); ap.add_argument('path',nargs='?'); ap.add_argument('--root')
    args=ap.parse_args()
    if args.path:
        p=Path(args.path)
        if p.is_symlink() or not p.is_file(): raise SystemExit('Not a regular evidence file')
        p.resolve().relative_to(Path(args.root or runtime_path('ARTIFACT_PATH','artifacts')).resolve())
    for row in scan(args.root,args.path): print(json.dumps(row))
