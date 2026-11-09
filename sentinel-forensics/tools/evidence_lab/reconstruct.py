"""Optional offline bounded TLS reconstruction from an unchanged closed case.

Output is a separate private derived bundle. Raw observations, packet decoding
losses, findings and the HoneyTrace exchange remain unchanged.
"""
from contextlib import closing
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import sqlite3
import stat
import subprocess
import sys
import time
from core import IngestError, MAX_RECORD, canonical, private_write, hash_file, VERSION as PARSER_VERSION
from report import minimize
from reconstruct_input import validated_case
from reconstruct_plan import plan, inventory, selection, materialize_batch, release_batch
import reconstruct_history as history
import reconstruct_pipeline as pipeline
from reconstruct_resource import Budget
from reconstruct_profile import STANDARD, SOLO, envelope, specification

VERSION=history.PRODUCER_VERSION
SCHEMA=history.PAGE_SCHEMA
DEFAULT_LIMITS={'rss_bytes':536870912,'timeout_seconds':120,'decoder_seconds':60,
    'scratch_bytes':67108864,'max_batches':32,'batch_cohorts':4,'batch_frames':16384,
    'batch_bytes':16777216,'total_frames':131072,'candidates':2048,'packet_rows':2000000,
    'support_references':16384,'support_links':65536,'segments_per_candidate':512}
INDEX_SCHEMA='''PRAGMA cache_size=-4096;
CREATE TABLE derivations(id INTEGER PRIMARY KEY,source_id INTEGER,ordinal INTEGER,
 packet_number INTEGER,kind TEXT,context TEXT,status TEXT,reason TEXT,data_json TEXT,
 first_time_json TEXT,completion_time_json TEXT,provenance_json TEXT,batch_id INTEGER);
CREATE TABLE packet_references(batch_id INTEGER,mini_frame INTEGER,source_id INTEGER,
 ordinal INTEGER,packet_number INTEGER,offset INTEGER,length INTEGER,sha256 TEXT,
 cohort INTEGER,time_json TEXT,PRIMARY KEY(batch_id,mini_frame));
CREATE TABLE support(derivation_id INTEGER,mini_frame INTEGER,source_id INTEGER,
 ordinal INTEGER,packet_number INTEGER,byte_offset INTEGER,byte_length INTEGER,
 record_sha256 TEXT,payload_offset INTEGER,window_offset INTEGER,slice_length INTEGER,time_json TEXT);
CREATE INDEX support_query ON support(derivation_id,mini_frame,window_offset);
'''
LIMITATIONS=[
 'Optional bounded derived evidence only; raw observations and all original decoding losses remain unchanged.',
 'Selected whole complete-header TCP tuples only. Exclusions, unsupported/fragmented headers and unresolved references remain explicit.',
 'TCP assignment and matching bytes are descriptive support, not physical device/person identity or compromise evidence.',
 'Hello metadata requires an exact source-byte union and one independently matched record/handshake/field set. No TLS decryption, endpoint contact or external resolution occurs.',
 'First and completion times refer to supporting capture packets, not a newly inferred handshake clock. Original precision and clock uncertainty are retained privately.',
 'Pseudonyms minimize identifiers; source hashes, times and integer cohort selectors/locators remain linkable within the same reconciled source inventory. Cohort IDs are source-local locators, not device pseudonyms. Share only the minimized export after verifying the complete parent bundle.',
 'HoneyTrace sentinel.honeytrace/1 is unchanged; this is a separate Sentinel derived schema.',
 'Continuation verifies prior artifact consistency, not authenticated prior execution or acquisition; inherited outcomes are reported references, never fresh Hello observations.',
 'Continuation follows at most15 explicit prior siblings under the operator-selected family directory. Use a dedicated family directory; no unrelated paths or sibling branches are scanned.',
]


