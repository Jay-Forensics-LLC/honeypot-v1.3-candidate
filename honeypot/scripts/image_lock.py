#!/usr/bin/env python3
"""Acquire an exclusive local image lock against independently reviewed IDs.

Reads existing Docker metadata only: never builds, pulls, creates or starts.
The review input is {"schema_version":1,"images":[{"reference":...,"image_id":...}]}.
Its seven exact image references/IDs must be reviewed and SHA-256 pinned first.
This records agreement with that review; it is not source-to-image attestation.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess

from daemon_check import inspect as inspect_daemon
from hp_common import utc
from runtime_inventory import SERVICES, validate_image_ids


def reviewed_images(path, digest):
    if not re.fullmatch(r'[0-9a-f]{64}', digest):
        raise ValueError('Reviewed image manifest requires a SHA-256 pin')
    path = Path(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or not 0 < before.st_size <= 1024**2:
            raise ValueError('Reviewed image manifest must be a bounded regular file')
        data = os.read(fd, 1024**2 + 1)
        after = os.fstat(fd)
        if ((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) !=
                (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) or len(data) != before.st_size):
            raise ValueError('Reviewed image manifest changed during acquisition')
    finally:
        os.close(fd)
    if hashlib.sha256(data).hexdigest() != digest:
        raise ValueError('Reviewed image manifest SHA-256 differs')
    document = json.loads(data)
    if not isinstance(document, dict) or document.get('schema_version') != 1:
        raise ValueError('Unsupported reviewed image manifest schema')
    entries = document.get('images')
    if not isinstance(entries, list) or len(entries) != len(SERVICES):
        raise ValueError('Review must identify exactly seven images')
    result = {}
    for entry in entries:
        if not isinstance(entry, dict) or set(entry) != {'reference', 'image_id'}:
            raise ValueError('Malformed reviewed image entry')
        reference, image_id = entry['reference'], entry['image_id']
        if (not isinstance(reference, str) or not re.fullmatch(r'[^\s\x00-\x1f]+', reference) or
                reference.startswith('-') or reference in result or not isinstance(image_id, str) or
                not re.fullmatch(r'sha256:[0-9a-f]{64}', image_id)):
            raise ValueError('Invalid or duplicate reviewed image identity')
        result[reference] = image_id
    return result


def _command(argv, root):
    return subprocess.run(argv, cwd=root, text=True, capture_output=True, timeout=30, check=True)


def acquire_reviewed_lock(root, review_path, review_sha256, runner=None, ownership=None):
    root = Path(root).absolute()
    state = root / 'state'
    lock = state / 'images.lock.json'
    if root.resolve() != root or state.resolve() != state or not state.is_dir():
        raise ValueError('Runtime/state must be prepared canonical directories')
    if lock.exists() or lock.is_symlink():
        raise FileExistsError('Existing image lock is preserved; review it without replacement')
    reviewed = reviewed_images(review_path, review_sha256)
    owner = (inspect_daemon if ownership is None else ownership)(root)
    if owner.get('ok') is not True:
        raise ValueError('Approved local Docker ownership is not established')
    run = _command if runner is None else runner
    rendered = json.loads(run(['docker', 'compose', '-f', str(root / 'docker-compose.yml'),
                               'config', '--format', 'json'], root).stdout)
    services = rendered.get('services', {})
    if set(services) != SERVICES or {spec.get('image') for spec in services.values()} != set(reviewed):
        raise ValueError('Rendered seven-service image selection differs from review')
    references = sorted(reviewed)
    images = json.loads(run(['docker', 'image', 'inspect', *references], root).stdout)
    if not isinstance(images, list) or len(images) != len(references):
        raise ValueError('Local image inventory differs from seven reviewed images')
    selected = {reference: {'Config': {'Image': reference}, 'Image': image_id}
                for reference, image_id in reviewed.items()}
    problems = validate_image_ids(selected, images)
    if problems:
        raise ValueError('Local image IDs differ from reviewed image identities')
    # Retain only lock-relevant metadata; do not store image environment/secrets.
    locked = [{key: image.get(key) for key in ('Id', 'RepoTags', 'RepoDigests')} for image in images]
    data = (json.dumps(locked, indent=2, sort_keys=True) + '\n').encode()
    fd = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o640)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    directory = os.open(state, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
    return {'timestamp': utc(), 'status': 'REVIEWED_LOCAL_IMAGE_LOCK_ACQUIRED', 'path': str(lock),
            'sha256': hashlib.sha256(data).hexdigest(), 'review_sha256': review_sha256,
            'image_count': len(locked), 'docker_mutated': False, 'local_lock_created': True,
            'qualification': 'Existing local image identities only; source-to-image and live gates NOT TESTED'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime-root', type=Path, required=True)
    parser.add_argument('--reviewed-images', type=Path, required=True)
    parser.add_argument('--reviewed-images-sha256', required=True)
    parser.add_argument('--write-lock', action='store_true', required=True,
                        help='Create one exclusive local state/images.lock.json; no Docker mutations')
    args = parser.parse_args()
    try:
        print(json.dumps(acquire_reviewed_lock(args.runtime_root, args.reviewed_images,
                                               args.reviewed_images_sha256), indent=2))
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as exc:
        raise SystemExit('Image lock acquisition blocked: ' + str(exc))


if __name__ == '__main__':
    main()
