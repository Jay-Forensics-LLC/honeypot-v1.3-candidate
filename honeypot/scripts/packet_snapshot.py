"""Inspect bounded snapshots; never edit or repair original packet evidence.

Only a structurally valid PCAPNG prefix followed by one incomplete final block
can produce a derivative. TShark must still validate that derivative and find
the exact controlled marker. Unknown formats are left to the strict parser.
"""
import hashlib
import os
from pathlib import Path
import re
import stat
import struct


MAX_SNAPSHOT_BYTES = 64 * 1024**2
MAX_ACQUISITION_BYTES = 128 * 1024**2
METHOD = 'pcapng-complete-block-prefix-v1'
SOURCE_IDENTITY_FIELDS={'device','inode','bytes','mtime_ns','ctime_ns','mode'}
SHB = b'\x0a\x0d\x0d\x0a'
MINIMUM = {1: 20, 2: 32, 3: 16, 5: 24, 6: 32, 0x0A0D0D0A: 28}


def _bytes(path):
    """Read one stable, bounded regular file without following a symlink."""
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_NONBLOCK', 0))
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or not 0 < before.st_size <= MAX_SNAPSHOT_BYTES:
            raise ValueError('Packet snapshot must be a nonempty regular file within the 64 MiB limit')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            data = stream.read(MAX_SNAPSHOT_BYTES + 1)
        after = os.fstat(fd)
        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (
                after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) or len(data) != before.st_size:
            raise ValueError('Packet snapshot changed during bounded inspection')
        return data
    finally:
        os.close(fd)


def _options(data, start, end, order):
    while start < end:
        if end - start < 4:
            raise ValueError('Malformed complete PCAPNG options')
        code, length = struct.unpack_from(order + 'HH', data, start)
        start += 4
        if code == 0:
            if length or start != end:
                raise ValueError('Malformed complete PCAPNG option terminator')
            return
        start += (length + 3) & ~3
        if start > end:
            raise ValueError('Malformed complete PCAPNG option length')


def _complete_block(data, offset, length, kind, order, interfaces):
    """Check framing and packet lengths before considering a tail derivative."""
    if struct.unpack_from(order + 'I', data, offset + length - 4)[0] != length:
        raise ValueError('Malformed complete PCAPNG block trailer')
    end = offset + length - 4
    if kind == 0x0A0D0D0A:
        if struct.unpack_from(order + 'HH', data, offset + 12) != (1, 0):
            raise ValueError('Unsupported PCAPNG section version')
        section_length = struct.unpack_from(order + 'q', data, offset + 16)[0]
        if section_length != -1:
            # dumpcap writes an unknown section length. Explicit lengths need
            # cross-section accounting; refuse derivation rather than guess.
            raise ValueError('Explicit PCAPNG section length is not supported for bounded snapshots')
        interfaces.clear()
        _options(data, offset + 24, end, order)
    elif kind == 1:
        _, reserved, snaplen = struct.unpack_from(order + 'HHI', data, offset + 8)
        if reserved:
            raise ValueError('Malformed complete PCAPNG interface description')
        interfaces.append(snaplen)
        _options(data, offset + 16, end, order)
    elif kind in (2, 6):
        interface = (struct.unpack_from(order + 'H', data, offset + 8)[0] if kind == 2 else
                     struct.unpack_from(order + 'I', data, offset + 8)[0])
        captured, original = struct.unpack_from(order + 'II', data, offset + 20)
        if interface >= len(interfaces) or captured > original:
            raise ValueError('Malformed complete PCAPNG packet metadata')
        if interfaces[interface] and captured > interfaces[interface]:
            raise ValueError('PCAPNG packet exceeds interface snapshot length')
        options = offset + 28 + ((captured + 3) & ~3)
        if options > end:
            raise ValueError('Malformed complete PCAPNG packet length')
        _options(data, options, end, order)
    elif kind == 3:
        if not interfaces:
            raise ValueError('PCAPNG simple packet has no interface')
        original = struct.unpack_from(order + 'I', data, offset + 8)[0]
        captured = min(original, interfaces[0]) if interfaces[0] else original
        if length != 16 + ((captured + 3) & ~3):
            raise ValueError('Malformed complete PCAPNG simple packet length')
    elif kind == 5:
        if struct.unpack_from(order + 'I', data, offset + 8)[0] >= len(interfaces):
            raise ValueError('PCAPNG statistics block has no interface')
        _options(data, offset + 20, end, order)


