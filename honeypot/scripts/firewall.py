#!/usr/bin/env python3
"""Generate/apply only hp_guard. Never flush the ruleset or modify host routing."""
import argparse
import ipaddress
import json
import os
from pathlib import Path
import re
import sys
from hp_common import ROOT, config, run, require_root, audit, utc

def addresses(value, version=4):
    result=[]
    for entry in filter(None,value.split(',')):
        addr=ipaddress.ip_address(entry.strip())
        if addr.version!=version: raise ValueError('Approved egress currently supports IPv4 only')
        result.append(str(addr))
    return ', '.join(result)

def render(cfg):
    protected=ipaddress.ip_network(cfg['PROTECTED_SUBNET'],strict=False)
    if protected.version!=4: raise ValueError('PROTECTED_SUBNET must be IPv4; IPv6 is denied from decoys')
    dns=addresses(cfg.get('APPROVED_DNS',''));ntp=addresses(cfg.get('APPROVED_NTP',''))
    updates=addresses(cfg.get('APPROVED_UPDATE_IPS','')) if cfg.get('ENABLE_UPDATE_EGRESS')=='true' else ''
    template=(ROOT/'configs/nftables/hp-guard.nft.in').read_text()
    extra=[]
    if dns: extra += [f'ip daddr {{ {dns} }} udp dport 53 accept',f'ip daddr {{ {dns} }} tcp dport 53 accept']
    if ntp: extra += [f'ip daddr {{ {ntp} }} udp dport 123 accept']
    if updates: extra += [f'ip daddr {{ {updates} }} tcp dport {{ 80, 443 }} accept']
    return template.replace('@PROTECTED@',str(protected)).replace('@APPROVED_EGRESS@','\n        '.join(extra))

def verdict_only(text):
    """Remove logging/rate-limit lines. Verdicts, sets, and hooks stay intact."""
    lines=[line for line in text.splitlines() if 'limit rate' not in line and 'log prefix' not in line]
    return '\n'.join(lines)+('\n' if lines else '')

def classify_nft_error(stderr):
    text=stderr or ''
    if 'No such file or directory' in text and ('limit rate' in text or 'log prefix' in text):
        return 'kernel-missing-log-limit'
    return 'nft-error'

def nft_check(path):
    result=run(['nft','-c','-f',str(path)],check=False)
    if result.returncode:
        return False, classify_nft_error(result.stderr), result.stderr
    return True, 'ok', result.stdout

def existing():
    return run(['nft','list','table','inet','hp_guard'],check=False)

def stop_gate():
    p=run(['docker','ps','--format','{{.Names}}'],check=False)
    if p.returncode: raise SystemExit('Cannot verify decoys stopped; refuse containment removal')
    if any(n in p.stdout.splitlines() for n in ('honeypot-cowrie','honeypot-opencanary')):
        raise SystemExit('Stop decoys before removing/replacing containment: scripts/stop.sh')

def scoped_snapshot(text):
    # A snapshot may contain one owned table, never includes or top-level commands.
    clean=re.sub(r'"(?:\\.|[^"\\])*"|#[^\n]*', ' ', text).strip()
    if not clean: return
    if not re.match(r'^table\s+inet\s+hp_guard\s*\{',clean): raise ValueError('Snapshot must contain only inet hp_guard')
    if re.search(r'\b(include|define|flush|delete|destroy|add|insert|replace|create|import|export)\b',clean): raise ValueError('Commands/includes forbidden in snapshot')
    depth=0
    for i,char in enumerate(clean[clean.index('{'):]):
        if char=='{': depth+=1
        elif char=='}':
            depth-=1
            if depth==0 and clean[clean.index('{')+i+1:].strip(): raise ValueError('Extra snapshot content')
            if depth<0: raise ValueError('Unbalanced snapshot')
    if depth: raise ValueError('Unbalanced snapshot')

