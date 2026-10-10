import json
from pathlib import Path
import tempfile
import unittest
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import bait


class BaitTests(unittest.TestCase):
    def test_inventory_is_not_clobbered_and_rule_ignores_names(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            first, created = bait.ensure_inventory(root)
            self.assertTrue(created)
            second, created = bait.ensure_inventory(root)
            self.assertFalse(created)
            self.assertEqual(first['cloud_key'], second['cloud_key'])
            docs = 'The prefix is HPAKIA. Field names include cloud_key, http_path, and banner_infix.'
            self.assertEqual(bait.match_tokens(docs, first), [])
            hit = bait.match_tokens('cat ' + first['invoice_name'], first)
            self.assertEqual(hit, ['bait-invoice'])
            event = {'severity': 'LOW', 'command': 'get ' + first['http_path'], 'notes': []}
            bait.annotate(event, root)
            self.assertEqual(event['severity'], 'HIGH')
            self.assertIn('bait-http', event['bait_ids'])
            self.assertNotIn(first['http_token'], json.dumps({'bait_ids': event['bait_ids']}))
            ftp = {'severity': 'LOW', 'filename': first['invoice_name'], 'notes': []}
            bait.annotate(ftp, root)
            self.assertEqual(ftp['severity'], 'HIGH')
            self.assertIn('bait-invoice', ftp['bait_ids'])

    def test_render_writes_tripwire_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            dest = bait.render(root)
            inventory = bait.load_inventory(root)
            self.assertTrue((dest / 'honeyfs/home' / inventory['invoice_name']).exists())
            text = (dest / 'honeyfs/home/.aws/credentials').read_text(encoding='utf-8')
            self.assertIn(inventory['cloud_key'], text)
            self.assertIn('NOT A REAL KEY', text)


if __name__ == '__main__':
    unittest.main()
