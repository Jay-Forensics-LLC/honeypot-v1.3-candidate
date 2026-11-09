"""Read-only local index queries. Output contains private identifiers; never uploads."""
import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3
from core import IngestError, time_info, canonical
from contract import validate_file


def timeline(db, *, since=None, until=None, source=None, protocol=None, identifier=None, limit=1000, include_unresolved=False):
    if type(limit) is not int or not 1<=limit<=10000: raise IngestError('query_limit')
    clauses=[]; values=[]
    indexed_identifier = identifier is not None and db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='identifier_timeline'").fetchone() is not None
    selector = 'i' if indexed_identifier else 't'
    for name,value,op in [('since',since,'>='),('until',until,'<')]:
        if value is not None:
            ns=time_info(value)['utc_ns']
            if ns is None: raise IngestError('query_time_requires_explicit_timezone')
            clauses.append(selector+'.utc_ns'+op+'?'); values.append(ns)
    if source is not None: clauses.append(selector+'.source_id=?'); values.append(source)
    if protocol is not None: clauses.append(selector+'.protocol=?'); values.append(protocol)
    if identifier is not None:
        clauses.append('i.value=?' if indexed_identifier else 't.event_id IN (SELECT event_id FROM event_identifiers WHERE value=?)'); values.append(identifier)
    # Separate resolved/unresolved ranges preserve NULL-last order while letting
    # SQLite use the chronological indexes and stop at LIMIT without a full sort.
    remaining = limit
    for null_clause in (' IS NOT NULL', ' IS NULL') if include_unresolved and since is None and until is None else (' IS NOT NULL',):
        tables = 'identifier_timeline i JOIN timeline_index t ON t.event_id=i.event_id' if indexed_identifier else 'timeline_index t'
        query='SELECT t.* FROM '+tables+' WHERE '+' AND '.join(clauses+[selector+'.utc_ns'+null_clause])
        query+=' ORDER BY '+','.join(selector+'.'+name for name in ('utc_ns','source_id','ordinal','event_id'))+' LIMIT ?'
        cur=db.execute(query,values+[remaining]); keys=[x[0] for x in cur.description]
        for row in cur:
            result=dict(zip(keys,row)); result['time']=json.loads(result.pop('time_json')); yield result
            remaining -= 1
        if not remaining: return


MAX_SUPPORT_BYTES = 8 * 1024**2


def decoded_row(cursor, row):
    result = dict(zip((column[0] for column in cursor.description), row))
    for name in list(result):
        if name.endswith('_json'):
            result[name[:-5]] = json.loads(result.pop(name))
        elif name in ('limitations','alternatives','losses'):
            result[name] = json.loads(result[name])
    return result