def configuration(value=None,*,profile=STANDARD):
    bounds=dict(DEFAULT_LIMITS)
    envelope(profile)
    if profile==SOLO:
        bounds.update(max_batches=1,batch_cohorts=1,batch_frames=32768,
                      batch_bytes=33554432,total_frames=32768)
    if value is None:value={}
    if not isinstance(value,dict) or set(value)-set(DEFAULT_LIMITS):
        raise IngestError('tls_invalid_limits')
    result=dict(bounds,**value)
    if any(type(v) is not int or v<=0 for v in result.values()):
        raise IngestError('tls_positive_integer_limits_required')
    for name in ('max_batches','batch_cohorts','batch_frames','batch_bytes','total_frames',
                 'candidates','packet_rows','support_references','support_links','segments_per_candidate'):
        if result[name]>bounds[name]:raise IngestError('tls_parser_cap_exceeded')
    if profile==SOLO and any(result[name]>bounds[name] for name in
            ('rss_bytes','timeout_seconds','decoder_seconds','scratch_bytes')):
        raise IngestError('tls_solo_resource_cap_exceeded')
    if result['decoder_seconds']>min(60,result['timeout_seconds']):
        raise IngestError('tls_decoder_timeout_invalid')
    if result['batch_bytes']<24:raise IngestError('tls_batch_header_budget')
    return result


def executing_code():
    paths={p.name:p for p in sorted(Path(__file__).parent.glob('*.py'))}
    paths['ios_ingest.py']=Path(__file__).parent.parent/'ios_sysdiagnose/ingest.py'
    return paths,{name:hash_file(path) for name,path in paths.items()}


def revision_provenance(paths):
    """Optional read-only Git metadata; copied offline packages need no Git."""
    result={'commit':None,'dirty':None,'matches_revision':None,'status':'git_unavailable'}
    root=Path(__file__).resolve().parents[2]
    environment={key:value for key,value in os.environ.items() if not key.startswith('GIT_')}
    def git(*args):
        value=subprocess.run(['git','-C',str(root),*args],capture_output=True,
            check=True,timeout=5,env=environment).stdout
        if len(value)>MAX_RECORD:raise IngestError('tls_git_metadata_budget')
        return value
    try:
        if Path(git('rev-parse','--show-toplevel').decode().strip()).resolve()!=root:
            result['status']='workspace_mismatch';return result
        revision=git('rev-parse','HEAD').decode().strip()
        if not re.fullmatch('[0-9a-f]{40,64}',revision):return result
        dirty=bool(git('status','--porcelain').strip())
        records=git('ls-tree','-rz',revision,'--',*[p.relative_to(root).as_posix() for p in paths.values()])
        blobs={}
        for record in records.split(b'\0'):
            if record:
                metadata,name=record.split(b'\t',1)
                _,kind,blob=metadata.split()
                if kind==b'blob':blobs[name.decode()]=blob.decode()
        matches=True
        for path in paths.values():
            body=path.read_bytes()
            expected=hashlib.sha1(b'blob '+str(len(body)).encode()+b'\0'+body).hexdigest()
            matches&=blobs.get(path.relative_to(root).as_posix())==expected
        result.update(commit=revision,dirty=dirty,matches_revision=matches,
                      status='git' if matches else 'implementation_mismatch')
    except (OSError,ValueError,UnicodeError,subprocess.SubprocessError,IngestError):
        pass
    return result


def write_owned(fd,value):
    data=canonical(value)+b'\n'
    if len(data)>MAX_RECORD:raise IngestError('tls_metadata_size_budget')
    os.ftruncate(fd,0);os.lseek(fd,0,os.SEEK_SET)
    with os.fdopen(os.dup(fd),'wb') as stream:
        stream.write(data);stream.flush();os.fsync(stream.fileno())


def failure_markers(primary,manifest_fd,output,manifest):
    """Invalidate old COMPLETE bytes before fallible failure serialization."""
    for descriptor in (primary,manifest_fd):
        if descriptor is not None:
            try:os.ftruncate(descriptor,0)
            except OSError:pass
    minimal={'schema':SCHEMA,'producer_version':VERSION,'status':manifest['status'],
             'reason':manifest.get('reason','tls_terminal_write_failed')}
    try:write_owned(primary,minimal)
    except BaseException:
        try:os.ftruncate(primary,0)
        except OSError:pass
    if manifest_fd is None:
        try:manifest_fd=os.open(output/'manifest.json',os.O_RDWR|os.O_CREAT|os.O_EXCL,0o600)
        except OSError:return None
    try:write_owned(manifest_fd,manifest)
    except BaseException:
        try:
            os.ftruncate(manifest_fd,0)
            write_owned(manifest_fd,dict(minimal,terminal_metadata_truncated=True))
        except BaseException:
            try:os.ftruncate(manifest_fd,0)
            except OSError:pass
    return manifest_fd


