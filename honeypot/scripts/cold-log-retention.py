#!/usr/bin/env python3
"""Explicit live-raw-log retention. No recursion and no forensic evidence deletion."""
import gzip
import json
import os
from pathlib import Path
import re
import shutil
import time
from hp_common import ROOT, config, require_root, append_json, utc
if __name__=='__main__':
    require_root();os.umask(0o027)
    policy=json.loads((ROOT/'configs/logrotate/cowrie-cold-policy.json').read_text())
    base=ROOT/'logs/cowrie';days=int(config()['LOG_RETENTION_DAYS'])
    if not 1<=days<=90:raise SystemExit('Retention must be 1..90 days')
    for p in base.iterdir():
        if p.is_symlink() or not p.is_file() or not re.fullmatch(policy['filename_pattern'],p.name):continue
        age=(time.time()-p.stat().st_mtime)/86400
        if age>days:
            # This is normal, explicitly scoped live log rotation, never incident evidence.
            p.unlink();action='expired'
        elif age>1 and p.suffix!='.gz':
            dest=p.with_name(p.name+'.gz')
            if dest.exists():continue
            before=p.stat()
            with p.open('rb') as a,dest.open('xb') as out:
                with gzip.GzipFile(fileobj=out,mode='wb') as b:shutil.copyfileobj(a,b)
            if p.stat().st_size!=before.st_size or p.stat().st_mtime_ns!=before.st_mtime_ns:
                # Preserve both copies for review on a race; never remove a changing source.
                action='changed_during_compression'
            else:
                os.utime(dest,(before.st_atime,before.st_mtime));p.unlink();action='compressed'
        else:continue
        append_json(ROOT/'logs/system/retention.jsonl',{'timestamp':utc(),'action':action,'path':str(p),'scope':'expired live raw logs only'},rotate=True)
