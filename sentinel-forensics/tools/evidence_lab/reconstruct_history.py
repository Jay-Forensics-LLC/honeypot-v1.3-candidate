"""Bounded, consistent prior artifacts; never authenticated prior execution.

Only explicit sibling page names inside the operator-authorized family are
followed. Physical paths/checksums stay private; semantic links contain neither.
"""
from collections import Counter
from contextlib import contextmanager
import hashlib
import os
from pathlib import Path
import re
import sqlite3
import stat

from core import IngestError, MAX_RECORD, canonical, fingerprint, source_file, strict_json
from reconstruct_input import checksum_entries, hash_stream, metadata
from reconstruct_plan import SELECT, cohort_key, record_size, selection, page_candidates, page_coverage
from reconstruct_history_io import FamilyFiles

SCHEMA='sentinel.tls-continuation/1'
PAGE_SCHEMA='sentinel.tls-derived/3'
PRODUCER_VERSION='1.2.0'
PROOF_SCHEMA='sentinel.tls-page-semantic-proof/1'
MAX_PAGES=16
MAX_MEMBERS=4096
NAME=re.compile('[A-Za-z0-9][A-Za-z0-9_.-]{0,127}')
SHA=re.compile('[0-9a-f]{64}')
MAIN_TABLES={'derivations','packet_references','support'}
BATCH_TABLES={'frames','candidates','segments','assignments','events','support',
              'references_checked','classifications','original_references','classification_data','hello_reference'}
OUTCOMES={'independently_recovered_hello','reference_indeterminate','source_byte_range_missing',
          'conflicting_overlap','complete_record_without_identified_hello'}
REASONS={
    'independently_recovered_hello':{'complete_source_bytes_and_reference_hello'},
    'reference_indeterminate':{'candidate_source_range_unavailable','candidate_source_header_reference_mismatch',
        'candidate_record_extent_reference_mismatch','cohort_or_sequence_assignment_ambiguous',
        'intersecting_payload_range_unavailable','complete_source_bytes_without_unambiguous_reference_record',
        'hello_or_fragment_reference_alignment_ambiguous'},
    'source_byte_range_missing':{'not_covered_in_reference_connection_and_cohort'},
    'conflicting_overlap':{'source_bytes_disagree_in_overlap'},
    'complete_record_without_identified_hello':{'record_complete_not_a_verified_cleartext_hello'}}
SEMANTIC_FIELDS=('schema','producer','producer_version','parser_version','limits','limitations',
    'raw_case_modified','raw_decoding_losses_modified','findings_generated','payload_retention',
    'external_enrichment','name_resolution','compromise_assessment','input_binding',
    'source_configuration','sources','coverage','analysis_profile')
TOOL_FIELDS=('python','sqlite','tshark','code_sha256','lua_sha256','decoder_profile','decoder_profile_sha256')


def require(value,code):
    if not value:raise IngestError(code)


def digest(value):return hashlib.sha256(canonical(value)).hexdigest()


def producer_header(parser_version,limitations):
    """One exact versioned invariant mapping for producer and prior checks."""
    return {'schema':PAGE_SCHEMA,'producer':'Sentinel Forensics optional TLS reconstruction',
        'producer_version':PRODUCER_VERSION,'parser_version':parser_version,'limitations':list(limitations),
        'raw_case_modified':False,'raw_decoding_losses_modified':False,'findings_generated':0,
        'payload_retention':False,'external_enrichment':False,'name_resolution':False,
        'compromise_assessment':'not_performed'}


def safe_name(value):
    require(isinstance(value,str) and NAME.fullmatch(value) and value not in ('.','..'),
            'tls_history_page_name_invalid')
    return value


def request_scope(previous,output):
    output=Path(output)
    safe_name(output.name)
    if previous is None:return None
    require(isinstance(previous,(str,Path)),'tls_history_previous_path_invalid')
    previous=Path(previous)
    require(previous.is_absolute() and previous==previous.resolve() and
            previous.parent==output.parent and previous!=output,'tls_history_sibling_family_required')
    safe_name(previous.name)
    return previous


