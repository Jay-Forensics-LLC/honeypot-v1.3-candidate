import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
import contextlib
import io

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from incidentd import Engine,normalize
from hp_common import disk_severity,sha256
from firewall import render

class EngineTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        shutil.copytree(ROOT/'detections',self.root/'detections')
        (self.root/'captures').mkdir();self.engine=Engine(self.root)
    def tearDown(self):self.tmp.cleanup()
    def incidents(self):return [json.loads(p.read_text()) for p in (self.root/'incidents').rglob('incident.json')]
    def event(self,i,**kw):self.engine.process('cowrie',{'src_ip':'192.0.2.10','session':'localtest','eventid':'cowrie.login.failed',**kw},str(i))
    def test_normalization_password(self):
        e=normalize('cowrie',{'src_ip':'192.0.2.1','password':'SYNTHETIC-ONLY','eventid':'cowrie.login.failed'})
        self.assertTrue(e['password_present']);self.assertNotIn('password',e)
        self.assertNotIn('SYNTHETIC-ONLY',json.dumps(e))
    def test_opencanary_filename_kept_password_stripped(self):
        e=normalize('opencanary',{'src_host':'203.0.113.9','dst_port':2121,'logdata':{'USERNAME':'anon','PASSWORD':'s3cret','FILENAME':'INVOICE-HPAKIAabcdef12345678.xlsx'}})
        self.assertEqual(e.get('filename'),'INVOICE-HPAKIAabcdef12345678.xlsx')
        self.assertTrue(e['password_present'])
        self.assertNotIn('s3cret',json.dumps(e))
    def test_no_critical_from_attacker_text(self):
        self.event(1,eventid='cowrie.command.input',input='nsenter /proc/1/root')
        self.assertEqual(self.incidents()[0]['severity'],'HIGH')
    def test_verified_boundary(self):
        e=normalize('boundary',{'event_type':'host.compromise','verified':True});self.assertEqual(e['severity'],'CRITICAL')
        self.assertEqual(normalize('cowrie',{'event_type':'host.compromise','verified':True})['severity'],'LOW')
    def test_success_high(self):
        self.event(1,eventid='cowrie.login.success');self.assertEqual(self.incidents()[0]['severity'],'HIGH')
    def test_auth_threshold(self):
        for i in range(8):self.event(i,password='SYNTHETIC-ONLY')
        self.assertEqual(self.incidents()[0]['severity'],'MEDIUM')
    def test_session_ip_enrichment(self):
        self.event(1,eventid='cowrie.session.connect');self.event(2,src_ip=None,eventid='cowrie.command.input',input='id')
        self.assertEqual(len(self.incidents()),1);self.assertEqual(self.incidents()[0]['source_ip'],'192.0.2.10')
    def test_dedup(self):
        self.event(1);self.event(1);self.assertEqual(len(self.incidents()[0]['related_events']),1)
    def test_shared_username_links_not_merge(self):
        self.event(1,username='synthetic');self.event(2,src_ip='192.0.2.11',session='second',username='synthetic')
        values=self.incidents();self.assertEqual(len(values),2);self.assertTrue(any(x['correlation_links'] for x in values))
    def test_low_to_high_preservation(self):
        self.event(1);self.event(2,eventid='cowrie.command.input',input='id')
        p=next((self.root/'incidents').rglob('metadata.json'));self.assertTrue(json.loads(p.read_text())['pcap_snapshotted'])
    def test_malicious_timestamp_no_path(self):
        self.event(1,timestamp='../../unsafe');self.assertEqual(len(self.incidents()),1)
    def test_report_distinguishes_evidence(self):
        self.event(1);p=next((self.root/'incidents').rglob('incident.md'));s=p.read_text()
        for token in ['OBSERVED','INFERRED','UNKNOWN']:self.assertIn(token,s)
    def test_firewall_denial_not_compromise(self):
        e=normalize('firewall',{'MESSAGE':'HP_PROTECTED_DENY SRC=172.29.40.2 DST=192.168.1.2 SPT=12345 DPT=445'})
        self.assertEqual(e['severity'],'HIGH');self.assertEqual(e['source_ip'],'172.29.40.2')
    def test_suricata_mapping(self):
        e=self.engine.classify(normalize('suricata',{'alert':{'signature_id':1000007,'signature':'DNS burst'},'event_type':'alert'}))
        self.assertEqual(e['severity'],'MEDIUM')
    def test_hash_stable_bytes(self):
        p=self.root/'sample.txt';p.write_bytes(b'benign synthetic test')
        self.assertEqual(sha256(p),(hashlib.sha256(p.read_bytes()).hexdigest(),len(p.read_bytes())))
    def test_manifest_idempotent(self):
        spec=importlib.util.spec_from_file_location('hasher',ROOT/'scripts/hash-artifacts.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
        p=self.root/'artifacts';p.mkdir();f=p/'benign.txt';f.write_text('benign');os.utime(f,(time.time()-10,time.time()-10))
        self.assertEqual(len(m.scan(p)),1);self.assertEqual(m.scan(p),[])
    def test_watermarks(self):
        self.assertEqual([disk_severity(x) for x in [79,80,89,90,94,95,100]],['LOW','MEDIUM','MEDIUM','HIGH','HIGH','CRITICAL','CRITICAL'])
    def test_invalid_egress_rejected(self):
        with self.assertRaises(ValueError):render({'PROTECTED_SUBNET':'192.168.0.0/16','APPROVED_DNS':'8.8.8.8; flush ruleset'})
    def test_firewall_scoped(self):
        text=render({'PROTECTED_SUBNET':'192.168.0.0/16'})
        self.assertNotIn('flush ruleset',text);self.assertIn('table inet hp_guard',text);self.assertIn('ct state established,related accept',text)
    def test_partial_line_checkpoint(self):
        p=self.root/'logs/cowrie/cowrie.json';p.parent.mkdir(parents=True);p.write_text('{"eventid":"cowrie.session.connect"')
        self.engine.poll();self.assertEqual(self.engine.state['offsets']['logs/cowrie/cowrie.json']['offset'],0)
        with p.open('a') as f:f.write('}\n')
        self.engine.poll();self.assertGreater(self.engine.state['offsets']['logs/cowrie/cowrie.json']['offset'],0)
    def test_rotation_truncate(self):
        p=self.root/'logs/cowrie/cowrie.json';p.parent.mkdir(parents=True)
        p.write_text(json.dumps({'src_ip':'192.0.2.4','eventid':'cowrie.login.success','input':'x'*100})+'\n');self.engine.poll()
        p.write_text('{"src_ip":"192.0.2.5"}\n');self.engine.poll();self.assertEqual(len(self.incidents()),2)
    def test_splitting_caps_incident_size(self):
        self.engine.rules['max_events_per_incident']=2
        for i in range(3):self.event(i)
        self.assertEqual(sorted(len(x['related_events']) for x in self.incidents()),[1,2])
    def test_backup_verification_and_tamper_detection(self):
        import backup
        (self.root/'docker-compose.yml').write_text('services: {}\n')
        with patch.object(backup,'ROOT',self.root),patch.object(backup,'audit'),patch.object(backup,'runtime_path',lambda key,fallback:self.root/fallback),contextlib.redirect_stdout(io.StringIO()):
            archive=backup.backup();backup.verify(archive)
            with archive.open('ab') as f:f.write(b'tamper')
            with self.assertRaises(ValueError):backup.verify(archive)
    def test_pcap_preserves_closed_segment_only(self):
        for i in range(3):
            p=self.root/'captures'/f'ring-{i}.pcapng';p.write_bytes(b'BENIGN SYNTHETIC SEGMENT '+str(i).encode());os.utime(p,(time.time()-30+i,time.time()-30+i))
        self.event(1,eventid='cowrie.command.input',input='id')
        metadata=json.loads(next((self.root/'incidents').rglob('metadata.json')).read_text())
        self.assertEqual(len(metadata['copies']),2)
        self.assertFalse(any(x['source'].endswith('ring-2.pcapng') for x in metadata['copies']))
    def test_hash_manifest_replayed_after_restart(self):
        art=self.root/'artifacts';art.mkdir();p=art/'benign.txt';p.write_bytes(b'benign replay fixture');os.utime(p,(time.time()-10,time.time()-10))
        self.engine.poll();before=len(self.incidents());again=Engine(self.root);again.poll()
        self.assertEqual(len(self.incidents()),before);self.assertEqual(len(self.incidents()[0]['related_events']),1)

if __name__=='__main__':unittest.main()