def finding(db, ident, *, limit=100):
    """Resolve an allowlisted finding selector; never execute evidence as SQL.

    Supporting rows are a bounded sample. The exact private SQL/parameters make
    the full selection reproducible without pretending that anchors are all the
    evidence. Original source records remain read-only and are never reopened.
    """
    if type(ident) is not int or ident < 1: raise IngestError('query_finding_id')
    if type(limit) is not int or not 1 <= limit <= 1000: raise IngestError('query_limit')
    cur = db.execute('SELECT * FROM findings WHERE id=?', (ident,))
    row = cur.fetchone()
    if row is None: raise IngestError('query_finding_not_found')
    result = decoded_row(cur, row)
    cur = db.execute('SELECT * FROM rule_evaluations WHERE rule=?', (result['rule'],))
    evaluation = cur.fetchone()
    result['evaluation'] = dict(zip((x[0] for x in cur.description), evaluation)) if evaluation else None
    if result['evaluation']: result['evaluation']['configuration'] = json.loads(result['evaluation']['configuration'])
    evidence = result['evidence']
    selector = evidence.get('selector', {})
    if result['rule'] in ('repeated_syn', 'destination_ports') and selector.get('table') == 'rule_packets':
        where = 'r.context=? AND r.src=? AND r.dst=? AND r.bucket=?'
        parameters = [selector.get(k) for k in ('context','src','dst','bucket')]
        if result['rule'] == 'repeated_syn':
            where += ' AND r.dport=?'; parameters.append(selector.get('dport'))
        sql = '''SELECT p.*,r.event_ns adjusted_utc_ns,rec.offset record_offset,
            rec.length record_length,rec.sha256 record_sha256 FROM rule_packets r
            JOIN packet_meta p ON p.id=r.id JOIN records rec
            ON rec.source_id=p.source_id AND rec.ordinal=p.ordinal WHERE '''+where+' ORDER BY r.id'
    elif result['rule'] == 'dns_long_labels' and selector.get('table') == 'rule_dns':
        parameters = [selector.get(k) for k in ('context','bucket','minimum_label_length')]
        sql = '''SELECT o.*,r.event_ns adjusted_utc_ns,r.label_length FROM rule_dns r
            JOIN observations o ON o.id=r.observation_id
            WHERE r.context=? AND r.bucket=? AND r.label_length>=?
            ORDER BY r.label_length,r.observation_id'''
    elif result['rule'] == 'conflicting_mappings' and type(evidence.get('conflict')) is int:
        parameters = [evidence['conflict']]
        sql = '''SELECT a.*,o.source_id,o.ordinal,o.time_json,o.provenance_json,o.data_json
            FROM conflicts c JOIN associations a ON a.id=c.association_a OR a.id=c.association_b
            JOIN observations o ON o.id=a.evidence_id WHERE c.id=? ORDER BY a.id'''
    else: raise IngestError('query_finding_selector_unsupported')
    support = []
    used_bytes = 0
    truncated = False
    for row in (cur := db.execute(sql+' LIMIT ?', parameters+[limit+1])):
        record = decoded_row(cur, row)
        used_bytes += len(canonical(record))
        if len(support) >= limit or used_bytes > MAX_SUPPORT_BYTES:
            truncated = True
            break
        support.append(record)
    result['support'] = {'records':support, 'returned_records':len(support), 'truncated':truncated,
        'minimum_matching_records':len(support)+int(truncated),
        'complete_match_count':None if truncated else len(support),
        'sample_byte_budget':MAX_SUPPORT_BYTES,
        'reproduction_selector':{'sql':sql,'parameters':parameters},
        'limitation':'Private support sample; truncation does not change the stored finding metrics or full selector.'}
    return result


def main():
    p=argparse.ArgumentParser(description=__doc__); sub=p.add_subparsers(dest='command',required=True)
    t=sub.add_parser('timeline'); t.add_argument('case',type=Path)
    for name in ('since','until','protocol','identifier'): t.add_argument('--'+name)
    t.add_argument('--source',type=int); t.add_argument('--limit',type=int,default=1000); t.add_argument('--include-unresolved',action='store_true')
    v=sub.add_parser('validate-export'); v.add_argument('path',type=Path)
    f=sub.add_parser('flows'); f.add_argument('case',type=Path); f.add_argument('--limit',type=int,default=20)
    g=sub.add_parser('finding'); g.add_argument('case',type=Path); g.add_argument('--id',required=True,type=int); g.add_argument('--limit',type=int,default=100)
    a=p.parse_args()
    try:
        if a.command=='validate-export': print(json.dumps({'validated_records':validate_file(a.path)})); return 0
        with closing(sqlite3.connect((a.case/'index.sqlite').resolve().as_uri()+'?mode=ro',uri=True)) as db:
            if a.command=='timeline':
                for r in timeline(db,since=a.since,until=a.until,source=a.source,protocol=a.protocol,identifier=a.identifier,limit=a.limit,include_unresolved=a.include_unresolved): print(json.dumps(r))
            elif a.command=='finding': print(json.dumps(finding(db,a.id,limit=a.limit)))
            else:
                if not 1<=a.limit<=1000: raise IngestError('query_limit')
                cur=db.execute('SELECT * FROM flows ORDER BY packets DESC,context,protocol,a,b,bucket LIMIT ?',(a.limit,))
                keys=[x[0] for x in cur.description]
                for row in cur: print(json.dumps(dict(zip(keys,row))))
        return 0
    except (IngestError,OSError,ValueError,sqlite3.Error) as exc:
        print(str(exc) if isinstance(exc,IngestError) else 'query_failed_'+type(exc).__name__); return 2

if __name__=='__main__': raise SystemExit(main())