@contextmanager
def sql_open(path,guard,opener=source_file):
    for suffix in ('-wal','-shm','-journal'):
        require(not os.path.lexists(str(path)+suffix),'tls_history_sqlite_sidecar')
    with opener(path) as (held,_):
        # SQLite opens the held immutable object, never an input-directed path
        # which could be replaced after the stream's security checks.
        uri=(Path('/proc/self/fd')/str(held.fileno())).as_uri()+'?mode=ro&immutable=1'
        db=sqlite3.connect(uri,uri=True)
        try:
            db.row_factory=sqlite3.Row;db.enable_load_extension(False)
            db.execute('PRAGMA trusted_schema=OFF');db.execute('PRAGMA query_only=ON')
            db.execute('PRAGMA mmap_size=0');db.execute('PRAGMA cache_size=-4096');db.execute('PRAGMA temp_store=FILE')
            db.setlimit(sqlite3.SQLITE_LIMIT_LENGTH,MAX_RECORD);db.setlimit(sqlite3.SQLITE_LIMIT_ATTACHED,0)
            db.set_progress_handler(lambda:(guard() or 0),10000)
            yield db
        finally:db.close()


def rows_digest(rows,guard):
    result=hashlib.sha256();count=0
    for row in rows:
        if count%1024==0:guard()
        raw=canonical(list(row));require(len(raw)<=MAX_RECORD,'tls_history_row_budget')
        result.update(raw+b'\n');count+=1
    return {'sha256':result.hexdigest(),'rows':count}


def database_proof(path,tables,guard,opener=source_file):
    with sql_open(path,guard,opener) as db:
        schema=[]
        for row in db.execute("SELECT name,type,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name"):
            require(len(schema)<128,'tls_history_schema_cardinality');schema.append(row)
        require(all(r['type'] in ('table','index') for r in schema),
                'tls_history_sqlite_schema_invalid')
        require({r['name'] for r in schema if r['type']=='table'}==tables,'tls_history_table_inventory')
        proof={'schema':digest([list(row) for row in schema]),'tables':{}}
        for name in sorted(tables):
            columns=db.execute('PRAGMA table_info('+name+')').fetchall()
            require(0<len(columns)<=64,'tls_history_columns_budget')
            require(all(r['sql'].lstrip().upper().startswith('CREATE TABLE ') for r in schema
                        if r['name']==name),'tls_history_ordinary_table_required')
            proof['tables'][name]=rows_digest(db.execute('SELECT * FROM '+name+' ORDER BY '+
                ','.join(str(i) for i in range(1,len(columns)+1))),guard)
        require(db.total_changes==0,'tls_history_index_wrote')
        return proof


def file_sha(path,guard,opener=source_file):
    with opener(path) as (stream,_):return hash_stream(stream,guard)


def semantic_proof(folder,manifest,state,guard,opener=source_file):
    """Predeclared projection: no current digest/checksum cycle or path repair.

    Resources, Git execution revision, per-batch wall_seconds and the separate
    execution/reproduction files are execution metadata. All stable manifest
    fields, complete logical DB contents and exact exports remain substantive.
    Current semantic SHA is written only AFTER this hash, never into exports.
    """
    require(set(manifest)<=set(SEMANTIC_FIELDS)|{'tools','batches','resources','status','continuation'},
            'tls_history_unknown_manifest_field')
    require(set(manifest['tools'])==set(TOOL_FIELDS)|{'revision'},'tls_history_unknown_tool_field')
    stable={name:manifest[name] for name in SEMANTIC_FIELDS}
    # This is a provisional proof of the completed content. It is resumable
    # only if the final state+manifest+ledger later pass COMPLETE verification.
    stable['status']='COMPLETE'
    stable['continuation']={key:value for key,value in manifest['continuation'].items()
                            if key!='semantic_sha256'}
    stable['tools']={name:manifest['tools'][name] for name in TOOL_FIELDS}
    stable['batches']=[{k:v for k,v in row.items() if k!='wall_seconds'} for row in manifest['batches']]
    databases={'index.sqlite':database_proof(folder/'index.sqlite',MAIN_TABLES,guard,opener)}
    require(len(manifest['batches'])<=32,'tls_history_batch_budget')
    for row in manifest['batches']:
        name='batch-'+str(row['id'])+'.sqlite'
        require(name not in databases,'tls_history_duplicate_batch')
        databases[name]=database_proof(folder/name,BATCH_TABLES,guard,opener)
    exports={name:file_sha(folder/name,guard,opener) for name in ('export/observations.jsonl','export/report.md')}
    return {'schema':PROOF_SCHEMA,'manifest':stable,'cursor_state_sha256':digest(state),
            'logical_databases':databases,'exact_minimized_exports':exports}