def invalidate_closed_markers(output,manifest,identities):
    """A close error may have closed its FD; reopen only our exact inodes."""
    minimal={'schema':SCHEMA,'producer_version':VERSION,'status':'FAILED',
             'reason':manifest.get('reason','tls_terminal_close_failed')}
    for name,expected in identities.items():
        path=output/name;descriptor=None
        try:
            if Path(os.path.abspath(path))!=path.resolve():continue
            descriptor=os.open(path,os.O_RDWR|os.O_NOFOLLOW|os.O_NONBLOCK)
            opened=os.fstat(descriptor);named=path.lstat()
            if (not stat.S_ISREG(opened.st_mode) or opened.st_nlink!=1
                    or (opened.st_dev,opened.st_ino)!=expected
                    or (named.st_dev,named.st_ino)!=expected):continue
            os.ftruncate(descriptor,0)
            try:write_owned(descriptor,minimal)
            except BaseException:
                try:os.ftruncate(descriptor,0)
                except OSError:pass
        except (OSError,RuntimeError):
            pass
        finally:
            if descriptor is not None:
                try:os.close(descriptor)
                except OSError:pass


def capture_time(info,basis,config):
    adjustment=config.get('clock_adjustments',{}).get(str(info['source_id']),{}).get('offset_ns',0)
    original=info['utc_ns']
    adjusted=original+adjustment if original is not None else None
    if adjusted is not None and not -(2**63)<adjusted<2**63:
        raise IngestError('tls_adjusted_time_outside_index_range')
    return {'basis':basis,'source_id':info['source_id'],'ordinal':info['ordinal'],
        'packet_number':info['packet_number'],'time':json.loads(info['time_json']),
        'original_utc_ns':original,'utc_ns':adjusted,'offset_ns':adjustment,
        'uncertainty':'capture_clock_unverified_no_calibration'}


def initial_derivations(db,candidates,config):
    for item in candidates.values():
        provenance=history.original_provenance(item,item.get('prior_evaluation'))
        first=capture_time(item,'candidate_capture',config)
        db.execute('INSERT INTO derivations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (item['derivation_id'],item['source_id'],item['ordinal'],item['packet_number'],
             'tls.prior_evaluation_reference' if item['status']=='previously_evaluated' else 'tls.reassembly_evaluation',
             item['context'],item['status'],item['reason'],'{}',
             canonical(first).decode(),'null',canonical(provenance).decode(),item.get('batch_id')))


def merge_batch(db,batch,result,config):
    with closing(sqlite3.connect(result['private_index'].as_uri()+'?mode=ro&immutable=1',uri=True)) as reference:
        reference.row_factory=sqlite3.Row
        for frame,ref in enumerate(batch['references'],1):
            info=batch['information'][frame]
            stamp=capture_time(info,'support_capture',config)
            db.execute('INSERT INTO packet_references VALUES(?,?,?,?,?,?,?,?,?,?)',
                (batch['id'],frame,info['source_id'],ref.ordinal,ref.packet_number,ref.offset,
                 ref.length,ref.sha256,ref.cohort,canonical(stamp).decode()))
        for row in reference.execute('SELECT * FROM classifications ORDER BY frame'):
            frame=row['frame'];ident=batch['candidates'][frame]
            support_frames=[]
            for part in reference.execute('SELECT * FROM support WHERE candidate=? ORDER BY frame,window_start',(frame,)):
                other=part['frame'];ref=batch['references'][other-1];info=batch['information'][other]
                payload=reference.execute('SELECT payload_offset FROM segments WHERE frame=?',(other,)).fetchone()
                if payload is None or payload[0] is None:raise IngestError('tls_support_payload_reference_missing')
                stamp=capture_time(info,'support_capture',config)
                db.execute('INSERT INTO support VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
                    (ident,other,info['source_id'],ref.ordinal,ref.packet_number,ref.offset,ref.length,
                     ref.sha256,payload[0]+part['payload_skip'],part['window_start'],part['length'],canonical(stamp).decode()))
                support_frames.append(other)
            first=min(support_frames,key=lambda f:batch['references'][f-1].ordinal) if support_frames else frame
            first_time=capture_time(batch['information'][first],
                'first_support_capture' if support_frames else 'candidate_capture',config)
            completion=row['completion_frame']
            completion_time=(capture_time(batch['information'][completion],'completion_support_capture',config)
                             if completion is not None else None)
            data={}
            if row['category']=='independently_recovered_hello':
                native=reference.execute('SELECT data_json FROM classification_data WHERE frame=?',(frame,)).fetchone()
                if native is None:raise IngestError('tls_native_verified_fields_missing')
                data=json.loads(native[0]);info=batch['information'][frame]
                data.update({key:info[key] for key in ('src','dst','sport','dport')})
            data['evaluation']={key:row[key] for key in ('record_bytes','missing_bytes',
                'conflicting_overlap_bytes','identical_overlap_bytes','support_packets')}
            db.execute('UPDATE derivations SET kind=?,status=?,reason=?,data_json=?,first_time_json=?,completion_time_json=? WHERE id=?',
                ('tls.reassembled_hello' if row['category']=='independently_recovered_hello' else 'tls.reassembly_evaluation',
                 row['category'],row['reason'],canonical(data).decode(),canonical(first_time).decode(),
                 canonical(completion_time).decode(),ident))
    db.commit()


