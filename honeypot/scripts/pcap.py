#!/usr/bin/env python3
"""Run dumpcap with an explicit finite ring, restricted permissions and no payload execution."""
import os
from pathlib import Path
import re
import shutil
from hp_common import ROOT, config, runtime_path, require_root

if __name__=='__main__':
    require_root();os.umask(0o027);cfg=config()
    raw_interfaces=cfg.get('PCAP_INTERFACES',cfg['HONEYPOT_INTERFACE'])
    interfaces=[x.strip() for x in raw_interfaces.split(',') if x.strip()]
    if not interfaces:
        raise SystemExit('Set PCAP_INTERFACES or HONEYPOT_INTERFACE')
    for interface in interfaces:
        if not re.fullmatch(r'[A-Za-z0-9_.:-]{1,32}',interface) or not (Path('/sys/class/net')/interface).exists():
            raise SystemExit('Capture interface missing or invalid: '+interface)
    size=int(cfg['PCAP_SIZE_MB']);count=int(cfg['PCAP_FILE_COUNT'])
    if not 1<=size<=1000 or not 2<=count<=5000 or size*count>150000: raise SystemExit('PCAP budget must be <=150000 MB with at least two files')
    dest=runtime_path('PCAP_PATH','captures');dest.mkdir(parents=True,exist_ok=True)
    if shutil.disk_usage(dest).used/shutil.disk_usage(dest).total*100>=int(cfg['DISK_CRITICAL_PERCENT']): raise SystemExit('Critical disk watermark: refusing capture')
    cmd=['dumpcap','-q','-g']
    for interface in interfaces:
        cmd.extend(['-i',interface])
    cmd.extend(['-s','0','-b',f'filesize:{size*1000}','-b',f'files:{count}','-b','duration:300','-w',str(dest/'ring.pcapng')])
    # dumpcap adds monotonically numbered, timestamped names. No arbitrary shell filter.
    os.execvp(cmd[0],cmd)
