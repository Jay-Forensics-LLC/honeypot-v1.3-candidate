#!/usr/bin/env python3
"""Verify historical archives separately from evolving, tested source code."""
import ast
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import zipfile

from check_dependencies import check as check_dependencies

ROOT = Path(__file__).resolve().parents[1]
SENSITIVE = re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|'
                       r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16})\b')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def safe_path(root, name):
    relative = Path(name)
    require(not relative.is_absolute() and '..' not in relative.parts, f'Unsafe path: {name}')
    path = root / relative
    require(not path.is_symlink() and path.resolve() == path.absolute(), f'Symlink: {name}')
    return path


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify_archives(root=ROOT):
    manifest = json.loads((root / 'docs/import-manifest.json').read_text())
    archive = safe_path(root, manifest['archive'])
    require(digest(archive.read_bytes()) == manifest['sha256'], 'Historical archive checksum mismatch')
    with zipfile.ZipFile(archive) as contents:
        for entry in manifest['entries']:
            require(digest(contents.read(entry['path'])) == entry['archive_sha256'],
                    'Historical archive entry differs: ' + entry['path'])
    for checksum in root.glob('*.zip.sha256'):
        fields = checksum.read_text().split()
        require(len(fields) == 2, 'Invalid archive checksum receipt')
        archive = safe_path(root, fields[1].lstrip('*'))
        require(digest(archive.read_bytes()) == fields[0], 'Historical ZIP checksum mismatch')
    # import_sha256 describes the original import, not today's working source.
    return manifest


def verify_source(root=ROOT):
    count = 0
    for directory in ('honeypot', 'tools'):
        for path in (root / directory).rglob('*'):
            require(not path.is_symlink(), f'Source symlink: {path}')
            if not path.is_file():
                continue
            name = path.relative_to(root).as_posix()
            safe_path(root, name)
            parts = path.relative_to(root / directory).parts
            require(not set(parts) & {'secrets', 'logs', 'captures', 'artifacts', 'incidents',
                                      'backups', 'work', '__pycache__'}, f'Excluded source path: {name}')
            require('state' not in parts or name == 'honeypot/state/wan-approval.example.json',
                    f'Runtime state: {name}')
            require(path.name != '.env' and not path.name.startswith('.env.') or path.name == '.env.example',
                    f'Live environment file: {name}')
            require(path.suffix not in {'.key', '.pem', '.pcap', '.pcapng'}, f'Excluded source file: {name}')
            require(path.stat().st_mode & 0o777 in {0o644, 0o755}, f'Unexpected source mode: {name}')
            text = path.read_text()
            require(not SENSITIVE.search(text), f'Sensitive content: {name}')
            if path.suffix == '.py':
                ast.parse(text, filename=name)
            elif path.suffix == '.json' or path.name == 'opencanary.conf':
                json.loads(text)
            elif path.suffix == '.sh':
                subprocess.run(['bash', '-n', str(path)], check=True, timeout=10)
            elif path.suffix in {'.yml', '.yaml'}:
                import yaml
                list(yaml.safe_load_all(text))
            count += 1
    return count


def main():
    verify_archives()
    print('PASS: historical archives and their original receipts', flush=True)
    count = verify_source()
    print(f'PASS: {count} current source files checked for modes, syntax and exclusions', flush=True)
    check_dependencies()
    subprocess.run([sys.executable, '-B', '-m', 'unittest', 'discover', '-s', 'tools/tests', '-v'],
                   cwd=ROOT, check=True, timeout=60)
    for target in ('test', 'verify'):
        subprocess.run(['make', target], cwd=ROOT / 'honeypot', check=True, timeout=180)
    print('Offline source checks only. Beta BLOCKED; independent Stage 7 PENDING; daemon-reload HOLD.',
          flush=True)


if __name__ == '__main__':
    main()
