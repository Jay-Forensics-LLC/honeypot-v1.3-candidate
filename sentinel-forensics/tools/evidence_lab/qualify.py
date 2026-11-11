"""Measured two-run Linux capture qualification; real and synthetic gates stay separate."""
from __future__ import annotations
from contextlib import closing
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import resource
import shutil
import signal
import sqlite3
import struct
import subprocess
import sys
import tempfile
import time
from analyze import analyze, config_validate
from core import IngestError, MAX_RECORD, canonical, hash_file, source_file, fingerprint, private_write, atomic_json, VERSION
from capture import MAGICS, NG

GOAL_BYTES = 30_000_000_000  # Description only: actual dataset identity/bytes control acceptance.
MAX_SOURCES = 4096


def generate(path, packets=100000, payload_bytes=1024):
    if packets <= 0 or not 14 <= payload_bytes <= 65535: raise IngestError('invalid_fixture_parameters')
    size = 24+packets*(16+payload_bytes)
    if shutil.disk_usage(path.parent).free < size+64*1024**2: raise IngestError('fixture_space_required')
    payload = b'\0'*12+b'\x88\xb5'+b'F'*(payload_bytes-14)
    with os.fdopen(os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb') as f:
        f.write(b'\xd4\xc3\xb2\xa1'+struct.pack('<HHiiII',2,4,0,0,65535,1))
        for i in range(packets):
            f.write(struct.pack('<IIII',1700000000+i//1000000,i%1000000,len(payload),len(payload))+payload)
    return {'packets':packets,'bytes':size,'synthetic':True}


def generate_cardinality(path, packets=10000):
    """Synthetic distinct TCP conversations, reserved benchmarking address space."""
    if type(packets) is not int or not 1<=packets<=1_000_000:
        raise IngestError('cardinality_fixture_budget')
    if shutil.disk_usage(path.parent).free<packets*12000+1024**3:
        raise IngestError('cardinality_fixture_and_two_run_space_required')
    def checksum(data):
        value=sum(struct.unpack('!10H',data))
        value=(value&65535)+(value>>16); value=(value&65535)+(value>>16)
        return (~value)&65535
    with os.fdopen(os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb') as f:
        f.write(b'\xd4\xc3\xb2\xa1'+struct.pack('<HHiiII',2,4,0,0,65535,1))
        for i in range(packets):
            src=bytes([192,0,2,i%254+1]); dst=(int.from_bytes(bytes([198,18,0,1]),'big')+(i%131070)).to_bytes(4,'big')
            head=struct.pack('!BBHHHBBH4s4s',0x45,0,40,i%65536,0,64,6,0,src,dst)
            head=head[:10]+struct.pack('!H',checksum(head))+head[12:]
            tcp=struct.pack('!HHIIBBHHH',40000+i%20000,443,i,0,0x50,2,65535,0,0)
            payload=bytes.fromhex('0200000000020200000000010800')+head+tcp
            f.write(struct.pack('<IIII',1700000000+i//1000000,i%1000000,len(payload),len(payload))+payload)
    return {'packets':packets,'bytes':24+70*packets,'synthetic':True,'pattern':'high-cardinality'}


def inventory(source):
    source=Path(source)
    if source.is_symlink() or Path(os.path.abspath(source))!=source.resolve(): raise IngestError('source_symlink_rejected')
    paths=[]
    if source.is_dir():
        # Bounded, deterministic recursive segment inventory; no links followed.
        pending=[source]
        while pending:
            current=pending.pop()
            for p in current.iterdir():
                if p.is_symlink(): raise IngestError('segment_symlink_rejected')
                if p.is_dir(): pending.append(p)
                elif p.is_file(): paths.append(p)
                else: raise IngestError('segment_not_regular')
                if len(paths)+len(pending)>MAX_SOURCES: raise IngestError('segment_inventory_budget')
        paths.sort(key=lambda p:p.relative_to(source).as_posix())
    else: paths=[source]
    if not paths: raise IngestError('empty_capture_inventory')
    result=[]
    for i,path in enumerate(paths,1):
        with source_file(path) as (f,st):
            magic=f.read(16)
            kind='pcap' if magic[:4] in MAGICS else 'pcapng' if magic[:4]==NG else 'unsupported'
            result.append({'id':i,'size':st.st_size,'signature_hex':magic.hex(),'kind':kind})
    return paths,result


def semantic_digest(bundle):
    """Canonical ordered private content. Excludes run UUID, clocks of execution and random export key."""
    h=hashlib.sha256()
    with closing(sqlite3.connect((bundle/'index.sqlite').resolve().as_uri()+'?mode=ro',uri=True)) as db:
        tables=db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").fetchall()
        for (name,) in tables:
            if not re.fullmatch('[a-z_]+',name): raise IngestError('unexpected_index_table')
            count=len(db.execute(f'PRAGMA table_info({name})').fetchall())
            order=','.join(str(i) for i in range(1,count+1))
            for row in db.execute(f'SELECT * FROM {name} ORDER BY {order}'):
                h.update(canonical([name,row])+b'\n')
    return h.hexdigest()


def export_digest(bundle):
    h=hashlib.sha256()
    with (bundle/'export/exchange.jsonl').open('rb') as stream:
        for raw in stream:
            obj=json.loads(raw)
            if obj['entity']=='case': obj['payload']['run_id']='VOLATILE'
            h.update(canonical(obj)+b'\n')
    return h.hexdigest()


def verify_bundle(bundle):
    if json.loads((bundle/'state.json').read_bytes()).get('status')!='COMPLETE': raise IngestError('bundle_incomplete')
    seen=set()
    for line in (bundle/'SHA256SUMS').read_text().splitlines():
        sha,name=line.split('  ',1)
        path=bundle/name
        if name in seen or not re.fullmatch('[0-9a-f]{64}',sha) or path.is_symlink() or not path.resolve().is_relative_to(bundle.resolve()) or path.resolve()==bundle.resolve():
            raise IngestError('invalid_checksum_manifest')
        seen.add(name)
        if hash_file(path)!=sha: raise IngestError('bundle_checksum_mismatch')
    actual={p.relative_to(bundle).as_posix() for p in bundle.rglob('*') if p.is_file() and p!=bundle/'SHA256SUMS'}
    if seen!=actual or not {'index.sqlite','manifest.json','state.json','export/exchange.jsonl'}<=seen:
        raise IngestError('bundle_checksum_coverage')


def tree_rss(pid):
    total=0
    pending=[pid]; seen=set()
    while pending and len(seen)<128:
        current=pending.pop()
        if current in seen: continue
        seen.add(current)
        try:
            text=Path(f'/proc/{current}/status').read_text()
            match=re.search(r'^VmRSS:\s+(\d+) kB',text,re.M)
            if match: total+=int(match[1])*1024
            for task in Path(f'/proc/{current}/task').iterdir():
                pending.extend(map(int,(task/'children').read_text().split()))
        except (OSError,ValueError): pass
    return total


def allocated_bytes(root):
    logical=allocated=0
    for base,dirs,files in os.walk(root):
        for name in files:
            try: st=(Path(base)/name).stat()
            except OSError: continue
            logical+=st.st_size; allocated+=st.st_blocks*512
    return logical,allocated


def measured_process(args, *, timeout, scratch):
    start=time.perf_counter(); before=resource.getrusage(resource.RUSAGE_CHILDREN)
    stdout=scratch/'worker.stdout'; stderr=scratch/'worker.stderr'
    scratch.mkdir(mode=0o700)
    peak=parent_peak=disk_peak=0
    fs_before=os.statvfs(scratch).f_bavail*os.statvfs(scratch).f_frsize
    timed_out=False
    try:
        with os.fdopen(os.open(stdout,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600),'wb') as out, os.fdopen(os.open(stderr,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600),'wb') as err:
            proc=subprocess.Popen(args,stdout=out,stderr=err,start_new_session=True,env=dict(os.environ,LC_ALL='C',LANG='C',SQLITE_TMPDIR=str(scratch.resolve())))
            next_disk=0
            while proc.poll() is None:
                now=time.perf_counter()
                peak=max(peak,tree_rss(proc.pid)); parent_peak=max(parent_peak,tree_rss(os.getpid())-tree_rss(proc.pid))
                if now>=next_disk:
                    disk_peak=max(disk_peak,allocated_bytes(scratch.parent)[1]); next_disk=now+1
                if now-start>timeout:
                    timed_out=True
                    os.killpg(proc.pid,signal.SIGTERM)
                    try: proc.wait(timeout=2)
                    except subprocess.TimeoutExpired: os.killpg(proc.pid,signal.SIGKILL); proc.wait()
                    break
                time.sleep(0.05)
            result=proc.wait()
        after=resource.getrusage(resource.RUSAGE_CHILDREN)
        fs_after=os.statvfs(scratch).f_bavail*os.statvfs(scratch).f_frsize
        metrics={'wall_seconds':time.perf_counter()-start,'cpu_user_seconds':after.ru_utime-before.ru_utime,
                 'cpu_system_seconds':after.ru_stime-before.ru_stime,'sampled_worker_tree_peak_rss_bytes':peak,
                 'sampled_parent_peak_rss_bytes':parent_peak,'sampled_case_allocated_peak_bytes':disk_peak,
                 'filesystem_free_decrease_bytes':max(0,fs_before-fs_after),'returncode':result}
        data=stdout.read_bytes() if stdout.stat().st_size<=2*MAX_RECORD else b''
        if timed_out:
            exc=subprocess.TimeoutExpired('local_worker',timeout); exc.metrics=metrics; raise exc
        return result,data,metrics
    except BaseException:
        if 'proc' in locals() and proc.poll() is None:
            os.killpg(proc.pid,signal.SIGTERM)
            try: proc.wait(timeout=2)
            except subprocess.TimeoutExpired: os.killpg(proc.pid,signal.SIGKILL); proc.wait()
        raise
    finally:
        shutil.rmtree(scratch)


def capinfos_count(path, timeout, scratch=None):
    exe=shutil.which('capinfos')
    capinfos_count.last_metrics=None
    if not exe: return None
    if scratch is None:
        with tempfile.TemporaryDirectory() as t:
            return capinfos_count(path,timeout,Path(t)/'decoder')
    code,data,metrics=measured_process([exe,'-c','-M','-K',str(path.resolve())],timeout=timeout,scratch=scratch)
    capinfos_count.last_metrics=metrics
    matches=re.findall(r'^Number of packets:\s*([0-9]+)\s*$',data.decode('utf-8','replace'),re.M)
    if code:
        exc=IngestError('independent_decoder_failed')
        exc.details={'partial_count':int(matches[0]) if len(matches)==1 else None,'metrics':metrics}
        raise exc
    if len(matches)!=1: raise IngestError('independent_decoder_output_unrecognized')
    return int(matches[0])


def worker(paths,output,config,key):
    start=time.perf_counter(); cpu=time.process_time()
    manifest=analyze(paths,output,config=config,pseudonym_key=key)
    per_file=[]
    with closing(sqlite3.connect(output/'index.sqlite')) as db:
        for source in manifest['sources']:
            sid=source['id']
            n=db.execute('SELECT COUNT(*) FROM packet_meta WHERE source_id=?',(sid,)).fetchone()[0]
            unsupported=db.execute("SELECT COUNT(*) FROM packet_meta WHERE source_id=? AND (losses LIKE '%unsupported%' OR losses LIKE '%reassembly%')",(sid,)).fetchone()[0]
            malformed=db.execute("SELECT COUNT(*) FROM packet_meta WHERE source_id=? AND losses!='[]' AND losses NOT LIKE '%unsupported%' AND losses NOT LIKE '%reassembly%'",(sid,)).fetchone()[0]
            per_file.append({**{k:source[k] for k in ('id','sha256','size','kind')},'packets':n,'filtered':0,
                             'unsupported_or_unreassembled':unsupported,'decoding_limited_other':malformed})
    return {'seconds':time.perf_counter()-start,'cpu_seconds':time.process_time()-cpu,
            'peak_rss_bytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024,
            'output_bytes':allocated_bytes(output)[0],'packets':sum(s['packets'] for s in per_file),
            'sources':per_file,'coverage':manifest['coverage']}


def host_info():
    mem={}
    for line in Path('/proc/meminfo').read_text().splitlines():
        if line.startswith(('MemTotal:','MemAvailable:')):
            key,value=line.split(':',1); mem[key+'_bytes']=int(value.split()[0])*1024
    return {'python':platform.python_version(),'platform':platform.platform(),'machine':platform.machine(),
            'logical_cpus':os.cpu_count(),'memory':mem,'sqlite':sqlite3.sqlite_version,
            'cpu_model':next((line.split(':',1)[1].strip() for line in Path('/proc/cpuinfo').read_text().splitlines() if line.startswith('model name')),'unknown')}


def read_pseudonym_key(path):
    """Read a protected caller key without unbounded reads or path-bearing errors."""
    try:
        with source_file(path) as (stream,_):
            key=stream.read(33)
    except (IngestError,OSError):
        raise IngestError('pseudonym_key_file_unavailable') from None
    if len(key)!=32: raise IngestError('pseudonym_key_must_be_32_bytes')
    return key


def qualify(source,output,*,profile='real',timeout=14400,max_rss=512*1024**2,expected_packets=None,
            min_free_bytes=None,dataset_id=None,config=None,pseudonym_key=None):
    if pseudonym_key is not None and (not isinstance(pseudonym_key,bytes) or len(pseudonym_key)!=32):
        raise IngestError('pseudonym_key_must_be_32_bytes')
    if platform.system()!='Linux': raise IngestError('qualification_requires_linux')
    if profile not in ('real','synthetic') or timeout<=0 or max_rss<=0: raise IngestError('invalid_qualification_options')
    config=config_validate({} if config is None else config)
    output=Path(output)
    if output.resolve().is_relative_to(Path(__file__).resolve().parents[2]) or Path(os.path.abspath(output))!=output.resolve(): raise IngestError('qualification_output_must_be_private_external_directory')
    if output.resolve().is_relative_to(Path(source).resolve()):
        raise IngestError('qualification_output_must_be_separate_from_source')
    output.mkdir(mode=0o700)
    start=time.perf_counter(); cpu=time.process_time(); child_start=resource.getrusage(resource.RUSAGE_CHILDREN)
    report={'schema':'capture-qualification/2','profile':profile,'status':'BLOCKED_EXTERNAL',
     'goal':'Actual Packet Squirrel dataset: reproducible supported-subset analysis',
     'dataset_identified':bool(dataset_id),'dataset_id_sha256':hashlib.sha256(dataset_id.encode()).hexdigest() if dataset_id else None,
     'description_approximate_bytes':GOAL_BYTES,'environment':host_info(),
     'limits':{'per_run_seconds':timeout,'peak_rss_bytes':max_rss,
               'justification':'One sequential worker; default 512 MiB leaves headroom on this 31 GiB host. Four-hour per-worker deadline is fixed before measurement.',
               'disk_estimate_bytes_per_packet_per_run':6000,'disk_reserve_bytes':1024**3},
     'configuration':config,'runs':[],'checks':{},'timing':{},'independent':[],
     'metric_limitations':['50 ms RSS samples can miss short peaks; Python worker ru_maxrss also recorded.',
       'Worker process tree sampled; parent RSS sampled separately. No external decode workers inside analysis.',
       '1 s allocated-file sampling can miss temporary files; filesystem deltas include unrelated activity.',
       'Filesystem cache not flushed: both runs are clean cases but warm-cache effects are possible.',
       'Full cost includes inventory, all source hashes, decoder, worker startup, analysis, output verification and semantic/export digests; excludes report finalization.',
       'Analysis time includes ingestion, decoding, SQL aggregation, rules, export and checksums. No separately instrumented parser-only speed claim.',
       'No OS hard RSS/disk quota. Timeouts terminate the worker process group.']}
    try:
        implementation={p.name:p for p in sorted(Path(__file__).parent.glob('*.py'))}
        implementation['ios_ingest.py']=Path(__file__).resolve().parents[1]/'ios_sysdiagnose/ingest.py'
        report['code_sha256']={name:hash_file(path) for name,path in implementation.items()}
        report.update(code_commit=None,code_dirty=None,code_matches_revision=None,code_revision_status='unavailable')
        root=Path(__file__).resolve().parents[2]
        def git_output(*args):
            return subprocess.run(['git',*args],cwd=root,capture_output=True,check=True,timeout=10).stdout
        try:
            toplevel=Path(os.fsdecode(git_output('rev-parse','--show-toplevel').strip())).resolve()
            if toplevel!=root:
                report['code_revision_status']='workspace_mismatch'
            else:
                revision=git_output('rev-parse','HEAD').decode('ascii').strip()
                dirty=bool(git_output('status','--porcelain').strip())
                matches=all(hashlib.sha256(git_output('show',revision+':'+path.relative_to(root).as_posix())).hexdigest()==report['code_sha256'][name]
                            for name,path in implementation.items())
                if re.fullmatch('[0-9a-f]{40,64}',revision):
                    report.update(code_commit=revision,code_dirty=dirty,code_matches_revision=matches,
                                  code_revision_status='git' if matches else 'implementation_mismatch')
        except (OSError,subprocess.SubprocessError):
            pass  # Copied offline packages still record every implementation hash.
        if profile=='real' and not dataset_id: raise IngestError('actual_dataset_identity_required')
        if profile=='synthetic' and expected_packets is None: raise IngestError('synthetic_expected_count_required')
        invstart=time.perf_counter(); paths,items=inventory(source)
        report['inventory']=items; report['source_bytes']=sum(s['size'] for s in items)
        if any(s['kind']=='unsupported' for s in items): raise IngestError('non_capture_segments_in_inventory')
        private_write(output/'reproduce-private.json',canonical({'source':str(Path(source).resolve()),'paths':[str(p.resolve()) for p in paths],
          'profile':profile,'dataset_id':dataset_id,'config':config,'limits':report['limits'],'timeout':timeout,
          'expected_packets':expected_packets,'note':'Sensitive local recipe. Rerun with same code, source, limits and key into a NEW directory.'})+b'\n')
        report['timing']['inventory_seconds']=time.perf_counter()-invstart
        free=shutil.disk_usage(output).free; report['initial_free_bytes']=free
        if free<(min_free_bytes if min_free_bytes is not None else report['source_bytes']*4+1024**3): raise IngestError('insufficient_output_space')
        before=[]
        hstart=time.perf_counter()
        for p,item in zip(paths,items):
            with source_file(p) as (f,st):
                h=hashlib.sha256()
                for chunk in iter(lambda:f.read(MAX_RECORD),b''): h.update(chunk)
                item['sha256']=h.hexdigest(); before.append(fingerprint(st))
        report['timing']['source_hash_before_seconds']=time.perf_counter()-hstart
        exe=shutil.which('capinfos')
        report['tool_versions']={'capinfos':subprocess.run([exe,'--version'],capture_output=True,text=True).stdout.splitlines()[0] if exe else None}
        independent=[]
        for p,item in zip(paths,items):
            print(f"Qualification: independent decoder source {item['id']}",file=sys.stderr,flush=True)
            count=capinfos_count(p,timeout,output/f"decoder-{item['id']}")
            metrics=getattr(capinfos_count,'last_metrics',None)
            if not isinstance(metrics,dict): metrics=None
            report['independent'].append({'source_id':item['id'],'packets':count,'metrics':metrics})
            independent.append(count)
        if profile=='real' and any(n is None for n in independent): raise IngestError('capinfos_required_for_real_goal')
        estimate=max(report['source_bytes']*4,sum(n or 0 for n in independent)*6000*2)+1024**3
        needed=min_free_bytes if min_free_bytes is not None else estimate
        report['estimated_two_run_output_and_reserve_bytes']=estimate; report['free_space_required_bytes']=needed
        if shutil.disk_usage(output).free<needed: raise IngestError('insufficient_output_space_after_count')
        key=pseudonym_key if pseudonym_key is not None else os.urandom(32)
        private_write(output/'pseudonym.key',key)
        private_write(output/'configuration.json',canonical(config)+b'\n')
        for number in (1,2):
            print(f'Qualification: analysis run {number}/2',file=sys.stderr,flush=True)
            bundle=output/f'run-{number}'
            args=[sys.executable,str(Path(__file__).resolve()),'_worker',*[str(p.resolve()) for p in paths],
                  '--output',str(bundle.resolve()),'--config',str((output/'configuration.json').resolve()),
                  '--pseudonym-key',str((output/'pseudonym.key').resolve())]
            code,data,metrics=measured_process(args,timeout=timeout,scratch=output/f'worker-{number}')
            if code:
                report['runs'].append(metrics)
                try: report['worker_failure']=json.loads(data)
                except (ValueError,UnicodeError): report['worker_failure']={'reason':'worker_terminated_without_metrics'}
                raise IngestError('analysis_worker_failed')
            measured=json.loads(data); measured.update(metrics)
            verify_start=time.perf_counter(); verify_bundle(bundle)
            measured['semantic_sha256']=semantic_digest(bundle); measured['export_sha256']=export_digest(bundle)
            measured['verification_seconds']=time.perf_counter()-verify_start
            measured['throughput_mib_s']=report['source_bytes']/1024**2/max(measured['seconds'],1e-9)
            report['runs'].append(measured)
        # Verify the directory itself still describes the same complete set of
        # segments. Per-file hashes alone cannot detect a segment added later.
        final_paths,final_items=inventory(source)
        inventory_unchanged=final_paths==paths and final_items==[
            {key:item[key] for key in ('id','size','signature_hex','kind')} for item in items]
        report['final_inventory_sources']=len(final_items)
        report['final_inventory_bytes']=sum(item['size'] for item in final_items)
        hstart=time.perf_counter(); unchanged=True
        for p,item,fp in zip(paths,items,before):
            with source_file(p) as (f,st):
                h=hashlib.sha256()
                for chunk in iter(lambda:f.read(MAX_RECORD),b''): h.update(chunk)
                unchanged &= h.hexdigest()==item['sha256'] and fingerprint(st)==fp
        report['timing']['source_hash_after_seconds']=time.perf_counter()-hstart
        runs=report['runs']
        per_file=[]
        for i,item in enumerate(items):
            values=[r['sources'][i] for r in runs]
            per_file.append({'source_id':item['id'],'independent_packets':independent[i],
                'run_packets':[v['packets'] for v in values],
                'reconciled':independent[i] is not None and all(v['packets']==independent[i] for v in values),
                'integrity':all(v['sha256']==item['sha256'] and v['size']==item['size'] for v in values)})
        report['per_file_reconciliation']=per_file
        report['independent_packets']=sum(independent) if all(n is not None for n in independent) else None
        report['checks']={'source_unchanged':bool(unchanged),'source_hashes_match':all(r['integrity'] for r in per_file),
          'dataset_inventory_unchanged':inventory_unchanged,
          'implementation_unchanged':all(hash_file(path)==report['code_sha256'][name] for name,path in implementation.items()),
          'reproducible_records':runs[0]['semantic_sha256']==runs[1]['semantic_sha256'],
          'reproducible_minimized_export':runs[0]['export_sha256']==runs[1]['export_sha256'],
          'memory_budget':all(max(r['peak_rss_bytes'],r['sampled_worker_tree_peak_rss_bytes'])<=max_rss for r in runs),
          'independent_memory_budget':all(not r['metrics'] or r['metrics'].get('sampled_worker_tree_peak_rss_bytes',0)<=max_rss for r in report['independent']),
          'parent_memory_budget':all(r['sampled_parent_peak_rss_bytes']<=max_rss for r in runs),
          'pinned_real_code':profile!='real' or (report['code_commit'] is not None and report['code_dirty'] is False and report['code_matches_revision'] is True),
          'time_budget':all(r['wall_seconds']<=timeout for r in runs),'nonempty_capture':all(r['packets']>0 for r in runs),
          'independent_count':all(r['reconciled'] for r in per_file),
          'fixture_count':expected_packets is not None and all(r['packets']==expected_packets for r in runs),
          'complete_dataset_accounting':all(r['filtered']==0 for run in runs for r in run['sources'])}
        required=[v for k,v in report['checks'].items() if k not in ('independent_count','fixture_count')]
        required.append(report['checks']['independent_count' if profile=='real' else 'fixture_count'])
        if all(n is not None for n in independent): required.append(report['checks']['independent_count'])
        report['status']=('GOAL_PASS' if profile=='real' else 'SYNTHETIC_PASS') if all(required) else 'FAILED'
        if report['status']=='GOAL_PASS' and any(r['coverage']['decoding_losses'] for r in runs):
            report['status']='QUALIFIED_LIMITATIONS'
            report['reason']='Framing/count/integrity gates pass, but decoding losses require review; unsupported content is not fully analyzed.'
    except IngestError as exc:
        report['reason']=str(exc)
        if report['runs'] or str(exc) in ('independent_decoder_failed','analysis_worker_failed'):
            report['status']='FAILED'
        if hasattr(exc,'details'): report['failure_details']=exc.details
    except subprocess.TimeoutExpired as exc:
        report.update(status='FAILED',reason='timeout',timeout_metrics=getattr(exc,'metrics',{}))
    except KeyboardInterrupt:
        report.update(status='CANCELLED',reason='operator_cancellation')
    except FileNotFoundError:
        report.update(status='FAILED' if report['runs'] else 'BLOCKED_EXTERNAL',reason='source_or_required_tool_not_found')
    except (OSError,ValueError,sqlite3.Error,KeyError,subprocess.SubprocessError) as exc:
        report.update(status='FAILED',reason='qualification_'+type(exc).__name__)
    if report['status']!='CANCELLED' and 'paths' in locals() and 'before' in locals() and len(before)==len(paths) and 'source_hash_after_seconds' not in report['timing']:
        hstart=time.perf_counter(); verified=[]
        for p,item,fp in zip(paths,items,before):
            try:
                with source_file(p) as (stream,st):
                    h=hashlib.sha256()
                    for chunk in iter(lambda:stream.read(MAX_RECORD),b''): h.update(chunk)
                    verified.append({'source_id':item['id'],'after_sha256':h.hexdigest(),'unchanged':h.hexdigest()==item['sha256'] and fingerprint(st)==fp})
            except (OSError,IngestError): verified.append({'source_id':item['id'],'unchanged':False,'verification':'unavailable'})
        report['failure_path_integrity']=verified
        report['timing']['source_hash_after_seconds']=time.perf_counter()-hstart
    child_end=resource.getrusage(resource.RUSAGE_CHILDREN)
    report['timing'].update(total_wall_seconds=time.perf_counter()-start,parent_cpu_seconds=time.process_time()-cpu,
       child_user_cpu_seconds=child_end.ru_utime-child_start.ru_utime,child_system_cpu_seconds=child_end.ru_stime-child_start.ru_stime)
    report['output_logical_bytes'],report['output_allocated_bytes']=allocated_bytes(output)
    report['final_free_bytes']=shutil.disk_usage(output).free
    atomic_json(output/'qualification.json',report)
    human=f"# Capture qualification\n\nStatus: {report['status']}\nProfile: {profile}\nBytes: {report.get('source_bytes','not inventoried')}\nSources: {len(report.get('inventory',[]))}\nTotal wall seconds (excluding report finalization): {report['timing']['total_wall_seconds']:.3f}\n\n{report.get('reason','See per-file reconciliation, checks, coverage, versions, thresholds and metrics in qualification.json.')}\n\nSynthetic validation never completes the actual Packet Squirrel goal. The local reproduce-private.json contains paths; keep it and all case outputs private.\n"
    private_write(output/'qualification.md',human.encode())
    private_write(output/'SHA256SUMS',(hash_file(output/'qualification.json')+'  qualification.json\n'+hash_file(output/'qualification.md')+'  qualification.md\n').encode())
    return report


def main():
    p=argparse.ArgumentParser(description=__doc__); sub=p.add_subparsers(dest='command',required=True)
    gen=sub.add_parser('generate'); gen.add_argument('path',type=Path); gen.add_argument('--packets',type=int,default=100000); gen.add_argument('--payload-bytes',type=int,default=1024); gen.add_argument('--pattern',choices=('framing','high-cardinality'),default='framing')
    for name in ('run','_worker'):
        c=sub.add_parser(name); c.add_argument('source',type=Path,nargs='+' if name=='_worker' else None); c.add_argument('--output',type=Path,required=True)
        c.add_argument('--config',type=Path); c.add_argument('--pseudonym-key',type=Path)
        if name=='run':
            c.add_argument('--profile',choices=('real','synthetic'),default='real'); c.add_argument('--dataset-id')
            c.add_argument('--expected-packets',type=int); c.add_argument('--timeout-seconds',type=int,default=14400); c.add_argument('--max-rss-mib',type=int,default=512)
    a=p.parse_args()
    try:
        key=read_pseudonym_key(a.pseudonym_key) if getattr(a,'pseudonym_key',None) else None
        cfg=json.loads(a.config.read_bytes()) if getattr(a,'config',None) else None
        if a.command=='generate': result=generate_cardinality(a.path,a.packets) if a.pattern=='high-cardinality' else generate(a.path,a.packets,a.payload_bytes)
        elif a.command=='_worker':
            if key is None: raise IngestError('pseudonym_key_must_be_32_bytes')
            result=worker(a.source,a.output,cfg,key)
        else: result=qualify(a.source,a.output,profile=a.profile,timeout=a.timeout_seconds,max_rss=a.max_rss_mib*1024**2,
                            expected_packets=a.expected_packets,dataset_id=a.dataset_id,config=cfg,pseudonym_key=key)
        print(json.dumps(result)); return 0 if result.get('status','SYNTHETIC_PASS') in ('GOAL_PASS','SYNTHETIC_PASS') else 2
    except KeyboardInterrupt:
        print(json.dumps({'status':'CANCELLED','reason':'operator_cancellation'})); return 2
    except (IngestError,OSError,ValueError,sqlite3.Error) as exc:
        print(json.dumps({'reason':str(exc) if isinstance(exc,IngestError) else 'qualification_failed_'+type(exc).__name__,'details':getattr(exc,'details',{})})); return 2

if __name__=='__main__': raise SystemExit(main())
