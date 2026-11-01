#!/usr/bin/env python3
"""Verify the complete bundled Sentinel snapshot without requiring Git."""
import hashlib
import json
from pathlib import Path
import re
import stat

ROOT = Path(__file__).resolve().parents[1]


def _object(kind, data):
    return hashlib.sha1(kind.encode() + b' ' + str(len(data)).encode() + b'\0' + data).digest()


def check(root=ROOT):
    manifest = json.loads((root / 'docs/sentinel-source.json').read_text())
    if manifest.get('schema_version') != 1 or manifest.get('prefix') != 'sentinel-forensics':
        raise ValueError('Unsupported Sentinel source manifest')
    source = root / manifest['prefix']
    files = total = 0
    patches = {}
    for patch in manifest.get('patches', []):
        name = patch['path']
        operation = patch.get('operation', 'replace')
        if (not isinstance(name, str) or Path(name).is_absolute() or '..' in Path(name).parts or
                name in patches or operation not in ('replace', 'add') or
                not re.fullmatch('[a-f0-9]{64}', patch['sha256'])):
            raise ValueError('Invalid recorded Sentinel source patch')
        if operation == 'add':
            if patch.get('upstream_blob') is not None or patch.get('upstream_sha256') is not None:
                raise ValueError('Invalid recorded Sentinel source addition')
        elif not re.fullmatch('[a-f0-9]{40}', patch.get('upstream_blob', '')):
            raise ValueError('Invalid recorded Sentinel source replacement')
        patches[name] = patch
    observed_patches = set()

    def tree(folder):
        nonlocal files, total
        entries, upstream_entries = [], []
        for path in folder.iterdir():
            info = path.lstat()
            if stat.S_ISDIR(info.st_mode) and path.name != '.git':
                digest, upstream = tree(path)
                mode, key = b'40000', path.name.encode() + b'/'
            elif stat.S_ISREG(info.st_mode) and info.st_nlink == 1:
                if info.st_size > manifest['bytes']:
                    raise ValueError('Unexpected Sentinel source size')
                raw = path.read_bytes()
                files += 1
                total += len(raw)
                mode = b'100755' if info.st_mode & 0o111 else b'100644'
                digest, key = _object('blob', raw), path.name.encode()
                upstream = digest
                relative = path.relative_to(source).as_posix()
                if relative in patches:
                    patch = patches[relative]
                    if hashlib.sha256(raw).hexdigest() != patch['sha256']:
                        raise ValueError('Recorded Sentinel patch bytes differ')
                    upstream = (None if patch.get('operation', 'replace') == 'add' else
                                bytes.fromhex(patch['upstream_blob']))
                    observed_patches.add(relative)
            else:
                raise ValueError('Unsupported Sentinel source object')
            entries.append((key, mode + b' ' + path.name.encode() + b'\0' + digest))
            if upstream is not None:
                upstream_entries.append((key, mode + b' ' + path.name.encode() + b'\0' + upstream))
        return (_object('tree', b''.join(data for _, data in sorted(entries))),
                _object('tree', b''.join(data for _, data in sorted(upstream_entries))))

    if source.is_symlink() or not source.is_dir():
        raise ValueError('Bundled Sentinel source is missing')
    effective, original = tree(source)
    actual = effective.hex()
    if (actual != manifest['git_tree'] or original.hex() != manifest.get('upstream_git_tree', actual) or
            observed_patches != set(patches) or files != manifest['files'] or total != manifest['bytes'] or
            hashlib.sha256((source / 'LICENSE').read_bytes()).hexdigest() != manifest['license_sha256']):
        raise ValueError('Bundled Sentinel source differs from its pinned snapshot')
    return {'files': files, 'bytes': total, 'git_tree': actual, 'commit': manifest['commit'],
            'upstream_git_tree': original.hex(), 'recorded_patches': len(patches)}


if __name__ == '__main__':
    print('PASS: complete Sentinel source snapshot ' + json.dumps(check(), sort_keys=True))
