"""Private deterministic offline demonstration, separate from runtime telemetry."""
import hashlib
import ipaddress
import json
import os
from pathlib import Path, PurePosixPath
import stat
import struct

from .model import Phase10Error
from .session_cases import SessionCatalog

FIXTURE_ID = 'honeytrace.local-session-demo/1'
DEMO_CONTEXT = {'synthetic': True, 'fixture': FIXTURE_ID}
_STAMP = '2026-11-01T12:00:00Z'
_EPOCH = 1793534400
_PACKET_COUNT = 12
_DIRECTORY = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC


def _json(value):
    return (json.dumps(value, sort_keys=True, ensure_ascii=True,
                       separators=(',', ':'), allow_nan=False) + '\n').encode()


def _sha(raw):
    return hashlib.sha256(raw).hexdigest()


def _checksum(raw):
    raw += b'\0' * (len(raw) % 2)
    total = sum(int.from_bytes(raw[index:index + 2], 'big') for index in range(0, len(raw), 2))
    while total >> 16:
        total = (total & 65535) + (total >> 16)
    return (~total) & 65535


def _capture():
    """Construct twelve SYN observations as bytes; no sockets or capture tools."""
    def block(kind, body):
        body += b'\0' * (-len(body) % 4)
        size = len(body) + 12
        return struct.pack('<II', kind, size) + body + struct.pack('<I', size)

    source = ipaddress.ip_address('192.0.2.10').packed
    destination = ipaddress.ip_address('198.51.100.20').packed
    result = [block(0x0a0d0d0a, struct.pack('<IHHq', 0x1a2b3c4d, 1, 0, -1)),
              block(1, struct.pack('<HHI', 1, 0, 65535))]
    for ordinal in range(_PACKET_COUNT):
        tcp = struct.pack('!HHIIBBHHH', 41000, 2222, 1000 + ordinal, 0, 0x50, 2, 4096, 0, 0)
        pseudo = source + destination + struct.pack('!BBH', 0, 6, len(tcp))
        tcp = tcp[:16] + struct.pack('!H', _checksum(pseudo + tcp)) + tcp[18:]
        header = struct.pack('!BBHHHBBH4s4s', 0x45, 0, 40, ordinal, 0x4000, 64, 6, 0,
                             source, destination)
        header = header[:10] + struct.pack('!H', _checksum(header)) + header[12:]
        ethernet = bytes.fromhex('0200000000020200000000010800')
        packet = ethernet + header + tcp
        ticks = _EPOCH * 10**6 + ordinal * 100000
        result.append(block(6, struct.pack('<IIIII', 0, ticks >> 32, ticks & 0xffffffff,
                                           len(packet), len(packet)) + packet))
    return b''.join(result)


def _files():
    capture = _capture()
    digest = _sha(capture)
    folder = 'incidents/2026-11-01/' + 'd' * 24 + '-0000'
    rows = []
    for ordinal, (name, command) in enumerate((('connect', ''), ('id', 'id'), ('uname', 'uname -a'))):
        stamp = '2026-11-01T12:00:0' + str(ordinal) + 'Z'
        rows.append({'event_id': _sha((FIXTURE_ID + '/' + name).encode()), 'source': 'cowrie',
                     'session_id': 'synthetic-offline-session', 'timestamp': stamp,
                     'received_at': stamp, 'source_ip': '192.0.2.10', 'source_port': 41000,
                     'destination_port': 2222, 'service': 'ssh', 'command': command,
                     'event_type': 'cowrie.session.connect' if not command else 'cowrie.command.input',
                     'password_present': False, 'synthetic': True, 'fixture': FIXTURE_ID,
                     'notes': ['Wholly synthetic emulated input; no real-host execution is asserted.']})
    receipt = {'source': '/synthetic/honeytrace-demo/ring.pcapng',
               'destination': digest + '.pcapng', 'sha256': digest, 'size': len(capture),
               'timestamp': _STAMP, 'verified_stable': True,
               'source_size_at_start': len(capture), 'acquisition_limit_bytes': len(capture),
               'source_sha256_at_start': digest, 'source_identity':
               {'device': 1, 'inode': 1, 'mtime_ns': _EPOCH * 10**9, 'ctime_ns': _EPOCH * 10**9},
               'synthetic': True, 'fixture': FIXTURE_ID}
    files = {'logs/normalized/cowrie.jsonl': b''.join(_json(row) for row in rows),
             folder + '/pcap/' + digest + '.pcapng': capture,
             folder + '/incident.json': _json({'synthetic': True, 'fixture': FIXTURE_ID,
                                               'related_events': [row['event_id'] for row in rows]}),
             folder + '/metadata.json': _json({'synthetic': True, 'fixture': FIXTURE_ID,
                                               'created_at': _STAMP, 'copies': [receipt],
                                               'pcap_snapshotted': True,
                                               'limitations': ['Generated offline fixture, including fictional source identity; no live capture or physical identity proof.']})}
    files['demo.json'] = _json({'schema_version': 1, 'synthetic': True, 'fixture': FIXTURE_ID,
                               'case_context': DEMO_CONTEXT, 'packet_count': _PACKET_COUNT,
                               'expected_lead': 'repeated_syn',
                               'description': 'Offline synthetic observations; no sensor operation, network traffic or host execution.',
                               'files': {name: {'sha256': _sha(raw), 'bytes': len(raw)}
                                         for name, raw in sorted(files.items())}})
    return files


