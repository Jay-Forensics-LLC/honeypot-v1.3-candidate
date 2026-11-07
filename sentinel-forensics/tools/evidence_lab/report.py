"""Minimized deterministic exchange and human reports from the private index."""
import hashlib
import hmac
import json
import os
from pathlib import Path
import shlex
from core import canonical, private_write, iso_ns
from contract import CONTRACT, validate

IDENTIFIERS = {'src','dst','src_mac','dst_mac','client_mac','assigned_ip','client_ip','mac','bssid','ssid',
 'address','name','scanner','server_name','left_value','right_value','context','a','b',
 'manufacturer_data','service_data','service_uuids','manufacturer_id','first_seen','last_seen','tables','unsupported_tables','uninterpreted_columns',
 'security','encryption_code_uninterpreted','hidden','wps','scan_id','source_addresses'}


def minimize(value, key, field=None):
    if value is None: return None
    # SQLite's affinity does not constrain source-defined IDs to integers. Keep
    # rowid/table for location, but pseudonymize the arbitrary original ID value.
    if field=='provenance' and isinstance(value,dict) and 'table' in value:
        return {k:minimize(v,key,'address' if k=='id' else k) for k,v in value.items()}
    if field=='contexts' and isinstance(value,dict): return {k:minimize(v,key,'context') for k,v in value.items()}
    if field=='clock' and value not in ('unknown','capture_interface','scanner_unverified','diagnostic_unverified'):
        return minimize(value,key,'scanner')
    if field in IDENTIFIERS:
        return 'p_'+hmac.new(key,canonical(value),hashlib.sha256).hexdigest()[:32]
    if isinstance(value,dict):
        return {k:minimize(v,key,k) for k,v in value.items() if k not in ('original','justification')}
    if isinstance(value,list): return [minimize(v,key) for v in value]
    return value


def rows(db, query):
    cur = db.execute(query)
    keys = [x[0] for x in cur.description]
    for row in cur: yield dict(zip(keys,row))


def coverage(db):
    counts = {}
    for name,table in [('packet_records','packet_meta'),('observations','observations'),('flows','flows'),
                       ('associations','associations'),('conflicts','conflicts'),('findings','findings')]:
        counts[name] = db.execute('SELECT COUNT(*) FROM '+table).fetchone()[0]
    counts['parse_errors'] = db.execute("SELECT COUNT(*) FROM records WHERE kind='parse_error'").fetchone()[0]
    counts['duplicate_records'] = db.execute('SELECT COUNT(*) FROM duplicates').fetchone()[0]
    losses = {}
    # Only the finite decoder code vocabulary is aggregated in Python.
    for raw,n in db.execute('SELECT losses,COUNT(*) FROM packet_meta GROUP BY losses'):
        for loss in json.loads(raw): losses[loss] = losses.get(loss,0)+n
    blocks = {str(k):n for k,n in db.execute("SELECT status,COUNT(*) FROM records WHERE kind='capture_block' GROUP BY status")}
    protocols = {str(k):n for k,n in db.execute('SELECT protocol,COUNT(*) FROM packet_meta GROUP BY protocol')}
    evaluations = list(rows(db,'SELECT * FROM rule_evaluations ORDER BY rule'))
    for r in evaluations: r['configuration'] = json.loads(r['configuration'])
    return {'counts':counts,'decoding_losses':losses,'capture_blocks':blocks,'protocol_distribution':protocols,'rules':evaluations,
            'filtered_packets':0,'reassembly':'none','payload_retention':False,'unexamined':['encrypted application content','tracev3','unsupported protocols and adapter schemas']}