def export_bundle(db,output,manifest,key,guard):
    folder=output/'export';folder.mkdir(mode=0o700)
    fd=os.open(folder/'observations.jsonl',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'wb') as stream:
        def emit(entity,ident,payload):
            guard()
            value={'schema':SCHEMA,'entity':entity,'id':str(ident),'payload':minimize(payload,key)}
            raw=canonical(value)+b'\n'
            if len(raw)>MAX_RECORD:raise IngestError('tls_export_record_budget')
            stream.write(raw)
        emit('coverage','coverage',{'producer_version':VERSION,'coverage':manifest['coverage'],
                                  'analysis_profile':manifest['analysis_profile'],
                                  'limits':manifest['limits'],'limitations':LIMITATIONS})
        for row in db.execute('SELECT * FROM derivations ORDER BY id'):
            value=dict(row)
            for field in ('data_json','first_time_json','completion_time_json','provenance_json'):
                value[field[:-5]]=json.loads(value.pop(field))
            support=[]
            for ref in db.execute('SELECT * FROM support WHERE derivation_id=? ORDER BY mini_frame,window_offset',(row['id'],)):
                item=dict(ref);item['time']=json.loads(item.pop('time_json'));support.append(item)
                if len(support)>512:raise IngestError('tls_export_support_budget')
            value['support']=support
            entity=('derived_observation' if row['status']=='independently_recovered_hello' else
                    'prior_evaluation_reference' if row['status']=='previously_evaluated' else 'evaluation')
            emit(entity,row['id'],value)
    private_write(folder/'report.md',('# Derived TLS observations\n\n'+
        'Profile: '+json.dumps(manifest['analysis_profile'],sort_keys=True)+'\n\n'+
        'Coverage: '+json.dumps(manifest['coverage'],sort_keys=True)+'\n\n'+
        '\n'.join('- '+line for line in LIMITATIONS)+'\n').encode())


def checksums(output,guard):
    values=[]
    for path in sorted(output.rglob('*')):
        guard()
        if path.is_symlink():raise IngestError('tls_output_symlink')
        if path.is_file() and path.name!='SHA256SUMS':
            values.append(hash_file(path)+'  '+path.relative_to(output).as_posix())
    private_write(output/'SHA256SUMS',('\n'.join(values)+'\n').encode())


