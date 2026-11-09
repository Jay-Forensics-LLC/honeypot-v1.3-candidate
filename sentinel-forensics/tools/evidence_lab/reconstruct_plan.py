"""Bounded complete-tuple planning; no windows, deduplication or identity claims."""
import hashlib
import ipaddress
import json
import re
from array import array
from core import IngestError, canonical
from reconstruct_stream import PacketReference
MAX_SOURCES=4096
MAX_ROW_BYTES=1048576
HEX64=re.compile('[0-9a-f]{64}')
def require(value,code):
    if not value: raise IngestError(code)
SELECT="""SELECT p.*,r.offset record_offset,r.length record_length,r.sha256 record_sha256,
r.kind record_kind FROM packet_meta p LEFT JOIN records r ON r.source_id=p.source_id AND r.ordinal=p.ordinal"""

def cohort_key(row):
    if row['protocol'] != 'tcp':
        return None
    for field in ('src', 'dst'):
        if row[field] is None:
            return None
        require(isinstance(row[field], str) and len(row[field]) <= 64,
                'tcp_address_representation_invalid')
    for field in ('sport', 'dport'):
        if row[field] is None:
            return None
        require(type(row[field]) is int and 0 <= row[field] <= 65535,
                'tcp_port_invalid')
    left, right = ipaddress.ip_address(row['src']), ipaddress.ip_address(row['dst'])
    require(left.version == right.version and str(left) == row['src']
            and str(right) == row['dst'], 'tcp_address_family_or_spelling_invalid')
    require(isinstance(row['context'], str) and len(row['context']) <= 4096,
            'context_representation_invalid')
    require(isinstance(row['vlan'], str) and len(row['vlan']) <= 128,
            'vlan_representation_invalid')
    vlan = json.loads(row['vlan'])
    require(isinstance(vlan, list) and len(vlan) <= 4
            and all(type(tag) is int and 0 <= tag <= 4095 for tag in vlan),
            'vlan_values_invalid')
    require(type(row['source_id']) is int and 1 <= row['source_id'] <= MAX_SOURCES,
            'cohort_source_id_invalid')
    for field in ('section', 'interface', 'linktype'):
        require(type(row[field]) is int and 0 <= row[field] <= 4294967295,
                'cohort_scope_invalid')
    endpoints = tuple(sorted(((str(left), row['sport']), (str(right), row['dport']))))
    scope = (row['source_id'], row['context'], row['section'], row['interface'],
             row['linktype'], tuple(vlan), left.version)
    return scope, endpoints

def losses(row):
    value = row['losses']
    require(isinstance(value, str) and len(value) <= 16384, 'losses_size_budget')
    result = json.loads(value)
    require(isinstance(result, list) and len(result) <= 64
            and all(isinstance(item, str) and len(item) <= 256 for item in result),
            'losses_representation_invalid')
    return result

def record_size(row, source_sizes):
    sid = row['source_id']
    require(sid in source_sizes and row['record_kind'] == 'packet',
            'record_source_or_kind_mismatch')
    require(type(row['ordinal']) is int and row['ordinal'] > 0,
            'packet_ordinal_invalid')
    offset, length, captured = row['record_offset'], row['record_length'], row['captured_bytes']
    require(type(offset) is int and type(length) is int and type(captured) is int
            and offset >= 0 and 0 < length <= MAX_ROW_BYTES+64
            and 0 <= captured <= MAX_ROW_BYTES and captured <= length
            and offset+length <= source_sizes[sid], 'packet_record_range_invalid')
    require(isinstance(row['record_sha256'], str)
            and HEX64.fullmatch(row['record_sha256']), 'packet_record_hash_invalid')
    # This helper is intentionally limited to the qualified classic-PCAP set.
    # Every selected occurrence therefore preserves its entire original
    # 16-byte record header plus captured link bytes, not a payload estimate.
    require(length == 16+captured, 'classic_record_length_mismatch')
    return length


PLANNER_VERSION='whole-cohort-first-fit/1'
PERMANENT_REASONS={'whole_cohort_frame_cap','whole_cohort_byte_cap',
                   'whole_cohort_frame_and_byte_caps'}


