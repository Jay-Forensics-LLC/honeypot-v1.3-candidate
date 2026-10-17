"""Private Grafana rollback snapshots, taken only after the container stops."""
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import sqlite3
import stat
import tarfile
import uuid

from hp_common import sha256, utc


def require(condition, message):
    if not condition:
        raise ValueError(message)


def container_identity(root, inspection):
    require(re.fullmatch(r'[0-9a-f]{64}', inspection.get('Id', '')) is not None,
            'Grafana container identity unavailable')
    require(re.fullmatch(r'sha256:[0-9a-f]{64}', inspection.get('Image', '')) is not None,
            'Grafana image identity unavailable')
    config = inspection.get('Config') or {}
    require((config.get('Labels') or {}).get('com.docker.compose.service') == 'grafana',
            'Container is not identified as the Grafana service')
    require((config.get('Labels') or {}).get('com.docker.compose.project.working_dir') == str(Path(root).resolve()),
            'Grafana belongs to a different Compose working directory')
    source = Path(root) / 'state/grafana'
    require(source.absolute() == source.resolve(), 'Grafana state path contains a symlink')
    mounts = [row for row in inspection.get('Mounts', []) if row.get('Destination') == '/var/lib/grafana']
    require(len(mounts) == 1 and mounts[0].get('Type') == 'bind'
            and mounts[0].get('Source') == str(source.resolve()),
            'Grafana state mount does not match this runtime tree')
    return {'container_id': inspection['Id'], 'image_id': inspection['Image'],
            'image_reference': config.get('Image')}


def stopped_identity(root, inspection):
    state = inspection.get('State') or {}
    require(state.get('Running') is False and state.get('Paused') is False
            and state.get('Pid') == 0 and state.get('Status') in ('exited', 'created'),
            'Grafana must be confirmed stopped before its state can be backed up')
    return container_identity(root, inspection)


def inventory(source):
    require(source.is_dir() and not source.is_symlink(), 'Grafana state directory unavailable')
    files = {}
    directories = []
    for path in sorted(source.rglob('*')):
        mode = path.lstat().st_mode
        require(not path.is_symlink(), 'Symlinks in Grafana state require separate review')
        name = path.relative_to(source).as_posix()
        if stat.S_ISDIR(mode):
            directories.append(name)
        else:
            require(stat.S_ISREG(mode) and path.stat().st_nlink == 1,
                    'Nonregular or hardlinked Grafana state requires separate review')
            digest, size = sha256(path)
            files[name] = {'sha256': digest, 'bytes': size}
    return files, directories


def verify(archive, expected=None):
    """Read every archived file without extracting or restoring anything."""
    with tarfile.open(archive, 'r:gz') as contents:
        members = contents.getmembers()
        names = [member.name for member in members]
        require(len(names) == len(set(names)), 'Duplicate Grafana backup member')
        for member in members:
            path = PurePosixPath(member.name)
            require(not path.is_absolute() and '..' not in path.parts
                    and (member.isfile() or member.isdir()), 'Unsafe Grafana backup member')
        receipt = json.load(contents.extractfile('snapshot.json'))
        if expected is not None:
            require(receipt == expected, 'Grafana backup receipt differs')
        expected_names = {'snapshot.json', 'grafana-state'}
        expected_names.update('grafana-state/' + name for name in receipt['directories'])
        expected_names.update('grafana-state/' + name for name in receipt['files'])
        require(set(names) == expected_names, 'Grafana backup inventory differs')
        for name, record in receipt['files'].items():
            member = contents.getmember('grafana-state/' + name)
            require(member.isfile() and member.size == record['bytes'], 'Grafana backup file size differs')
            digest = hashlib.sha256()
            with contents.extractfile(member) as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                    digest.update(chunk)
            require(digest.hexdigest() == record['sha256'], 'Grafana backup content differs')
    return receipt


def verify_snapshot(archive):
    """Verify the separate checksum receipt and archive before a restore drill."""
    archive = Path(archive)
    checksum = archive.with_name(archive.name + '.sha256')
    require(checksum.is_file() and not checksum.is_symlink(), 'Grafana checksum receipt unavailable')
    fields = checksum.read_text().split()
    require(len(fields) == 2 and re.fullmatch(r'[0-9a-f]{64}', fields[0]) is not None
            and fields[1] == archive.name, 'Invalid Grafana checksum receipt')
    require(sha256(archive)[0] == fields[0], 'Grafana archive checksum differs')
    return verify(archive)


def create_backup(root, inspection):
    root = Path(root)
    identity = stopped_identity(root, inspection)
    source = root / 'state/grafana'
    # Hot journals need a separately reviewed recovery/checkpoint procedure.
    for suffix in ('-wal', '-journal'):
        journal = source / ('grafana.db' + suffix)
        require(not journal.exists() or journal.stat().st_size == 0,
                'Grafana WAL/journal is nonempty; update stopped pending database backup review')
    files, directories = inventory(source)
    database = source / 'grafana.db'
    if database.exists():
        with sqlite3.connect(database.resolve().as_uri() + '?mode=ro&immutable=1', uri=True) as connection:
            require(connection.execute('PRAGMA quick_check').fetchall() == [('ok',)],
                    'Grafana SQLite integrity check failed')
    receipt = {'schema': 1, 'timestamp': utc(), 'identity': identity,
               'database_present': database.exists(), 'files': files, 'directories': directories,
               'qualification': 'ARCHIVE_VERIFIED; RESTORE_NOT_TESTED'}
    destination = root / 'backups'
    destination.mkdir(mode=0o700, exist_ok=True)
    require(destination.resolve() == destination.absolute(), 'Backup directory contains a symlink')
    archive = destination / ('grafana-state-' + uuid.uuid4().hex + '.tar.gz')
    fd = os.open(archive, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        with tarfile.open(fileobj=stream, mode='w:gz') as contents:
            contents.add(source, arcname='grafana-state', recursive=False)
            for name in directories + list(files):
                contents.add(source / name, arcname='grafana-state/' + name, recursive=False)
            data = (json.dumps(receipt, indent=2) + '\n').encode()
            member = tarfile.TarInfo('snapshot.json')
            member.size = len(data)
            member.mode = 0o600
            contents.addfile(member, io.BytesIO(data))
        stream.flush()
        os.fsync(stream.fileno())
    require(inventory(source) == (files, directories), 'Grafana state changed during backup')
    verify(archive, receipt)
    digest, _ = sha256(archive)
    checksum = archive.with_name(archive.name + '.sha256')
    fd = os.open(checksum, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(digest + '  ' + archive.name + '\n')
        stream.flush()
        os.fsync(stream.fileno())
    return archive
