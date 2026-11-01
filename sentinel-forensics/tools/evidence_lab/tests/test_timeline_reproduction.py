"""Observation integrity, bounded timeline lookups and private rule reproduction."""
from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
import struct
import tempfile
import unittest
from unittest.mock import patch

from analyze import analyze
from core import IngestError, iso_ns, time_info
from fixtures import addr, arp, dns_question, eth, ipv4, pcap, qname, tcp, udp
from query import finding, timeline
from store import Store


class TimelineReproduction(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def db(self):
        db = sqlite3.connect(self.root/'index.sqlite')
        self.addCleanup(db.close)
        return db

    def measured(self, db, callback, budget=5000):
        steps = [0]
        def progress():
            steps[0] += 100
            return steps[0] > budget
        db.set_progress_handler(progress, 100)
        try: result = callback()
        finally: db.set_progress_handler(None, 0)
        self.assertLessEqual(steps[0], budget)
        return result

    def test_distinct_dns_answers_are_not_duplicate_observations(self):
        msg = struct.pack('!6H',1,0x8180,1,2,0,0)+qname('example.test')+struct.pack('!HH',1,1)
        for address in ('198.51.100.20','198.51.100.21'):
            msg += b'\xc0\x0c'+struct.pack('!HHIH',1,1,30,4)+addr(address)
        source = self.root/'answers.pcap'
        source.write_bytes(pcap([(1700000000,eth(ipv4(udp(msg,53,50000))))]*2))
        analyze([source],self.root/'case')
        with closing(sqlite3.connect(self.root/'case/index.sqlite')) as db:
            rows = db.execute("SELECT id,data_json,duplicate_of FROM observations WHERE kind='dns.address' ORDER BY id").fetchall()
            self.assertEqual([json.loads(x[1])['address'] for x in rows],['198.51.100.20','198.51.100.21']*2)
            self.assertEqual([x[2] for x in rows],[None,None,rows[0][0],rows[1][0]])
            self.assertEqual(db.execute('SELECT COUNT(*) FROM duplicates').fetchone()[0],1)

    def test_observation_duplicate_requires_normalized_time_and_content(self):
        db = self.db(); store = Store(db)
        first = store.observe(1,1,'fixture',{'value':1},time_info('2026-01-01T00:00:00Z'),{},'same-source-record')
        store.observe(1,2,'fixture',{'value':1},time_info('2026-01-01T00:00:01Z'),{},'same-source-record')
        store.observe(1,3,'fixture',{'value':2},time_info('2026-01-01T00:00:00Z'),{},'same-source-record')
        store.observe(1,4,'fixture',{'value':1},time_info('2026-01-01T00:00:00Z'),{},'same-source-record')
        self.assertEqual([x[0] for x in db.execute('SELECT duplicate_of FROM observations ORDER BY id')],[None,None,None,first])

    def test_many_distinct_observations_in_one_record_have_indexed_duplicate_lookup(self):
        db = self.db(); store = Store(db)
        when = time_info('2026-01-01T00:00:00Z')
        self.measured(db,lambda:[store.observe(1,i,'fixture',{'value':i},when,{},'same-record') for i in range(4000)],budget=250000)
        self.assertEqual(db.execute('SELECT COUNT(*) FROM observations WHERE duplicate_of IS NOT NULL').fetchone()[0],0)

    def test_invalid_timezone_offsets_do_not_become_normalized(self):
        for text in ('2026-01-01T00:00:00+01:99','2026-01-01T00:00:00-00:60','2026-01-01T00:00:00+24:00','2026-13-01T00:00:00','0001-01-01T00:00:00+23:59'):
            with self.subTest(text=text):
                when = time_info(text)
                self.assertEqual(when['status'],'invalid')
                self.assertIsNone(when['utc_ns'])
                self.assertEqual(when['original'],text)
        self.assertEqual(time_info('2026-01-01T00:00:00+01:59')['status'],'normalized')

    def test_timeline_limit_and_range_queries_have_bounded_cost(self):
        db = self.db(); store = Store(db); store.index_timeline()
        base = time_info('2026-01-01T00:00:00Z')['utc_ns']
        when = json.dumps(time_info('2026-01-01T00:00:00Z'))
        db.executemany('INSERT INTO timeline_index VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            ((f'observation:{i}',i%3+1,i,'fixture','tcp' if i%2 else 'udp','ctx',base+i,base+i,when,'observations',i) for i in range(16000)))
        db.executemany('INSERT INTO event_identifiers VALUES (?,?,?)',[(f'observation:{i}','address',f'fixture-{i}') for i in range(16000)])
        db.executemany('INSERT INTO event_identifiers VALUES (?,?,?)',[(f'observation:{i}','address','common-fixture') for i in range(16000)])
        db.execute('''INSERT INTO identifier_timeline SELECT DISTINCT e.value,t.event_id,t.utc_ns,t.source_id,t.ordinal,t.protocol
            FROM event_identifiers e JOIN timeline_index t ON t.event_id=e.event_id''')
        for kwargs in ({},{'source':2},{'protocol':'tcp'},{'identifier':'fixture-15999'},
                       {'identifier':'common-fixture'},{'identifier':'common-fixture','source':2},
                       {'identifier':'common-fixture','protocol':'tcp'},
                       {'identifier':'common-fixture','since':iso_ns(base+15900),'until':iso_ns(base+15920)},
                       {'since':iso_ns(base+15900),'until':iso_ns(base+15920)},{'include_unresolved':True}):
            with self.subTest(kwargs=kwargs):
                rows = self.measured(db,lambda:list(timeline(db,limit=10,**kwargs)))
                self.assertTrue(rows)
                self.assertLessEqual(len(rows),10)
        db.execute('UPDATE timeline_index SET utc_ns=NULL,original_utc_ns=NULL')
        db.execute('UPDATE identifier_timeline SET utc_ns=NULL')
        rows = self.measured(db,lambda:list(timeline(db,limit=10,include_unresolved=True)))
        self.assertEqual([row['source_id'] for row in rows],[1]*10)
        rows = self.measured(db,lambda:list(timeline(db,limit=10,include_unresolved=True,identifier='common-fixture')))
        self.assertEqual([row['source_id'] for row in rows],[1]*10)
        self.assertEqual(list(timeline(db)),[])

    def test_identifier_query_keeps_one_event_when_multiple_fields_match(self):
        source = self.root/'same-address.pcap'
        source.write_bytes(pcap([eth(ipv4(udp(dns_question()),src='192.0.2.10',dst='192.0.2.10'))]))
        analyze([source],self.root/'same-address-case')
        with closing(sqlite3.connect(self.root/'same-address-case/index.sqlite')) as db:
            rows = list(timeline(db,identifier='192.0.2.10'))
            self.assertEqual(len(rows),2)  # One packet and its DNS question.
            self.assertEqual(len({row['event_id'] for row in rows}),2)
            self.assertGreater(db.execute("SELECT COUNT(*) FROM event_identifiers WHERE value='192.0.2.10'").fetchone()[0],2)
            # Old cases remain queryable without a rebuild or mutation.
            db.execute('DROP TABLE identifier_timeline')
            self.assertEqual([row['event_id'] for row in timeline(db,identifier='192.0.2.10')],[row['event_id'] for row in rows])

    def rule_case(self):
        items = [eth(ipv4(tcp(dport=443),6))]*10
        items += [eth(ipv4(tcp(dport=100+i),6)) for i in range(10)]
        items += [eth(ipv4(udp(dns_question('a'*50+'.example.test'))))]*5
        items += [arp(),arp(mac='020000000003')]
        source = self.root/'rules.pcap'
        source.write_bytes(pcap([(1700000000,p) for p in items]))
        analyze([source],self.root/'rules-case')
        db = sqlite3.connect((self.root/'rules-case/index.sqlite').as_uri()+'?mode=ro',uri=True)
        self.addCleanup(db.close)
        return db,source

    def test_every_finding_resolves_private_support_and_exact_safe_selectors(self):
        db,source = self.rule_case()
        before = hashlib.sha256(source.read_bytes()).digest()
        found = set()
        for ident,rule in db.execute('SELECT id,rule FROM findings ORDER BY id'):
            result = finding(db,ident,limit=100)
            found.add(rule)
            support = result['support']
            self.assertFalse(support['truncated'])
            self.assertEqual(support['complete_match_count'],len(support['records']))
            self.assertTrue(support['records'])
            selector = support['reproduction_selector']
            self.assertEqual(len(db.execute(selector['sql'],selector['parameters']).fetchall()),len(support['records']))
            self.assertEqual(result['evaluation']['status'],'FINDINGS')
            for record in support['records']:
                self.assertEqual(record['source_id'],1)
                self.assertIn('time',record)
                self.assertTrue('provenance' in record or 'record_offset' in record)
        self.assertEqual(found,{'repeated_syn','destination_ports','dns_long_labels','conflicting_mappings'})
        self.assertEqual(before,hashlib.sha256(source.read_bytes()).digest())
        self.assertEqual(db.total_changes,0)

    def test_support_truncation_and_invalid_ids_are_explicit(self):
        db,_ = self.rule_case()
        ident = db.execute("SELECT id FROM findings WHERE rule='repeated_syn'").fetchone()[0]
        result = finding(db,ident,limit=3)['support']
        self.assertTrue(result['truncated']); self.assertEqual(result['returned_records'],3)
        self.assertIsNone(result['complete_match_count']); self.assertEqual(result['minimum_matching_records'],4)
        with patch('query.MAX_SUPPORT_BYTES',1):
            result = finding(db,ident)['support']
            self.assertTrue(result['truncated']); self.assertEqual(result['returned_records'],0)
        for ident,limit in ((True,100),(0,100),(9999,100),(1,0),(1,1001)):
            with self.assertRaises(IngestError): finding(db,ident,limit=limit)

    def test_finding_support_limit_does_not_scan_all_matching_occurrences(self):
        self.rule_case()
        db = sqlite3.connect(self.root/'rules-case/index.sqlite')
        self.addCleanup(db.close)
        # Repeated support remains distinct occurrences. LIMIT must stop the
        # indexed selector rather than sorting/counting all occurrences first.
        packet = db.execute('SELECT * FROM rule_packets LIMIT 1').fetchone()
        dns = db.execute('SELECT * FROM rule_dns LIMIT 1').fetchone()
        db.executemany('INSERT INTO rule_packets VALUES (?,?,?,?,?,?,?)',[packet]*16000)
        db.executemany('INSERT INTO rule_dns VALUES (?,?,?,?,?)',[dns]*16000)
        for ident, in db.execute("SELECT id FROM findings WHERE rule IN ('repeated_syn','destination_ports','dns_long_labels')"):
            result = self.measured(db,lambda:finding(db,ident,limit=3))
            self.assertTrue(result['support']['truncated'])
            self.assertEqual(result['support']['returned_records'],3)

    def test_syn_support_uses_ordered_index_with_distinct_ids_and_ports(self):
        self.rule_case()
        db = sqlite3.connect(self.root/'rules-case/index.sqlite')
        self.addCleanup(db.close)
        ident = db.execute("SELECT id FROM findings WHERE rule='repeated_syn'").fetchone()[0]
        rule_packet = db.execute('SELECT * FROM rule_packets WHERE dport=443 LIMIT 1').fetchone()
        packet = db.execute('SELECT * FROM packet_meta WHERE id=?',(rule_packet[0],)).fetchone()
        record = db.execute('SELECT * FROM records WHERE source_id=? AND ordinal=?',
                            (packet[1],packet[2])).fetchone()
        db.execute('DELETE FROM rule_packets')
        rules,packets,records = [],[],[]
        # Distinct IDs require real ORDER BY work; varying ports also prevents an
        # index ordered only by window/ID from cheaply filtering a sparse port.
        for number in range(16000,0,-1):
            row_id = number+100
            port = 443 if number>12000 else 1000+number
            r = list(rule_packet); r[0] = row_id; r[4] = port; rules.append(r)
            p = list(packet); p[0] = row_id; p[2] = row_id; p[8] = port; packets.append(p)
            rec = list(record); rec[1] = row_id; records.append(rec)
        db.executemany('INSERT INTO rule_packets VALUES (?,?,?,?,?,?,?)',rules)
        db.executemany('INSERT INTO packet_meta VALUES ('+','.join('?'*len(packet))+')',packets)
        db.executemany('INSERT INTO records VALUES ('+','.join('?'*len(record))+')',records)
        result = self.measured(db,lambda:finding(db,ident,limit=3))
        self.assertTrue(result['support']['truncated'])
        self.assertEqual(result['support']['returned_records'],3)
        selector = result['support']['reproduction_selector']
        plan = db.execute('EXPLAIN QUERY PLAN '+selector['sql']+' LIMIT ?',
                          selector['parameters']+[4]).fetchall()
        self.assertFalse(any('TEMP B-TREE' in row[3] for row in plan))


if __name__ == '__main__': unittest.main()
