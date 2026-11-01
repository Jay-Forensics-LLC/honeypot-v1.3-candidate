"""Small transparent lead-generation rule set; no compromise or malware score."""
# Modified for HoneyTrace on 2026-11-01: exact DNS support and preflight thresholds.
import json
from core import IngestError, canonical

VERSION = '1.0.1'
DEFAULTS = {'window_seconds':60, 'syn_minimum':10, 'port_minimum':10,
            'dns_label_minimum':50, 'dns_minimum_questions':5, 'mapping_minimum_conflicts':1}
CATALOG = {
 'repeated_syn': {
  'detects':'Repeated TCP SYN without ACK observations to one destination/port in a fixed time window.',
  'required':'Timestamped TCP headers with source, destination and ports; no reassembly needed.',
  'alternatives':['Retransmissions after packet loss','Authorized availability monitoring','A busy client reconnecting'],
  'limitations':['Counts packets, not distinct connection attempts. Retransmissions remain preserved.',
                 'Partial/asymmetric capture prevents claims about failed connections or completed sessions.',
                 'Fixed window boundaries can split a burst; no baseline of typical behavior.']},
 'destination_ports': {
  'detects':'A source contacts many distinct destination TCP ports on one address within a fixed window.',
  'required':'Timestamped TCP SYN-without-ACK headers and distinct destination ports.',
  'alternatives':['Authorized inventory/security tooling','Service discovery','An application using many services'],
  'limitations':['No active scan is performed. Observations do not establish intent.','Fixed windows and missing packets can hide a pattern.']},
 'dns_long_labels': {
  'detects':'Repeated DNS questions containing a long label; an analytical lead consistent with several uses including tunneling.',
  'required':'Complete decoded DNS questions, known timestamps, sufficient questions in one source context/window.',
  'alternatives':['CDN cache keys','Anti-abuse tokens','Legitimate telemetry and tracking domains'],
  'limitations':['Label length is not proof of tunneling or exfiltration.','Encrypted DNS and split TCP messages are not evaluated.','No lexical classifier or entropy-based attribution.']},
 'conflicting_mappings': {
  'detects':'Different MAC addresses mapped to one IP in overlapping observed validity intervals within one context.',
  'required':'Traceable ARP/NDP statements or finite DHCP ACK intervals with resolved timestamps.',
  'alternatives':['Proxy ARP','DHCP reassignment/early lease revocation','Virtual IP failover','Clock errors'],
  'limitations':['Address ownership is not authenticated.','No cross-network conflict inference.','Unresolved times cannot establish overlap.']}}


def configuration(options=None):
    result = dict(DEFAULTS)
    if options is not None and not isinstance(options,dict): raise IngestError('rule_configuration_object_required')
    if options:
        if not isinstance(options,dict): raise IngestError('rule_configuration_object_required')
        if set(options)-set(result): raise IngestError('unknown_rule_configuration')
        result.update(options)
    for key,value in result.items():
        if type(value) is not int or value <= 0 or value > 10**6:
            raise IngestError('invalid_rule_threshold')
    if result['dns_label_minimum'] > 63: raise IngestError('invalid_dns_label_threshold')
    if result['mapping_minimum_conflicts'] != 1: raise IngestError('mapping_threshold_must_be_one')
    return result


def requirements(rule, config):
    """Effective per-rule coverage and sample gates, recorded with every finding."""
    minimum_key,unit,threshold_keys = {
      'repeated_syn': ('syn_minimum','timestamped SYN-without-ACK packets',('window_seconds','syn_minimum')),
      'destination_ports': ('port_minimum','distinct destination TCP ports',('window_seconds','port_minimum')),
      'dns_long_labels': ('dns_minimum_questions','complete timestamped DNS questions',
                          ('window_seconds','dns_label_minimum','dns_minimum_questions')),
      'conflicting_mappings': (None,'time-resolved IP/MAC associations',('mapping_minimum_conflicts',))}[rule]
    return {'required_coverage':CATALOG[rule]['required'],
            'minimum_sample_size':config[minimum_key] if minimum_key else 2,
            'sample_unit':unit,'thresholds':{key:config[key] for key in threshold_keys}}


