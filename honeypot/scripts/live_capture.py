"""Read-only capture gates and bounded packet proof for the localhost FTP demo."""
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
from hp_common import config, runtime_path, sha256


def capture_segments(directory):
    """Unlike Path.glob, preserve permission errors instead of an empty inventory."""
    paths=[]
    with os.scandir(directory) as entries:
        for entry in entries:
            if entry.name.startswith('ring_') and entry.name.endswith('.pcapng'):
                paths.append(Path(entry.path))
                if len(paths)>5000:raise ValueError('Capture inventory exceeds bound')
    return paths


def readiness(root, now=None):
    now=time.time() if now is None else now
    row={'ok':False,'problems':[],'continuity':'UNKNOWN'}
    try:
        cfg=config(root); dest=runtime_path('PCAP_PATH','captures',root)
        row['directory']=str(dest)
        if dest.is_symlink() or not dest.is_dir(): raise ValueError('Capture directory absent or symlink')
        usage=shutil.disk_usage(dest)
        row['disk']={'total':usage.total,'used':usage.used,'free':usage.free,
                     'high_percent':int(cfg['DISK_HIGH_PERCENT']),
                     'critical_percent':int(cfg['DISK_CRITICAL_PERCENT'])}
        if not 0<int(cfg['DISK_HIGH_PERCENT'])<int(cfg['DISK_CRITICAL_PERCENT'])<=100:
            raise ValueError('Invalid disk watermarks')
        if usage.used/usage.total*100>=int(cfg['DISK_HIGH_PERCENT']) or usage.free<256*1024**2:
            raise ValueError('Insufficient capture disk headroom')
        workspace=shutil.disk_usage(root)
        if workspace.used/workspace.total*100>=int(cfg['DISK_HIGH_PERCENT']) or workspace.free<256*1024**2:
            raise ValueError('Insufficient workspace headroom for packet snapshot')
        if not os.access(dest,os.W_OK): raise ValueError('Capture directory not writable to inspection identity')
        paths=capture_segments(dest)
        if not paths or len(paths)>5000: raise ValueError('Capture ring absent or inventory exceeds bound')
        segments=[]
        for path in paths:
            if path.is_symlink() or not path.is_file(): raise ValueError('Nonregular capture segment')
            stat=path.stat()
            segments.append({'path':str(path),'size':stat.st_size,'mtime_epoch':stat.st_mtime})
        row['recent_segments']=sorted(segments,key=lambda x:x['mtime_epoch'],reverse=True)[:3]
        age=now-row['recent_segments'][0]['mtime_epoch'];row['newest_age_seconds']=age
        if age < -5 or age>360 or not any(s['size']>0 for s in row['recent_segments']):
            raise ValueError('Capture output missing, stale or future-dated')
        if not shutil.which('tshark'): raise ValueError('tshark required for packet proof; no traffic permitted')
        row['ok']=True
    except (OSError,ValueError,KeyError) as exc:
        row['problems'].append(str(exc))
    return row


def packet_proof(root, folder, marker, target_ip, started, runner=subprocess.run, candidate_paths=None,
                 protocol='ftp'):
    """Snapshot finite prefixes, inspect offline, retain only a matching snapshot.

    Marker is a tool-generated username, never a captured command/filter string.
    No live capture, sockets, service changes or source evidence writes occur.
    """
    import ipaddress
    if not re.fullmatch(r'honeytrace-demo-[a-zA-Z0-9-]+',marker): raise ValueError('Invalid synthetic marker')
    choices={'ftp':('172.29.41.0/24',2121,'USER '),
             'ssh_banner':('172.29.40.0/24',2222,'SSH-2.0-')}
    if protocol not in choices: raise ValueError('Unsupported controlled packet protocol')
    subnet,port,prefix=choices[protocol]
    address=ipaddress.ip_address(target_ip)
    if address not in ipaddress.ip_network(subnet): raise ValueError('Target outside expected decoy subnet')
    dest=runtime_path('PCAP_PATH','captures',root)
    inventory=capture_segments(dest)
    if len(inventory)>5000: raise ValueError('Capture inventory exceeds bound')
    paths=sorted(inventory,key=lambda p:p.stat().st_mtime,reverse=True)[:3]
    if candidate_paths is not None:
        paths=list(dict.fromkeys(Path(p) for p in candidate_paths))
        if len(paths)>8:raise ValueError('Diagnostic segment budget exceeded')
        if any(p.parent.resolve()!=dest.resolve() for p in paths):raise ValueError('Diagnostic path outside capture directory')
    inspections=[]
    budget=128*1024**2
    for path in paths:
        if path.is_symlink() or not path.is_file(): raise ValueError('Nonregular capture segment')
        size=path.stat().st_size
        entry={'path':str(path),'size':size,'mtime_epoch':path.stat().st_mtime};inspections.append(entry)
        if (candidate_paths is None and path.stat().st_mtime<started) or size==0:
            entry['status']='SKIPPED: predates interaction or empty';continue
        if size>64*1024**2 or size>budget: raise ValueError('Packet proof snapshot budget exceeded')
        budget-=size
        snapshot=folder/'capture-match.pcapng'
        matched=False;created=False
        try:
            with path.open('rb') as source, snapshot.open('xb') as out:
                created=True
                os.chmod(snapshot,0o600)
                remaining=size
                while remaining:
                    chunk=source.read(min(1024**2,remaining))
                    if not chunk: raise ValueError('Capture rotated during snapshot')
                    out.write(chunk);remaining-=len(chunk)
            payload=(prefix+marker).encode().hex(':')
            query=f'ip.dst == {address} && tcp.dstport == {port} && frame.time_epoch >= {started:.6f} && tcp contains {payload}'
            # Ubuntu's tshark profile permits owner files in /tmp, but not
            # arbitrary workspace captures. Keep evidence here and parse an
            # identical private disposable copy; never relax AppArmor or modes.
            with tempfile.TemporaryDirectory(prefix='honeytrace-packet-',dir='/tmp') as scratch:
                parser_input=Path(scratch)/'input.pcapng'
                shutil.copyfile(snapshot,parser_input)
                parser_input.chmod(0o600)
                if sha256(parser_input)!=sha256(snapshot):
                    raise ValueError('Parser input differs from retained snapshot')
                result=runner(['tshark','-n','-r',str(parser_input),'-Y',query,'-T','fields',
                               '-e','frame.time_epoch','-e','ip.dst','-e','tcp.dstport'],
                              capture_output=True,text=True,timeout=15,check=False)
            entry['parser_exit']=result.returncode
            entry['status']='PARSED_NO_MARKER' if result.returncode==0 else 'PARSER_FAILED'
            if result.returncode:entry['parser_error']=(getattr(result,'stderr','') or '')[-600:]
            if result.returncode==0:
                for line in result.stdout.splitlines():
                    values=line.split('\t')
                    if len(values)==3 and float(values[0])>=started and values[1]==str(address) and values[2]==str(port):
                        digest,length=sha256(snapshot)
                        matched=True
                        entry['status']='MATCHED_MARKER'
                        return {'ok':True,'packet_epoch':float(values[0]),'target_ip':str(address),
                                'target_port':port,'demo_run_id':marker,'snapshot':str(snapshot),
                                'sha256':digest,'bytes':length,'source_segment':str(path),
                                'inspections':inspections,
                                'continuity':'UNKNOWN; this proves only the demo marker packet'}
        finally:
            # Retain a matching snapshot only; never delete the source segment.
            if created and not matched and snapshot.exists(): snapshot.unlink()
    return {'ok':False,'reason':'Matching complete packet snapshot not yet available','inspections':inspections}