def binding(bound,manifest,limits,observed):
    return {'parent':dict(bound.binding),'source_configuration':bound.manifest['configuration'],
        'sources':[{key:row[key] for key in ('id','kind','size','sha256')}
                   for _,row in sorted(bound.sources.items())],
        'key_sha256':hashlib.sha256(bound.pseudonym_key).hexdigest(),
        'producer_version':manifest['producer_version'],'parser_version':manifest['parser_version'],
        'producer_header':producer_header(manifest['parser_version'],manifest['limitations']),
        'tools':{key:manifest['tools'][key] for key in TOOL_FIELDS},
        'limits':dict(limits),'planner_version':observed['planner_version'],
        'inventory_sha256':observed['sha256'],
        'maximum_pages':MAX_PAGES if manifest['analysis_profile']['continuation_supported'] else 1,
        'analysis_profile':dict(manifest['analysis_profile'])}


def original_provenance(item,prior_claim=None):
    value={'source_id':item['source_id'],'ordinal':item['ordinal'],
        'packet_number':item['packet_number'],'byte_offset':item['record_offset'],
        'byte_length':item['record_length'],'record_sha256':item['record_sha256'],
        'cohort_id':item['cohort_id'],
        'precision':'multi_packet_source_records','support_table':'support',
        'support_slice_basis':'payload_offset is measured from the captured link frame after the16-byte classic record header'}
    if prior_claim is not None:value['prior_evaluation']=prior_claim
    return value


def finished_coverage(coverage,outcomes,prior_outcomes,page_number,references,links):
    previous=Counter(value['reported_status'] for value in prior_outcomes.values())
    current=Counter(row[1] for row in outcomes)
    statuses=Counter(current)
    if prior_outcomes:statuses['previously_evaluated']=len(prior_outcomes)
    if coverage['excluded_candidates']:statuses['not_evaluated']=sum(coverage['excluded_candidates'].values())
    cumulative=previous+current
    if coverage['excluded_candidates']:cumulative['not_evaluated']=sum(coverage['excluded_candidates'].values())
    accounting={'this_page_evaluated':len(outcomes),'prior_reported':len(prior_outcomes),
        'permanent_not_evaluated':sum(coverage['permanent_candidates'].values()),
        'deferred_not_evaluated':sum(coverage['deferred_candidates'].values()),
        'other_profile_not_evaluated':sum(coverage['other_profile_candidates'].values())}
    require(sum(accounting.values())==coverage['eligible_candidates'],'tls_continuation_disjoint_accounting')
    return dict(coverage,classifications=dict(sorted(statuses.items())),support_links=links,
        support_original_records_rechecked=references,
        prior_reported_classifications=dict(sorted(previous.items())),
        current_evaluated_classifications=dict(sorted(current.items())),
        cumulative_reported_classifications=dict(sorted(cumulative.items())),
        disjoint_candidate_accounting=accounting,page_number=page_number,
        evaluation='NO_ELIGIBLE_CANDIDATES' if not coverage['eligible_candidates'] else 'BOUNDED_PAGE')


def continuation_summary(observed,limits,completed,page_number,previous_semantic,guard,*,cohort_id=None):
    next_selection=selection(observed,limits,completed,guard,cohort_id=cohort_id)
    remaining=len(observed['cohorts'])-len(next_selection['permanent'])-len(completed)
    return {'schema':SCHEMA,'page_number':page_number,'previous_semantic_sha256':previous_semantic,
        'maximum_pages':MAX_PAGES if cohort_id is None else 1,'remaining_fitting_cohorts':remaining,
        'can_continue':cohort_id is None and remaining>0 and page_number<MAX_PAGES,
        'chain_page_limit_reached':remaining>0 and page_number==MAX_PAGES,
        'prior_artifact_consistency_verified':True,'prior_execution_authenticated':False,
        'acquisition_authenticated':False}


