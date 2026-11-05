from contextlib import closing
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import socket
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
import zipfile
from adapters import normalize, TETRA, BLE
from analyze import analyze, config_validate
from core import IngestError, strict_json, time_info
from query import timeline
from fixtures import pcap, arp, dhcp, eth, ipv4, udp, dns_answer

AP={'schema':TETRA,'kind':'ap','bssid':'02:00:00:00:00:01','ssid':'private-ssid','timestamp':'2026-01-01T00:00:00.000000123-04:00','rssi':-50}
CLIENT={'schema':TETRA,'kind':'association','client_mac':'02:00:00:00:00:02','bssid':'02:00:00:00:00:01','timestamp':'2026-01-01T00:00:00Z'}
BEACON={'schema':BLE,'address':'02:00:00:00:00:03','address_type':'random_resolvable','name':'private-device','timestamp':'2026-01-01T00:00:00Z',
        'service_uuids':['180f'],'manufacturer_id':76,'manufacturer_data':'01ff','service_data':'1122','rssi':-55,'tx_power':-10}

class AdaptersTimeline(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup); self.root=Path(self.tmp.name)
    def source(self,name,rows):
        p=self.root/name
        p.write_bytes(rows if isinstance(rows,bytes) else b''.join(json.dumps(r).encode()+b'\n' for r in rows)); return p
    def run_case(self,inputs,config=None,name='case'):
        output=self.root/name; result=analyze(inputs,output,config=config)
        db=sqlite3.connect(output/'index.sqlite'); self.addCleanup(db.close)
        return result,db,output
    def test_json_csv_envelope_schemas(self):
        one=self.source('r.tetra.jsonl',[AP,CLIENT]); two=self.source('r.ble.jsonl',[BEACON])
        three=self.source('r.json',json.dumps({'schema':BLE,'observations':[dict(BEACON)]}).encode())
        stream=io.StringIO(); writer=csv.DictWriter(stream,fieldnames=list(AP)); writer.writeheader(); writer.writerow(AP)
        four=self.source('r.csv',stream.getvalue().encode())
        result,db,_=self.run_case([one,two,three,four])
        self.assertEqual(db.execute('SELECT COUNT(*) FROM observations').fetchone()[0],5)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM associations WHERE relationship='wifi.association'").fetchone()[0],1)
        self.assertEqual(result['coverage']['counts']['parse_errors'],0)
    def test_duplicates_preserved_and_identifier_rotation_not_merged(self):
        other=dict(BEACON,address='02:00:00:00:00:04')
        _,db,_=self.run_case([self.source('r.ble.jsonl',[BEACON,BEACON,other])])
        self.assertEqual(db.execute('SELECT COUNT(*) FROM observations').fetchone()[0],3)
        self.assertEqual(db.execute('SELECT COUNT(*) FROM observations WHERE duplicate_of IS NOT NULL').fetchone()[0],1)
        self.assertEqual(db.execute('SELECT COUNT(*) FROM associations').fetchone()[0],0)
    def test_missing_malformed_unknown_version_variants(self):
        values=[dict(BEACON,timestamp=None),dict(BEACON,timestamp='2026-01-01 12:00:00'),dict(BEACON,timestamp=123),
                dict(BEACON,schema='evidence-lab.ble/99'),dict(BEACON,address='bad'),dict(AP,rssi='x')]
        _,db,_=self.run_case([self.source('r.ble.jsonl',values)])
        self.assertEqual(db.execute('SELECT COUNT(*) FROM records').fetchone()[0],6)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM records WHERE kind='parse_error'").fetchone()[0],3)
        self.assertEqual(db.execute('SELECT COUNT(*) FROM observations WHERE utc_ns IS NULL').fetchone()[0],3)
    def test_provenance_jsonl_csv_sqlite(self):
        p=self.source('r.ble.jsonl',[BEACON,BEACON])
        _,db,_=self.run_case([p])
        for (raw,) in db.execute('SELECT provenance_json FROM observations'):
            ref=json.loads(raw); source=p.read_bytes()[ref['byte_offset']:ref['byte_offset']+ref['byte_length']]
            self.assertEqual(hashlib.sha256(source).hexdigest(),ref['record_sha256'])
    def test_csv_multiline_and_limit(self):
        ap=dict(AP,ssid='one\ntwo'); stream=io.StringIO(); w=csv.DictWriter(stream,fieldnames=list(ap)); w.writeheader(); w.writerow(ap)
        _,db,_=self.run_case([self.source('r.csv',stream.getvalue().encode())])
        ref=json.loads(db.execute('SELECT provenance_json FROM observations').fetchone()[0]); self.assertGreater(ref['last_line'],ref['line'])
        with self.assertRaises(IngestError): self.run_case([self.source('large.csv',b'schema,name\n'+b'x'*(1024**2+1))],name='too-large')
    def test_structured_limits(self):
        for raw in (b'['*40+b']'*40,b'{"a":1,"a":2}',b'{"a":NaN}'):
            with self.assertRaises(IngestError): strict_json(raw)
    def make_db(self,name='recon.db',version=0):
        p=self.root/name
        with closing(sqlite3.connect(p)) as db:
            db.executescript('''CREATE TABLE aps(id INT PRIMARY KEY,scan_id INT,ssid TEXT,bssid TEXT,encryption INT,hidden INT,channel INT,signal INT,wps INT,last_seen TIMESTAMP);
              CREATE TABLE clients(id INT PRIMARY KEY,scan_id INT,mac TEXT,bssid TEXT,last_seen TIMESTAMP);
              CREATE TABLE scan_ids(scan_id INT,date TIMESTAMP);''')
            db.execute('INSERT INTO aps VALUES (1,1,?,?,3,0,6,-60,0,?)',(AP['ssid'],AP['bssid'],'2026-01-01 00:00:00'))
            db.execute('INSERT INTO clients VALUES (1,1,?,?,?)',(CLIENT['client_mac'],CLIENT['bssid'],'2026-01-01 00:00:00'))
            db.execute('PRAGMA user_version='+str(version)); db.commit()
        return p
    def test_sqlite_read_only_schema_and_unknown_times(self):
        p=self.make_db(); before=p.read_bytes()
        result,db,_=self.run_case([p])
        self.assertEqual(p.read_bytes(),before); self.assertFalse(Path(str(p)+'-wal').exists()); self.assertFalse(Path(str(p)+'-shm').exists())
        self.assertEqual(db.execute('SELECT COUNT(*) FROM observations').fetchone()[0],2)
        self.assertEqual(db.execute('SELECT COUNT(*) FROM observations WHERE utc_ns IS NULL').fetchone()[0],2)
        self.assertEqual(db.execute('SELECT COUNT(*) FROM associations').fetchone()[0],1)
        self.assertIsNone(db.execute('SELECT start_ns FROM associations').fetchone()[0])
        ref=json.loads(db.execute('SELECT provenance_json FROM observations LIMIT 1').fetchone()[0]); self.assertEqual(ref['precision'],'logical'); self.assertIn('rowid',ref)
    def test_sqlite_wal_blocked_no_source_modification(self):
        p=self.make_db(); Path(str(p)+'-wal').write_bytes(b'closed-fixture-wal')
        result,db,_=self.run_case([p]); detail=result['sources'][0]['metadata']
        self.assertEqual(detail['compatibility'],'BLOCKED_EXTERNAL'); self.assertEqual(db.execute('SELECT COUNT(*) FROM observations').fetchone()[0],0)
        self.assertEqual(Path(str(p)+'-wal').read_bytes(),b'closed-fixture-wal')
    def test_sqlite_schema_version_explicit(self):
        result,db,_=self.run_case([self.make_db(version=99)])
        self.assertEqual(result['sources'][0]['metadata']['error'],'unsupported_tetra_sqlite_version')
    def test_original_precision_timezone_and_missing(self):
        one=time_info(AP['timestamp']); two=time_info('2026-01-01T04:00:00.000000123Z')
        self.assertEqual(one['utc_ns'],two['utc_ns']); self.assertEqual(one['precision']['decimal_digits'],9)
        self.assertEqual(one['original'],AP['timestamp']); self.assertEqual(one['timezone'],'-04:00')
        self.assertIsNone(time_info('2026-01-01T04:00:00')['utc_ns']); self.assertIsNone(time_info(17200)['utc_ns'])
    def test_timeline_adjustment_query_and_ties(self):
        p=self.source('r.tetra.jsonl',[CLIENT,CLIENT]); q=self.source('b.ble.jsonl',[BEACON])
        config={'clock_adjustments':{'1':{'offset_ns':10**9,'justification':'Known synthetic fixture skew'}}}
        _,db,_=self.run_case([p,q],config)
        rows=list(timeline(db,since='2026-01-01T00:00:00Z',until='2026-01-01T00:00:01Z'))
        self.assertEqual(len(rows),1); self.assertEqual(rows[0]['source_id'],2)
        allrows=list(timeline(db)); self.assertEqual([r['source_id'] for r in allrows],[2,1,1])
        self.assertEqual(allrows[1]['utc_ns']-allrows[1]['original_utc_ns'],10**9)
        self.assertEqual(len(list(timeline(db,identifier=CLIENT['client_mac']))),2)
        db.execute('DELETE FROM adjustments'); db.execute('DELETE FROM timeline_index'); db.execute('INSERT INTO timeline_index SELECT * FROM timeline')
        self.assertTrue(all(r['utc_ns']==r['original_utc_ns'] for r in timeline(db)))
    def test_cross_network_conflicts_and_lease_expiry(self):
        t=1700000000
        one=self.source('one.pcap',pcap([(t,dhcp(lease=5)),(t+4,arp(mac='020000000003')),(t+5,arp(mac='020000000004'))]))
        two=self.source('two.pcap',pcap([(t,arp(mac='020000000005'))]))
        _,db,_=self.run_case([one,two])
        self.assertEqual(db.execute('SELECT COUNT(*) FROM conflicts').fetchone()[0],1)
        lease=db.execute("SELECT start_ns,end_ns FROM associations WHERE relationship='dhcp.lease'").fetchone()
        self.assertEqual(lease[1]-lease[0],5*10**9)
        for (eid,) in db.execute('SELECT evidence_id FROM associations'): self.assertIsNotNone(db.execute('SELECT provenance_json FROM observations WHERE id=?',(eid,)).fetchone())
    def test_explicit_context_allows_cross_source_conflict(self):
        p=self.source('one.pcap',pcap([arp()])); q=self.source('two.pcap',pcap([arp(mac='020000000003')]))
        _,db,_=self.run_case([p,q],{'contexts':{'1':'lab','2':'lab'}})
        self.assertEqual(db.execute('SELECT COUNT(*) FROM conflicts').fetchone()[0],1)
    def test_dns_ttl_interval_and_no_mac_identity(self):
        p=self.source('dns.pcap',pcap([eth(ipv4(udp(dns_answer(),53,50000)))]))
        _,db,_=self.run_case([p]); row=db.execute('SELECT relationship,start_ns,end_ns FROM associations').fetchone()
        self.assertEqual(row[0],'dns.answer'); self.assertEqual(row[2]-row[1],30*10**9)
        self.assertEqual(db.execute('SELECT COUNT(*) FROM conflicts').fetchone()[0],0)
    def test_sysdiagnose_original_time_joined(self):
        p=self.root/'phone.zip'
        with zipfile.ZipFile(p,'w') as z: z.writestr('record.json',json.dumps({'timestamp':AP['timestamp']}))
        _,db,_=self.run_case([p]); when=json.loads(db.execute('SELECT time_json FROM observations').fetchone()[0])
        self.assertEqual(when['original'],AP['timestamp']); self.assertEqual(when['timezone'],'-04:00')
    def test_offline_privacy_and_private_permissions(self):
        p=self.source('private-name.ble.jsonl',[BEACON])
        with patch.object(socket,'socket',side_effect=AssertionError('network forbidden')),patch.object(socket,'getaddrinfo',side_effect=AssertionError('DNS forbidden')):
            _,db,out=self.run_case([p])
        raw=(out/'export/exchange.jsonl').read_text(); self.assertNotIn(BEACON['name'],raw); self.assertNotIn(BEACON['address'],raw)
        self.assertNotIn('private-name',raw); self.assertFalse((out/'export/pseudonym.key').exists())
        for f in out.rglob('*'):
            self.assertEqual(f.stat().st_mode & 0o077,0,f.name)
        self.assertIn(BEACON['name'],db.execute('SELECT data_json FROM observations').fetchone()[0])
    def test_configuration_rejects_ambiguous_options(self):
        for cfg in ({'unknown':1},{'rules':{'unknown':5}},{'clock_adjustments':{'1':{'offset_ns':1}}},{'flow_bucket_seconds':0}):
            with self.assertRaises((IngestError,KeyError)): config_validate(cfg)

if __name__=='__main__': unittest.main()