def export(db, output, manifest, key):
    output.mkdir(mode=0o700)
    path = output/'exchange.jsonl'
    fd = os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'wb') as stream:
        def emit(entity,ident,payload):
            obj = {'contract':CONTRACT,'entity':entity,'id':str(ident),'payload':minimize(payload,key)}
            validate(obj)
            stream.write(canonical(obj)+b'\n')
        emit('case','case',{'status':manifest['status'],'run_id':manifest['run_id'],'parser_version':manifest['parser_version'],
             'tools':manifest['tools'],'configuration':manifest['configuration'],'privacy':manifest['privacy'],
             'limitations':manifest['limitations']})
        for source in manifest['sources']:
            emit('source','source:'+str(source['id']),source)
        for r in rows(db,'SELECT * FROM packet_meta ORDER BY id'):
            data = {k:r[k] for k in ('src','dst','sport','dport','tcp_flags','captured_bytes','original_bytes','ip_bytes','src_mac','dst_mac')}
            data['losses'] = json.loads(r['losses'])
            ref = db.execute('SELECT offset,length,sha256 FROM records WHERE source_id=? AND ordinal=?',(r['source_id'],r['ordinal'])).fetchone()
            duplicate = db.execute('SELECT duplicate_source,duplicate_ordinal FROM duplicates WHERE source_id=? AND ordinal=?',(r['source_id'],r['ordinal'])).fetchone()
            emit('observation','packet:'+str(r['id']),{'id':'packet:'+str(r['id']),'source_id':r['source_id'],'ordinal':r['ordinal'],
                'kind':'network.'+r['protocol'],'protocol':r['protocol'],'context':r['context'],'time':json.loads(r['time_json']),
                'data':data,'provenance':{'source_id':r['source_id'],'ordinal':r['ordinal'],'byte_offset':ref[0],
                   'byte_length':ref[1],'record_sha256':ref[2],'packet_number':r['packet_number'],'section':r['section'],
                   'interface':r['interface'],'block':r['block'],'precision':'byte'},
                'duplicate_of':f'record:{duplicate[0]}:{duplicate[1]}' if duplicate else None})
        for r in rows(db,'SELECT * FROM observations ORDER BY id'):
            payload = {k:r[k] for k in ('source_id','ordinal','kind','protocol','context')}
            payload.update(id='observation:'+str(r['id']),time=json.loads(r['time_json']),data=json.loads(r['data_json']),
                           provenance=json.loads(r['provenance_json']),duplicate_of='observation:'+str(r['duplicate_of']) if r['duplicate_of'] else None)
            emit('observation',payload['id'],payload)
        for r in rows(db,'SELECT * FROM timeline_index ORDER BY utc_ns IS NULL,utc_ns,source_id,ordinal,event_id'):
            r['time'] = json.loads(r.pop('time_json'))
            emit('timeline',r['event_id'],r)
        for r in rows(db,'SELECT * FROM associations ORDER BY id'):
            r['limitations'] = json.loads(r['limitations'])
            r['conflicts'] = [x[0] for x in db.execute('SELECT id FROM conflicts WHERE association_a=? OR association_b=? ORDER BY id',(r['id'],r['id']))]
            emit('association','association:'+str(r['id']),r)
        for r in rows(db,'SELECT * FROM findings ORDER BY id'):
            for name in ('alternatives','limitations'): r[name] = json.loads(r[name])
            r['evidence'] = json.loads(r.pop('evidence_json')); r['metrics'] = json.loads(r.pop('metrics_json'))
            emit('finding','finding:'+str(r['id']),r)
        emit('coverage','coverage',{'name':'supported_subset','details':manifest['coverage']})
        for r in rows(db,"SELECT source_id,ordinal,status FROM records WHERE kind='parse_error' ORDER BY source_id,ordinal"):
            emit('error',f"error:{r['source_id']}:{r['ordinal']}",{'source_id':r['source_id'],'ordinal':r['ordinal'],'code':r['status'],'details':{}})
        stream.flush(); os.fsync(stream.fileno())
    safe = minimize(manifest,key)
    private_write(output/'report.json',canonical(safe)+b'\n')
    write_human_report(db, output/'report.md', manifest, key)


