from contextlib import closing
import copy
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from analyze import analyze
from contract import validate, validate_file, schema, CONTRACT
from core import IngestError
from qualify import semantic_digest, export_digest, verify_bundle
from fixtures import *

class RulesContract(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup); self.root=Path(self.tmp.name); self.number=0
    def case(self,items,config=None):
        self.number+=1; p=self.root/f'{self.number}.pcap'; p.write_bytes(pcap(items)); os.utime(p,ns=(1700000000000000000,1700000000000000000)); out=self.root/f'out{self.number}'
        m=analyze([p],out,config=config,pseudonym_key=b'K'*32)
        db=sqlite3.connect(out/'index.sqlite'); self.addCleanup(db.close); return db,out,m
    def syn(self,n,spread=False): return [eth(ipv4(tcp(sport=40000,dport=100+i if spread else 443),6)) for i in range(n)]
    def dnss(self,n,size=50): return [eth(ipv4(udp(dns_question('a'*size+'.example.test')))) for _ in range(n)]
    def state(self,db,rule): return db.execute('SELECT status FROM rule_evaluations WHERE rule=?',(rule,)).fetchone()[0]
    def test_syn_positive_negative_boundary_and_insufficient(self):
        for n,status in [(0,'INSUFFICIENT_EVIDENCE'),(9,'INSUFFICIENT_EVIDENCE'),(10,'FINDINGS')]:
            db,_,_=self.case(self.syn(n)); self.assertEqual(self.state(db,'repeated_syn'),status)
        # Sufficient samples spread among destinations: evaluated, no threshold exceeded.
        items=[eth(ipv4(tcp(),6,dst=f'198.51.100.{i+1}')) for i in range(10)]
        db,_,_=self.case(items); self.assertEqual(self.state(db,'repeated_syn'),'NO_FINDING')
    def test_port_spread_positive_negative_boundary_and_insufficient(self):
        db,_,_=self.case(self.syn(10,True)); self.assertEqual(self.state(db,'destination_ports'),'FINDINGS')
        db,_,_=self.case(self.syn(10,False)); self.assertEqual(self.state(db,'destination_ports'),'NO_FINDING')
        db,_,_=self.case(self.syn(9,True)); self.assertEqual(self.state(db,'destination_ports'),'INSUFFICIENT_EVIDENCE')
        db,_,_=self.case(self.syn(10,True),{'rules':{'port_minimum':11}}); self.assertNotEqual(self.state(db,'destination_ports'),'FINDINGS')
    def test_dns_positive_negative_boundaries_insufficient(self):
        for n,size,status in [(5,50,'FINDINGS'),(5,49,'NO_FINDING'),(4,50,'INSUFFICIENT_EVIDENCE'),(5,12,'NO_FINDING')]:
            db,_,_=self.case(self.dnss(n,size)); self.assertEqual(self.state(db,'dns_long_labels'),status)
    def test_conflicts_positive_negative_boundary_insufficient(self):
        t=1700000000
        for when,count in [(t+4,1),(t+5,0)]:
            db,_,_=self.case([(t,dhcp(5)),(when,arp(mac='020000000003'))])
            self.assertEqual(db.execute("SELECT COUNT(*) FROM findings WHERE rule='conflicting_mappings'").fetchone()[0],count)
        db,_,_=self.case([arp()]); self.assertEqual(self.state(db,'conflicting_mappings'),'INSUFFICIENT_EVIDENCE')
    def test_benign_lookalikes_explained_for_every_rule(self):
        # All deliberately ambiguous lookalikes trigger a lead, never attribution.
        cases=[('repeated_syn',self.syn(10),'Retransmissions'),('destination_ports',self.syn(10,True),'Authorized'),
               ('dns_long_labels',self.dnss(5),'CDN'),('conflicting_mappings',[(1700000000,arp()),(1700000000,arp(mac='020000000003'))],'Proxy ARP')]
        for rule,items,alternative in cases:
            db,_,_=self.case(items)
            row=db.execute('SELECT severity,confidence,alternatives,explanation,evidence_json FROM findings WHERE rule=?',(rule,)).fetchone()
            self.assertEqual(row[0],'review'); self.assertEqual(row[1],'supported_pattern'); self.assertIn(alternative,row[2])
            self.assertNotIn('compromised',row[3]); self.assertTrue(json.loads(row[4]))
    def test_determinism_traceability_and_contract(self):
        items=self.syn(10)+self.dnss(5)
        db,one,_=self.case(items); _,two,_=self.case(items)
        self.assertEqual(semantic_digest(one),semantic_digest(two)); self.assertEqual(export_digest(one),export_digest(two))
        verify_bundle(one); n=validate_file(one/'export/exchange.jsonl'); self.assertGreater(n,30)
        for (raw,) in db.execute('SELECT evidence_json FROM findings'):
            evidence=json.loads(raw)
            if 'first_packet' in evidence:
                self.assertIsNotNone(db.execute('SELECT source_id,ordinal FROM packet_meta WHERE id=?',(evidence['first_packet'],)).fetchone())
            if 'first_observation' in evidence:
                self.assertIsNotNone(db.execute('SELECT provenance_json FROM observations WHERE id=?',(evidence['first_observation'],)).fetchone())
    def test_contract_shape_and_version_fail_closed(self):
        valid={'contract':CONTRACT,'entity':'source','id':'source:1','payload':{'id':1,'sha256':'a'*64,'size':2,'kind':'pcap','parser_version':'2.0.0','metadata':{}}}
        validate(valid)
        changes=[dict(valid,contract='future/99'),dict(valid,extra=True),dict(valid,payload={}),
                 dict(valid,payload=dict(valid['payload'],size=True)),dict(valid,payload=dict(valid['payload'],sha256='g'*64))]
        for obj in changes:
            with self.assertRaises(IngestError): validate(obj)
    def test_json_schema_agrees_on_export(self):
        try: import jsonschema
        except ImportError: self.skipTest('optional independent JSON Schema validator not installed')
        _,out,_=self.case(self.syn(10))
        validator=jsonschema.Draft202012Validator(schema())
        for line in (out/'export/exchange.jsonl').read_bytes().splitlines(): validator.validate(json.loads(line))
    def test_evidence_unavailable_is_not_clean(self):
        db,_,m=self.case([])
        self.assertTrue(all(row[0]=='INSUFFICIENT_EVIDENCE' for row in db.execute('SELECT status FROM rule_evaluations')))
        self.assertEqual(m['compromise_assessment'],'not_performed')

if __name__=='__main__': unittest.main()

class HostileContract(unittest.TestCase):
    def observation(self):
        from core import time_info
        when=time_info('2026-01-01T00:00:00Z'); when.pop('original')
        return {'contract':CONTRACT,'entity':'observation','id':'observation:1','payload':{
           'id':'observation:1','source_id':1,'ordinal':1,'kind':'fixture','protocol':'fixture','context':'fixture',
           'time':when,'data':{},'provenance':{'source_id':1,'precision':'byte','byte_offset':0,'byte_length':1},'duplicate_of':None}}
    def test_malformed_nested_contract_values_rejected(self):
        for key,value in [('precision',[]),('precision',{'decimal_digits':True}),('precision',{'denominator':0,'numerator':1}),('utc_ns',True),('status','unknown-future-status')]:
            item=self.observation();item['payload']['time'][key]=value
            with self.assertRaises(IngestError): validate(item)
    def test_untrusted_entity_and_provenance_rejected(self):
        item=self.observation(); item['entity']=[]
        with self.assertRaises(IngestError): validate(item)
        item=self.observation(); item['payload']['provenance']['source_id']=True
        with self.assertRaises(IngestError): validate(item)
