"""Offline forensic analysis CLI. Python 3.11+; standard library; no network calls."""
# Modified for HoneyTrace on 2026-11-01: exact source summaries and bounded CLI inputs.
from __future__ import annotations
import argparse
from contextlib import closing
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import re
import shutil
import sqlite3
import sys
import uuid

from core import (IngestError, Limits, canonical, hash_file, ingest, records, iso_ns,
                  MAX_RECORD, Reader, fingerprint, source_file, private_write, atomic_json,
                  strict_json, json_schema_probe, time_info, VERSION, IOS_PARSER_VERSION,
                  read_configuration, read_pseudonym_key)
from capture import MAGICS, NG, packets, ng_packets
from adapters import (normalize, normalize_ble_ard_parallel, json_rows, csv_rows,
                      sqlite_snapshot, sqlite_rows, TETRA, BLE, BLE_ARD_PARALLEL)
from store import Store
from correlate import correlate
from rules import evaluate, configuration as rule_configuration
from report import coverage, export

MAX_SUMMARY_ROWS = 1024
MAX_SOURCES = 4096


def valid_source_id(value):
    # Match the stored positional string keys exactly. Alternate spellings must
    # not validate and then silently miss Store's source lookup. Bound before int.
    return (isinstance(value, str) and
            re.fullmatch(r'[1-9][0-9]{0,3}', value) is not None and
            int(value) <= MAX_SOURCES)


def text_time_info(value):
    """Retain source spelling; canonicalize only supported offset notation."""
    supported = (value is None or isinstance(value, str) and len(value) <= 128 or
                 type(value) is int and value.bit_length() <= 128 or
                 type(value) is float and math.isfinite(value))
    if not supported:
        when = time_info()
        when.update(original={'type':'unsupported_representation'}, status='unresolved')
        return when, 'unsupported_representation'
    if not isinstance(value, str):
        return time_info(value), None
    # The existing bounded text parser recognizes both compact offsets and a
    # space before the offset. Normalize notation, never the supplied time.
    normalized = re.sub(r' ?([+-][0-9]{2}):?([0-9]{2})$', r'\1:\2', value)
    when = time_info(normalized)
    when['original'] = value
    extra = re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}'
                         r'\.([0-9]{10,})(Z|[+-][0-9]{2}:[0-9]{2})?', normalized)
    if when['status'] == 'unresolved' and extra:
        when.update(precision=None, timezone=extra[2])
        return when, 'unsupported_precision'
    return when, None


def lines(reader):
    """Legacy bounded line framing, preserving byte ranges and explicit errors."""
    number = 0
    while True:
        offset = reader.offset
        chunk = reader.line()
        if not chunk: return
        number += 1
        digest = hashlib.sha256(chunk)
        length, oversized, last = len(chunk), len(chunk)>MAX_RECORD, chunk
        while last and not last.endswith(b'\n'):
            last = reader.line(); digest.update(last); length += len(last)
            if last: oversized = True
        if oversized:
            yield (number,offset,length,digest.hexdigest(),None,'parse_error','text',0,'record_budget_exceeded'), None, None
            continue
        for loc,raw,obj,error in records('input.log',chunk,Limits()):
            value = next((obj[k] for k in ('timestamp','time','date','captureTime') if k in obj),None) if obj else None
            when, issue = text_time_info(value)
            reason = issue or when['status']
            status = error or (None if reason == 'normalized' else 'timestamp_'+reason)
            row = (number,offset,length,digest.hexdigest(),iso_ns(when['utc_ns']),
                   'parse_error' if error else 'observation','text',0,status)
            yield row, when, issue


def config_validate(config):
    if not isinstance(config,dict) or set(config)-{'contexts','clock_adjustments','rules','flow_bucket_seconds'}:
        raise IngestError('invalid_configuration')
    if not isinstance(config.get('contexts',{}),dict) or not isinstance(config.get('clock_adjustments',{}),dict):
        raise IngestError('configuration_maps_required')
    for sid,context in config.get('contexts',{}).items():
        if not valid_source_id(sid) or not isinstance(context,str) or not re.fullmatch(r'[a-zA-Z0-9:_,./-]{1,128}',context):
            raise IngestError('invalid_context_configuration')
    for sid,adj in config.get('clock_adjustments',{}).items():
        if not valid_source_id(sid) or not isinstance(adj,dict) or set(adj) != {'offset_ns','justification'} or type(adj['offset_ns']) is not int or abs(adj['offset_ns'])>30*86400*10**9 or not isinstance(adj['justification'],str) or not 1<=len(adj['justification'])<=512:
            raise IngestError('invalid_clock_adjustment')
    bucket = config.get('flow_bucket_seconds',300)
    if type(bucket) is not int or not 1<=bucket<=86400: raise IngestError('invalid_flow_bucket')
    rule_configuration(config.get('rules'))
    return config