def inventory(bound,limits,guard):
    """Two streaming passes establish stable IDs before page selection."""
    candidates,cohorts={},{}
    source_sizes={sid:value['size'] for sid,value in bound.sources.items()}
    for row in bound.db.execute(SELECT+" WHERE p.losses LIKE '%tls_reassembly_required%' ORDER BY p.id"):
        guard()
        if 'tls_reassembly_required' not in losses(row):continue
        require(len(candidates)<limits['candidates'],'tls_candidate_budget')
        record_size(row,source_sizes)
        ident=len(candidates)+1
        item={key:row[key] for key in ('id','source_id','ordinal','packet_number','context',
            'src','dst','sport','dport','utc_ns','time_json','record_offset','record_length','record_sha256')}
        item.update(derivation_id=ident,cohort=cohort_key(row),status='not_evaluated',
                    reason='candidate_tuple_unavailable',cohort_id=None)
        if item['cohort'] is not None and item['cohort'][1][0]==item['cohort'][1][1]:
            item.update(cohort=None,reason='unsupported_cohort_direction')
        candidates[row['id']]=item
        key=item['cohort']
        if key is not None:
            if key not in cohorts:cohorts[key]={'id':len(cohorts)+1,'frames':0,'bytes':0,'candidates':[]}
            cohorts[key]['candidates'].append(row['id'])
            item['cohort_id']=cohorts[key]['id']
    rows=0
    for row in bound.db.execute(SELECT+' ORDER BY p.id'):
        if rows%1024==0:guard()
        rows+=1
        require(rows<=limits['packet_rows'],'tls_packet_scan_budget')
        key=cohort_key(row)
        if key in cohorts:
            cohorts[key]['frames']+=1
            cohorts[key]['bytes']+=record_size(row,source_sizes)
    digest=hashlib.sha256()
    digest.update(canonical({'planner':PLANNER_VERSION,'packet_rows':rows})+b'\n')
    for key,item in cohorts.items():
        guard();digest.update(canonical({'key':key,**item})+b'\n')
    for item in candidates.values():
        digest.update(canonical(item)+b'\n')
    return {'candidates':candidates,'cohorts':cohorts,'packet_rows':rows,
            'sha256':digest.hexdigest(),'planner_version':PLANNER_VERSION}


def selection(inventory,limits,completed=(),guard=lambda:None,*,cohort_id=None):
    """Pure first-fit replay; completed is an exact SET, never an ordinal."""
    require(isinstance(completed,(list,tuple,set,frozenset))
            and len(completed)<=len(inventory['cohorts']),'tls_continuation_completed_set_invalid')
    completed=list(completed)
    require(len(completed)==len(set(completed)) and all(type(i) is int and i>0 for i in completed),
            'tls_continuation_completed_set_invalid')
    completed=set(completed);cohorts=inventory['cohorts']
    if cohort_id is not None:
        require(type(cohort_id) is int and any(item['id']==cohort_id for item in cohorts.values()),
                'tls_solo_cohort_not_found')
        require(not completed or completed=={cohort_id},'tls_solo_completed_set_invalid')
    require(completed<={item['id'] for item in cohorts.values()},'tls_continuation_unknown_cohort')
    requested_id=cohort_id
    batches,selected,reasons,permanent,total=[],{}, {},set(),0
    for key,item in cohorts.items():
        guard();cohort_id=item['id'];reason=None
        if requested_id is not None and cohort_id!=requested_id:
            permanent.add(cohort_id);reasons[cohort_id]='not_selected_by_profile';continue
        if item['frames']>limits['batch_frames']:reason='whole_cohort_frame_cap'
        if item['bytes']+24>limits['batch_bytes']:reason='whole_cohort_byte_cap' if reason is None else 'whole_cohort_frame_and_byte_caps'
        if reason is not None:
            require(cohort_id not in completed,'tls_continuation_permanent_cohort_completed')
            permanent.add(cohort_id)
        if cohort_id in completed:continue
        if reason is None and total+item['frames']>limits['total_frames']:reason='total_frame_selection_cap'
        batch=None
        if reason is None:
            batch=next((b for b in batches if b['scope']==key[0] and len(b['cohorts'])<limits['batch_cohorts']
                and b['frames']+item['frames']<=limits['batch_frames']
                and b['bytes']+item['bytes']<=limits['batch_bytes']),None)
            if batch is None and len(batches)<limits['max_batches']:
                batch={'id':len(batches)+1,'scope':key[0],'cohorts':{},'frames':0,'bytes':24,
                       'packet_ids':array('Q'),'references':[],'information':{},'candidates':{}}
                batches.append(batch)
            if batch is None:reason='batch_selection_cap'
        if reason is not None:
            reasons[cohort_id]=reason;continue
        batch['cohorts'][key]=cohort_id
        batch['frames']+=item['frames'];batch['bytes']+=item['bytes'];total+=item['frames']
        selected[key]=batch
    return {'batches':batches,'selected':selected,'reasons':reasons,'permanent':permanent,
            'completed':completed,'selected_cohorts':sorted(i for b in batches for i in b['cohorts'].values()),
            'selected_frames':total}


def page_candidates(observed,chosen,prior_outcomes,guard):
    selected=chosen['selected']
    candidates={pid:dict(item) for pid,item in observed['candidates'].items()}
    prior_outcomes=prior_outcomes or {}
    for pid,item in candidates.items():
        guard();key=item['cohort'];cohort_id=item['cohort_id']
        if cohort_id in chosen['completed']:
            require(item['derivation_id'] in prior_outcomes,'tls_continuation_prior_outcome_missing')
            item.update(status='previously_evaluated',reason='prior_artifact_reported_evaluation',
                        prior_evaluation=prior_outcomes[item['derivation_id']])
        elif key in selected:
            item.update(status='selected',reason='selected_whole_cohort',batch_id=selected[key]['id'])
        elif cohort_id is not None:item['reason']=chosen['reasons'][cohort_id]
    return candidates


