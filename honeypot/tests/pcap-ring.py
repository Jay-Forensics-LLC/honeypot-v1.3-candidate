#!/usr/bin/env python3
"""Finite 10-second loopback capture test; never sends outside 127.0.0.1."""
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from hp_common import atomic_json, require_root, utc
if __name__=='__main__':
    require_root();os.umask(0o027);passed=False;detail=''
    try:
        with tempfile.TemporaryDirectory(prefix='hp-ring-') as folder:
            capture=subprocess.Popen(['dumpcap','-q','-i','lo','-b','filesize:100','-b','files:3','-a','duration:10','-w',folder+'/test.pcapng'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
            time.sleep(1)
            with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as s:
                for _ in range(500):s.sendto(b'BENIGN-PCAP-TEST'*100,('127.0.0.1',48999));time.sleep(0.005)
            _,err=capture.communicate(timeout=15);files=list(Path(folder).glob('*.pcapng'))
            passed=capture.returncode==0 and len(files)==3 and sum(p.stat().st_size for p in files)<600000
            detail=f'{len(files)} bounded rotating files; dumpcap exit {capture.returncode}; {err.decode()[-200:]}'
    finally:
        atomic_json(ROOT/'state/test-results/pcap_rotation.json',{'status':'PASS' if passed else 'FAIL','epoch':time.time(),'timestamp':utc(),'detail':detail})
    print(('PASS ' if passed else 'FAIL ')+detail);raise SystemExit(0 if passed else 1)
