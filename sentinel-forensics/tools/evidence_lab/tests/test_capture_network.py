from contextlib import closing
import hashlib
import io
import json
from pathlib import Path
import shutil
import sqlite3
import struct
import subprocess
import tempfile
import unittest
from core import Reader, IngestError, time_info
from capture import classic, pcapng, MAX_BLOCK
from analyze import analyze
from network import decode, dns
from fixtures import *

class CaptureNetwork(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup); self.root=Path(self.tmp.name)
    def parse(self,data): return list(pcapng(Reader(io.BytesIO(data))))
    def test_sections_interfaces_orders_resolutions_offsets(self):
        data=section()+interface()+interface(link=101,resolution=0x8a,offset=-2)
        data+=epb(eth(ipv4(udp(dns_question()))))+epb(ipv4(udp(dns_question())),iface=1,ticks=1025)
        data+=section('>')+interface('>',resolution=9,offset=3)+epb(eth(ipv4(tcp(),6)),endian='>',ticks=10**9)
        packets=[p for p in self.parse(data) if p.kind=='packet']
        self.assertEqual([p.linktype for p in packets],[1,101,1])
        self.assertEqual(packets[1].time['utc_ns'],-999023438)
        self.assertEqual(packets[1].time['original']['ticks'],1025)
        self.assertEqual(packets[2].time['utc_ns'],4*10**9)
        self.assertEqual(packets[2].section,1)
        for p in packets: self.assertEqual(p.sha256,hashlib.sha256(data[p.offset:p.offset+p.length]).hexdigest())
    def test_simple_packet_unknown_time(self):
        p=self.parse(section()+interface()+spb(arp()))[-1]
        self.assertIsNone(p.time['utc_ns']); self.assertEqual(p.time['status'],'missing')
    def test_unknown_block_accounting(self):
        p=self.parse(section()+block(0x1234,b'ignored'))[-1]
        self.assertEqual(p.status,'unsupported_block'); self.assertEqual(p.metadata['block_type'],0x1234)
    def test_optional_options_counted_not_resolved(self):
        data=section()+interface()+block(4,b'\0'*8)+block(10,b'\0'*8)
        self.assertEqual(sum(p.status=='unsupported_block' for p in self.parse(data)),2)
    def test_missing_section(self):
        with self.assertRaises(IngestError): self.parse(interface())
    def test_invalid_interface(self):
        with self.assertRaisesRegex(IngestError,'invalid_interface'): self.parse(section()+interface()+epb(arp(),iface=1))
    def test_interfaces_reset_per_section(self):
        with self.assertRaisesRegex(IngestError,'invalid_interface'): self.parse(section()+interface()+section()+epb(arp()))
    def test_block_budget_and_lengths(self):
        for length in (0,9,MAX_BLOCK+4,2**32-4):
            with self.subTest(length=length),self.assertRaises(IngestError): self.parse(section()+struct.pack('<II',6,length))
    def test_tail_mismatch_truncation(self):
        data=section()+interface()+epb(arp())
        for value in (data[:-1],data[:-4]+b'\0'*4,data[:20],data[:4]):
            with self.assertRaises(IngestError): self.parse(value)
    def test_options_malformed_and_duplicate(self):
        for options_data in (struct.pack('<HH',9,2)+b'\0'*4,struct.pack('<HH',14,3)+b'\0'*4,
                             (struct.pack('<HH',9,1)+b'\x06\0\0\0')*2,struct.pack('<HH',7,100)):
            with self.assertRaises(IngestError): self.parse(section()+block(1,struct.pack('<HHI',1,0,65535)+options_data))
    def test_known_section_length(self):
        tail=interface()+epb(arp())
        self.assertEqual(len(self.parse(section(length=len(tail))+tail)),3)
        for size in (1,len(tail)-4,len(tail)+4):
            with self.assertRaises(IngestError): self.parse(section(length=size)+tail)
    def test_classic_endian_nano_network_metadata(self):
        for endian in ('<','>'):
            for nano in (False,True):
                p=list(classic(Reader(io.BytesIO(pcap([arp()],endian,nano)))))[0]
                meta,obs,loss=decode(p)
                self.assertEqual(meta['protocol'],'arp'); self.assertEqual(obs[0][1]['address'],SRC); self.assertFalse(loss)
    def test_decode_network_protocols(self):
        inputs=[eth(ipv4(udp(dns_question()))),eth(ipv4(udp(dns_answer(),53,50000))),
                dhcp(),ndp(),eth(ipv4(tcp(hello()),6)),eth(ipv4(b'\x08\0\0\0',1),vlan=25),
                eth(ipv6(udp(b'abc',100,200),17),0x86dd)]
        packets=list(classic(Reader(io.BytesIO(pcap(inputs)))))
        out=[decode(p) for p in packets]
        self.assertEqual(out[0][1][0][1]['name'],'example.test')
        self.assertEqual(out[1][1][1][1]['address'],DST)
        self.assertEqual(out[2][1][0][1]['lease_seconds'],60)
        self.assertEqual(out[3][1][-1][1]['address'],'2001:db8::1')
        self.assertEqual(out[4][1][0][1]['server_name'],'example.test')
        self.assertEqual(out[5][0]['vlan'],[25]); self.assertEqual(out[6][0]['protocol'],'udp')
        self.assertTrue(all(not x[2] for x in out))
    def test_fragments_explicit_no_ports(self):
        for data in (eth(ipv4(udp(b'hi'),frag=0x2000)),eth(ipv6(b'\x11\0'+b'\0'*6+udp(b'hi'),44),0x86dd)):
            p=list(classic(Reader(io.BytesIO(pcap([data])))))[0]; meta,obs,loss=decode(p)
            self.assertIn('fragment_no_reassembly',loss); self.assertIsNone(meta['sport']); self.assertFalse(obs)
    def test_truncated_and_bad_transport(self):
        for data in (eth(b'\x45'),eth(ipv4(b'\0'*5,6)),eth(ipv4(b'\0'*8,17))):
            p=list(classic(Reader(io.BytesIO(pcap([data])))))[0]; self.assertTrue(decode(p)[2])
    def test_dns_pointer_loop_and_budget(self):
        for data in (struct.pack('!6H',1,0,1,0,0,0)+b'\xc0\x0c',struct.pack('!6H',1,0,33,0,0,0)):
            with self.assertRaises(ValueError): dns(data)
    def test_tls_no_reassembly_loss(self):
        data=eth(ipv4(tcp(hello()[:-1]),6))
        p=list(classic(Reader(io.BytesIO(pcap([data])))))[0]
        self.assertIn('tls_reassembly_required',decode(p)[2])
    def test_flow_directions_and_loss_reporting(self):
        forward=eth(ipv4(tcp(sport=111,dport=222),6))
        reverse=eth(ipv4(tcp(sport=222,dport=111,flags=18),6,src=DST,dst=SRC))
        src=self.root/'x.pcap'; src.write_bytes(pcap([forward,reverse,forward]))
        m=analyze([src],self.root/'case')
        with closing(sqlite3.connect(self.root/'case/index.sqlite')) as db:
            row=db.execute('SELECT packets,packets_a_to_b,packets_b_to_a,captured_a_to_b,captured_b_to_a FROM flows').fetchone()
            self.assertEqual(sorted(row[1:3]),[1,2]); self.assertEqual(row[0],3)
            self.assertEqual(row[3]+row[4],len(forward)*3)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM duplicates').fetchone()[0],0) # Timestamp differs; record bytes differ.
        self.assertEqual(m['coverage']['counts']['packet_records'],3)
    @unittest.skipUnless(shutil.which('tshark') and shutil.which('capinfos'),'independent Wireshark unavailable')
    def test_independent_pcap_and_pcapng_oracle(self):
        payloads=[eth(ipv4(udp(dns_question()))),eth(ipv4(udp(dns_answer(),53,50000))),arp(),dhcp(),ndp(),eth(ipv4(tcp(hello()),6))]
        for fmt in ('pcap','pcapng'):
            data=pcap(payloads) if fmt=='pcap' else section()+interface()+b''.join(epb(p,ticks=1700000000000000+i*1000000) for i,p in enumerate(payloads))
            src=self.root/f'oracle.{fmt}'; src.write_bytes(data)
            r=subprocess.run(['tshark','-n','-r',str(src),'-T','fields','-e','frame.number','-e','ip.src','-e','dns.qry.name','-e','dns.a','-e','arp.src.proto_ipv4','-e','dhcp.ip.your','-e','tls.handshake.extensions_server_name'],capture_output=True,text=True,check=True,timeout=10)
            rows=r.stdout.splitlines(); self.assertEqual(len(rows),6)
            self.assertIn(SRC,rows[0]); self.assertIn('example.test',rows[0]); self.assertIn(DST,rows[1])
            self.assertIn(SRC,rows[2]); self.assertIn(SRC,rows[3]); self.assertIn('example.test',rows[5])
            decoded=[decode(p) for p in (classic if fmt=='pcap' else pcapng)(Reader(io.BytesIO(data))) if p.kind=='packet']
            self.assertEqual(decoded[0][1][0][1]['name'],rows[0].split('\t')[2])
            self.assertEqual(decoded[1][1][1][1]['address'],rows[1].split('\t')[3])
            self.assertEqual(decoded[3][1][0][1]['assigned_ip'],rows[3].split('\t')[5])
    @unittest.skipUnless(shutil.which('tshark'),'independent Wireshark unavailable')
    def test_independent_multisection_mixed_endian_interfaces(self):
        raw=ipv4(udp(dns_question()))
        data=section()+interface()+interface(link=101,resolution=0x8a,offset=5)
        data+=epb(eth(raw))+epb(raw,iface=1,ticks=2048)
        data+=section('>')+interface('>',resolution=9)+epb(eth(raw),endian='>',ticks=10**9)
        p=self.root/'mixed.pcapng'; p.write_bytes(data)
        r=subprocess.run(['tshark','-n','-r',str(p),'-T','fields','-e','frame.number','-e','frame.time_epoch','-e','ip.src'],capture_output=True,text=True,check=True,timeout=10)
        rows=r.stdout.splitlines(); self.assertEqual(len(rows),3)
        times=[x.split('\t')[1] for x in rows]
        self.assertEqual(float(times[1]),7.0); self.assertEqual(float(times[2]),1.0)
        ours=[p for p in self.parse(data) if p.kind=='packet']; self.assertEqual([p.time['utc_ns'] for p in ours],[1700000000000000000,7*10**9,10**9])

if __name__=='__main__': unittest.main()

class ResourceReport(unittest.TestCase):
    def test_many_link_types_keep_complete_disk_accounting_with_bounded_manifest(self):
        with tempfile.TemporaryDirectory() as name:
            root=Path(name); src=root/'many.pcapng'
            # Hundreds of distinct protocol groups, not just repeated packet values.
            data=section()+b''.join(interface(link=1000+i) for i in range(1200))
            data+=b''.join(epb(b'\0'*14,iface=i) for i in range(1200))
            src.write_bytes(data); m=analyze([src],root/'case')
            self.assertEqual(len(m['summary']),1024); self.assertFalse(m['summary_complete_in_manifest'])
            self.assertEqual(m['summary_rows_total'],1201)
            with closing(sqlite3.connect(root/'case/index.sqlite')) as db:
                self.assertEqual(db.execute('SELECT COUNT(*) FROM summary').fetchone()[0],1201)
                self.assertEqual(db.execute('SELECT COUNT(*) FROM packet_meta').fetchone()[0],1200)
            self.assertEqual(m['coverage']['decoding_losses']['unsupported_linktype'],1200)
