from contextlib import closing
import hashlib, io, socket, sqlite3, struct, tempfile, unittest, zipfile
from pathlib import Path
from unittest.mock import patch
from analyze import analyze, packets, Reader, IngestError, MAX_RECORD

def capture(endian='<', nano=False, count=2):
    magic=b'\x4d\x3c\xb2\xa1' if nano else b'\xd4\xc3\xb2\xa1'
    if endian=='>': magic=magic[::-1]
    header=magic+struct.pack(endian+'HHiiII',2,4,0,0,65535,1)
    packet=b'\0'*12+b'\x08\x00private-payload'
    return header+(struct.pack(endian+'IIII',1700000000,123,len(packet),len(packet))+packet)*count

class Tests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name); self.out=self.root/'out'
    def source(self,name,data):
        p=self.root/name; p.write_bytes(data); return p
    def rows(self):
        with closing(sqlite3.connect(self.out/'index.sqlite')) as db: return db.execute('SELECT * FROM records').fetchall()
    def test_precision_offsets(self):
        for e in ('<','>'):
            for nano in (False,True):
                data=capture(e,nano); r=Reader(io.BytesIO(data)); rows=list(packets(r))
                self.assertEqual(len(rows),2); self.assertEqual(rows[0][1],24)
                self.assertEqual(rows[0][3],hashlib.sha256(data[24:24+rows[0][2]]).hexdigest())
                self.assertTrue(rows[0][4].endswith('000000123Z' if nano else '000123Z'))
                self.assertEqual(r.sha.hexdigest(),hashlib.sha256(data).hexdigest())
    def test_batch_privacy_summary_hashes(self):
        p=self.source('secret.pcap',capture()); q=self.source('a.log',b'2026-01-01T00:00:00Z private-payload\n{}\nbad\n')
        with patch.object(socket,'socket',side_effect=AssertionError): m=analyze([p,p,q],self.out)
        self.assertEqual(len(m['sources']),3); self.assertEqual(len(self.rows()),7)
        for f in self.out.rglob('*'):
            if not f.is_file(): continue
            self.assertNotIn(b'private-payload',f.read_bytes()); self.assertNotIn(b'secret.pcap',f.read_bytes())
        for line in (self.out/'SHA256SUMS').read_text().splitlines():
            sha,name=line.split('  '); self.assertEqual(sha,hashlib.sha256((self.out/name).read_bytes()).hexdigest())
        self.assertEqual(p.read_bytes(),capture())
    def test_truncation(self):
        data=capture(count=1)
        for cut in (0,4,23,25,len(data)-1):
            with self.assertRaises(IngestError): list(packets(Reader(io.BytesIO(data[:cut]))))
    def test_hostile_length(self):
        data=capture(count=0)+struct.pack('<IIII',1,0,2**32-1,2**32-1)
        with self.assertRaises(IngestError): list(packets(Reader(io.BytesIO(data))))
    def test_long_line(self):
        p=self.source('a.log',b'x'*(MAX_RECORD*3)+b'\n{}\n'); analyze([p],self.out)
        rows=self.rows(); self.assertEqual(len(rows),2)
        self.assertEqual(rows[0][-1],'record_budget_exceeded'); self.assertEqual(rows[1][2],MAX_RECORD*3+1)
    def test_batch_archives(self):
        paths=[]
        for i in range(2):
            p=self.root/f'{i}.zip'
            with zipfile.ZipFile(p,'w') as z: z.writestr('a.json','{}')
            paths.append(p)
        analyze(paths,self.out); self.assertTrue((self.out/'archive-2/events.jsonl').exists())
    def test_truncated_pcapng_rejected(self):
        p=self.source('a',b'\x0a\x0d\x0d\x0a')
        with self.assertRaisesRegex(IngestError,'truncated_capture'): analyze([p],self.out)
        self.assertFalse(self.out.exists())
    def test_no_overwrite(self):
        self.out.mkdir(); (self.out/'keep').write_text('keep')
        with self.assertRaises(IngestError): analyze([],self.out)
        self.assertTrue((self.out/'keep').exists())
    def test_failure_cleanup(self):
        p=self.source('a',capture())
        with patch('analyze.hash_file',side_effect=OSError):
            with self.assertRaises(OSError): analyze([p],self.out)
        self.assertFalse(self.out.exists())
    def test_source_change(self):
        p=self.source('a',capture()); original=packets
        def mutate(r):
            yield from original(r)
            with p.open('ab') as f: f.write(b'x')
        with patch('analyze.packets',mutate):
            with self.assertRaisesRegex(IngestError,'source_changed'): analyze([p],self.out)
        self.assertFalse(self.out.exists())
    def test_cli_private_error(self):
        import subprocess,sys
        r=subprocess.run([sys.executable,str(Path(__file__).resolve().parents[1]/'analyze.py'),str(self.root/'private-secret'),'--output',str(self.out)],text=True,capture_output=True)
        self.assertEqual(r.returncode,2); self.assertNotIn('private-secret',r.stdout+r.stderr)

if __name__=='__main__': unittest.main()