def write_human_report(db, path, manifest, key):
    """Stream every finding and its qualifications; keep identifier minimization."""
    cov = manifest['coverage']
    text = ['# Offline evidence analysis', '', 'Status: '+manifest['status'],
            'Supported-subset analysis; no clean/compromised verdict.','',
            'Packet records: '+str(cov['counts']['packet_records']), 'Flows: '+str(cov['counts']['flows']),
            'Observations: '+str(cov['counts']['observations']),'Associations: '+str(cov['counts']['associations']),
            'Findings requiring review: '+str(cov['counts']['findings']),'',
            'Decoding losses: '+json.dumps(cov['decoding_losses'],sort_keys=True),'',
            'Rule coverage:']
    for rule in cov['rules']:
        text += [f"- {rule['rule']}: {rule['status']} ({rule['eligible']} eligible; {rule['findings']} findings)",
                 '  '+rule['reason'], '  Configuration: `'+canonical(rule['configuration']).decode()+'`']
    text += ['', 'Exact identifiers and full time representations are in the private index. Supporting IDs and selectors below refer to that index and exchange.jsonl.',
             'Displayed UTC ranges use normalized query keys. Recorded timestamp precision and clock uncertainty remain in the supporting observations.',
             'HMAC pseudonyms are case-scoped; the key is outside this export. Timestamps and source hashes remain linkable.', '', 'Limitations:']
    text += ['- '+x for x in manifest['limitations']]
    with os.fdopen(os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb') as stream:
        def write(value): stream.write(value.encode('utf-8'))
        write('\n'.join(text)+'\n\n## Findings\n\n')
        if not cov['counts']['findings']:
            write('No findings were generated by the evaluated subset. Read the rule coverage and decoding limitations above; this is not a device health verdict.\n')
        for finding in rows(db,'SELECT * FROM findings ORDER BY id'):
            finding = minimize(finding,key)
            # JSON fields are decoded before minimization so selector identifiers
            # receive the same case-scoped pseudonyms as the exchange export.
            metrics = minimize(json.loads(finding['metrics_json']),key)
            evidence = minimize(json.loads(finding['evidence_json']),key)
            write(f"### Finding {finding['id']}: {finding['rule']} ({finding['rule_version']})\n\n")
            write(finding['explanation']+'\n\n')
            write(f"Severity: {finding['severity']}. Confidence: {finding['confidence']} (support for the descriptive pattern, not a probability of compromise).\n\n")
            start = iso_ns(finding['start_ns']) or 'unresolved'
            end = iso_ns(finding['end_ns']) or 'unresolved'
            write(f"Observed support range: {start} to {end}. Context: {finding['context']}.\n\n")
            evaluation = metrics['evaluation']
            write('Required coverage: '+evaluation['required_coverage']+'\n\n')
            write('Minimum sample: '+str(evaluation['minimum_sample_size'])+' '+evaluation['sample_unit']+'.\n\n')
            write('Effective thresholds: `'+canonical(evaluation['thresholds']).decode()+'`\n\n')
            write('Metrics:\n\n```json\n'+canonical(metrics).decode()+'\n```\n\n')
            write('Supporting evidence references/selectors:\n\n```json\n'+canonical(evidence).decode()+'\n```\n\n')
            reproduction = evidence['reproduction']
            write('Reproduce with the private case path:\n\n```sh\n'+shlex.join(reproduction['private_index_command'])+'\n```\n\n')
            write(reproduction['support_scope']+'\n\n'+reproduction['rerun']+'\n\n')
            write('Alternative benign explanations:\n\n')
            for alternative in json.loads(finding['alternatives']): write('- '+alternative+'\n')
            write('\nKnown limitations:\n\n')
            for limitation in json.loads(finding['limitations']): write('- '+limitation+'\n')
            write('\n')
        stream.flush()
        os.fsync(stream.fileno())
