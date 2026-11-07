"""Archive numeric failures retain source/record provenance and time uncertainty."""
from contextlib import closing
import hashlib
import json
from pathlib import Path
import plistlib
import sqlite3
import tempfile
import unittest
import zipfile

from analyze import analyze


class DiagnosticNumbers(unittest.TestCase):
    def test_numeric_errors_and_unsupported_time_do_not_discard_other_archive_records(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            source=root/'synthetic.zip'
            overflow=b'{"timestamp":1e999}\n'
            valid=b'{"timestamp":"2026-01-01T00:00:00Z"}\n'
            nonfinite_plist=plistlib.dumps({'timestamp':float('inf')})
            with zipfile.ZipFile(source,'w') as archive:
                archive.writestr('numbers.jsonl',overflow+valid)
                archive.writestr('unsupported-time.plist',nonfinite_plist)
            before=hashlib.sha256(source.read_bytes()).hexdigest()
            output=root/'case'
            result=analyze([source],output)
            self.assertEqual(result['status'],'COMPLETE')
            self.assertEqual(result['coverage']['counts']['parse_errors'],1)
            with closing(sqlite3.connect(output/'index.sqlite')) as db:
                self.assertEqual(db.execute("SELECT status,sha256 FROM records WHERE kind='parse_error'").fetchall(),
                                 [('malformed_record',hashlib.sha256(overflow).hexdigest())])
                values=db.execute('SELECT time_json,provenance_json,data_json FROM observations ORDER BY id').fetchall()
                self.assertEqual(len(values),2)
                times=[json.loads(row[0]) for row in values]
                self.assertEqual({row['status'] for row in times},{'normalized','unresolved'})
                bad=next(row for row in times if row['status']=='unresolved')
                self.assertIsNone(bad['utc_ns'])
                self.assertEqual(bad['original'],{'type':'nonfinite_number'})
                self.assertEqual([json.loads(row[2]) for row in values],[{}, {'timestamp_status':'unsupported_nonfinite'}])
                hashes={json.loads(row[1])['record_sha256'] for row in values}
                self.assertEqual(hashes,{hashlib.sha256(valid).hexdigest(),hashlib.sha256(nonfinite_plist).hexdigest()})
                self.assertTrue(all(json.loads(row[1])['source_id']==1 for row in values))
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),before)
            exported=(output/'export/exchange.jsonl').read_text()
            self.assertIn('unsupported_nonfinite',exported)
            self.assertNotIn('Infinity',exported)


if __name__=='__main__': unittest.main()