def _partial_block(data, offset, length, kind, order, interfaces):
    """Reject contradictions already visible in an incomplete final block."""
    remaining=len(data)-offset
    if kind in (2, 5, 6):
        if remaining < 12:
            raise ValueError('Incomplete PCAPNG packet interface cannot be verified')
        interface=struct.unpack_from(order+('H' if kind==2 else 'I'),data,offset+8)[0]
        if interface>=len(interfaces):
            raise ValueError('Incomplete PCAPNG final block has invalid interface')
        if kind in (2,6) and remaining>=28:
            captured,original=struct.unpack_from(order+'II',data,offset+20)
            if (captured>original or (interfaces[interface] and captured>interfaces[interface]) or
                    32+((captured+3)&~3)>length):
                raise ValueError('Malformed incomplete PCAPNG packet metadata')
    elif kind==1 and remaining>=16:
        if struct.unpack_from(order+'H',data,offset+10)[0]:
            raise ValueError('Malformed incomplete PCAPNG interface description')
    elif kind==3 and remaining>=12:
        original=struct.unpack_from(order+'I',data,offset+8)[0]
        captured=min(original,interfaces[0]) if interfaces[0] else original
        if length!=16+((captured+3)&~3):
            raise ValueError('Malformed incomplete PCAPNG simple packet length')
    elif kind==0x0a0d0d0a and remaining>=24:
        if (struct.unpack_from(order+'HH',data,offset+12)!=(1,0) or
                struct.unpack_from(order+'q',data,offset+16)[0]!=-1):
            raise ValueError('Unsupported incomplete PCAPNG section metadata')


def inspect_snapshot(path):
    """Return reproducible provenance for a possible complete-block derivative.

    A partial header, unrecognized partial block, bad length/trailer, or invalid
    complete packet fails closed. No search or resynchronization skips interior
    corruption. Complete non-PCAPNG files keep their existing TShark behavior.
    """
    return _inspect_bytes(_bytes(Path(path)))


def _inspect_bytes(data):
    digest = hashlib.sha256(data).hexdigest()
    result = {'raw_sha256': digest, 'raw_bytes': len(data), 'derivation': None}
    if data[:4] != SHB:
        return result
    offset = blocks = 0
    order = None
    interfaces = []
    while offset < len(data):
        remaining = len(data) - offset
        if remaining < 8:
            raise ValueError('Incomplete PCAPNG block header cannot establish a safe derivative')
        section = data[offset:offset + 4] == SHB
        if section:
            if remaining < 12:
                raise ValueError('Incomplete PCAPNG section byte order')
            magic = data[offset + 8:offset + 12]
            order = {b'\x4d\x3c\x2b\x1a': '<', b'\x1a\x2b\x3c\x4d': '>'}.get(magic)
            if order is None:
                raise ValueError('Malformed PCAPNG section byte order')
        if order is None:
            raise ValueError('PCAPNG block before section header')
        kind, length = struct.unpack_from(order + 'II', data, offset)
        if length < MINIMUM.get(kind, 12) or length % 4 or length > MAX_SNAPSHOT_BYTES:
            raise ValueError('Malformed PCAPNG block length')
        if length > remaining:
            if not blocks or not interfaces or kind not in MINIMUM:
                raise ValueError('Unverifiable incomplete PCAPNG final block')
            _partial_block(data,offset,length,kind,order,interfaces)
            result['derivation'] = {
                'method': METHOD, 'format': 'pcapng', 'source_sha256': digest,
                'source_bytes': len(data), 'prefix_bytes': offset,
                'discarded_tail_bytes': remaining, 'complete_blocks': blocks,
                'tail_block_type': kind, 'tail_declared_bytes': length,
            }
            return result
        _complete_block(data, offset, length, kind, order, interfaces)
        offset += length
        blocks += 1
    return result


def _receipt(value):
    if type(value) is not dict or set(value)!={'path','sha256','bytes'}:
        raise ValueError('Packet artifact receipt must contain exactly path, sha256 and bytes')
    if (type(value['path']) is not str or '\x00' in value['path'] or
            type(value['sha256']) is not str or re.fullmatch(r'[0-9a-f]{64}',value['sha256']) is None or
            type(value['bytes']) is not int or not 0<value['bytes']<=MAX_SNAPSHOT_BYTES):
        raise ValueError('Invalid packet artifact receipt types or bounds')
    path=Path(value['path'])
    if not path.is_absolute() or path.is_symlink() or str(path.resolve(strict=True))!=value['path']:
        raise ValueError('Packet artifact path must be canonical, absolute and not a symlink')
    return path


