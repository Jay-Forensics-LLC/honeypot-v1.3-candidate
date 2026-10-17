import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import check_dependencies as dependencies
import validate_baseline as validation

ROOT = Path(__file__).resolve().parents[2]


class DependencyConsistency(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        names = ['docker-compose.yml', '.env.example', 'docs/IMAGE_REFERENCES.json',
                 'docker/opencanary.Dockerfile', 'docker/incidentd.Dockerfile',
                 'docker/suricata.Dockerfile', 'docker/opencanary/requirements.txt']
        for name in names:
            dest = self.root / 'honeypot' / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / 'honeypot' / name, dest)

    def test_consistent_declared_pins_pass(self):
        self.assertTrue(dependencies.check(self.root))

    def test_each_duplicate_pin_location_detects_drift(self):
        env = dict(line.split('=', 1) for line in (self.root / 'honeypot/.env.example').read_text().splitlines()
                   if line and not line.startswith('#'))
        for name in ('docker-compose.yml', '.env.example', 'docs/IMAGE_REFERENCES.json',
                     'docker/opencanary.Dockerfile'):
            with self.subTest(name=name):
                path = self.root / 'honeypot' / name
                before = path.read_text()
                path.write_text(before.replace(env['PYTHON_IMAGE'], 'python:99.0.0@sha256:' + 'c' * 64)
                                if name.endswith('.Dockerfile') else
                                before.replace(env['GRAFANA_IMAGE'], 'grafana/grafana:99.0.0@sha256:' + 'c' * 64))
                with self.assertRaises(ValueError):
                    dependencies.check(self.root)
                path.write_text(before)

    def test_build_argument_drift_is_detected(self):
        path = self.root / 'honeypot/docker-compose.yml'
        config = dependencies.yaml.safe_load(path.read_text())
        config['services']['opencanary']['build']['args']['PYTHON_IMAGE'] = '${PYTHON_IMAGE:-python:99.0.0@sha256:' + 'c' * 64 + '}'
        path.write_text(dependencies.yaml.safe_dump(config))
        with self.assertRaisesRegex(ValueError, 'build argument'):
            dependencies.check(self.root)

    def test_missing_requirement_is_detected(self):
        (self.root / 'honeypot/docker/opencanary/requirements.txt').unlink()
        with self.assertRaisesRegex(ValueError, 'build context'):
            dependencies.check(self.root)

    def test_dependabot_paths_and_major_update_hold(self):
        config = dependencies.yaml.safe_load((ROOT / '.github/dependabot.yml').read_text())
        entries = {entry['package-ecosystem']: entry for entry in config['updates']}
        self.assertEqual(entries['docker']['directory'], '/honeypot/docker')
        self.assertEqual(entries['docker-compose']['directory'], '/honeypot')
        self.assertEqual(entries['pip']['directory'], '/honeypot/docker/opencanary')
        self.assertTrue(list((ROOT / '.github/workflows').glob('*.yml')))
        for ecosystem in ('docker', 'docker-compose'):
            self.assertIn({'dependency-name': '*', 'update-types': ['version-update:semver-major']},
                          entries[ecosystem]['ignore'])


class HistoricalArchive(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / 'docs').mkdir()
        self.archive = self.root / 'historical.zip'
        with zipfile.ZipFile(self.archive, 'w') as stream:
            stream.writestr('honeypot/README.md', b'historical source')
        receipt = {'archive': self.archive.name,
                   'sha256': hashlib.sha256(self.archive.read_bytes()).hexdigest(),
                   'entries': [{'path': 'honeypot/README.md',
                                'archive_sha256': hashlib.sha256(b'historical source').hexdigest(),
                                'import_sha256': hashlib.sha256(b'historical source').hexdigest()}]}
        (self.root / 'docs/import-manifest.json').write_text(json.dumps(receipt))
        (self.root / 'honeypot').mkdir()
        (self.root / 'honeypot/README.md').write_text('reviewed current source has evolved')

    def test_current_source_change_does_not_invalidate_historical_receipt(self):
        validation.verify_archives(self.root)

    def test_archive_tampering_is_rejected(self):
        self.archive.write_bytes(self.archive.read_bytes() + b'changed')
        with self.assertRaisesRegex(ValueError, 'archive checksum'):
            validation.verify_archives(self.root)

    def test_archive_entry_tampering_is_rejected_even_with_updated_outer_hash(self):
        with zipfile.ZipFile(self.archive, 'w') as stream:
            stream.writestr('honeypot/README.md', b'altered historical source')
        path = self.root / 'docs/import-manifest.json'
        receipt = json.loads(path.read_text())
        receipt['sha256'] = hashlib.sha256(self.archive.read_bytes()).hexdigest()
        path.write_text(json.dumps(receipt))
        with self.assertRaisesRegex(ValueError, 'archive entry'):
            validation.verify_archives(self.root)
