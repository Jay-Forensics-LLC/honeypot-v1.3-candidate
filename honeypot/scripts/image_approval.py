"""Expected image IDs come from reviewed source, never post-start observations."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat

SERVICES = frozenset(('cowrie', 'opencanary', 'suricata', 'loki', 'alloy', 'grafana', 'incidentd'))
APPROVAL_PATH = 'configs/images.approved.json'


def read_regular(path, limit):
    """Finite stable read; reject special files before opening their streams."""
    path = Path(path)
    before = path.lstat()
    if path.resolve() != path.absolute() or not stat.S_ISREG(before.st_mode):
        raise ValueError('Nonregular or symlink reviewed input: '+str(path))
    if before.st_size > limit:
        raise ValueError('Reviewed input exceeds finite read limit')
    signature = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        opened = os.fstat(stream.fileno())
        if not stat.S_ISREG(opened.st_mode) or signature(opened) != signature(before):
            raise ValueError('Reviewed input changed before read')
        data = stream.read(limit + 1)
        after = os.fstat(stream.fileno())
    if (len(data) > limit or signature(after) != signature(before) or
            signature(path.lstat()) != signature(before)):
        raise ValueError('Reviewed input changed during bounded read')
    return data


def unique_object(pairs):
    result = {}
    for name, value in pairs:
        if name in result:
            raise ValueError('Duplicate image approval field')
        result[name] = value
    return result


def load(root, references, expected_sha256=None):
    path = Path(root)/APPROVAL_PATH
    data = read_regular(path, 1024**2)
    digest = hashlib.sha256(data).hexdigest()
    if expected_sha256 is not None and (not re.fullmatch(r'[0-9a-f]{64}', expected_sha256) or
                                       digest != expected_sha256):
        raise ValueError('Image approval differs from independently reviewed SHA-256')
    document = json.loads(data, object_pairs_hook=unique_object)
    if (type(document) is not dict or set(document) != {'version', 'images'} or
            type(document['version']) is not int or document['version'] != 1 or
            type(document['images']) is not dict or set(document['images']) != SERVICES or
            set(references) != SERVICES):
        raise ValueError('Reviewed image approval must name exactly the seven services')
    for service, image in document['images'].items():
        if (type(image) is not dict or set(image) != {'reference', 'id'} or
                type(image['reference']) is not str or image['reference'] != references[service] or
                type(image['id']) is not str or not re.fullmatch(r'sha256:[0-9a-f]{64}', image['id'])):
            raise ValueError('Invalid or mismatched reviewed image approval: '+service)
    return {'path': str(path), 'sha256': digest, 'images': document['images']}


def check_available(approval, inspect):
    for service, expected in sorted(approval['images'].items()):
        images = inspect(expected['reference'])
        if (not isinstance(images, list) or len(images) != 1 or
                images[0].get('Id') != expected['id']):
            raise ValueError('Available image differs from reviewed approval: '+service)


def check_containers(approval, containers):
    if set(containers) != SERVICES:
        raise ValueError('Expected exactly seven containers for image approval')
    for service, expected in approval['images'].items():
        actual = containers[service]
        if actual.get('Config', {}).get('Image') != expected['reference'] or actual.get('Image') != expected['id']:
            raise ValueError('Container image differs from reviewed approval: '+service)
