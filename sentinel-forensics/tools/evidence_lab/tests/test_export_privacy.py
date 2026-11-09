"""Minimized exports never copy arbitrary radio text or SQLite source IDs."""
from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from adapters import TETRA
from analyze import analyze
from contract import validate_file


class RadioExportPrivacy(unittest.TestCase):
    def test_security_and_source_defined_sqlite_values_stay_private(self):
        with tempfile.TemporaryDirectory() as name:
            root=Path(name)
            markers={k:'private-marker-'+k for k in ('security','id','scan_id','encryption','hidden','wps')}
            radio=root/'radio.tetra.jsonl'
            radio.write_text(json.dumps({'schema':TETRA,'bssid':'02:00:00:00:00:01',
                'security':markers['security'],'timestamp':'2026-01-01T00:00:00Z'})+'\n')
            source=root/'recon.db'
            with closing(sqlite3.connect(source)) as db:
                db.executescript('''CREATE TABLE aps(id,scan_id,ssid,bssid,encryption,hidden,channel,signal,wps,last_seen);
                  CREATE TABLE clients(id,scan_id,mac,bssid,last_seen);''')
                db.execute('INSERT INTO aps VALUES (?,?,?,?,?,?,?,?,?,?)',
                    (markers['id'],markers['scan_id'],'private-network','02:00:00:00:00:02',
                     markers['encryption'],markers['hidden'],6,-50,markers['wps'],'2026-01-01T00:00:00Z'))
                db.commit()
            before=hashlib.sha256(source.read_bytes()).hexdigest()
            for target in ('one','two'):
                analyze([radio,source],root/target,pseudonym_key=b'K'*32)
                validate_file(root/target/'export/exchange.jsonl')
                for path in (root/target/'export').iterdir():
                    public=path.read_text()
                    for marker in markers.values(): self.assertNotIn(marker,public)
                with closing(sqlite3.connect(root/target/'index.sqlite')) as db:
                    private='\n'.join(str(row) for row in db.execute('SELECT data_json,provenance_json FROM observations'))
                    for marker in markers.values(): self.assertIn(marker,private)
                records=[json.loads(line) for line in (root/target/'export/exchange.jsonl').read_text().splitlines()]
                row=next(r['payload'] for r in records if r['entity']=='observation' and r['payload']['source_id']==2)
                self.assertEqual(row['provenance']['table'],'aps')
                self.assertEqual(row['provenance']['rowid'],1)
                self.assertTrue(row['provenance']['id'].startswith('p_'))
            self.assertEqual((root/'one/export/report.md').read_bytes(),(root/'two/export/report.md').read_bytes())
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),before)


if __name__=='__main__': unittest.main()
