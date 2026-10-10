#!/usr/bin/env python3
"""Read only this project's kernel deny records, with a persistent journal cursor."""
import json
import os
from hp_common import ROOT, append_json, atomic_json, run, utc

if __name__=='__main__':
    os.umask(0o027)
    state=ROOT/'state/firewall-journal.json'
    args=['journalctl','-k','-o','json','--no-pager']
    if state.exists(): args+=['--after-cursor',json.loads(state.read_text())['cursor']]
    else: args+=['--since','-5min']
    p=run(args,check=False)
    if p.returncode:
        append_json(ROOT/'logs/system/parser-errors.jsonl',{'timestamp':utc(),'source':'journal','error':'cursor unavailable; journal may have rotated'},rotate=True)
        raise SystemExit(p.stderr)
    cursor=None
    for line in p.stdout.splitlines():
        r=json.loads(line);cursor=r.get('__CURSOR',cursor);message=r.get('MESSAGE','')
        if isinstance(message,str) and any(x in message for x in ('HP_EGRESS_DENY','HP_PROTECTED_DENY','HP_HOST_DENY')):
            append_json(ROOT/'logs/firewall/events.jsonl',{'timestamp':utc(),'MESSAGE':message,'journal_cursor':cursor},rotate=True)
    if cursor: atomic_json(state,{'cursor':cursor})
