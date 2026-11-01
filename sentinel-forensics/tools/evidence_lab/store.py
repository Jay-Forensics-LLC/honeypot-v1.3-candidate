"""Disk-backed normalized private index. All identifiers remain local."""
# Modified for HoneyTrace on 2026-11-01: canonical exact summary timestamps.
import hashlib
import json
import sqlite3
from core import canonical, canonical_record_row
from network import decode

SCHEMA = '''
PRAGMA cache_size=-8192;
PRAGMA temp_store=FILE;
PRAGMA foreign_keys=ON;
CREATE TABLE sources(id INTEGER PRIMARY KEY, sha256 TEXT, size INTEGER, kind TEXT);
CREATE TABLE records(source_id INTEGER, ordinal INTEGER, offset INTEGER, length INTEGER,
 sha256 TEXT, timestamp TEXT, kind TEXT, protocol TEXT, captured_bytes INTEGER, status TEXT,
 PRIMARY KEY(source_id,ordinal));
CREATE INDEX record_hash ON records(sha256,source_id,ordinal);
CREATE TABLE summary(source_id INTEGER, kind TEXT, protocol TEXT, records INTEGER,
 captured_bytes INTEGER, first_time TEXT, last_time TEXT);
CREATE TABLE source_details(source_id INTEGER PRIMARY KEY, parser_version TEXT, metadata TEXT);
CREATE TABLE duplicates(source_id INTEGER, ordinal INTEGER, duplicate_source INTEGER, duplicate_ordinal INTEGER);
CREATE UNIQUE INDEX duplicate_record_lookup ON duplicates(source_id,ordinal);
CREATE TABLE observations(id INTEGER PRIMARY KEY, source_id INTEGER, ordinal INTEGER, kind TEXT,
 protocol TEXT, context TEXT, utc_ns INTEGER, time_json TEXT, data_json TEXT, provenance_json TEXT,
 record_hash TEXT, duplicate_of INTEGER, content_hash TEXT);
CREATE INDEX obs_hash ON observations(record_hash,kind,content_hash,id);
CREATE INDEX obs_time ON observations(utc_ns,source_id,id);
CREATE INDEX obs_kind ON observations(kind,context,utc_ns);
CREATE TABLE packet_meta(id INTEGER PRIMARY KEY, source_id INTEGER, ordinal INTEGER, context TEXT,
 protocol TEXT, src TEXT, dst TEXT, sport INTEGER, dport INTEGER, tcp_flags INTEGER,
 captured_bytes INTEGER, original_bytes INTEGER, ip_bytes INTEGER, utc_ns INTEGER, time_json TEXT,
 linktype INTEGER, section INTEGER, interface INTEGER, packet_number INTEGER, block INTEGER,
 losses TEXT, src_mac TEXT, dst_mac TEXT, vlan TEXT, a TEXT, b TEXT, direction INTEGER);
CREATE INDEX packet_time ON packet_meta(utc_ns,source_id,ordinal);
CREATE INDEX packet_identifiers ON packet_meta(context,src,dst,utc_ns);
CREATE TABLE adjustments(source_id INTEGER PRIMARY KEY, offset_ns INTEGER, justification TEXT);
CREATE VIEW timeline AS
 SELECT 'packet:'||p.id event_id,p.source_id,p.ordinal,'network.'||p.protocol kind,p.protocol,p.context,
 p.utc_ns original_utc_ns,p.utc_ns+COALESCE(a.offset_ns,0) utc_ns,p.time_json,'packet_meta' storage,p.id row_id
 FROM packet_meta p LEFT JOIN adjustments a ON a.source_id=p.source_id
 UNION ALL
 SELECT 'observation:'||o.id,o.source_id,o.ordinal,o.kind,o.protocol,o.context,o.utc_ns,
 o.utc_ns+COALESCE(a.offset_ns,0),o.time_json,'observations',o.id
 FROM observations o LEFT JOIN adjustments a ON a.source_id=o.source_id;
CREATE TABLE associations(id INTEGER PRIMARY KEY, relationship TEXT, context TEXT, left_type TEXT,
 left_value TEXT, right_type TEXT, right_value TEXT, start_ns INTEGER, end_ns INTEGER, evidence_id INTEGER,
 rule TEXT, rule_version TEXT, confidence TEXT, explanation TEXT, limitations TEXT);
CREATE INDEX assoc_lookup ON associations(context,left_type,left_value,start_ns,end_ns);
CREATE TABLE conflicts(id INTEGER PRIMARY KEY, association_a INTEGER, association_b INTEGER,
 explanation TEXT, UNIQUE(association_a,association_b));
CREATE INDEX conflict_reverse_lookup ON conflicts(association_b,association_a);
CREATE TABLE findings(id INTEGER PRIMARY KEY, rule TEXT, rule_version TEXT, context TEXT, start_ns INTEGER,
 end_ns INTEGER, severity TEXT, confidence TEXT, explanation TEXT, alternatives TEXT, limitations TEXT,
 evidence_json TEXT, metrics_json TEXT);
CREATE TABLE rule_evaluations(rule TEXT PRIMARY KEY, version TEXT, status TEXT, eligible INTEGER,
 findings INTEGER, configuration TEXT, reason TEXT);
'''