class History:
    def __init__(self,previous,output,guard):
        self.previous=request_scope(previous,output);self.family=Path(output).parent
        require(self.family==self.family.resolve(),'tls_history_family_symlink')
        self.io=FamilyFiles(self.family,guard)
        self.guard=guard;self.pages=[];self.files={};self.member_count=0
        self.completed=set();self.outcomes={};self.last_semantic=None;self.last_physical=None
        self.page_number=1

    def check_family(self):
        self.io.check()

    def close(self):
        self.io.close()

    def read_member(self,path,json_value=False,raw_value=False,max_bytes=None):
        self.check_family()
        with self.io.stream(path) as (stream,before):
            if max_bytes is not None:require(before.st_size<=max_bytes,'tls_history_page_size_budget')
            raw=metadata(stream,self.guard) if json_value or raw_value else None
            sha=hash_stream(stream,self.guard)
            observation=(fingerprint(before),sha)
            if path in self.files:require(self.files[path]==observation,'tls_history_member_changed_during_read')
            else:
                require(len(self.files)<MAX_MEMBERS+MAX_PAGES,'tls_history_member_budget')
                self.files[path]=observation
        return (sha,strict_json(raw)) if json_value else (sha,raw) if raw_value else sha

    def load(self,expected_binding,limits):
        """Follow at most15 explicit prior siblings, never a manifest path/glob."""
        name=self.previous.name if self.previous is not None else None;seen=set();newer=None
        while name is not None:
            safe_name(name);require(name not in seen,'tls_history_cycle')
            require(len(seen)<MAX_PAGES-1,'tls_history_page_limit');seen.add(name)
            folder=self.io.register_page(name)
            msha,m=self.read_member(folder/'manifest.json',True)
            _,status=self.read_member(folder/'state.json',True)
            _,cursor=self.read_member(folder/'continuation.json',True)
            require(m['status']=='COMPLETE' and cursor['schema']==SCHEMA
                    and canonical(status)==canonical({'schema':PAGE_SCHEMA,'status':'COMPLETE','version':PRODUCER_VERSION}),
                    'tls_history_complete_current_schema_required')
            require(canonical(cursor['state']['binding'])==canonical(expected_binding),'tls_history_binding_mismatch')
            require(canonical({key:m[key] for key in expected_binding['producer_header']})==
                    canonical(expected_binding['producer_header']),'tls_history_producer_invariants_mismatch')
            require(canonical(m['input_binding'])==canonical(expected_binding['parent'])
                    and canonical(m['analysis_profile'])==canonical(expected_binding['analysis_profile'])
                    and canonical(m['sources'])==canonical(expected_binding['sources'])
                    and canonical(m['source_configuration'])==canonical(expected_binding['source_configuration'])
                    and canonical({key:m['tools'][key] for key in TOOL_FIELDS})==canonical(expected_binding['tools'])
                    and canonical(m['limits'])==canonical(dict(limits,predeclared=True))
                    and m['parser_version']==expected_binding['parser_version'],'tls_history_manifest_binding_mismatch')
            measured=m['resources']
            require(type(measured['wall_seconds']) in (int,float)
                    and all(type(value) is int and value>=0 for value in
                        [measured['child_lifetime_peak_rss_bytes'],
                         *[measured['peaks'][key] for key in ('sampled_tree_rss_bytes','own_lifetime_rss_bytes','scratch_bytes')]]),
                    'tls_history_prior_metric_types')
            require(measured['resource_checks_passed'] is True and measured['sampling_failure'] is None
                    and 0<=measured['wall_seconds']<=limits['timeout_seconds']
                    and measured['peaks']['sampled_tree_rss_bytes']<=limits['rss_bytes']
                    and measured['peaks']['own_lifetime_rss_bytes']+measured['child_lifetime_peak_rss_bytes']<=limits['rss_bytes']
                    and measured['peaks']['scratch_bytes']<=limits['scratch_bytes'],'tls_history_prior_resources_incomplete')
            confirmations=measured['sampling_terminal_confirmations'];transitions=measured['sampling_transitions']
            require(isinstance(confirmations,list) and len(confirmations)<=limits['max_batches']
                    and set(transitions)=={'positive_terminal_observations','missing_rss_rereads'}
                    and all(type(value) is int and value>=0 for value in transitions.values()),
                    'tls_history_prior_sampling_header_invalid')
            for detail in confirmations:
                require(isinstance(detail,dict) and set(detail)=={'code','stage','exception_type','errno','state',
                    'rss_field_count','attempts','confirmation'} and detail['code']=='live_process_memory_unavailable'
                    and detail['stage']=='status' and detail['exception_type']=='ResourceSamplingFailure'
                    and detail['errno'] is None and (detail['state'] is None or
                        (isinstance(detail['state'],str) and len(detail['state'])==1 and detail['state'] in 'RSDZTtXxKWPI'))
                    and type(detail['rss_field_count']) is int and detail['rss_field_count']==0
                    and type(detail['attempts']) is int and detail['attempts']==3
                    and detail['confirmation']=='original_child_reaped_and_group_absent',
                    'tls_history_prior_terminal_confirmation_incomplete')
            require(transitions['positive_terminal_observations']>=len(confirmations)
                    and transitions['missing_rss_rereads']>=2*len(confirmations),
                    'tls_history_prior_sampling_counts_inconsistent')
            state=cursor['state']
            require(set(cursor)=={'schema','state','semantic_proof','semantic_sha256'}
                    and set(state)=={'page_number','binding','previous_semantic_sha256','completed_before',
                                     'selected_cohorts','completed_after','selected_outcomes','prior_claims'}
                    and type(state['page_number']) is int and 1<=state['page_number']<=MAX_PAGES,
                    'tls_history_cursor_shape')
            for field in ('completed_before','selected_cohorts','completed_after'):
                values=state[field]
                require(isinstance(values,list) and len(values)<=limits['candidates']
                        and all(type(i) is int and 1<=i<=limits['candidates'] for i in values)
                        and values==sorted(set(values)),'tls_history_cursor_cohort_set')
            require(isinstance(state['selected_outcomes'],list) and len(state['selected_outcomes'])<=limits['candidates']
                    and isinstance(state['prior_claims'],list) and len(state['prior_claims'])<=limits['candidates']
                    and isinstance(cursor['semantic_sha256'],str) and SHA.fullmatch(cursor['semantic_sha256']),
                    'tls_history_cursor_outcome_budget')
            for outcome in state['selected_outcomes']:
                require(isinstance(outcome,list) and len(outcome)==3 and type(outcome[0]) is int
                        and 1<=outcome[0]<=limits['candidates'] and isinstance(outcome[1],str)
                        and outcome[1] in OUTCOMES and isinstance(outcome[2],str)
                        and outcome[2] in REASONS[outcome[1]],'tls_history_cursor_outcome_invalid')
            require(state['selected_outcomes']==sorted(state['selected_outcomes'])
                    and len({row[0] for row in state['selected_outcomes']})==len(state['selected_outcomes']),
                    'tls_history_cursor_outcome_duplicate')
            prior_ids=[]
            for claim in state['prior_claims']:
                require(isinstance(claim,list) and len(claim)==2 and type(claim[0]) is int
                        and 1<=claim[0]<=limits['candidates'] and isinstance(claim[1],dict),
                        'tls_history_prior_claim_shape')
                ident,value=claim
                require(set(value)=={'semantic_page_sha256','derivation_id','reported_status','reported_reason',
                        'artifact_consistency_verified','execution_authenticated','acquisition_authenticated'}
                        and type(value['derivation_id']) is int and value['derivation_id']==ident
                        and isinstance(value['semantic_page_sha256'],str) and SHA.fullmatch(value['semantic_page_sha256'])
                        and isinstance(value['reported_status'],str) and value['reported_status'] in OUTCOMES
                        and isinstance(value['reported_reason'],str) and value['reported_reason'] in REASONS[value['reported_status']]
                        and value['artifact_consistency_verified'] is True
                        and value['execution_authenticated'] is False and value['acquisition_authenticated'] is False,
                        'tls_history_prior_claim_invalid')
                prior_ids.append(ident)
            require(prior_ids==sorted(set(prior_ids)),'tls_history_prior_claim_duplicate')
            prior_sha=state['previous_semantic_sha256']
            require((state['page_number']==1 and prior_sha is None) or
                    (state['page_number']>1 and isinstance(prior_sha,str) and SHA.fullmatch(prior_sha)),
                    'tls_history_semantic_parent_shape')
            require(isinstance(m['batches'],list) and len(m['batches'])<=limits['max_batches'],
                    'tls_history_batch_budget')
            require(all(isinstance(row,dict) and type(row.get('id')) is int for row in m['batches'])
                    and [row['id'] for row in m['batches']]==list(range(1,len(m['batches'])+1)),
                    'tls_history_batch_ids_invalid')
            _,execution=self.read_member(folder/'continuation-execution-private.json',True)
            require(set(execution)=={'schema','previous_page','previous_ledger_sha256'},'tls_history_execution_shape')
            previous=execution['previous_page']
            if previous is not None:safe_name(previous)  # BEFORE opening anything named by it.
            require(execution['schema']=='sentinel.tls-continuation-execution/1','tls_history_execution_schema')
            require((previous is None and execution['previous_ledger_sha256'] is None) or
                    (previous is not None and isinstance(execution['previous_ledger_sha256'],str)
                     and SHA.fullmatch(execution['previous_ledger_sha256'])),
                    'tls_history_physical_parent_shape')
            ledger_path=folder/'SHA256SUMS'
            physical,raw=self.read_member(ledger_path,raw_value=True)
            entries=checksum_entries(raw);self.member_count+=len(entries)
            require(self.member_count<=MAX_MEMBERS,'tls_history_member_budget')
            expected={'manifest.json','state.json','index.sqlite','pseudonym.key','continuation.json',
                      'continuation-execution-private.json','reproduction-private.json',
                      'export/observations.jsonl','export/report.md'}|{
                      'batch-'+str(row['id'])+'.sqlite' for row in m['batches']}
            require(set(entries)==expected,'tls_history_member_inventory')
            actual=self.io.inventory(folder,{'export'}|{'config-'+str(row['id']) for row in m['batches']});total=0
            require(actual==set(entries),'tls_history_unsealed_member')
            for member,want in entries.items():
                path=folder/member
                require(self.read_member(path,max_bytes=limits['scratch_bytes']-total)==want,'tls_history_member_checksum')
                total+=self.files[path][0][2]
            require(entries['pseudonym.key']==expected_binding['key_sha256'],'tls_history_key_mismatch')
            require(newer is None or newer['execution']['previous_ledger_sha256']==physical,
                    'tls_history_physical_parent_mismatch')
            page={'folder':folder,'manifest':m,'cursor':cursor,'execution':execution,
                  'physical_sha256':physical,'manifest_sha256':msha,'entries':entries,
                  'allowed_dirs':{'export'}|{'config-'+str(row['id']) for row in m['batches']}}
            self.pages.append(page);newer=page;name=previous
        self.pages.reverse();self.page_number=len(self.pages)+1
        if self.pages:self.last_physical=self.pages[-1]['physical_sha256']

    def replay(self,bound,observed,limits,capture_time):
        """Recompute every selected set from the fresh fully reconciled case."""
        if not self.pages:
            self.check_family()
            return
        reference_expected={};key_batches={}
        by_id={item['derivation_id']:item for item in observed['candidates'].values()}
        for number,page in enumerate(self.pages,1):
            cursor=page['cursor'];state=cursor['state'];chosen=selection(observed,limits,self.completed,self.guard)
            expected_candidates=page_candidates(observed,chosen,self.outcomes,self.guard)
            expected_coverage=page_coverage(observed,chosen,expected_candidates)
            require(all(canonical(page['manifest']['coverage'][key])==canonical(value)
                        for key,value in expected_coverage.items()),'tls_history_coverage_replay_mismatch')
            require(state['page_number']==number and state['previous_semantic_sha256']==self.last_semantic
                    and state['completed_before']==sorted(self.completed)
                    and state['selected_cohorts']==chosen['selected_cohorts']
                    and state['prior_claims']==[[ident,self.outcomes[ident]] for ident in sorted(self.outcomes)],
                    'tls_history_selection_replay_mismatch')
            require(chosen['selected_cohorts'],'tls_history_nonprogress_page')
            expected_current={item['derivation_id'] for item in by_id.values()
                              if item['cohort_id'] in set(chosen['selected_cohorts'])}
            outcomes=[]
            with sql_open(page['folder']/'index.sqlite',self.guard,self.io.stream) as db:
                seen=set()
                for row in db.execute('SELECT * FROM derivations ORDER BY id'):
                    self.guard();ident=row['id'];require(ident in by_id and ident not in seen,'tls_history_candidate_inventory');seen.add(ident)
                    original=by_id[ident];provenance=strict_json(row['provenance_json'])
                    require(all(row[key]==original[key] for key in ('source_id','ordinal','packet_number','context'))
                            and canonical(provenance)==canonical(original_provenance(original,self.outcomes.get(ident))),
                            'tls_history_candidate_original_mismatch')
                    if ident in expected_current:
                        require(row['status'] in OUTCOMES and row['reason'] in REASONS[row['status']],
                                'tls_history_current_outcome_incomplete')
                        require(row['kind']==('tls.reassembled_hello' if row['status']=='independently_recovered_hello'
                                             else 'tls.reassembly_evaluation'),'tls_history_current_kind_mismatch')
                        outcomes.append([ident,row['status'],row['reason']])
                    elif ident in self.outcomes:
                        require(row['status']=='previously_evaluated' and strict_json(row['data_json'])=={}
                                and row['kind']=='tls.prior_evaluation_reference'
                                and canonical(provenance.get('prior_evaluation'))==canonical(self.outcomes[ident]),
                                'tls_history_prior_claim_mismatch')
                    else:
                        reason=(chosen['reasons'][original['cohort_id']] if original['cohort_id'] is not None else original['reason'])
                        require(row['status']=='not_evaluated' and row['reason']==reason,'tls_history_exclusion_mismatch')
                    if ident not in expected_current:
                        require(strict_json(row['data_json'])=={} and row['completion_time_json']=='null'
                                and strict_json(row['first_time_json'])==capture_time(original,'candidate_capture',bound.manifest['configuration'])
                                and row['batch_id'] is None and db.execute('SELECT COUNT(*) FROM support WHERE derivation_id=?',(ident,)).fetchone()[0]==0,
                                'tls_history_noncurrent_observation_fabricated')
                require(seen==set(by_id) and {row[0] for row in outcomes}==expected_current,'tls_history_outcome_accounting')
            require(state['selected_outcomes']==outcomes and state['completed_after']==
                    sorted(self.completed|set(chosen['selected_cohorts'])),'tls_history_cursor_outcome_mismatch')
            proof=semantic_proof(page['folder'],page['manifest'],state,self.guard,self.io.stream)
            databases=proof['logical_databases']
            references=sum(value['tables']['references_checked']['rows'] for name,value in databases.items() if name!='index.sqlite')
            links=databases['index.sqlite']['tables']['support']['rows']
            expected_complete=finished_coverage(expected_coverage,outcomes,self.outcomes,number,references,links)
            require(canonical(page['manifest']['coverage'])==canonical(expected_complete),
                    'tls_history_coverage_summary_mismatch')
            expected_continuation=continuation_summary(observed,limits,state['completed_after'],number,self.last_semantic,self.guard)
            require(canonical({key:value for key,value in page['manifest']['continuation'].items() if key!='semantic_sha256'})==
                    canonical(expected_continuation),'tls_history_continuation_summary_mismatch')
            semantic=digest(proof)
            require(canonical(cursor['semantic_proof'])==canonical(proof) and cursor['semantic_sha256']==semantic
                    and page['manifest']['continuation']['semantic_sha256']==semantic,
                    'tls_history_semantic_proof_mismatch')
            for ident,status,reason in outcomes:
                self.outcomes[ident]={'semantic_page_sha256':semantic,'derivation_id':ident,
                    'reported_status':status,'reported_reason':reason,
                    'artifact_consistency_verified':True,'execution_authenticated':False,
                    'acquisition_authenticated':False}
            for batch in chosen['batches']:
                item={'batch':hashlib.sha256(),'main':hashlib.sha256(),'frames':0}
                reference_expected[number,batch['id']]=item
                for key,cohort_id in batch['cohorts'].items():key_batches[key]=(number,batch['id'],cohort_id)
            self.completed.update(chosen['selected_cohorts']);self.last_semantic=semantic
        # A single extra metadata pass proves every prior whole cohort contains
        # ALL original bidirectional occurrences. No per-source/tuple full sorts.
        sizes={sid:value['size'] for sid,value in bound.sources.items()}
        for count,row in enumerate(bound.db.execute(SELECT+' ORDER BY p.id'),1):
            if count%1024==0:self.guard()
            require(count<=limits['packet_rows'],'tls_history_packet_scan_budget')
            target=key_batches.get(cohort_key(row))
            if target is None:continue
            number,batch_id,cohort_id=target;item=reference_expected[number,batch_id]
            item['frames']+=1;frame=item['frames'];record_size(row,sizes)
            original=[frame,row['source_id'],row['ordinal'],row['packet_number'],row['record_offset'],
                      row['record_length'],row['record_sha256'],cohort_id,int(row['id'] in observed['candidates'])]
            item['batch'].update(canonical(original)+b'\n')
            stamp=capture_time(row,'support_capture',bound.manifest['configuration'])
            main=[batch_id,frame,*original[1:8],canonical(stamp).decode()]
            item['main'].update(canonical(main)+b'\n')
        for (number,batch_id),expected in reference_expected.items():
            page=self.pages[number-1]
            with sql_open(page['folder']/('batch-'+str(batch_id)+'.sqlite'),self.guard,self.io.stream) as db:
                actual=rows_digest(db.execute('SELECT * FROM original_references ORDER BY mini_frame'),self.guard)
                require(actual=={'rows':expected['frames'],'sha256':expected['batch'].hexdigest()},'tls_history_whole_cohort_reference_mismatch')
            with sql_open(page['folder']/'index.sqlite',self.guard,self.io.stream) as db:
                actual=rows_digest(db.execute('SELECT * FROM packet_references WHERE batch_id=? ORDER BY mini_frame',(batch_id,)),self.guard)
                require(actual=={'rows':expected['frames'],'sha256':expected['main'].hexdigest()},'tls_history_original_time_reference_mismatch')
        if self.pages:require(selection(observed,limits,self.completed,self.guard)['selected_cohorts'],
                              'tls_history_no_work_remaining')

    def verify_after(self):
        self.check_family()
        for path,(initial,want) in self.files.items():
            with self.io.stream(path) as (stream,before):
                require(fingerprint(before)==initial and hash_stream(stream,self.guard)==want,
                        'tls_history_input_changed')
            if path.suffix=='.sqlite':
                for suffix in ('-wal','-shm','-journal'):
                    require(not os.path.lexists(str(path)+suffix),'tls_history_sqlite_sidecar')
        for page in self.pages:
            require(self.io.inventory(page['folder'],page['allowed_dirs'])==set(page['entries']),
                    'tls_history_unsealed_member_added')
        self.check_family()


def cursor_state(history,expected_binding,coverage,outcomes):
    require(history.page_number<=MAX_PAGES,'tls_history_page_limit')
    selected=coverage['selected_cohorts'];completed=history.completed|set(selected)
    return {'page_number':history.page_number,'binding':expected_binding,
        'previous_semantic_sha256':history.last_semantic,'completed_before':sorted(history.completed),
        'selected_cohorts':selected,'completed_after':sorted(completed),'selected_outcomes':outcomes,
        'prior_claims':[[ident,history.outcomes[ident]] for ident in sorted(history.outcomes)]}
