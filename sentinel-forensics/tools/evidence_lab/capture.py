"""Bounded classic PCAP / PCAPNG framing with exact source byte provenance."""
from dataclasses import dataclass, field
import hashlib
import struct
from core import IngestError, MAX_RECORD, time_info, iso_ns

MAGICS = {b'\xd4\xc3\xb2\xa1': ('<', 10**6), b'\xa1\xb2\xc3\xd4': ('>', 10**6),
          b'\x4d\x3c\xb2\xa1': ('<', 10**9), b'\xa1\xb2\x3c\x4d': ('>', 10**9)}
NG = b'\x0a\x0d\x0d\x0a'
MAX_INTERFACES = 4096
MAX_BLOCK = MAX_RECORD + 65536


@dataclass
class Packet:
    ordinal: int
    offset: int
    length: int
    sha256: str
    time: dict
    payload: bytes
    original: int
    linktype: int
    section: int = 0
    interface: int = 0
    block: int = 0
    kind: str = 'packet'
    status: str | None = None
    metadata: dict = field(default_factory=dict)

    def row(self):
        protocol = 'link_' + str(self.linktype)
        if self.linktype == 1 and len(self.payload) >= 14:
            protocol = {0x0800: 'ethernet_ipv4', 0x86dd: 'ethernet_ipv6', 0x0806: 'ethernet_arp',
                        0x8100: 'ethernet_vlan'}.get(int.from_bytes(self.payload[12:14], 'big'), 'ethernet_other')
        stamp = iso_ns(self.time['utc_ns'])
        if stamp and isinstance(self.time['original'],dict) and self.time['original'].get('units_per_second') == 10**6:
            stamp = stamp[:-4]+'Z'
        return (self.ordinal, self.offset, self.length, self.sha256, stamp,
                self.kind, protocol if self.kind == 'packet' else 'pcapng', len(self.payload), self.status)


class PacketRow(tuple):
    def __new__(cls, packet):
        obj = super().__new__(cls, packet.row())
        obj.packet = packet
        return obj


def classic(reader):
    header = reader.exact(24)
    if header[:4] not in MAGICS: raise IngestError('unsupported_capture_format')
    endian, units = MAGICS[header[:4]]
    major, minor, zone, sigfigs, snaplen, network = struct.unpack(endian + 'HHiiII', header[4:])
    if (major, minor) != (2, 4) or not 0 < snaplen <= MAX_RECORD:
        raise IngestError('unsupported_capture_header')
    number = 0
    while True:
        offset = reader.offset
        record = reader.read(16)
        if not record: return
        if len(record) != 16: raise IngestError('truncated_capture')
        sec, frac, captured, original = struct.unpack(endian + 'IIII', record)
        if captured > snaplen or captured > original or frac >= units:
            raise IngestError('invalid_packet_header')
        payload = reader.exact(captured)
        number += 1
        t = time_info(ticks=sec * units + frac, units=units, clock='capture_interface')
        yield Packet(number, offset, 16 + captured, hashlib.sha256(record + payload).hexdigest(),
                     t, payload, original, network & 0xffff,
                     status='capture_truncated' if captured < original else None,
                     metadata={'pcap_network_word': network, 'fcs_metadata_not_interpreted': bool(network >> 16)})


def options(data, endian):
    pos = 0
    count = 0
    while pos < len(data):
        if len(data) - pos < 4: raise IngestError('pcapng_option_truncated')
        code, size = struct.unpack_from(endian + 'HH', data, pos)
        pos += 4
        if size > len(data) - pos: raise IngestError('pcapng_option_length')
        if code == 0:
            if size or any(data[pos:]): raise IngestError('pcapng_invalid_end_option')
            return
        yield code, data[pos:pos + size]
        pos += (size + 3) & ~3
        count += 1
        if pos > len(data) or count > 4096: raise IngestError('pcapng_option_budget')


