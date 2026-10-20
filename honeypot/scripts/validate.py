#!/usr/bin/env python3
"""Portable static validation; dependency absence is explicitly NOT TESTED."""
import argparse
import ast
import collections
import configparser
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from hp_common import ROOT, utc

REQUIRED_DOCS=['ARCHITECTURE.md','CHANGELOG.md','ASSET_INVENTORY.md','NETWORK_MAP.md','DETECTION_RULES.md','INCIDENT_LOG.md','TODO.md','README.md','SECURITY.md','DEPLOYMENT.md','RECOVERY.md','STORAGE.md','docs/FIRST_BOOT.md','docs/OPERATOR_MODEL.md','docs/HARDENING_VALIDATION.md','docs/LAB_ACCEPTANCE.md','docs/WAN_CRITERIA.md','verification/PRODUCTION_READINESS.md']
REQUIRED_SCRIPTS=['apply-containment.sh','remove-containment.sh','show-containment.sh','test-firewall-config.sh','incidentd.py','start-pcap.sh','hash-artifact.sh','hash-artifacts.py','quarantine-container.sh','unquarantine-container.sh','block-source.sh','unblock-source.sh','healthcheck.sh','healthcheck.py','backup.sh','restore-check.sh','preflight.sh','install-dependencies.sh','bootstrap.sh','validate.sh','start.sh','stop.sh','status.sh','update.sh','readiness-check.sh','hp.py','hp.sh','guard_policy.py','guard_watch.py','ops.py','firewall.py','target-validate.py','target-validate.sh','wan_criteria.py','bait.py','intel_pack.py','alert_bus.py']

