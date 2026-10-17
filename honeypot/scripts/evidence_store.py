"""Single-writer durable incident evidence. Corruption is never repaired here."""
import json
import os
from pathlib import Path
from hp_common import atomic_json

class EvidenceIntegrityError(RuntimeError):
    pass

def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)

def records(path, limit=32*1024*1024):
    path=Path(path)
    if not path.exists(): return {}
    if path.is_symlink(): raise EvidenceIntegrityError(f'Symlink evidence: {path}')
    result={}
    with path.open('rb') as f:
        while True:
            offset=f.tell(); line=f.readline(limit+1)
            if not line: break
            try:
                if len(line)>limit or not line.endswith(b'\n') or b'\0' in line: raise ValueError('Incomplete, oversized or NUL record')
                row=json.loads(line); eid=row['event_id']
                if not isinstance(eid,str) or not eid or eid in result: raise ValueError('Invalid or duplicate event ID')
                if row['normalized']['event_id']!=eid: raise ValueError('Normalized identity mismatch')
                result[eid]=row
            except (ValueError,KeyError,TypeError) as exc:
                raise EvidenceIntegrityError(f'Evidence integrity failure: {path} offset {offset}: {exc}') from exc
    return result

def append(path,row,limit=32*1024*1024):
    path=Path(path); existing=records(path,limit)
    if row['event_id'] in existing:
        if existing[row['event_id']]!=row: raise EvidenceIntegrityError('Replay content differs')
        # A prior complete write may have failed fsync. Re-sync before commit.
        fd=os.open(path,os.O_RDONLY | os.O_NOFOLLOW)
        try: os.fsync(fd)
        finally: os.close(fd)
        return False
    data=(json.dumps(row,ensure_ascii=True,separators=(',',':'))+'\n').encode()
    if len(data)>limit: raise EvidenceIntegrityError('Evidence record exceeds bound')
    new=not path.exists()
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_APPEND|os.O_NOFOLLOW,0o640)
    try:
        view=memoryview(data)
        while view:
            count=os.write(fd,view)
            if count<=0: raise OSError('Evidence short write')
            view=view[count:]
        os.fsync(fd)
    finally: os.close(fd)
    if new: sync_directory(path.parent)
    return True

def commit(path,data):
    atomic_json(path,data)
    sync_directory(Path(path).parent)