def page_coverage(observed,chosen,candidates):
    excluded={};permanent={};deferred={};other_profile={}
    for item in candidates.values():
        if item['status']=='not_evaluated':
            reason=item['reason'];excluded[reason]=excluded.get(reason,0)+1
            counts=(other_profile if reason=='not_selected_by_profile' else
                    permanent if item['cohort_id'] is None or reason in PERMANENT_REASONS else deferred)
            counts[reason]=counts.get(reason,0)+1
    count=sum(item['status']=='selected' for item in candidates.values())
    prior_count=sum(item['status']=='previously_evaluated' for item in candidates.values())
    require(count+prior_count+sum(excluded.values())==len(candidates),'tls_candidate_selection_reconciliation')
    coverage={'eligible_candidates':len(candidates),'selected_candidates':count,
        'previously_evaluated_candidates':prior_count,'excluded_candidates':excluded,
        'permanent_candidates':permanent,'deferred_candidates':deferred,
        'other_profile_candidates':other_profile,
        'selected_cohorts':chosen['selected_cohorts'],'completed_cohorts_before':sorted(chosen['completed']),
        'batches':len(chosen['batches']),'selected_frames':chosen['selected_frames'],
        'derivative_bytes':sum(batch['bytes'] for batch in chosen['batches']),
        'inventory_sha256':observed['sha256'],'planner_version':PLANNER_VERSION,
        'scope':'Indexed complete-header TCP tuples only; whole same-scope cohorts, both directions, no deduplication.'}
    return coverage


def plan(bound,limits,guard,*,known_inventory=None,completed=(),prior_outcomes=None,cohort_id=None):
    """Materialize only this page's entire selected cohorts in capture order."""
    observed=known_inventory if known_inventory is not None else inventory(bound,limits,guard)
    chosen=selection(observed,limits,completed,guard,cohort_id=cohort_id);batches=chosen['batches'];selected=chosen['selected']
    candidates=page_candidates(observed,chosen,prior_outcomes,guard)
    for row in bound.db.execute(SELECT+' ORDER BY p.id'):
        if row['id']%1024==0:guard()
        key=cohort_key(row);batch=selected.get(key)
        if batch is None:continue
        require(len(batch['packet_ids'])<limits['batch_frames'],'tls_batch_reference_budget')
        batch['packet_ids'].append(row['id'])
    for batch in batches:
        require(len(batch['packet_ids'])==batch['frames'],'whole_cohort_packet_id_reconciliation')
    return candidates,batches,page_coverage(observed,chosen,candidates)


def materialize_batch(bound,batch,candidates,limits,guard):
    """At most one <=16384-frame batch gets eager reference dictionaries.

    Compact page-wide packet-ID arrays retain capture order. Fixed 256-ID
    primary-key lookups never repeat a full per-source/per-cohort scan or sort.
    """
    require(not batch['references'] and not batch['information'] and not batch['candidates'],
            'tls_batch_already_materialized')
    require(len(batch['packet_ids'])==batch['frames']<=limits['batch_frames'],
            'tls_batch_packet_ids_incomplete')
    sizes={sid:value['size'] for sid,value in bound.sources.items()}
    previous=0
    for start in range(0,len(batch['packet_ids']),256):
        guard();ids=list(batch['packet_ids'][start:start+256])
        require(ids==sorted(set(ids)) and ids[0]>previous,'tls_batch_packet_id_order')
        rows=bound.db.execute(SELECT+' WHERE p.id IN ('+','.join('?' for _ in ids)+') ORDER BY p.id',ids)
        seen=[]
        for row in rows:
            guard()
            require(len(seen)<len(ids) and row['id']==ids[len(seen)],'tls_batch_packet_id_lookup_incomplete')
            seen.append(row['id']);key=cohort_key(row)
            require(key in batch['cohorts'],'tls_batch_packet_scope_changed')
            record_size(row,sizes)
            ref=PacketReference(row['ordinal'],row['packet_number'],row['record_offset'],
                row['record_length'],row['record_sha256'],batch['cohorts'][key])
            require(len(batch['references'])<limits['batch_frames'],'tls_batch_reference_budget')
            batch['references'].append(ref);frame=len(batch['references'])
            batch['information'][frame]={key:row[key] for key in ('source_id','ordinal','packet_number',
                'context','utc_ns','time_json','src','dst','sport','dport')}
            if row['id'] in candidates:
                require(candidates[row['id']]['status']=='selected','tls_batch_noncurrent_candidate')
                batch['candidates'][frame]=candidates[row['id']]['derivation_id']
        require(seen==ids,'tls_batch_packet_id_lookup_incomplete');previous=ids[-1]
    require(len(batch['references'])==batch['frames']
            and 24+sum(ref.length for ref in batch['references'])==batch['bytes'],
            'whole_cohort_reference_reconciliation')


def release_batch(batch):
    for field in ('references','information','candidates'):batch[field].clear()
    del batch['packet_ids'][:]