def source_identity(info):
    return {'device':info.st_dev,'inode':info.st_ino,'bytes':info.st_size,
            'mtime_ns':info.st_mtime_ns,'ctime_ns':info.st_ctime_ns,'mode':info.st_mode}


def verify_source_identity(packet, acquisition, raw_bytes):
    source=acquisition['source_segment']
    if type(source) is not dict or set(source)!={'path','selected','opened','after_fd','after_path'}:
        raise ValueError('Incomplete capture source identity receipt')
    path=source['path']
    if (type(path) is not str or not Path(path).is_absolute() or '..' in Path(path).parts or
            '\x00' in path or path.startswith('//') or str(Path(path))!=path or
            path!=packet.get('source_segment') or path in (acquisition['raw_snapshot']['path'],acquisition['parser_snapshot']['path'])):
        raise ValueError('Capture source segment relationship differs')
    selected=source['selected']
    if (type(selected) is not dict or set(selected)!=SOURCE_IDENTITY_FIELDS or
            any(type(value) is not int or value<0 for value in selected.values()) or
            selected['inode']==0 or not stat.S_ISREG(selected['mode']) or
            not 0<selected['bytes']==raw_bytes<=MAX_SNAPSHOT_BYTES):
        raise ValueError('Invalid capture source identity or extent')
    for key in ('opened','after_fd','after_path'):
        current=source[key]
        if (type(current) is not dict or set(current)!=SOURCE_IDENTITY_FIELDS or
                any(type(value) is not int for value in current.values()) or current!=selected):
            raise ValueError('Capture source identity changed during acquisition')


def verify_acquisition(packet):
    """Independently verify retained raw-to-parser linkage, without TShark.

    This verifies evidence custody and exact derivation only. A separate strict
    TShark invocation must still establish the controlled marker, target and
    timestamp; successful provenance alone never qualifies a packet probe.
    """
    if type(packet) is not dict or type(packet.get('acquisition')) is not dict:
        raise ValueError('Packet acquisition metadata is required')
    acquisition=packet['acquisition']
    if set(acquisition)!={'raw_snapshot','parser_snapshot','derivation','source_segment'}:
        raise ValueError('Incomplete or unexpected packet acquisition metadata')
    raw_receipt=acquisition['raw_snapshot'];parser_receipt=acquisition['parser_snapshot']
    raw_path=_receipt(raw_receipt);parser_path=_receipt(parser_receipt)
    linked={'path':packet.get('snapshot'),'sha256':packet.get('sha256'),'bytes':packet.get('bytes')}
    _receipt(linked)
    if parser_receipt!=linked or raw_path.parent!=parser_path.parent:
        raise ValueError('Packet parser receipt or same-parent relationship differs')
    raw=_bytes(raw_path)
    parsed=raw if raw_path==parser_path else _bytes(parser_path)
    for receipt,data in ((raw_receipt,raw),(parser_receipt,parsed)):
        if receipt['bytes']!=len(data) or receipt['sha256']!=hashlib.sha256(data).hexdigest():
            raise ValueError('Retained packet artifact hash or size differs')
    unique_bytes=len(raw)+(len(parsed) if raw_path!=parser_path else 0)
    if unique_bytes>MAX_ACQUISITION_BYTES:
        raise ValueError('Retained packet acquisition exceeds the 128 MiB allowance')
    plan=_inspect_bytes(raw)['derivation']
    supplied=acquisition['derivation']
    if plan is None:
        if supplied is not None or raw_path!=parser_path:
            raise ValueError('Complete packet acquisition must reference the same unmodified artifact')
    else:
        if (type(supplied) is not dict or set(supplied)!=set(plan) or
                any(type(supplied[key]) is not type(value) or supplied[key]!=value for key,value in plan.items())):
            raise ValueError('Packet derivation metadata differs from the acquired bytes')
        if raw_path==parser_path or parsed!=raw[:plan['prefix_bytes']]:
            raise ValueError('Retained parser artifact is not the exact complete-block prefix')
    verify_source_identity(packet,acquisition,len(raw))
    return {'status':'PASS','raw_sha256':raw_receipt['sha256'],
            'parser_sha256':parser_receipt['sha256'],'unique_bytes':unique_bytes,
            'derived':plan is not None}
