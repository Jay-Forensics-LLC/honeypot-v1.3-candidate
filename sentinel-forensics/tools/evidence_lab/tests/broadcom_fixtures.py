"""Invented fixed Broadcom common-header wire fixtures; no observed identifiers."""
import struct

SOURCE_MAC = '02:00:00:00:86:01'
DESTINATION_MAC = '02:00:00:00:86:02'


def event(*, version=2, flags=0, event_type=16, status=0, reason=0,
          auth_type=0, datalen=None, ifidx=0, bsscfgidx=0, data=b'',
          station=b'\x02\x00\x00\x00\x87\x01', ifname=b'invented'):
    """Emit the published packed v1/v2 layouts, allowing contradictory lengths."""
    if len(station) != 6 or len(ifname) > 16:
        raise ValueError('invented_identifier_width')
    declared = len(data) if datalen is None else datalen
    header = struct.pack('!HHIIIII6s16s', version, flags, event_type, status,
                         reason, auth_type, declared, station, ifname)
    if version != 1:
        header += bytes((ifidx, bsscfgidx))
    return header + data


def envelope(body, *, subtype=0x8001, version=0, namespace=b'\x00\x10\x18',
             user_subtype=1, length=None):
    """Outer length defaults to captured bytes following subtype and length."""
    if len(namespace) != 3:
        raise ValueError('invented_namespace_width')
    declared = len(body) + 6 if length is None else length
    return struct.pack('!HHB3sH', subtype, declared, version, namespace, user_subtype) + body


def ethernet(payload, *, tags=(), ethertype=0x886c):
    frame = bytes.fromhex(DESTINATION_MAC.replace(':', '') + SOURCE_MAC.replace(':', ''))
    for tpid, tci in tags:
        frame += struct.pack('!HH', tpid, tci)
    return frame + struct.pack('!H', ethertype) + payload