def validate(runtime=False):
    results=[]
    def add(name,status,detail):
        results.append({'check':name,'status':status,'detail':str(detail)});print(f'{status:10} {name}: {str(detail)[:250]}')
    def attempt(name,fn):
        try:detail=fn();add(name,'PASS',detail)
        except Exception as exc:add(name,'FAIL',str(exc))
    def require(condition,detail):
        if not condition:raise ValueError(detail)
        return detail
    files=[p for p in ROOT.rglob('*') if p.is_file() and not any(x in p.relative_to(ROOT).parts for x in ('state','secrets','work','__pycache__'))]
    attempt('Required deliverables',lambda:require(all((ROOT/x).is_file() for x in REQUIRED_DOCS+['docker-compose.yml','.env.example','.gitignore','Makefile']+['scripts/'+x for x in REQUIRED_SCRIPTS]),'All required source/docs/scripts present'))
    def json_check():
        paths=[p for p in files if p.suffix=='.json' or p.name=='opencanary.conf']
        for p in paths:json.loads(p.read_text())
        return f'{len(paths)} JSON documents parsed'
    attempt('JSON syntax',json_check)
    yaml_available=importlib.util.find_spec('yaml') is not None
    if yaml_available:
        def yaml_check():
            import yaml
            paths=[p for p in files if p.suffix in ('.yaml','.yml')]
            for p in paths:list(yaml.safe_load_all(p.read_text()))
            return f'{len(paths)} YAML documents parsed'
        attempt('YAML syntax',yaml_check)
        def compose_safety():
            import yaml
            c=yaml.safe_load((ROOT/'docker-compose.yml').read_text())
            for name,s in c['services'].items():
                if s.get('privileged'):raise ValueError(name+' privileged')
                if any('docker.sock' in str(v) for v in s.get('volumes',[])):raise ValueError('Docker socket mounted')
                require(s.get('restart')=='no',name+' requires supervised startup without automatic restart')
            require(not c['services']['loki'].get('ports'),'Loki internal')
            for name in ('cowrie','opencanary'):
                require(all(c['networks'][n]['internal'] is False for n in c['services'][name]['networks']),'Non-internal decoy bridge; hp_guard required')
                from guard_policy import DNS
                require(c['services'][name]['dns']==[DNS[name]],'Expected DNS blackhole only')
                require(all('127.0.0.1' in x for x in c['services'][name]['ports']),'Loopback defaults')
            require(c['networks']['observability']['internal'] is True,'Observability stays internal')
            return 'No privileged containers or socket mounts; separate non-internal decoy bridges; DNS blackholes; loopback defaults; no published Loki'
        attempt('Compose safety invariants',compose_safety)
        def mount_check():
            import yaml
            c=yaml.safe_load((ROOT/'docker-compose.yml').read_text());missing=[]
            for s in c['services'].values():
                for m in s.get('volumes',[]):
                    src=m.split(':')[0]
                    if src.startswith('./configs/') or src.startswith('./detections/') or src=='./dashboards':
                        if not (ROOT/src).exists():missing.append(src)
                if s.get('build') and not (ROOT/s['build']['dockerfile']).exists():missing.append(s['build']['dockerfile'])
            return require(not missing,'All static bind mounts and Dockerfile paths resolve: '+str(missing))
        attempt('Compose relative paths',mount_check)
    else:add('YAML syntax','NOT TESTED','PyYAML unavailable; install python3-yaml on target')
    def py_check():
        paths=[p for p in files if p.suffix=='.py']
        for p in paths:compile(p.read_text(encoding='utf-8'),str(p),'exec')
        return f'{len(paths)} Python files compiled without writing pycache'
    attempt('Python compilation',py_check)
    def cfg_check():
        parser=configparser.ConfigParser(interpolation=None);parser.read(ROOT/'configs/cowrie/cowrie.cfg')
        require(parser.get('ssh','forwarding')=='false','Forwarding disabled')
        return 'Cowrie INI parsed; protocol forwarding disabled'
    attempt('Cowrie INI syntax',cfg_check)
    def duplicate():
        paths=[p.relative_to(ROOT).as_posix().casefold() for p in files]
        return require(len(paths)==len(set(paths)),'No case-insensitive duplicate relative paths; repeated basenames in different config directories are intentional')
    attempt('Duplicate paths',duplicate)
    def links():
        missing=[]
        for p in files:
            if p.suffix!='.md':continue
            for link in re.findall(r'\]\(([^)]+)\)',p.read_text()):
                if '://' in link or link.startswith('#'):continue
                target=link.split('#')[0]
                if target and not (p.parent/target).exists():missing.append(str(p.relative_to(ROOT))+': '+link)
        return require(not missing,'Markdown relative links resolve; '+str(missing))
    attempt('Documentation relative links',links)
    def wrappers():
        for p in (ROOT/'scripts').glob('*.sh'):
            for script in re.findall(r'\$ROOT/scripts/([\w.-]+)',p.read_text()):require((ROOT/'scripts'/script).exists(),'Missing script '+script)
        return 'Shell wrapper Python references resolve'
    attempt('Script references',wrappers)
    def clean():
        prohibited=[]
        for p in files:
            if p.suffix in ('.key','.pem','.pcap','.pcapng') or p.name=='.env':prohibited.append(str(p.relative_to(ROOT)))
            if p.suffix in ('.py','.md','.yml','.yaml','.conf','.cfg','.sh','.txt','.json'):
                if re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',p.read_text(errors='ignore')):prohibited.append(str(p.relative_to(ROOT)))
        return require(not prohibited,'No private key blocks, packaged .env, or capture files: '+str(prohibited))
    attempt('Build secret and evidence scan',clean)
    bash=shutil.which('bash')
    if bash:
        def shells():
            paths=list((ROOT/'scripts').glob('*.sh'))
            for p in paths:subprocess.run([bash,'-n',str(p)],check=True,capture_output=True,text=True)
            return f'bash -n passed for {len(paths)} scripts'
        attempt('Bash syntax',shells)
    else:add('Bash syntax','NOT TESTED','bash executable unavailable on build host; required on Ubuntu')
    if importlib.util.find_spec('yara'):
        def yara_check():
            import yara
            yara.compile(filepath=str(ROOT/'detections/yara/suspicious-artifacts.yar'));return 'Compiled with libyara via yara-python'
        attempt('YARA syntax',yara_check)
    elif shutil.which('yara'):
        def yara_cli():
            r=subprocess.run(['yara',str(ROOT/'detections/yara/suspicious-artifacts.yar'),str(ROOT/'README.md')],capture_output=True,text=True)
            return require(r.returncode==0,r.stderr or 'YARA compiled and scanned benign README')
        attempt('YARA syntax',yara_cli)
    else:add('YARA syntax','NOT TESTED','Neither yara nor yara-python installed')
    def unit():
        r=subprocess.run([sys.executable,'-B','-m','unittest','discover','-s',str(ROOT/'tests'),'-v'],capture_output=True,text=True)
        require(r.returncode==0,r.stderr);return r.stderr.strip()
    attempt('Behavioral unit tests',unit)
    for name,exe,args in [('Docker Compose validation','docker',['docker','compose','config','--quiet']),('Suricata config validation','suricata',['suricata','-T','-c',str(ROOT/'configs/suricata/suricata.yaml'),'-S',str(ROOT/'detections/suricata/local.rules')]),('Alloy configuration validation','alloy',['alloy','validate',str(ROOT/'configs/alloy/config.alloy')])]:
        if not shutil.which(exe):add(name,'NOT TESTED',exe+' unavailable on build host; target validation required')
        else:
            def execute(args=args):
                r=subprocess.run(args,cwd=ROOT,capture_output=True,text=True,timeout=120);return require(r.returncode==0,r.stdout+r.stderr or 'Native validator succeeded')
            attempt(name,execute)
    if os.name=='nt':add('POSIX executable permissions','NOT TESTED','Windows ACLs are not Unix mode bits; packager sets and verifies Unix 0755 on scripts in ZIP; target ownership must be checked after extraction')
    else:attempt('POSIX executable permissions',lambda:require(all(os.access(p,os.X_OK) for p in (ROOT/'scripts').glob('*.sh')),'All shell entrypoints executable'))
    if runtime:
        for name,args in [('Local integration',['python3','tests/local-integration.py']),('PCAP ring integration',['python3','tests/pcap-ring.py']),('Firewall namespace integration',['python3','tests/firewall-netns.py'])]:
            def execute(args=args):
                r=subprocess.run(args,cwd=ROOT,capture_output=True,text=True,timeout=300);return require(r.returncode==0,r.stdout+r.stderr)
            attempt(name,execute)
    else:add('Ubuntu live integration','NOT TESTED','Build-only execution; no daemon, network listener, capture, or firewall action started')
    return results

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--runtime',action='store_true');ap.add_argument('--write-report',action='store_true');args=ap.parse_args()
    results=validate(args.runtime);counts=collections.Counter(r['status'] for r in results)
    print(json.dumps(dict(counts)))
    if args.write_report:
        text='# Validation report\n\nGenerated '+utc()+'\n\n'+'; '.join(f'{k}: {counts[k]}' for k in ['PASS','FAIL','NOT TESTED'])+'\n\n'
        text+='Each row is one validation category; behavioral tests are reported within their category. Dependency absence never counts as PASS.\n\n'
        for r in results:text+='## '+r['status']+' — '+r['check']+'\n\n'+r['detail']+'\n\n'
        (ROOT/'docs/VALIDATION_REPORT.md').write_text(text,encoding='utf-8')
        (ROOT/'docs/validation-results.json').write_text(json.dumps({'timestamp':utc(),'counts':dict(counts),'results':results},indent=2))
    raise SystemExit(1 if counts['FAIL'] else 0)