def _private(info, directory):
    return ((stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)) and
            info.st_uid == os.geteuid() and stat.S_IMODE(info.st_mode) == (0o700 if directory else 0o600)
            and (directory or info.st_nlink == 1))


def _signature(info):
    return info.st_dev, info.st_ino, info.st_mode, info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns


def _verify(parent, name, expected):
    descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC,
                         dir_fd=parent)
    try:
        before = os.fstat(descriptor)
        if not _private(before, False) or before.st_size != len(expected):
            raise Phase10Error('Existing demo data differs; choose an empty private demo directory')
        observed = bytearray()
        while len(observed) < len(expected):
            part = os.read(descriptor, len(expected) - len(observed))
            if not part:
                raise Phase10Error('Demo data changed during verification')
            observed.extend(part)
        if (bytes(observed) != expected or _signature(before) != _signature(os.fstat(descriptor)) or
                _signature(before) != _signature(os.stat(name, dir_fd=parent, follow_symlinks=False))):
            raise Phase10Error('Existing demo data differs; it was preserved unchanged')
    finally:
        os.close(descriptor)


def _tree(descriptor, prefix, files, directories):
    """Check the complete tiny existing tree before creating any fixture files."""
    with os.scandir(descriptor) as entries:
        for count, entry in enumerate(entries, 1):
            if count > 32:
                raise Phase10Error('Unexpected data in the private demo directory')
            relative = prefix + entry.name
            info = entry.stat(follow_symlinks=False)
            if relative in directories and _private(info, True):
                child = os.open(entry.name, _DIRECTORY, dir_fd=descriptor)
                try:
                    if (info.st_dev, info.st_ino) != (os.fstat(child).st_dev, os.fstat(child).st_ino):
                        raise Phase10Error('Demo directory changed during verification')
                    _tree(child, relative + '/', files, directories)
                finally:
                    os.close(child)
            elif relative in files:
                _verify(descriptor, entry.name, files[relative])
            else:
                raise Phase10Error('Unexpected data in the demo directory was preserved unchanged')


def create_demo(root):
    """Create/verify fixed private synthetic data and return its SessionCatalog.

    Callers must include ``catalog.demo_context`` in the resulting case context.
    Existing unexpected files, aliases, modes or contents are never overwritten.
    """
    path = Path(root).absolute()
    if '..' in path.parts or len(path.parts) < 2:
        raise Phase10Error('Choose a private local demo directory')
    parent = os.open(path.anchor, _DIRECTORY)
    descriptor = None
    try:
        for part in path.parts[1:-1]:
            try:
                os.mkdir(part, 0o700, dir_fd=parent)
            except FileExistsError:
                pass
            child = os.open(part, _DIRECTORY, dir_fd=parent)
            os.close(parent)
            parent = child
        try:
            os.mkdir(path.name, 0o700, dir_fd=parent)
        except FileExistsError:
            pass
        descriptor = os.open(path.name, _DIRECTORY, dir_fd=parent)
        if not _private(os.fstat(descriptor), True):
            raise Phase10Error('Demo directory must be private and operator-owned')
        files = _files()
        directories = {str(directory) for name in files for directory in PurePosixPath(name).parents
                       if str(directory) != '.'}
        _tree(descriptor, '', files, directories)
        for name in sorted(files):
            current = os.dup(descriptor)
            try:
                parts = PurePosixPath(name).parts
                for part in parts[:-1]:
                    try:
                        os.mkdir(part, 0o700, dir_fd=current)
                    except FileExistsError:
                        pass
                    child = os.open(part, _DIRECTORY, dir_fd=current)
                    if not _private(os.fstat(child), True):
                        os.close(child)
                        raise Phase10Error('Demo subdirectory must remain private and operator-owned')
                    os.close(current)
                    current = child
                try:
                    target = os.open(parts[-1], os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                                     os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=current)
                except FileExistsError:
                    _verify(current, parts[-1], files[name])
                else:
                    with os.fdopen(target, 'wb') as stream:
                        os.fchmod(stream.fileno(), 0o600)
                        stream.write(files[name])
                        stream.flush()
                        os.fsync(stream.fileno())
                    os.fsync(current)
            finally:
                os.close(current)
        if ((os.fstat(descriptor).st_dev, os.fstat(descriptor).st_ino) !=
                (os.stat(path.name, dir_fd=parent, follow_symlinks=False).st_dev,
                 os.stat(path.name, dir_fd=parent, follow_symlinks=False).st_ino)):
            raise Phase10Error('Demo directory changed during creation')
        os.fsync(descriptor)
    except OSError as exc:
        raise Phase10Error('Private demo data is unavailable or unsupported') from exc
    finally:
        if descriptor is not None:
            os.close(descriptor)
        os.close(parent)
    catalog = SessionCatalog(path)
    catalog.demo_context = dict(DEMO_CONTEXT)
    return catalog
