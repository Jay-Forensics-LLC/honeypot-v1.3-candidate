"""Bounded-cardinality health fields shared by the CLI and health report."""
import datetime as dt
import json
import re
import time
from hp_common import ROOT

def source_paths(root=ROOT):
    text=(root/'configs/alloy/config.alloy').read_text()
    return {source: root/path.lstrip('/') for path,source in
            re.findall(r'"__path__"\s*=\s*"([^"]+)"[^\n]*"source"\s*=\s*"([^"]+)"',text)}

def snapshot(root=ROOT, now=None):
    now=time.time() if now is None else now
    sources={}
    for name,path in source_paths(root).items():
        sources[name]={'last_write_age':max(0,round(now-path.stat().st_mtime,3)) if path.exists() else None,
                       'present':path.exists()}
    count=0
    for path in (root/'logs/system').glob('parser-errors.jsonl*'):
        with path.open(encoding='utf-8',errors='replace') as f:
            for line in f:
                try:
                    row=json.loads(line)
                    epoch=dt.datetime.fromisoformat(row['timestamp'].replace('Z','+00:00')).timestamp()
                    if 0 <= now-epoch <= 3600: count+=1
                except (ValueError,KeyError,TypeError): continue
    return sources,count

def drop_rate(previous, current, now):
    old=previous.get('suricata_kernel_drops')
    elapsed=now-previous.get('checked_epoch',now)
    if not isinstance(old,(int,float)) or not isinstance(current,(int,float)) or elapsed<=0 or current<old:
        return None
    return (current-old)/elapsed
