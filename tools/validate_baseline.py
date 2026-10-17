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
    # The original export receipt pins only the explicitly retained work sources.
    receipt_path = root / 'docs/source-sync-manifest.json'
    receipt = json.loads(receipt_path.read_text()) if receipt_path.exists() else {}
    allowed = set(receipt.get('qualification_source_allowlist', []))
    records = {row['path']: row for row in receipt.get('files', [])}
    require(all(name.startswith('honeypot/work/live-qualification/') and name.endswith('.py')
                for name in allowed), 'Invalid qualification source allowlist')
    observed_work = set()
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
                                      'backups', '__pycache__'}, f'Excluded source path: {name}')
            if 'work' in parts:
                require(name in allowed, f'Unreviewed work file: {name}')
                record = records.get(name, {})
                require(digest(path.read_bytes()) == record.get('sha256')
                        and path.stat().st_size == record.get('bytes'),
                        f'Retained qualification source differs from export receipt: {name}')
                observed_work.add(name)
            require('state' not in parts or name == 'honeypot/state/wan-approval.example.json',
                    f'Runtime state: {name}')
            require(path.name != '.env' and not path.name.startswith('.env.') or path.name == '.env.example',
                    f'Live environment file: {name}')
            require(path.suffix not in {'.key', '.pem', '.pcap', '.pcapng'}, f'Excluded source file: {name}')
            require(path.stat().st_mode & 0o777 in {0o644, 0o755}, f'Unexpected source mode: {name}')
            text = path.read_text()
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
            count += 1
    require(observed_work == allowed, 'Retained qualification source inventory differs')
    return count


def verify_snapshot(root, manifest):
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
        require(entry['mode'] in {'0o644', '0o755'}, f'Non-Git source mode: {name}')
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



def verify_workflow(root=ROOT):
    import yaml
    config = yaml.safe_load((root / '.github/workflows/source-baseline.yml').read_text())
    require(config.get('permissions') == {'contents': 'read'}, 'Offline workflow permissions differ')
    job = config['jobs']['offline-validation']
    require(job.get('permissions', {'contents': 'read'}) == {'contents': 'read'},
            'Offline job permissions differ')
    steps = job['steps']
    checkouts = [step for step in steps if step.get('uses', '').startswith('actions/checkout@')]
    require(len(checkouts) == 1 and checkouts[0].get('with', {}).get('persist-credentials') is False,
            'Checkout credentials must not persist')
    require(any(step.get('run') == 'python -B tools/validate_baseline.py' for step in steps),
            'Offline workflow must run the source validator')


def main():
    verify_workflow()
    verify_archives()
    print('PASS: historical archives and their original receipts', flush=True)
    count = verify_source()
    print(f'PASS: {count} current source files checked for modes, syntax and exclusions', flush=True)
    check_dependencies()
    subprocess.run([sys.executable, '-B', '-m', 'unittest', 'discover', '-s', 'tools/tests', '-v'],
                   cwd=ROOT, check=True, timeout=60)
    for target in ('stage7-test', 'test', 'verify'):
        subprocess.run(['make', target], cwd=ROOT / 'honeypot', check=True, timeout=180)
    print('Offline source checks only. Beta BLOCKED; independent Stage 7 PENDING; daemon-reload HOLD.',
          flush=True)


if __name__ == '__main__':
    main()
