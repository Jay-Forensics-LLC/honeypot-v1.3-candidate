#!/usr/bin/env python3
"""Offline baseline checks. No deployment, listener, capture, or firewall actions."""
import ast
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / 'docs/import-manifest.json').read_text())
archive = ROOT / manifest['archive']
assert hashlib.sha256(archive.read_bytes()).hexdigest() == manifest['sha256'], 'Archive checksum mismatch'
with zipfile.ZipFile(archive) as z:
    for entry in manifest['entries']:
        assert hashlib.sha256(z.read(entry['path'])).hexdigest() == entry['archive_sha256'], entry['path']
        path = ROOT / entry['path']
        assert hashlib.sha256(path.read_bytes()).hexdigest() == entry['import_sha256'], entry['path']
        assert oct(path.stat().st_mode & 0o777) == entry['mode'], entry['path']
        if entry['status'] == 'unchanged':
            assert entry['archive_sha256'] == entry['import_sha256'], entry['path']
        else:
            assert entry['path'] in {'honeypot/tests/test_intel_pack.py', 'honeypot/verification/LIVE_EVIDENCE_SUMMARY.md'}, entry['path']

for path in (ROOT / 'honeypot').rglob('*'):
    if not path.is_file():
        continue
    rel = path.relative_to(ROOT / 'honeypot')
    assert not any(part in {'secrets','logs','captures','artifacts','incidents','backups','work'} for part in rel.parts), str(rel)
    assert 'state' not in rel.parts or str(rel) == 'state/wan-approval.example.json', str(rel)
    assert path.name != '.env' and path.suffix not in {'.key','.pem','.pcap','.pcapng'}, str(rel)
    text = path.read_text()
    assert not re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', text), str(rel)
    assert not re.search(r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16})\b',text), str(rel)
    if path.suffix == '.py':
        ast.parse(text, filename=str(path))
    elif path.suffix == '.json' or path.name == 'opencanary.conf':
        json.loads(text)
    elif path.suffix == '.sh':
        subprocess.run(['bash','-n',str(path)], check=True)
    elif path.suffix in {'.yml','.yaml'}:
        import yaml
        list(yaml.safe_load_all(text))
print('PASS: archive, provenance, executable modes, source exclusions, Python/JSON/YAML/bash syntax')
subprocess.run([sys.executable,'-B','-m','unittest','discover','-s','tests','-v'],cwd=ROOT/'honeypot',check=True)
print('Live deployment, Docker, native validators, PCAP correlation, and runtime stability: NOT TESTED')