def execute(args):
    if args.action=='render': print(render(config()));return
    require_root()
    if args.action=='show': print(existing().stdout);return
    if args.action in ('block','unblock'):
        ip=ipaddress.ip_address(args.value);family='blocked4' if ip.version==4 else 'blocked6'
        if not existing().returncode==0: raise SystemExit('Apply hp_guard first')
        if ip.is_loopback or ip.is_unspecified or ip.is_multicast: raise SystemExit('Refusing local/unspecified/multicast address')
        op='add' if args.action=='block' else 'delete'
        seconds=int(config().get('TEMP_BLOCK_SECONDS',3600))
        if not 60<=seconds<=86400: raise SystemExit('Block duration must be 60..86400 seconds')
        literal=f'{{ {ip} timeout {seconds}s }}' if op=='add' else f'{{ {ip} }}'
        cmd=['nft',op,'element','inet','hp_guard',family,literal]
        print(' '.join(cmd))
        if not args.apply: raise SystemExit('Preview only; add --apply')
        result=run(cmd,check=False)
        if result.returncode:
            acceptable='File exists' if op=='add' else 'No such file'
            if acceptable not in result.stderr: raise SystemExit(result.stderr)
        return
    if args.action in ('remove','rollback'): stop_gate()
    current=existing();old=current.stdout if current.returncode==0 else ''
    if args.action=='remove': content='delete table inet hp_guard\n' if old else ''
    elif args.action=='rollback':
        path=Path(args.value).resolve()
        path.relative_to((ROOT/'backups/firewall').resolve())
        if not path.name.endswith('.hp_guard.nft'): raise SystemExit('Use a scoped .hp_guard.nft snapshot, never full ruleset')
        previous=path.read_text()
        # Snapshot is root-created. Refuse broad ruleset operations even if manually modified.
        scoped_snapshot(previous)
        content=('delete table inet hp_guard\n' if old else '')+previous
    else:
        if old and args.action=='apply': stop_gate()
        content=('delete table inet hp_guard\n' if old else '')+render(config())
    print(content or '# No owned table exists; nothing to remove.')
    if not content: return
    folder=ROOT/'state';folder.mkdir(exist_ok=True)
    target=folder/'containment-preview.nft';target.write_text(content)
    ok,kind,detail=nft_check(target)
    if not ok and kind=='kernel-missing-log-limit':
        verdict=folder/'containment-preview-verdicts.nft'
        verdict.write_text(verdict_only(content))
        vok,_,vdetail=nft_check(verdict)
        if args.action=='test':
            if vok:
                print('NOT TESTED full log/limit expressions: this kernel rejected nft_log/nft_limit')
                print(detail)
                print('PASS verdict-only nft check (drop/accept/jump/sets)')
                return
            raise SystemExit('nft check failed for full policy and verdict-only policy\n'+detail+'\n'+vdetail)
        raise SystemExit('nft kernel rejected log/limit expressions; refuse apply on this host.\n'+detail)
    if not ok:
        raise SystemExit(detail or 'nft check failed')
    if args.action=='test': print('PASS nft syntax and kernel check');return
    if not args.apply: raise SystemExit('Preview and validation complete. Re-run with --apply to change the temporary owned table.')
    stamp=utc().replace(':','').replace('.','-')
    backup=ROOT/'backups/firewall';backup.mkdir(parents=True,exist_ok=True)
    (backup/f'{stamp}.ruleset.nft').write_text(run(['nft','list','ruleset']).stdout)
    (backup/f'{stamp}.hp_guard.nft').write_text(old)
    run(['nft','-f',str(target)])
    print('Applied temporary hp_guard change; unrelated tables untouched. Nothing persisted under /etc/nftables.conf.')

def main():
    ap=argparse.ArgumentParser();ap.add_argument('action',choices=['render','test','apply','remove','show','rollback','block','unblock'])
    ap.add_argument('value',nargs='?');ap.add_argument('--apply',action='store_true');args=ap.parse_args()
    mutation=args.apply and args.action in ('apply','remove','rollback','block','unblock')
    success=False
    try:
        result=execute(args);success=True;return result
    finally:
        if mutation:
            fields={}
            if args.action in ('block','unblock'):
                try: fields['source_ip']=str(ipaddress.ip_address(args.value))
                except (ValueError,TypeError): pass
            audit('firewall.'+args.action,success=success,approval_flags=['--apply'],scope='inet hp_guard',**fields)

if __name__=='__main__':
    os.umask(0o027)
    main()