def add_adapter_record(store, sid, item, *, normalizer=normalize):
    ordinal,loc,obj,digest,error = item
    try:
        if error: raise IngestError(error)
        kind,data,when = normalizer(obj)
        store.observe(sid,ordinal,kind,data,when,{'source_id':sid,**loc,'record_sha256':digest},digest)
        status = None if when['status']=='normalized' else 'timestamp_'+when['status']
    except (IngestError,ValueError,TypeError) as exc:
        kind = 'parse_error'; status = str(exc) if isinstance(exc,IngestError) else 'malformed_adapter_record'
        when = time_info()
    store.add_record(sid,(ordinal,loc.get('byte_offset'),loc.get('byte_length'),digest,iso_ns(when['utc_ns']),
                          'parse_error' if kind=='parse_error' else 'observation','radio',0,status))


def analyze(paths, output, *, config=None, pseudonym_key=None, min_free_bytes=64*1024**2):
    config = config_validate({} if config is None else config)
    paths=list(paths)
    if len(paths)>MAX_SOURCES: raise IngestError('source_inventory_budget')
    if any(not 1<=int(k)<=len(paths) for field in ('contexts','clock_adjustments') for k in config.get(field,{})):
        raise IngestError('configuration_source_id_out_of_range')
    output = Path(output)
    repo = Path(__file__).resolve().parents[2]
    if output.resolve().is_relative_to(repo) or Path(os.path.abspath(output))!=output.resolve():
        raise IngestError('case_directory_must_be_outside_repository_and_non_symlink')
    if not paths: raise IngestError('inputs_required')
    try: output.mkdir(mode=0o700)
    except OSError: raise IngestError('output_unavailable') from None
    previous_tmp = os.environ.get('SQLITE_TMPDIR')
    os.environ['SQLITE_TMPDIR'] = str(output.resolve())
    try:
        if shutil.disk_usage(output).free < min_free_bytes: raise IngestError('insufficient_output_space')
        atomic_json(output/'state.json',{'status':'INCOMPLETE','stage':'ingestion','version':VERSION})
        key = pseudonym_key if pseudonym_key is not None else os.urandom(32)
        if not isinstance(key,bytes) or len(key)!=32: raise IngestError('pseudonym_key_must_be_32_bytes')
        private_write(output/'pseudonym.key',key)
        dbpath = output/'index.sqlite'; private_write(dbpath,b'')
        with closing(sqlite3.connect(dbpath)) as db:
            store = Store(db,contexts=config.get('contexts'),adjustments=config.get('clock_adjustments'))
            sources = []
            for sid,name in enumerate(paths,1):
                path = Path(name)
                details = {}
                row = None
                with source_file(path) as (stream,before):
                    magic = stream.read(16); stream.seek(0)
                    reader = Reader(stream)
                    if magic[:4] in MAGICS or magic[:4] == NG:
                        kind = 'pcap' if magic[:4] in MAGICS else 'pcapng'
                        parser = packets if kind=='pcap' else ng_packets
                        for n,row in enumerate(parser(reader),1):
                            store.add_record(sid,row); store.packet(sid,row.packet)
                            if row.packet.kind != 'packet':
                                # Metadata only, no captured names, secrets, or comments.
                                store.observe(sid,row[0],'capture.block',row.packet.metadata,time_info(),
                                  {'source_id':sid,'byte_offset':row[1],'byte_length':row[2],'block':row.packet.block,'precision':'byte'},row[3])
                            if n%10000==0:
                                db.commit()
                                if shutil.disk_usage(output).free<min_free_bytes: raise IngestError('output_space_exhausted')
                        sha,size = reader.sha.hexdigest(),reader.offset
                    elif magic == b'SQLite format 3\0':
                        kind = 'tetra_sqlite'
                        h = hashlib.sha256()
                        for chunk in iter(lambda: stream.read(MAX_RECORD),b''): h.update(chunk)
                        sha,size = h.hexdigest(),stream.tell()
                        snapshot,details = sqlite_snapshot(path,stream,output,sid)
                        if snapshot:
                            try:
                                if hash_file(snapshot)!=sha: raise IngestError('snapshot_integrity_failure')
                                for ordinal,loc,obj,digest,extra in sqlite_rows(snapshot,details):
                                    try:
                                        event,data,when = normalize(obj); data.update(extra)
                                        store.observe(sid,ordinal,event,data,when,{'source_id':sid,**loc,'record_sha256':digest},digest)
                                        store.add_record(sid,(ordinal,None,None,digest,iso_ns(when['utc_ns']),'observation','wifi',0,
                                                           None if when['status']=='normalized' else 'timestamp_'+when['status']))
                                    except IngestError as exc:
                                        store.add_record(sid,(ordinal,None,None,digest,None,'parse_error','wifi',0,str(exc)))
                                    if ordinal%10000==0: db.commit()
                            except (IngestError,sqlite3.Error) as exc:
                                details.update(compatibility='unsupported_or_partial',error=str(exc) if isinstance(exc,IngestError) else 'sqlite_decode_error')
                            finally: snapshot.unlink()
                        if details.get('error'):
                            ordinal = db.execute('SELECT COALESCE(MAX(ordinal),0)+1 FROM records WHERE source_id=?',(sid,)).fetchone()[0]
                            store.add_record(sid,(ordinal,None,None,sha,None,'parse_error','sqlite',0,details['error']))
                    elif path.suffix.lower() in ('.csv','.json') or path.name.lower().endswith(('.tetra.jsonl','.ble.jsonl')):
                        kind = 'radio_export'
                        parser = csv_rows(reader, details) if path.suffix.lower()=='.csv' else json_rows(reader,full=path.suffix.lower()=='.json')
                        for item in parser:
                            normalizer = normalize_ble_ard_parallel if details.get('adapter_profile') == BLE_ARD_PARALLEL else normalize
                            add_adapter_record(store,sid,item,normalizer=normalizer)
                        sha,size = reader.sha.hexdigest(),reader.offset
                        details.setdefault('compatibility', 'declared_schema_only_unless_separately_validated')
                    elif path.suffix.lower() in ('.jsonl','.ndjson','.log','.txt'):
                        kind = 'text'
                        # Explicit radio schema markers select a dedicated adapter, never vendor guesswork.
                        first = stream.readline(MAX_RECORD+1); stream.seek(0)
                        try: marker = json_schema_probe(first)
                        except (ValueError,UnicodeError,IngestError): marker = False
                        if marker:
                            kind='radio_export'
                            for item in json_rows(reader): add_adapter_record(store,sid,item)
                        else:
                            for row,when,issue in lines(reader):
                                store.add_record(sid,row)
                                if row[5]=='observation':
                                    # Carry only the parsed time; never arbitrary message text.
                                    data = {'timestamp_status':issue} if issue else {}
                                    store.observe(sid,row[0],'telemetry.record',data,when,{'source_id':sid,'line':row[0],
                                      'byte_offset':row[1],'byte_length':row[2],'precision':'byte','record_sha256':row[3]},row[3])
                        sha,size = reader.sha.hexdigest(),reader.offset
                    elif path.suffix.lower() in ('.zip','.tar','.gz','.tgz'):
                        kind = 'diagnostic_archive'
                        manifest = ingest(path,output/f'archive-{sid}',preserve_time_original=True)
                        sha,size = manifest['archive']['sha256'],manifest['archive']['size']
                        details.update(coverage=manifest['coverage'],unsupported_members=sum(f['discovery']!='supported_candidate' for f in manifest['files']))
                        with (output/f'archive-{sid}'/'events.jsonl').open('rb') as events:
                            for ordinal,raw in enumerate(events,1):
                                ev = strict_json(raw); norm = ev.get('normalized') or {}
                                digest=ev['provenance']['record_sha256']
                                when,issue,data = None,None,{}
                                if ev['record_type']=='observation':
                                    # The legacy diagnostic timestamp is microsecond
                                    # normalized. Use only its bounded source value.
                                    when,issue=text_time_info(norm.get('timestamp_original'))
                                    when['clock']='diagnostic_unverified'
                                    if norm.get('timestamp_status')=='unsupported_nonfinite':
                                        # A supplied nonfinite plist value is present but
                                        # unsupported, rather than an absent timestamp.
                                        when.update(status='unresolved',original={'type':'nonfinite_number'})
                                        issue='unsupported_nonfinite'
                                    elif norm.get('timestamp_status')=='unsupported' and 'timestamp_original' not in norm:
                                        # The archive ingestor omits unsafe source
                                        # representations rather than retaining payloads.
                                        when.update(status='unresolved',original={'type':'unsupported_representation'})
                                        issue='unsupported_representation'
                                    if issue: data['timestamp_status']=issue
                                reason = (issue or when['status']) if when else None
                                status = ev.get('error_code') or ('timestamp_'+reason if reason and reason!='normalized' else None)
                                store.add_record(sid,(ordinal,None,None,digest,iso_ns(when['utc_ns']) if when else None,ev['record_type'],'diagnostic',0,status))
                                if when is not None:
                                    store.observe(sid,ordinal,norm['event_type'],data,when,{'source_id':sid,**ev['provenance'],'precision':'archive_member_logical'},digest)
                    else:
                        kind='unsupported'
                        for chunk in iter(lambda:reader.read(MAX_RECORD),b''): pass
                        sha,size=reader.sha.hexdigest(),reader.offset
                        details.update(compatibility='unsupported',error='unsupported_input_format')
                        store.add_record(sid,(1,None,None,sha,None,'parse_error','unknown',0,'unsupported_input_format'))
                    if kind=='tetra_sqlite' and not details.get('sidecars') and any(Path(str(path)+suffix).exists() for suffix in ('-wal','-shm','-journal')):
                        raise IngestError('sqlite_sidecars_changed')
                    if size!=before.st_size: raise IngestError('source_changed_or_incompletely_read')
                    details['source_mtime_ns'] = before.st_mtime_ns
                    db.execute('INSERT INTO sources VALUES (?,?,?,?)',(sid,sha,size,kind))
                    db.execute('INSERT INTO source_details VALUES (?,?,?)',(sid,VERSION,canonical(details).decode()))
                    sources.append({'id':sid,'sha256':sha,'size':size,'kind':kind,'parser_version':VERSION,'metadata':details})
                    db.commit()
            atomic_json(output/'state.json',{'status':'INCOMPLETE','stage':'analysis','version':VERSION})
            db.execute('''INSERT INTO summary SELECT source_id,kind,protocol,COUNT(*),SUM(captured_bytes),MIN(timestamp),MAX(timestamp)
                          FROM records GROUP BY source_id,kind,protocol''')
            # Reject adjusted ranges that could overflow SQLite's integer query keys.
            for low,high,offset in db.execute('SELECT MIN(utc_ns),MAX(utc_ns),a.offset_ns FROM timeline t JOIN adjustments a ON a.source_id=t.source_id GROUP BY a.source_id'):
                if low is not None and not -(2**63)<low<=high<2**63: raise IngestError('adjusted_time_overflow')
            store.index_timeline(); store.aggregate(config.get('flow_bucket_seconds',300)); correlate(db); evaluate(db,config.get('rules'))
            db.commit()
            summary_total = db.execute('SELECT COUNT(*) FROM summary').fetchone()[0]
            summary = [dict(zip(('source_id','kind','protocol','records','captured_bytes','first_time','last_time'),row)) for row in db.execute('SELECT * FROM summary ORDER BY source_id,kind,protocol LIMIT ?',(MAX_SUMMARY_ROWS,))]
            manifest = {'schema':'evidence-lab/2','status':'COMPLETE','run_id':str(uuid.uuid4()),'parser_version':VERSION,
             'sources':sources,'summary':summary,'summary_rows_total':summary_total,'summary_complete_in_manifest':summary_total<=MAX_SUMMARY_ROWS,'configuration':config,
             'tools':{'python':platform.python_version(),'sqlite':sqlite3.sqlite_version,'ios_sysdiagnose':IOS_PARSER_VERSION,
                      'code_sha256':{p.name:hash_file(p) for p in sorted(Path(__file__).parent.glob('*.py'))}},
             'privacy':{'index':'private_exact_identifiers','export':'case_scoped_hmac_minimized_not_anonymous',
                        'payload_retention':False,'external_enrichment':False,'name_resolution':False},
             'compromise_assessment':'not_performed','interpretations':[],'suspected_anomalies':[],
             'coverage':coverage(db),'limitations':[
              'Supported-subset analysis only; findings are review leads, never a clean or compromised verdict.',
              'No TCP/IP fragment reassembly, TLS decryption, encrypted DNS, QUIC decoding or session reconstruction. Complete supported IGMP messages have checksum validation; IPv4/TCP/UDP checksums are unvalidated (capture offload may affect them).',
              'IGMP observations describe captured control messages and ordered group records, not persistent membership, sessions or physical identities. Unknown types, auxiliary/trailing data and parser budgets remain explicit decoding losses.',
              'Packet metadata excludes payloads. DNS/TLS decode requires complete supported messages in one packet.',
              'Flow windows aggregate observed packets and link-layer captured bytes, not application bytes or complete sessions.',
              'Missing/timezone-free times stay unresolved; capture clocks and dataset/device origin are unverified.',
              'Diagnostic adapter covers bounded subsets; original time representations are retained locally up to declared record limits.',
              'Source hashes and metadata checks detect ordinary mutation, not adversarial metadata-preserving concurrent rewrites.',
              'Unknown blocks/options/protocols/schemas and decoding losses remain explicitly inventoried. Manifests show at most 1024 summary groups; full groups remain in SQLite.',
              'No automatic cross-source network identity merge; context mappings and clock adjustments require explicit configuration.',
              'Tetra SQLite support is an inspected recon schema subset. BLE-ARD parallel CSV is a versioned header layout, not verified collector origin; timestamps/type codes stay unresolved or uninterpreted. Other BLE/exchange vendor coverage remains unverified.',
              'No crash resume. Cancellation leaves INCOMPLETE/CANCELLED state; rerun into a new case directory.',
              'POSIX private permissions verified locally; Windows ACL and performance equivalence unverified.',
              'HoneyTrace contract is versioned exchange only; no HoneyTrace runtime ingestion or classification changes.']}
            export(db,output/'export',manifest,key)
        private_write(output/'manifest.json',canonical(manifest)+b'\n')
        atomic_json(output/'state.json',{'status':'COMPLETE','version':VERSION})
        checksums=[]
        for path in sorted(output.rglob('*')):
            if path.is_file(): checksums.append(hash_file(path)+'  '+path.relative_to(output).as_posix())
        private_write(output/'SHA256SUMS',('\n'.join(checksums)+'\n').encode())
        return manifest
    except IngestError as exc:
        exc.details={'source_id':locals().get('sid'),'processed_bytes':locals().get('reader').offset if locals().get('reader') else None,
                     'last_framed_ordinal':locals().get('row')[0] if isinstance(locals().get('row'),tuple) else None,
                     'incomplete':True,'partial_outputs_removed':True}
        shutil.rmtree(output)
        raise
    except KeyboardInterrupt:
        atomic_json(output/'state.json',{'status':'CANCELLED','version':VERSION})
        raise
    except BaseException:
        shutil.rmtree(output)
        raise
    finally:
        if previous_tmp is None: os.environ.pop('SQLITE_TMPDIR',None)
        else: os.environ['SQLITE_TMPDIR']=previous_tmp


def main():
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('inputs',nargs='+',type=Path); cli.add_argument('--output',required=True,type=Path)
    cli.add_argument('--config',type=Path); cli.add_argument('--pseudonym-key',type=Path)
    args=cli.parse_args()
    try:
        result=analyze(args.inputs,args.output,config=read_configuration(args.config) if args.config else None,
                       pseudonym_key=read_pseudonym_key(args.pseudonym_key) if args.pseudonym_key else None)
    except KeyboardInterrupt: print('analysis_cancelled'); return 130
    except (IngestError,OSError,sqlite3.Error,ValueError,TypeError) as exc:
        print(str(exc) if isinstance(exc,IngestError) else 'analysis_failed_'+type(exc).__name__); return 2
    print(json.dumps({'status':result['status'],'sources':len(result['sources']),'coverage':result['coverage']['counts']}))
    return 0

if __name__=='__main__': raise SystemExit(main())
