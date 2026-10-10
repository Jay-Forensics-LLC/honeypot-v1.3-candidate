"""Explicit one-time PCAP start for a verified local demo; no boot-policy changes."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import uuid
from hp_common import atomic_json, config, runtime_path, sha256, utc
from runtime_inventory import collect
from live_capture import readiness
from capture_status import inspect_capture

SOURCE=Path(__file__).resolve().parents[1]
ONLY_BLOCKER='PCAP identity/interface verification failed'

# Capture state is deliberately absent; every field here must remain invariant.
SECURITY_FIELDS=('boot_id','runtime_root','containers','networks','network_fingerprint',
                 'compose_hash','rendered_config_hash','config_hash','mounted_config_hashes',
                 'deployed_source_hashes','candidate_source_hashes','guard_fingerprint','wan_enabled')


def security_projection(observed):
    missing=[key for key in SECURITY_FIELDS if key not in observed]
    if missing:raise ValueError('Incomplete runtime security inventory: '+', '.join(missing))
    def ordered(rows,key):
        # Docker may change presentation order; names/destinations and values stay strict.
        if len({row[key] for row in rows})!=len(rows):raise ValueError('Duplicate inventory identity')
        return {row[key]:row for row in rows}
    projected={key:observed[key] for key in SECURITY_FIELDS}
    projected['containers']={name:{**container,'mounts':ordered(container['mounts'],'Destination')}
                             for name,container in observed['containers'].items()}
    projected['networks']=ordered(observed['networks'],'Name')
    guard=observed['guard']
    # The collector fingerprint carries the ordered live rules without counters.
    projected['guard']={key:guard[key] for key in ('ok','problems','observed','expected')}
    return projected


def differences(before,after,path=''):
    if isinstance(before,dict) and isinstance(after,dict):
        result=[]
        for key in sorted(set(before)|set(after)):
            field=path+'.'+key if path else key
            if key not in before or key not in after:
                result.append({'field':field,'before':before.get(key),'after':after.get(key)})
            else:result.extend(differences(before[key],after[key],field))
        return result
    if before!=after:return [{'field':path,'before':before,'after':after}]
    return []


def compare_runtime(before,after,starting=False):
    """Separate a verified PCAP start from strict runtime security invariants."""
    changes=[{**change,'classification':'UNEXPECTED_RUNTIME_DRIFT'}
             for change in differences(security_projection(before),security_projection(after))]
    prior=before.get('capture',{});current=after.get('capture',{})
    capture_before={k:v for k,v in prior.items() if k not in ('timestamp','problems')}
    capture_after={k:v for k,v in current.items() if k not in ('timestamp','problems')}
    valid_start=(starting and prior.get('ok') is False and
                 prior.get('service',{}).get('ActiveState')=='inactive' and
                 prior.get('service',{}).get('SubState')=='dead' and
                 prior.get('service',{}).get('MainPID')=='0' and
                 current.get('ok') is True and
                 current.get('service',{}).get('ActiveState')=='active' and
                 current.get('service',{}).get('SubState')=='running' and
                 current.get('service',{}).get('Result')=='success' and
                 current.get('pid',0)>0 and current.get('start_ticks',0)>0 and
                 str(current['pid'])==current['service'].get('MainPID'))
    allowed={'capture.ok','capture.service.ActiveState','capture.service.SubState',
             'capture.service.MainPID','capture.pid','capture.start_ticks','capture.start_epoch',
             'capture.argv','capture.interfaces','capture.capture_directory'}
    changes.extend({**change,'classification':'EXPECTED_PCAP_TRANSITION'
                    if valid_start and change['field'] in allowed else 'UNEXPECTED_RUNTIME_DRIFT'}
                   for change in differences(capture_before,capture_after,'capture'))
    if starting and not valid_start:
        changes.append({'field':'capture.lifecycle','classification':'UNEXPECTED_RUNTIME_DRIFT',
                        'before':'inactive/dead required','after':'verified running capture required'})
    # Optional packet inventory is observational; it never substitutes for process/resource gates.
    changes.extend({**change,'classification':'EXPECTED_PCAP_TRANSITION'} for change in
                   differences(before.get('capture_segments',[]),after.get('capture_segments',[]),'capture_segments'))
    return {'ok':not any(c['classification']=='UNEXPECTED_RUNTIME_DRIFT' for c in changes),
            'differences':changes,'security_fields_checked':list(SECURITY_FIELDS)+['guard']}


def command(argv):
    return subprocess.run(argv,capture_output=True,text=True,check=True,timeout=20)


def storage_gate(root):
    cfg=config(root);dest=runtime_path('PCAP_PATH','captures',root)
    high=int(cfg['DISK_HIGH_PERCENT']);critical=int(cfg['DISK_CRITICAL_PERCENT'])
    if not 0<high<critical<=100:raise ValueError('Invalid disk watermarks')
    for path in (root,dest):
        if path.is_symlink() or not path.is_dir():raise ValueError('Storage directory absent or symlink')
        usage=shutil.disk_usage(path)
        if usage.used/usage.total*100>=high or usage.free<256*1024**2:
            raise ValueError('Disk headroom insufficient; capture start refused')
    if not os.access(dest,os.W_OK):raise ValueError('Capture directory not writable')
    if not shutil.which('dumpcap') or not shutil.which('tshark'):
        raise ValueError('dumpcap/tshark unavailable')
    if cfg.get('PCAP_INTERFACES')!='br-hp-cowrie,br-hp-canary':
        raise ValueError('Unexpected capture interfaces')
    for name in ('br-hp-cowrie','br-hp-canary'):
        if not (Path('/sys/class/net')/name).exists():raise ValueError('Capture bridge missing: '+name)
    size=int(cfg['PCAP_SIZE_MB']);count=int(cfg['PCAP_FILE_COUNT'])
    if not 1<=size<=1000 or not 2<=count<=5000 or size*count>150000:
        raise ValueError('Capture ring budget invalid')


def check_start_gate(observed,service):
    if observed.get('problems')!=[ONLY_BLOCKER]:
        raise ValueError('PCAP must be the sole runtime blocker; no start permitted')
    if observed.get('guard',{}).get('ok') is not True or observed.get('wan_enabled') is not False:
        raise ValueError('Current containment/WAN state unverified')
    if (service.get('ActiveState'),service.get('SubState'),service.get('MainPID'),
        service.get('Result'),service.get('ExecMainStatus'))!=('inactive','dead','0','success','0'):
        raise ValueError('Service is active, failed or unexpected; no restart permitted')
    if service.get('ExecMainStartTimestamp') or service.get('ActiveEnterTimestamp'):
        raise ValueError('Service has current-boot activation history; investigate stop cause first')


def recover(root,start=False):
    root=Path(root).resolve()
    row={'timestamp':utc(),'status':'BLOCKED','start_requested':start,'service_started':False,
         'traffic_generated':False,'boot_policy_changed':False,'stage7':'BLOCKED','stage8':'BLOCKED',
         'historical_capture_gap':'UNKNOWN'}
    try:
        before=collect(root,SOURCE,probe_readiness=False);row['runtime_before']=before
        text=command(['systemctl','show','honeypot-pcap.service',
                      '-p','ActiveState','-p','SubState','-p','MainPID','-p','Result',
                      '-p','ExecMainStatus','-p','ExecMainStartTimestamp','-p','ActiveEnterTimestamp',
                      '-p','ExecStart','-p','FragmentPath','-p','DropInPaths']).stdout
        service=dict(line.split('=',1) for line in text.splitlines() if '=' in line)
        row['service_before']=service
        already_active=(service.get('ActiveState')=='active' and service.get('SubState')=='running')
        if already_active:
            if not before.get('ok') or before.get('problems'):
                raise ValueError('Active capture runtime safety verification failed')
            if service.get('Result')!='success' or service.get('MainPID')!=str(before.get('capture',{}).get('pid')):
                raise ValueError('Active service identity differs from inspected capture process')
            row['classification']='ALREADY_ACTIVE; validation only, no start or restart'
        else:check_start_gate(before,service)
        security_projection(before)
        if service.get('FragmentPath')!='/etc/systemd/system/honeypot-pcap.service' or service.get('DropInPaths'):
            raise ValueError('Unexpected PCAP unit location or overrides')
        loaded=service.get('ExecStart','')
        if loaded.count('argv[]=')!=1 or 'argv[]=/usr/bin/python3 '+str(root/'scripts/pcap.py')+' ;' not in loaded:
            raise ValueError('Loaded PCAP command differs from reviewed command')
        expected=(SOURCE/'systemd/honeypot-pcap.service.in').read_text().replace('@ROOT@',str(root)).replace('@PCAP@',str(runtime_path('PCAP_PATH','captures',root))).replace('@EVIDENCE_GROUP@','honeypot-evidence')
        actual=command(['systemctl','cat','honeypot-pcap.service']).stdout
        clean=lambda value:'\n'.join(line.strip() for line in value.splitlines() if line.strip() and not line.lstrip().startswith('#'))
        if clean(actual)!=clean(expected):raise ValueError('PCAP unit differs from reviewed source')
        hashes={}
        for name in ('pcap.py','hp_common.py'):
            deployed=sha256(root/'scripts'/name)[0];candidate=sha256(SOURCE/'scripts'/name)[0]
            if deployed!=candidate:raise ValueError('Deployed capture source differs: '+name)
            hashes[name]=deployed
        row['capture_source_hashes']=hashes
        if not already_active:
            journal=command(['journalctl','-b','-u','honeypot-pcap.service','-o','json','--no-pager','-n','80']).stdout.strip()
            if journal not in ('','-- No entries --'):
                raise ValueError('Current boot has PCAP journal activity; investigate before recovery')
        storage_gate(root)
        if not already_active:row['classification']='NO_RECORDED_CURRENT_BOOT_START; static unit requires explicit activation'
        if not already_active and not start:
            row['status']='READY_FOR_EXPLICIT_START';return row
        if not already_active:
            if os.geteuid()!=0:raise PermissionError('Operator root required for explicit PCAP start')
            row['start_attempted']=True
            command(['systemctl','start','honeypot-pcap.service']);row['service_started']=True
        # Wait only for capture headers/process readiness; generate no packets.
        for attempt in range(10):
            capture=inspect_capture(root);resources=readiness(root)
            row['capture_after']=capture;row['capture_resources']=resources
            if capture.get('ok') and resources.get('ok'):
                after=collect(root,SOURCE,probe_readiness=False);row['runtime_after']=after
                if not after.get('ok'):raise ValueError('Runtime post-start safety verification failed')
                row['runtime_comparison']=compare_runtime(before,after,starting=not already_active)
                if not row['runtime_comparison']['ok']:
                    fields=[change['field'] for change in row['runtime_comparison']['differences']
                            if change['classification']=='UNEXPECTED_RUNTIME_DRIFT']
                    raise ValueError('Unexpected runtime drift: '+', '.join(fields)+'; do not run demo')
                row['status']='CAPTURE_READY_FOR_DEMO';return row
            if attempt<9:time.sleep(1)
        raise ValueError('Capture post-start verification failed; inspect report, no automatic restart')
    except (OSError,ValueError,KeyError,TypeError,subprocess.SubprocessError) as exc:
        row['error']=str(exc)
    return row


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime-root',type=Path,required=True)
    parser.add_argument('--start',action='store_true',help='Explicitly start only the gated inactive PCAP unit once')
    args=parser.parse_args();os.umask(0o077)
    row=recover(args.runtime_root,args.start)
    path=SOURCE/'work/live-qualification'/('pcap-demo-recovery-'+uuid.uuid4().hex[:12]+'.json')
    atomic_json(path,row);print(json.dumps(row,indent=2));print('REPORT: '+str(path))
    return 0 if row['status'] in ('READY_FOR_EXPLICIT_START','CAPTURE_READY_FOR_DEMO') else 1


if __name__=='__main__':raise SystemExit(main())
