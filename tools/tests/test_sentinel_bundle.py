"""A pinned import must retain every file, byte and Git mode."""
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from validate_sentinel_bundle import _object, check


class SentinelSnapshot(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        (self.root / 'docs').mkdir()
        self.source = self.root / 'sentinel-forensics'
        self.source.mkdir()
        (self.source / 'LICENSE').write_bytes(b'Example license\n')
        (self.source / 'README.md').write_bytes(b'Upstream source\n')
        for path in self.source.iterdir():
            path.chmod(0o644)
        manifest = {'schema_version': 1, 'prefix': 'sentinel-forensics',
                    'git_tree': '6b4e8899c4ae45347bc15114d3b5d31891e741b6',
                    'files': 2, 'bytes': 32, 'commit': 'a' * 40,
                    'license_sha256': 'bc2826aa98efbc4e96008986014adaa4315ebc742ac6577d64151178e952be0a'}
        (self.root / 'docs/sentinel-source.json').write_text(json.dumps(manifest))

    def test_exact_snapshot_passes_and_changed_byte_fails(self):
        self.assertEqual(check(self.root)['files'], 2)
        (self.source / 'README.md').write_bytes(b'Upstream source!')
        with self.assertRaises(ValueError):
            check(self.root)

    def test_missing_and_extra_files_fail(self):
        path = self.source / 'README.md'
        path.unlink()
        with self.assertRaises(ValueError):
            check(self.root)
        path.write_bytes(b'Upstream source\n')
        (self.source / 'extra').write_text('unexpected')
        with self.assertRaises(ValueError):
            check(self.root)

    def test_executable_mode_and_file_aliases_fail(self):
        path = self.source / 'README.md'
        path.chmod(0o755)
        with self.assertRaises(ValueError):
            check(self.root)
        path.chmod(0o644)
        path.unlink()
        path.symlink_to(self.source / 'LICENSE')
        with self.assertRaises(ValueError):
            check(self.root)
        path.unlink()
        os.link(self.source / 'LICENSE', path)
        with self.assertRaises(ValueError):
            check(self.root)

    def test_recorded_publication_patch_preserves_upstream_identity(self):
        (self.source / 'README.md').write_bytes(b'Published source\n')
        receipt = self.root / 'docs/sentinel-source.json'
        manifest = json.loads(receipt.read_text())
        manifest.update(upstream_git_tree=manifest['git_tree'],
                        git_tree='b350e8d14d3f6433f050ee938a989a2f2bf21c38', bytes=33,
                        patches=[{'path': 'README.md',
                                  'upstream_blob': 'e0a1411def2bc49002b74e5b2868cb72f17ffecb',
                                  'sha256': '4e9bc86457d26d2dced7e099cea994ab07b028c293194291116fce4b57e8ca10'}])
        receipt.write_text(json.dumps(manifest))
        self.assertEqual(check(self.root)['recorded_patches'], 1)
        manifest['patches'][0]['upstream_blob'] = '0' * 40
        receipt.write_text(json.dumps(manifest))
        with self.assertRaises(ValueError):
            check(self.root)

    def test_recorded_addition_preserves_upstream_identity(self):
        (self.source / 'overlay.txt').write_bytes(b'Local overlay\n')
        receipt = self.root / 'docs/sentinel-source.json'
        manifest = json.loads(receipt.read_text())
        manifest.update(upstream_git_tree=manifest['git_tree'],
                        git_tree='e496bb89c547fe059f9f9f4ef6e72617dbc41f39',
                        files=3, bytes=46,
                        patches=[{'path': 'overlay.txt', 'operation': 'add',
                                  'sha256': '869e5800630cf2513e2d826d6e6be63abf0ade969bb9975531d965f0096ca0d6',
                                  'reason': 'Add a local overlay file.'}])
        receipt.write_text(json.dumps(manifest))
        self.assertEqual(check(self.root)['recorded_patches'], 1)
        manifest['patches'][0]['upstream_blob'] = '0' * 40
        receipt.write_text(json.dumps(manifest))
        with self.assertRaises(ValueError):
            check(self.root)

    def test_recorded_rename_preserves_upstream_identity(self):
        source = self.source / 'README.md'
        renamed = self.source / 'README-renamed.md'
        raw = source.read_bytes()
        source.rename(renamed)
        effective = []
        for path in self.source.iterdir():
            blob = _object('blob', path.read_bytes())
            effective.append((path.name.encode(), b'100644 ' + path.name.encode() + b'\0' + blob))
        tree = _object('tree', b''.join(data for _, data in sorted(effective))).hex()
        receipt = self.root / 'docs/sentinel-source.json'
        manifest = json.loads(receipt.read_text())
        manifest.update(git_tree=tree, upstream_git_tree='6b4e8899c4ae45347bc15114d3b5d31891e741b6',
                        patches=[{'path': 'README-renamed.md', 'operation': 'replace',
                                  'upstream_path': 'README.md',
                                  'upstream_blob': _object('blob', raw).hex(),
                                  'sha256': hashlib.sha256(raw).hexdigest()}])
        receipt.write_text(json.dumps(manifest))
        self.assertEqual(check(self.root)['upstream_git_tree'], manifest['upstream_git_tree'])
        manifest['patches'][0]['upstream_path'] = '../README.md'
        receipt.write_text(json.dumps(manifest))
        with self.assertRaises(ValueError):
            check(self.root)


if __name__ == '__main__':
    unittest.main()