def reconstruct(case,source_map,output,*,limits=None,continue_from=None,
                profile=STANDARD,cohort_id=None):
    analysis_profile=specification(profile,cohort_id)
    if profile==SOLO and continue_from is not None:
        raise IngestError('tls_solo_continuation_unsupported')
    limits=configuration(limits,profile=profile)
    case=Path(case);output=Path(output)
    if (not isinstance(source_map,dict) or not source_map or len(source_map)>4096
            or any(type(sid) is not int or not 1<=sid<=4096 for sid in source_map)):
        raise IngestError('tls_source_mapping_invalid')
    if any(not isinstance(path,(str,Path)) or not 0<len(str(path))<=4096 for path in source_map.values()):
        raise IngestError('tls_source_mapping_invalid')
    sources={sid:Path(path) for sid,path in source_map.items()}
    repo=Path(__file__).resolve().parents[2]
    if (not case.is_absolute() or not output.is_absolute()
            or Path(os.path.abspath(output))!=output.resolve() or output.resolve().is_relative_to(repo)
            or output.resolve().is_relative_to(case.resolve()) or case.resolve().is_relative_to(output.resolve())
            or any(not p.is_absolute() or output.resolve().is_relative_to(p.resolve())
                   or p.resolve().is_relative_to(output.resolve()) for p in sources.values())):
        raise IngestError('tls_output_or_source_path_invalid')
    if platform.system()!='Linux':raise IngestError('tls_resource_measurement_requires_linux')
    previous=history.request_scope(continue_from,output)
    previous_umask=os.umask(0o077)
    try:output.mkdir(mode=0o700)
    except OSError:
        os.umask(previous_umask);raise IngestError('tls_output_unavailable') from None
    previous_environment={key:os.environ.get(key) for key in ('SQLITE_TMPDIR','TMPDIR')}
    primary=None
    marker_identities={}
    try:
        primary=os.open(output/'state.json',os.O_RDWR|os.O_CREAT|os.O_EXCL,0o600)
        opened=os.fstat(primary);marker_identities['state.json']=(opened.st_dev,opened.st_ino)
        budget=Budget(output,limits)
        os.environ.update(SQLITE_TMPDIR=str(output),TMPDIR=str(output))
    except BaseException as exc:
        try:
            if primary is not None:os.close(primary)
        finally:
            os.umask(previous_umask)
            for key,value in previous_environment.items():
                if value is None:os.environ.pop(key,None)
                else:os.environ[key]=value
        if isinstance(exc,OSError):raise IngestError('tls_output_unavailable') from None
        raise
    manifest=dict(history.producer_header(PARSER_VERSION,LIMITATIONS),status='INCOMPLETE',
                  limits=dict(limits,predeclared=True),batches=[],analysis_profile=analysis_profile)
    manifest_fd=None
    try:
        write_owned(primary,{'status':'INCOMPLETE','schema':SCHEMA,'version':VERSION,'limits':limits})
        if shutil.disk_usage(output).free<limits['scratch_bytes']+1024**3:
            raise IngestError('tls_output_space_required')
        private_write(output/'index.sqlite',b'')
        budget.start()
        code_paths,code_hashes=executing_code()
        manifest['tools']={'python':platform.python_version(),'sqlite':sqlite3.sqlite_version,
            'tshark':None,'code_sha256':code_hashes,'revision':revision_provenance(code_paths),
            'lua_sha256':hashlib.sha256(pipeline.LUA.encode()).hexdigest()}
        with closing(history.History(previous,output,budget.guard)) as prior:
            with validated_case(case,sources,budget.guard,packet_rows=limits['packet_rows']) as bound:
                manifest['input_binding']=bound.binding
                manifest['source_configuration']=bound.manifest['configuration']
                manifest['sources']=[{name:value[name] for name in ('id','sha256','size','kind')}
                                     for _,value in sorted(bound.sources.items())]
                key=bound.pseudonym_key
                private_write(output/'pseudonym.key',key)
                observed=inventory(bound,limits,budget.guard)
                preview=selection(observed,limits,guard=budget.guard,cohort_id=cohort_id)
                manifest['tools']['tshark']=pipeline.tool_version() if preview['selected_cohorts'] else None
                decoder_profile={'schema':'sentinel.tls-decoder-profile/1','arguments':['-n','-r','-','-T','fields'],
                    'preferences':dict(pipeline.PREFERENCES),'fields':list(pipeline.FIELDS),
                    'lua_sha256':manifest['tools']['lua_sha256'],'oracle_version':pipeline.oracle.ORACLE_VERSION,
                    'secret_environment_removed':['SSLKEYLOGFILE','SSLKEYLOG_FILE'],
                    'input':'complete original classic-PCAP records via anonymous pipes'}
                manifest['tools']['decoder_profile']=decoder_profile
                manifest['tools']['decoder_profile_sha256']=history.digest(decoder_profile)
                expected_binding=history.binding(bound,manifest,limits,observed)
                prior.load(expected_binding,limits)
                prior.replay(bound,observed,limits,capture_time)
                candidates,batches,coverage=plan(bound,limits,budget.guard,known_inventory=observed,
                                                completed=prior.completed,prior_outcomes=prior.outcomes,
                                                cohort_id=cohort_id)
                if coverage['deferred_candidates'] and not coverage['selected_candidates']:
                    raise IngestError('tls_continuation_no_progress')
                manifest['coverage']=coverage
                private_write(output/'reproduction-private.json',canonical({'case':str(case),'output':str(output),
                    'continue_from':str(previous) if previous is not None else None,
                    'sources':{str(sid):str(path) for sid,path in sources.items()},'limits':limits,
                    'argv':sys.argv,'producer_version':VERSION,'analysis_profile':analysis_profile,
                    'note':'Use the same parent/source/configuration/key/code/profile/limits with a NEW private sibling; prior artifacts prove consistency, not authenticated execution.'})+b'\n')
                with closing(pipeline.open_db(output/'index.sqlite',budget.guard)) as db:
                    db.row_factory=sqlite3.Row;db.executescript(INDEX_SCHEMA)
                    initial_derivations(db,candidates,bound.manifest['configuration']);db.commit()
                    references=links=0
                    for batch in batches:
                        try:
                            materialize_batch(bound,batch,candidates,limits,budget.guard)
                            budget.guard();source=bound.sources[batch['scope'][0]]
                            source['stream'].seek(0);source['header']=source['stream'].read(24)
                            item=pipeline.decode_batch(batch['id'],batch,source,output,guard=budget.guard,
                                begin_decoder=budget.begin_decoder,end_decoder=budget.end_decoder,
                                register=budget.register,unregister=budget.unregister,
                                decoder_seconds=limits['decoder_seconds'],limits=limits,profile=profile)
                            references+=item['support_original_records_rechecked'];links+=item['support_links']
                            if references>limits['support_references'] or links>limits['support_links']:
                                raise IngestError('tls_global_support_budget')
                            merge_batch(db,batch,item,bound.manifest['configuration'])
                            manifest['batches'].append({k:v for k,v in item.items() if k!='private_index'})
                        finally:release_batch(batch)
                    statuses=dict(db.execute('SELECT status,COUNT(*) FROM derivations GROUP BY status'))
                    if 'selected' in statuses or sum(statuses.values())!=coverage['eligible_candidates']:
                        raise IngestError('tls_final_candidate_reconciliation')
                    outcomes=[list(row) for row in db.execute('SELECT id,status,reason FROM derivations WHERE batch_id IS NOT NULL ORDER BY id')]
                    if (len(outcomes)!=coverage['selected_candidates'] or
                            any(status not in history.OUTCOMES or reason not in history.REASONS[status]
                                for _,status,reason in outcomes)):
                        raise IngestError('tls_continuation_current_outcome_incomplete')
                    completed_coverage=history.finished_coverage(coverage,outcomes,prior.outcomes,
                                                                 prior.page_number,references,links)
                    if statuses!=completed_coverage['classifications']:
                        raise IngestError('tls_continuation_classification_accounting')
                    manifest['coverage']=completed_coverage
                    state=history.cursor_state(prior,expected_binding,coverage,outcomes)
                    manifest['continuation']=history.continuation_summary(observed,limits,
                        state['completed_after'],prior.page_number,prior.last_semantic,budget.guard,
                        cohort_id=cohort_id)
                    db.commit()
                # Normal context exit hashes every original source and parent input
                # after processing; raw observations/index/losses remain untouched.
            with closing(pipeline.open_db(output/'index.sqlite',budget.guard)) as db:
                db.row_factory=sqlite3.Row
                export_bundle(db,output,manifest,key,budget.guard)
            prior.verify_after()
            proof=history.semantic_proof(output,manifest,state,budget.guard)
            semantic=history.digest(proof)
            cursor={'schema':history.SCHEMA,'state':state,'semantic_proof':proof,'semantic_sha256':semantic}
            raw=canonical(cursor)+b'\n'
            if len(raw)>MAX_RECORD:raise IngestError('tls_continuation_cursor_metadata_budget')
            private_write(output/'continuation.json',raw)
            private_write(output/'continuation-execution-private.json',canonical({
                'schema':'sentinel.tls-continuation-execution/1',
                'previous_page':previous.name if previous is not None else None,
                'previous_ledger_sha256':prior.last_physical})+b'\n')
            manifest['continuation']['semantic_sha256']=semantic
        for name,sha in manifest['tools']['code_sha256'].items():
            if hash_file(code_paths[name])!=sha:raise IngestError('tls_executing_code_changed')
        manifest['resources']=dict(budget.finish(),resource_checks_passed=True)
        manifest['status']='COMPLETE'
        manifest_fd=os.open(output/'manifest.json',os.O_RDWR|os.O_CREAT|os.O_EXCL,0o600)
        opened=os.fstat(manifest_fd);marker_identities['manifest.json']=(opened.st_dev,opened.st_ino)
        write_owned(manifest_fd,manifest)
        budget.guard();write_owned(primary,{'status':'COMPLETE','schema':SCHEMA,'version':VERSION})
        checksums(output,budget.guard)
        budget.sample()
    except KeyboardInterrupt:
        manifest.update(status='CANCELLED',reason='operator_cancellation')
    except BaseException as exc:
        manifest.update(status='FAILED',reason=budget.failure or
            (str(exc) if isinstance(exc,IngestError) else 'tls_reconstruction_'+type(exc).__name__))
    finally:
        try:
            try:
                budget.stop()
                if manifest['status']=='COMPLETE':
                    budget.sample()
                    budget.finish()
            except KeyboardInterrupt:manifest.update(status='CANCELLED',reason='operator_cancellation')
            except BaseException as exc:
                manifest.update(status='FAILED',reason=budget.failure or
                    (str(exc) if isinstance(exc,IngestError) else 'tls_terminal_cleanup_failed'))
            if manifest['status']!='COMPLETE':
                try:manifest['resources']=dict(budget.snapshot(),resource_checks_passed=False)
                except BaseException:manifest['resources']={'resource_checks_passed':False,'metrics_unavailable':True}
                manifest_fd=failure_markers(primary,manifest_fd,output,manifest)
                if manifest_fd is not None:
                    try:
                        opened=os.fstat(manifest_fd)
                        marker_identities['manifest.json']=(opened.st_dev,opened.st_ino)
                    except OSError:pass
        finally:
            try:
                close_failed=False
                for descriptor in (manifest_fd,primary):
                    if descriptor is not None:
                        try:os.close(descriptor)
                        except OSError:
                            close_failed=True
                            manifest.update(status='FAILED',reason='tls_terminal_close_failed')
                if close_failed:invalidate_closed_markers(output,manifest,marker_identities)
            finally:
                os.umask(previous_umask)
                for key,value in previous_environment.items():
                    if value is None:os.environ.pop(key,None)
                    else:os.environ[key]=value
    return manifest


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case',type=Path,required=True)
    parser.add_argument('--source',action='append',required=True,metavar='ID=ABSOLUTE_PATH')
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--continue-from',type=Path,help='COMPLETE producer1.2.0 standard-profile prior sibling; authorizes only its bounded family directory')
    parser.add_argument('--profile',choices=(STANDARD,SOLO),default=STANDARD)
    parser.add_argument('--cohort-id',type=int,help='private first-appearance cohort ID; required only for solo-large-cohort-v1')
    parser.add_argument('--max-rss-mib',type=int,default=512)
    parser.add_argument('--timeout-seconds',type=int,default=120)
    parser.add_argument('--decoder-timeout-seconds',type=int,default=60)
    parser.add_argument('--max-scratch-mib',type=int,default=64)
    parser.add_argument('--max-batches',type=int,default=None)
    parser.add_argument('--max-selected-frames',type=int,default=None)
    args=parser.parse_args()
    mapping={}
    try:
        for value in args.source:
            ident,separator,path=value.partition('=')
            if not separator or not re.fullmatch('[1-9][0-9]{0,3}',ident) or int(ident) in mapping:
                raise IngestError('tls_source_mapping_invalid')
            mapping[int(ident)]=Path(path)
        limits={
            'rss_bytes':args.max_rss_mib*1024**2,'timeout_seconds':args.timeout_seconds,
            'decoder_seconds':args.decoder_timeout_seconds,'scratch_bytes':args.max_scratch_mib*1024**2}
        if args.max_batches is not None:limits['max_batches']=args.max_batches
        if args.max_selected_frames is not None:limits['total_frames']=args.max_selected_frames
        result=reconstruct(args.case,mapping,args.output,continue_from=args.continue_from,
                           limits=limits,profile=args.profile,cohort_id=args.cohort_id)
        print(json.dumps({'status':result['status'],'coverage':result.get('coverage'),
                          'reason':result.get('reason')}))
        return 0 if result['status']=='COMPLETE' else 2
    except (IngestError,OSError) as exc:
        print(json.dumps({'status':'FAILED','reason':str(exc) if isinstance(exc,IngestError) else 'tls_output_unavailable'}))
        return 2


if __name__=='__main__':raise SystemExit(main())
