#!/usr/bin/env python3
"""Verify immutable archives and a reviewed source snapshot; offline checks only."""
import ast
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SENSITIVE = re.compile(
    r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|'
    r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16})\b'
)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def safe_path(root, name):
    rel = Path(name)
    require(not rel.is_absolute() and '..' not in rel.parts, f'Unsafe path: {name}')
    path = root / rel
    require(path.resolve() == path.absolute() and not path.is_symlink(), f'Symlink: {name}')
    return path


def verify_archives(root):
    original = json.loads((root / 'docs/import-manifest.json').read_text())
    archive = safe_path(root, original['archive'])
    require(digest(archive.read_bytes()) == original['sha256'], 'Archive checksum mismatch')
    with zipfile.ZipFile(archive) as archive_file:
        for entry in original['entries']:
            require(digest(archive_file.read(entry['path'])) == entry['archive_sha256'],
                    f'Original archive entry changed: {entry["path"]}')
    checksums = sorted(root.glob('*.zip.sha256'))
    require(len(checksums) == 2, 'Both original ZIP checksum files required')
    for checksum in checksums:
        fields = checksum.read_text().split()
        require(len(fields) == 2, f'Invalid checksum file: {checksum.name}')
        archive = safe_path(root, fields[1].lstrip('*'))
        require(archive.name == checksum.name[:-7], 'Checksum filename differs')
        require(digest(archive.read_bytes()) == fields[0], f'ZIP checksum mismatch: {archive.name}')
    return original


def verify_source(root, manifest):
    entries = manifest['files']
    names = {entry['path'] for entry in entries}
    require(len(names) == len(entries), 'Duplicate source entries')
    actual = set()
    for directory in ('honeypot', 'tools'):
        for path in (root / directory).rglob('*'):
            require(not path.is_symlink(), f'Symlink: {path}')
            if path.is_file():
                actual.add(path.relative_to(root).as_posix())
    require(actual == names, f'Source inventory differs: missing={sorted(names-actual)}, extra={sorted(actual-names)}')
    allowed_work = set(manifest['qualification_source_allowlist'])
    require(allowed_work <= names, 'Qualification source allowlist not fully inventoried')
    for entry in entries:
        name = entry['path']
        path = safe_path(root, name)
        require(Path(name).parts[0] in {'honeypot', 'tools'}, f'Outside source roots: {name}')
        parts = Path(name).parts
        require(not set(parts) & {'secrets', 'logs', 'captures', 'artifacts', 'incidents', 'backups', '__pycache__'},
                f'Excluded source path: {name}')
        require(not (path.name == '.env' or path.name.startswith('.env.')) or path.name == '.env.example',
                f'Live environment file: {name}')
        require(path.suffix not in {'.key', '.pem', '.pcap', '.pcapng', '.zip', '.bundle'}, f'Excluded file: {name}')
        require('work' not in parts or name in allowed_work, f'Unreviewed work file: {name}')
        require('state' not in parts or name == 'honeypot/state/wan-approval.example.json', f'Live state: {name}')
        data = path.read_bytes()
        require(len(data) == entry['bytes'] and digest(data) == entry['sha256'], f'Source hash/size differs: {name}')
        require(oct(path.stat().st_mode & 0o777) == entry['mode'], f'Source mode differs: {name}')
        text = data.decode('utf-8')
        require('\x00' not in text and not SENSITIVE.search(text), f'Sensitive/binary content: {name}')
        if path.suffix == '.py':
            ast.parse(text, filename=name)
        elif path.suffix == '.json' or path.name == 'opencanary.conf':
            json.loads(text)
        elif path.suffix == '.sh':
            subprocess.run(['bash', '-n', str(path)], check=True, timeout=10)
        elif path.suffix in {'.yml', '.yaml'}:
            import yaml
            list(yaml.safe_load_all(text))


def verify_import_records(root, original, manifest):
    differences = {entry['path']: entry for entry in manifest['baseline_differences']}
    for entry in original['entries']:
        name = entry['path']
        change = differences.get(name)
        if change:
            require(change['baseline_sha256'] == entry['import_sha256'], f'Baseline provenance differs: {name}')
            expected = change['snapshot_sha256']
            path = safe_path(root, name)
            require((not path.exists()) if expected is None else digest(path.read_bytes()) == expected,
                    f'Reviewed difference does not match: {name}')
        else:
            require(digest(safe_path(root, name).read_bytes()) == entry['import_sha256'],
                    f'Unaccounted imported source change: {name}')


def main():
    manifest = json.loads((ROOT / 'docs/source-sync-manifest.json').read_text())
    original = verify_archives(ROOT)
    verify_source(ROOT, manifest)
    verify_import_records(ROOT, original, manifest)
    print('PASS: original archives, reviewed source hashes/modes, exact inventory, exclusions and syntax', flush=True)
    subprocess.run([sys.executable, '-B', '-m', 'unittest', 'discover', '-s', 'tools/tests', '-v'],
                   cwd=ROOT, check=True, timeout=30)
    for target in ('stage7-test', 'test', 'verify'):
        subprocess.run(['make', target], cwd=ROOT / 'honeypot', check=True, timeout=120)
    print('Stage 7: BLOCKED; Stage 8: BLOCKED / NOT TESTED. No live, privileged, boot or deployment qualification.', flush=True)


if __name__ == '__main__':
    main()
