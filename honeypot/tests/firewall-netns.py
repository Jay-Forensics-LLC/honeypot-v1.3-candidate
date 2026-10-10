#!/usr/bin/env python3
"""Target-only isolated namespace integration test. No physical uplink is attached."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from hp_common import atomic_json, require_root, utc
from firewall import render
from guard_policy import evaluate

def cmd(*args,check=True):return subprocess.run(list(args),check=check,text=True,capture_output=True,timeout=15)
def record(name,ok,detail):atomic_json(ROOT/'state/test-results'/f'{name}.json',{'status':'PASS' if ok else 'FAIL','epoch':time.time(),'timestamp':utc(),'detail':detail})

def source_fidelity_netns():
    """Peer-IP surrogate. Direct veth keeps the attacker address; a proxy hop does not."""
    from wan_criteria import source_fidelity_ok
    left,right=[f'hp-fid-{os.getpid()}-{name}' for name in ('a','b')]
    created=[]
    try:
        for ns in (left,right):
            cmd('ip','netns','add',ns);created.append(ns);cmd('ip','-n',ns,'link','set','lo','up')
        cmd('ip','-n',left,'link','add','veth0','type','veth','peer','name','veth0','netns',right)
        cmd('ip','-n',left,'addr','add','203.0.113.10/24','dev','veth0');cmd('ip','-n',left,'link','set','veth0','up')
        cmd('ip','-n',right,'addr','add','203.0.113.1/24','dev','veth0');cmd('ip','-n',right,'link','set','veth0','up')
        direct='''import socket
s=socket.socket();s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);s.bind(("0.0.0.0",18081));s.listen(1)
c,addr=s.accept();print(addr[0]);c.close()'''
        proxy='''import socket
def once(port):
    s=socket.socket();s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);s.bind(("0.0.0.0",port));s.listen(1)
    c,addr=s.accept();
    upstream=socket.create_connection(("203.0.113.10",18082),2);upstream.close();c.close();print(addr[0])
once(18083)'''
        sink='''import socket
s=socket.socket();s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);s.bind(("0.0.0.0",18082));s.listen(1)
c,addr=s.accept();print(addr[0]);c.close()'''
        sink_proc=subprocess.Popen(['ip','netns','exec',left,sys.executable,'-c',sink],stdout=subprocess.PIPE,text=True)
        direct_proc=subprocess.Popen(['ip','netns','exec',right,sys.executable,'-c',direct],stdout=subprocess.PIPE,text=True)
        time.sleep(0.4)
        cmd('ip','netns','exec',left,sys.executable,'-c','import socket;s=socket.create_connection(("203.0.113.1",18081),2);s.close()')
        direct_peer=direct_proc.stdout.readline().strip()
        proxy_proc=subprocess.Popen(['ip','netns','exec',right,sys.executable,'-c',proxy],stdout=subprocess.PIPE,text=True)
        time.sleep(0.4)
        cmd('ip','netns','exec',left,sys.executable,'-c','import socket;s=socket.create_connection(("203.0.113.1",18083),2);s.close()')
        proxy_proc.stdout.readline()
        rewritten=sink_proc.stdout.readline().strip()
        kept=source_fidelity_ok(direct_peer,'203.0.113.10')
        detected=not source_fidelity_ok(rewritten,'203.0.113.10')
        if not (kept and detected):
            return False,f'direct={direct_peer} rewritten={rewritten}'
        return True,'direct peer preserved attacker address; proxy hop was rejected by the fidelity check'
    finally:
        for ns in reversed(created):cmd('ip','netns','delete',ns,check=False)

if __name__=='__main__':
    require_root();os.umask(0o027)
    a,b,c=[f'hp-test-{os.getpid()}-{x}' for x in 'abc'];created=[];servers=[]
    try:
        for ns in (a,b,c):cmd('ip','netns','add',ns);created.append(ns);cmd('ip','-n',ns,'link','set','lo','up')
        cmd('ip','-n',a,'link','add','br-hp-cowrie','type','veth','peer','name','peer0','netns',b)
        cmd('ip','-n',a,'link','add','uplink','type','veth','peer','name','peer0','netns',c)
        for ns,dev,addr in [(a,'br-hp-cowrie','172.29.40.1/24'),(b,'peer0','172.29.40.2/24'),(a,'uplink','192.168.56.1/24'),(c,'peer0','192.168.56.2/24')]:
            cmd('ip','-n',ns,'addr','add',addr,'dev',dev);cmd('ip','-n',ns,'link','set',dev,'up')
        cmd('ip','-n',b,'route','add','default','via','172.29.40.1');cmd('ip','-n',c,'route','add','172.29.40.0/24','via','192.168.56.1')
        cmd('ip','netns','exec',a,'sysctl','-q','-w','net.ipv4.ip_forward=1')
        for ns,addr in [(c,'192.168.56.2'),(a,'172.29.40.1'),(b,'172.29.40.2')]:
            code=f'import socket,time; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1); s.bind(({addr!r},18080)); s.listen(20); time.sleep(60)'
            servers.append(subprocess.Popen(['ip','netns','exec',ns,sys.executable,'-c',code],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL))
        time.sleep(1)
        def connect(ns,ip):return cmd('ip','netns','exec',ns,sys.executable,'-c',f'import socket; s=socket.create_connection(({ip!r},18080),1);s.close()',check=False).returncode==0
        if not connect(b,'192.168.56.2'):raise RuntimeError('Isolated baseline connectivity failed')
        from firewall import verdict_only
        policy=render({'PROTECTED_SUBNET':'192.168.56.0/24'})
        variant='full'
        with tempfile.NamedTemporaryFile(mode='w',suffix='.nft',delete=False) as f:
            f.write(policy);path=f.name
        try:
            loaded=cmd('ip','netns','exec',a,'nft','-f',path,check=False)
            if loaded.returncode:
                if 'limit rate' in loaded.stderr or 'log prefix' in loaded.stderr:
                    variant='verdict-only'
                    Path(path).write_text(verdict_only(policy))
                    cmd('ip','netns','exec',a,'nft','-f',path)
                else:
                    raise subprocess.CalledProcessError(loaded.returncode, loaded.args, loaded.stdout, loaded.stderr)
        finally:os.unlink(path)
        live=json.loads(cmd('ip','netns','exec',a,'nft','-j','list','table','inet','hp_guard').stdout)
        semantics=evaluate(live,{'PROTECTED_SUBNET':'192.168.56.0/24'})
        if not semantics['ok']: raise RuntimeError('Live nft JSON differs ('+variant+'): '+json.dumps(semantics))
        semantics['policy_variant']=variant
        isolation=not connect(b,'192.168.56.2') and not connect(b,'172.29.40.1') and connect(c,'172.29.40.2')
        record('firewall_isolation',isolation,'variant='+variant+'; protected/host blocked; inbound decoy reply permitted')
        cmd('ip','netns','exec',a,'nft','delete','table','inet','hp_guard')
        absent=cmd('ip','netns','exec',a,'nft','-j','list','table','inet','hp_guard',check=False)
        if absent.returncode==0: raise RuntimeError('Owned table deletion not observed')
        if evaluate({'nftables':[]},{'PROTECTED_SUBNET':'192.168.56.0/24'})['ok']: raise RuntimeError('Absent table accepted')
        rollback=connect(b,'192.168.56.2');record('firewall_rollback',rollback,'Deleting owned table restored isolated test connectivity')
        if not isolation or not rollback:raise RuntimeError('Firewall behavior failed')
        try:
            fidelity_ok,fidelity_detail=source_fidelity_netns()
        except Exception as exc:
            fidelity_ok,fidelity_detail=False,str(exc)
        atomic_json(ROOT/'state/test-results/wan_source_fidelity.json',{'status':'PASS' if fidelity_ok else 'FAIL','epoch':time.time(),'timestamp':utc(),'detail':fidelity_detail,'scope':'netns','live':bool(fidelity_ok)})
        print(('PASS' if fidelity_ok else 'FAIL')+' netns source-fidelity surrogate: '+fidelity_detail)
        print('PASS isolated containment and rollback; no physical interface or host routing modified')
    except Exception as exc:
        record('firewall_isolation',False,str(exc));record('firewall_rollback',False,'Test incomplete');raise
    finally:
        for proc in servers:proc.terminate();proc.wait(timeout=5)
        for ns in reversed(created):cmd('ip','netns','delete',ns,check=False)