def pcapng(reader):
    endian = None
    interfaces = []
    section, block, ordinal, packet_number = -1, 0, 0, 0
    section_end = None
    while True:
        offset = reader.offset
        head = reader.read(8)
        if not head:
            if section < 0: raise IngestError('pcapng_missing_section')
            if section_end is not None and offset != section_end: raise IngestError('pcapng_section_truncated')
            return
        if len(head) < 8: raise IngestError('truncated_capture')
        is_section = head[:4] == NG
        prefix = b''
        if is_section:
            if section_end is not None and offset != section_end: raise IngestError('pcapng_section_length')
            prefix = reader.exact(4)
            if prefix == b'\x4d\x3c\x2b\x1a': endian = '<'
            elif prefix == b'\x1a\x2b\x3c\x4d': endian = '>'
            else: raise IngestError('pcapng_byte_order')
        elif endian is None: raise IngestError('pcapng_missing_section')
        length = struct.unpack(endian + 'I', head[4:8])[0]
        if length < (28 if is_section else 12) or length % 4 or length > MAX_BLOCK:
            raise IngestError('pcapng_block_length_or_budget')
        body_tail = prefix + reader.exact(length - 8 - len(prefix))
        if struct.unpack(endian + 'I', body_tail[-4:])[0] != length:
            raise IngestError('pcapng_block_length_mismatch')
        if not is_section and section_end is not None and reader.offset > section_end:
            raise IngestError('pcapng_section_length')
        body = body_tail[:-4]
        typ = struct.unpack(endian + 'I', head[:4])[0]
        digest = hashlib.sha256(head + body_tail).hexdigest()
        block += 1
        ordinal += 1
        meta = {'block_type': typ}
        empty = lambda status: Packet(ordinal, offset, length, digest, time_info(), b'', 0, -1,
                                     section, 0, block, 'capture_block', status, meta)
        if is_section:
            major, minor, seclen = struct.unpack_from(endian + 'HHq', body, 4)
            if (major, minor) != (1, 0) or seclen < -1: raise IngestError('pcapng_section_version_or_length')
            list(options(body[16:], endian))
            section += 1
            interfaces = []
            section_end = None if seclen == -1 else reader.offset + seclen
            meta.update(byte_order=endian, section_length=seclen)
            yield empty('section_header')
        elif typ == 1:
            if len(body) < 8 or len(interfaces) >= MAX_INTERFACES: raise IngestError('pcapng_interface_budget_or_length')
            link, reserved, snaplen = struct.unpack_from(endian + 'HHI', body)
            if snaplen > MAX_RECORD: raise IngestError('pcapng_snaplen_budget')
            units, tsoffset = 10**6, 0
            seen = set()
            ignored = 0
            for code, value in options(body[8:], endian):
                if code in (9, 14):
                    if code in seen: raise IngestError('pcapng_duplicate_time_option')
                    seen.add(code)
                    if code == 9:
                        if len(value) != 1: raise IngestError('pcapng_tsresol')
                        exponent = value[0] & 127
                        if exponent > 63: raise IngestError('pcapng_tsresol_budget')
                        units = (2 if value[0] & 128 else 10) ** exponent
                    else:
                        if len(value) != 8: raise IngestError('pcapng_tsoffset')
                        tsoffset = struct.unpack(endian + 'q', value)[0]
                else: ignored += 1
            interfaces.append((link, snaplen, units, tsoffset))
            meta.update(interface=len(interfaces)-1, linktype=link, snaplen=snaplen,
                        units_per_second=units, offset_seconds=tsoffset, uninterpreted_options=ignored)
            yield empty('interface_description')
        elif typ in (3, 6, 2):
            minimum = {3: 4, 6: 20, 2: 20}[typ]
            if len(body) < minimum: raise IngestError('pcapng_packet_block_truncated')
            if typ == 3:
                interface, original = 0, struct.unpack_from(endian + 'I', body)[0]
            elif typ == 6:
                interface, high, low, captured, original = struct.unpack_from(endian + 'IIIII', body)
            else:
                interface, drops, high, low, captured, original = struct.unpack_from(endian + 'HHIIII', body)
                meta['obsolete_packet_block_drops'] = drops
            if interface >= len(interfaces): raise IngestError('pcapng_invalid_interface')
            link, snaplen, units, tsoffset = interfaces[interface]
            if typ == 3: captured = min(original, snaplen or original)
            if captured > original or captured > MAX_RECORD or (snaplen and captured > snaplen):
                raise IngestError('pcapng_packet_length')
            padded = (captured + 3) & ~3
            if minimum + padded > len(body): raise IngestError('pcapng_packet_truncated')
            if typ == 3 and minimum + padded != len(body): raise IngestError('pcapng_simple_packet_length')
            opt_count = sum(1 for _ in options(body[minimum + padded:], endian)) if typ != 3 else 0
            t = time_info(clock='capture_interface') if typ == 3 else time_info(
                ticks=(high << 32) | low, units=units, offset=tsoffset, clock='capture_interface')
            packet_number += 1
            meta.update(packet_number=packet_number, uninterpreted_options=opt_count)
            yield Packet(ordinal, offset, length, digest, t, body[minimum:minimum+captured], original,
                         link, section, interface, block, status='capture_truncated' if captured < original else None,
                         metadata=meta)
        else:
            # NRB and DSB deliberately never drive name resolution or decryption.
            yield empty('unsupported_block')


def packets(reader):
    for p in classic(reader): yield PacketRow(p)


def ng_packets(reader):
    for p in pcapng(reader): yield PacketRow(p)
