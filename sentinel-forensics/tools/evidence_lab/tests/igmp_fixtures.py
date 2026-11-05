"""Wholly invented checksum-correct IGMP wire fixtures shared by local tests."""
import ipaddress
import struct


GROUP = '239.255.0.31'
SOURCE = '192.0.2.31'


def checksum(data):
    if len(data) % 2:
        data += b'\0'
    total = sum(struct.unpack('!'+str(len(data)//2)+'H', data))
    while total >> 16:
        total = (total & 0xffff)+(total >> 16)
    return (~total) & 0xffff


def with_checksum(data):
    data = data[:2]+b'\0\0'+data[4:]
    return data[:2]+struct.pack('!H', checksum(data))+data[4:]


def legacy(message_type=0x16, address=GROUP, max_response_code=0):
    return with_checksum(struct.pack('!BBH4s', message_type, max_response_code, 0,
                                     ipaddress.IPv4Address(address).packed))


def query_v3(address='0.0.0.0', max_response_code=100, sources=(), suppress=False,
             robustness=2, query_interval_code=125):
    sources = tuple(sources)
    body = struct.pack('!BBH4sBBH', 0x11, max_response_code, 0,
        ipaddress.IPv4Address(address).packed, (int(suppress)<<3)|robustness,
        query_interval_code, len(sources))
    return with_checksum(body+b''.join(ipaddress.IPv4Address(value).packed for value in sources))


def group_record(record_type=1, address=GROUP, sources=(), auxiliary=b''):
    sources = tuple(sources)
    if len(auxiliary) % 4:
        raise ValueError('Synthetic auxiliary data must contain complete words')
    return struct.pack('!BBH4s', record_type, len(auxiliary)//4, len(sources),
        ipaddress.IPv4Address(address).packed)+b''.join(
        ipaddress.IPv4Address(value).packed for value in sources)+auxiliary


def report_v3(records=()):
    records = tuple(records)
    return with_checksum(struct.pack('!BBHHH', 0x22, 0, 0, 0, len(records))+b''.join(records))