def text_json(obj): return canonical(obj).decode()


class Store:
    def __init__(self, db, *, contexts=None, adjustments=None):
        self.db, self.contexts = db, contexts or {}
        db.executescript(SCHEMA)
        for sid, item in (adjustments or {}).items():
            db.execute('INSERT INTO adjustments VALUES (?,?,?)', (int(sid), item['offset_ns'], item['justification']))

    def context(self, source_id, packet=None):
        base = self.contexts.get(str(source_id), 'source:'+str(source_id))
        if packet is not None:
            base += f'/section:{packet.section}/interface:{packet.interface}'
        return base

    def add_record(self, source_id, row):
        # This derivative column is comparable UTC; original spelling, ticks and
        # precision remain in packet/observation time_json and source evidence.
        row = canonical_record_row(row)
        previous = self.db.execute('SELECT source_id,ordinal FROM records WHERE sha256=? ORDER BY source_id,ordinal LIMIT 1', (row[3],)).fetchone()
        if previous:
            self.db.execute('INSERT INTO duplicates VALUES (?,?,?,?)', (source_id,row[0],*previous))
        self.db.execute('INSERT INTO records VALUES (?,?,?,?,?,?,?,?,?,?)', (source_id,*row))

    def observe(self, source_id, ordinal, kind, data, time, provenance, record_hash, *, context=None, protocol=None):
        # One source record can contain several distinct questions/answers of the
        # same kind. A shared source hash alone does not make them duplicates.
        content_hash = hashlib.sha256(canonical([kind, protocol or kind.split('.')[0], data, time])).hexdigest()
        previous = self.db.execute('SELECT id FROM observations WHERE record_hash=? AND kind=? AND content_hash=? ORDER BY id LIMIT 1', (record_hash,kind,content_hash)).fetchone()
        cursor = self.db.execute('INSERT INTO observations VALUES (NULL,?,?,?,?,?,?,?,?,?,?,?,?)',
            (source_id,ordinal,kind,protocol or kind.split('.')[0],context or self.context(source_id),time['utc_ns'],
             text_json(time),text_json(data),text_json(provenance),record_hash,previous[0] if previous else None,content_hash))
        return cursor.lastrowid

    def packet(self, source_id, packet):
        if packet.kind != 'packet': return
        meta, apps, losses = decode(packet)
        if packet.status: losses.append(packet.status)
        if packet.time['status'] != 'normalized': losses.append('timestamp_'+packet.time['status'])
        context = self.context(source_id, packet) + '/vlan:'+','.join(map(str,meta['vlan']))
        # Endpoint sorting defines direction independent of which packet was first.
        src = meta['src']; dst = meta['dst']
        left = text_json([src,meta['sport']]); right = text_json([dst,meta['dport']])
        a,b = sorted((left,right)); direction = int(left != a)
        self.db.execute('INSERT INTO packet_meta VALUES (NULL,'+','.join('?' for _ in range(26))+')',
            (source_id,packet.ordinal,context,meta['protocol'],src,dst,meta['sport'],meta['dport'],meta['tcp_flags'],
             len(packet.payload),packet.original,meta['ip_bytes'],packet.time['utc_ns'],text_json(packet.time),
             packet.linktype,packet.section,packet.interface,packet.metadata.get('packet_number',packet.ordinal),packet.block,
             text_json(losses),meta['src_mac'],meta['dst_mac'],text_json(meta['vlan']),a,b,direction))
        provenance = {'source_id':source_id,'ordinal':packet.ordinal,'packet_number':packet.metadata.get('packet_number',packet.ordinal),
                      'byte_offset':packet.offset,'byte_length':packet.length,'section':packet.section,
                      'interface':packet.interface,'block':packet.block,'precision':'byte','record_sha256':packet.sha256}
        for kind,data in apps:
            data.update(src=src,dst=dst,sport=meta['sport'],dport=meta['dport'])
            self.observe(source_id,packet.ordinal,kind,data,packet.time,provenance,packet.sha256,context=context,protocol=meta['protocol'])

    def aggregate(self, bucket_seconds=300):
        # GROUP BY and distinct endpoints are SQLite disk-backed operations, never Python sets.
        ns = int(bucket_seconds)*10**9
        self.db.executescript(f'''
        CREATE TABLE flows AS SELECT context,protocol,a,b,
          CASE WHEN event_ns IS NULL THEN NULL ELSE (event_ns/{ns})-CASE WHEN event_ns<0 AND event_ns%{ns}!=0 THEN 1 ELSE 0 END END bucket,
          MIN(event_ns) first_ns,MAX(event_ns) last_ns,COUNT(*) packets,
          SUM(CASE WHEN direction=0 THEN 1 ELSE 0 END) packets_a_to_b,
          SUM(CASE WHEN direction=1 THEN 1 ELSE 0 END) packets_b_to_a,
          SUM(CASE WHEN direction=0 THEN captured_bytes ELSE 0 END) captured_a_to_b,
          SUM(CASE WHEN direction=1 THEN captured_bytes ELSE 0 END) captured_b_to_a,
          SUM(original_bytes) reported_original_bytes, SUM(ip_bytes) reported_ip_bytes,
          SUM(CASE WHEN tcp_flags&2!=0 THEN 1 ELSE 0 END) syn_packets,
          SUM(CASE WHEN tcp_flags&4!=0 THEN 1 ELSE 0 END) rst_packets,
          MIN(id) first_packet_ref,MAX(id) last_packet_ref
          FROM (SELECT p.*,p.utc_ns+COALESCE(ad.offset_ns,0) event_ns FROM packet_meta p LEFT JOIN adjustments ad ON ad.source_id=p.source_id) WHERE src IS NOT NULL AND dst IS NOT NULL
          GROUP BY context,protocol,a,b,bucket;
        CREATE INDEX flow_lookup ON flows(context,protocol,first_ns,last_ns);
        ''')

    def index_timeline(self):
        self.db.executescript('''
        CREATE TABLE timeline_index AS SELECT * FROM timeline;
        CREATE UNIQUE INDEX timeline_event ON timeline_index(event_id);
        CREATE INDEX timeline_query ON timeline_index(utc_ns,source_id,ordinal,event_id);
        CREATE INDEX timeline_source ON timeline_index(source_id,utc_ns,ordinal,event_id);
        CREATE INDEX timeline_protocol ON timeline_index(protocol,utc_ns,source_id,ordinal,event_id);
        CREATE TABLE event_identifiers(event_id TEXT,field TEXT,value TEXT);
        INSERT INTO event_identifiers SELECT 'packet:'||id,'src',src FROM packet_meta WHERE src IS NOT NULL;
        INSERT INTO event_identifiers SELECT 'packet:'||id,'dst',dst FROM packet_meta WHERE dst IS NOT NULL;
        INSERT INTO event_identifiers SELECT 'packet:'||id,'src_mac',src_mac FROM packet_meta WHERE src_mac IS NOT NULL;
        INSERT INTO event_identifiers SELECT 'packet:'||id,'dst_mac',dst_mac FROM packet_meta WHERE dst_mac IS NOT NULL;
        INSERT INTO event_identifiers SELECT 'observation:'||o.id,j.key,CAST(j.value AS TEXT)
          FROM observations o,json_each(o.data_json) j WHERE j.key IN
          ('address','mac','client_mac','bssid','ssid','name','src','dst','server_name','assigned_ip','client_ip') AND j.value IS NOT NULL;
        INSERT INTO event_identifiers SELECT 'observation:'||o.id,'source_addresses',CAST(j.value AS TEXT)
          FROM observations o,json_each(o.data_json,'$.source_addresses') j
          WHERE o.protocol='igmp' AND j.type='text';
        CREATE INDEX identifier_query ON event_identifiers(value,event_id);
        -- Keep one occurrence per identifier/event, even when src equals dst.
        -- Chronological selector indexes avoid materializing every matching ID
        -- before a common-identifier query can honor its output limit.
        CREATE TABLE identifier_timeline AS
          SELECT DISTINCT e.value,t.event_id,t.utc_ns,t.source_id,t.ordinal,t.protocol
          FROM event_identifiers e JOIN timeline_index t ON t.event_id=e.event_id;
        CREATE INDEX identifier_timeline_query ON identifier_timeline(value,utc_ns,source_id,ordinal,event_id);
        CREATE INDEX identifier_timeline_source ON identifier_timeline(value,source_id,utc_ns,ordinal,event_id);
        CREATE INDEX identifier_timeline_protocol ON identifier_timeline(value,protocol,utc_ns,source_id,ordinal,event_id);
        ''')
