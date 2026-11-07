"""Invented IEEE 802.3/802.2 basic-XID wire fixtures; no observed addresses."""
import struct


SOURCE_MAC = '02:00:00:00:7a:01'
DESTINATION_MAC = '02:00:00:00:7a:02'


def xid(*, dsap=0, ssap=1, control=0xaf, format=0x81,
        types_octet=1, receive_window_octet=0):
    """Accept wire octets directly, including deliberately invalid values."""
    return bytes((dsap, ssap, control, format, types_octet, receive_window_octet))


def ethernet(payload, *, declared_length=None, tags=(), padding=b''):
    """Ethernet length includes LLC, excluding independently supplied padding."""
    head = bytes.fromhex(DESTINATION_MAC.replace(':','')+SOURCE_MAC.replace(':',''))
    for tpid, tci in tags:
        head += struct.pack('!HH', tpid, tci)
    length = len(payload) if declared_length is None else declared_length
    return head+struct.pack('!H',length)+payload+padding