def evaluate(db, options=None):
    config = configuration(options)
    win = config['window_seconds']*10**9
    db.executescript(f'''CREATE TABLE rule_packets AS SELECT p.id,p.context,p.src,p.dst,p.dport,
       p.utc_ns+COALESCE(a.offset_ns,0) event_ns,
       CAST((p.utc_ns+COALESCE(a.offset_ns,0))/{win} AS INTEGER)-CASE WHEN p.utc_ns+COALESCE(a.offset_ns,0)<0 AND (p.utc_ns+COALESCE(a.offset_ns,0))%{win}!=0 THEN 1 ELSE 0 END bucket
       FROM packet_meta p LEFT JOIN adjustments a ON a.source_id=p.source_id
       WHERE p.protocol='tcp' AND p.tcp_flags&2!=0 AND p.tcp_flags&16=0 AND p.utc_ns IS NOT NULL;
       CREATE INDEX rule_packets_group ON rule_packets(context,src,dst,dport,bucket,id);
       CREATE INDEX rule_packets_window ON rule_packets(context,src,dst,bucket,id);
       CREATE TABLE rule_dns(observation_id INTEGER,context TEXT,event_ns INTEGER,bucket INTEGER,label_length INTEGER);
       CREATE INDEX rule_dns_group ON rule_dns(context,bucket,label_length,observation_id);
    ''')
    for ident,context,when,raw in db.execute('''SELECT o.id,o.context,o.utc_ns+COALESCE(a.offset_ns,0),o.data_json
       FROM observations o LEFT JOIN adjustments a ON a.source_id=o.source_id
       WHERE o.kind='dns.question' AND o.utc_ns IS NOT NULL ORDER BY o.id'''):
        data = json.loads(raw)
        if not data.get('response'):
            longest = max(data.get('label_lengths',[]),default=0)
            db.execute('INSERT INTO rule_dns VALUES (?,?,?,?,?)',(ident,context,when,when//win,longest))
    def finding(rule,context,start,end,metrics,evidence):
        info = CATALOG[rule]
        metrics['evaluation'] = requirements(rule,config)
        cursor = db.execute('INSERT INTO findings VALUES (NULL,?,?,?,?,?,?,?,?,?,?,?,?)',
          (rule,VERSION,context,start,end,'review','supported_pattern',info['detects'],
           canonical(info['alternatives']).decode(),canonical(info['limitations']).decode(),
           canonical(evidence).decode(),canonical(metrics).decode()))
        ident = cursor.lastrowid
        evidence['reproduction'] = {
            'private_index_command':['python3','tools/evidence_lab/query.py','finding',
                                     '/ABSOLUTE/PRIVATE_CASE','--id',str(ident),'--limit','100'],
            'support_scope':'The command returns exact private selectors and a sample capped at 1,000 records and 8 MiB. Only a complete sample has an exact count; otherwise inspect its lower bound and explicit truncation.',
            'rerun':'Use analyze.py on the same hash-verified source occurrences in the same order, parser version and configuration, into a new private case directory. Use the original case key to reproduce minimized identifiers.'}
        db.execute('UPDATE findings SET evidence_json=? WHERE id=?',(canonical(evidence).decode(),ident))
    def evaluation(rule,eligible,count,minimum):
        status = 'FINDINGS' if count else ('NO_FINDING' if eligible >= minimum else 'INSUFFICIENT_EVIDENCE')
        capture_sources = db.execute("SELECT COUNT(*) FROM sources WHERE kind IN ('pcap','pcapng')").fetchone()[0]
        if not eligible and not capture_sources:
            supported = db.execute("SELECT COUNT(*) FROM observations").fetchone()[0]
            status = 'NOT_EVALUATED' if supported else 'UNSUPPORTED'
        reason = 'Thresholds evaluated on the supported subset; absence of a finding is not a device health verdict.' if eligible >= minimum else 'Too few eligible observations; unresolved, unsupported and encrypted data excluded.'
        db.execute('INSERT INTO rule_evaluations VALUES (?,?,?,?,?,?,?)',
          (rule,VERSION,status,eligible,count,canonical(config).decode(),reason))
    eligible = db.execute('SELECT COUNT(*) FROM rule_packets').fetchone()[0]
    for rule,expr,minimum in [('repeated_syn','COUNT(*)',config['syn_minimum']),('destination_ports','COUNT(DISTINCT dport)',config['port_minimum'])]:
        count = 0
        group = 'context,src,dst,bucket'+(',dport' if rule == 'repeated_syn' else '')
        query = f'SELECT context,src,dst,bucket,MIN(event_ns),MAX(event_ns),{expr},MIN(id),MAX(id) FROM rule_packets GROUP BY {group} HAVING {expr}>=? ORDER BY {group}'
        for context,src,dst,bucket,start,end,n,first,last in db.execute(query,(minimum,)):
            count += 1
            finding(rule,context,start,end,{'eligible_count':n,'window_bucket':bucket,'src':src,'dst':dst},
                    {'first_packet':first,'last_packet':last,'selector':{'table':'rule_packets','context':context,'src':src,'dst':dst,'bucket':bucket,
                     'dport':db.execute('SELECT dport FROM rule_packets WHERE id=?',(first,)).fetchone()[0] if rule == 'repeated_syn' else None}})
        evaluation(rule,eligible,count,minimum)
    count = 0
    for context,bucket,start,end,total,longs,first,last in db.execute('''SELECT context,bucket,
        MIN(CASE WHEN label_length>=? THEN event_ns END),MAX(CASE WHEN label_length>=? THEN event_ns END),COUNT(*),
        SUM(label_length>=?),MIN(CASE WHEN label_length>=? THEN observation_id END),
        MAX(CASE WHEN label_length>=? THEN observation_id END) FROM rule_dns GROUP BY context,bucket
        HAVING SUM(label_length>=?)>=? ORDER BY context,bucket''',
        (config['dns_label_minimum'],)*6+(config['dns_minimum_questions'],)):
        count += 1
        finding('dns_long_labels',context,start,end,{'questions':total,'long_label_questions':longs,'window_bucket':bucket},
                {'first_observation':first,'last_observation':last,'selector':{'table':'rule_dns','context':context,'bucket':bucket,'minimum_label_length':config['dns_label_minimum']}})
    evaluation('dns_long_labels',db.execute('SELECT COUNT(*) FROM rule_dns').fetchone()[0],count,config['dns_minimum_questions'])
    count = 0
    for cid,a,b,context,start,end in db.execute('''SELECT c.id,c.association_a,c.association_b,a.context,
       MAX(a.start_ns,b.start_ns),MIN(a.end_ns,b.end_ns) FROM conflicts c
       JOIN associations a ON a.id=c.association_a JOIN associations b ON b.id=c.association_b ORDER BY c.id'''):
        count += 1
        finding('conflicting_mappings',context,start,end,{'conflicts':1}, {'conflict':cid,'associations':[a,b]})
    # Configuration admits only one; every conflict remains a separate traceable lead.
    evaluation('conflicting_mappings',db.execute("SELECT COUNT(*) FROM associations WHERE left_type='ip' AND right_type='mac' AND start_ns IS NOT NULL").fetchone()[0],count,2)
