"""Stateless, bounded network metadata decoding; no resolution or reassembly."""
# Modified for HoneyTrace on 2026-11-01: require valid TCP headers for rule metadata.
import ipaddress
import re
import struct

class DecodeError(ValueError): pass

MAX_IGMP_RECORDS = 128
MAX_IGMP_SOURCES = 256


def need(data, size):
    if len(data) < size: raise DecodeError('truncated_protocol')


def mac(data): return ':'.join(f'{x:02x}' for x in data)
def ip(data): return str(ipaddress.ip_address(data))


def llc_xid(data):
    """Complete IEEE 802.2 basic XID metadata, without LLC state or identity.

    The caller supplies only the declared IEEE 802.3 payload: Ethernet padding
    is not an XID extension. Unknown content remains an explicit decoding loss.
    """
    need(data, 3)
    dsap, ssap, control = data[:3]
    if control not in (0xaf, 0xbf): raise DecodeError('unsupported_llc_control')
    need(data, 6)
    if len(data) != 6: raise DecodeError('llc_xid_trailing_data_unexamined')
    fmt, types, window = data[3:6]
    if fmt != 0x81: raise DecodeError('unsupported_llc_xid_format')
    if types & 0xe0 or window & 1: raise DecodeError('llc_xid_reserved_bits')
    if ssap & 1 and dsap & 1: raise DecodeError('llc_xid_response_group')
    capability = types & 0x1f
    valid = (1, 3, 5, 7) if (dsap & 0xfe) == 0 and (ssap & 0xfe) == 0 else range(1, 8)
    if capability not in valid: raise DecodeError('unsupported_llc_xid_capability')
    return [('llc.xid', {'declared_length': len(data), 'dsap': dsap, 'ssap': ssap,
        'control': control, 'response': bool(ssap & 1), 'poll_final': bool(control & 0x10),
        'group': bool(dsap & 1), 'format': fmt, 'types_octet': types,
        'capability_code': capability, 'receive_window_octet': window,
        'receive_window': window >> 1})]


def broadcom_event_header(data):
    """Observed v2 common fields only; event bodies and identity stay unknown.

    ``data`` begins at the vendor envelope after Ethernet/VLAN headers. The
    outer-length comparison is an arithmetic relation to captured bytes, not a
    validation of padding, FCS, the declared body or the origin of this frame.
    """
    if data and data[0] < 0x80:
        raise DecodeError('broadcom_event_subtype_unsupported')
    if len(data) < 2:
        raise DecodeError('broadcom_event_outer_header_truncated')
    if int.from_bytes(data[:2], 'big') != 0x8001:
        raise DecodeError('broadcom_event_subtype_unsupported')
    if len(data) < 10:
        raise DecodeError('broadcom_event_outer_header_truncated')
    _, outer_length, outer_version, namespace, user_subtype = struct.unpack_from('!HHB3sH', data)
    if outer_version != 0:
        raise DecodeError('broadcom_event_outer_version_unsupported')
    if namespace != b'\x00\x10\x18':
        raise DecodeError('broadcom_event_namespace_unsupported')
    if user_subtype != 1:
        raise DecodeError('broadcom_event_user_subtype_unsupported')
    if len(data) < 12:
        raise DecodeError('broadcom_event_header_truncated')
    if int.from_bytes(data[10:12], 'big') != 2:
        # Version 1 has 46 bytes and no final interface indices. Extra body bytes
        # cannot turn that distinct layout into a version 2 common header.
        raise DecodeError('broadcom_event_version_unsupported')
    if len(data) < 58:
        raise DecodeError('broadcom_event_header_truncated')
    version, flags, event_type, status, reason, auth_type, datalen = struct.unpack_from('!HHIIIII', data, 10)
    available = len(data) - 58
    trailing = max(0, available - datalen)
    return [('bcm.event_header', {
        'header_profile': 'broadcom_event_v2_common/1',
        'version': version, 'flags': flags, 'event_type': event_type,
        'status': status, 'reason': reason, 'auth_type': auth_type,
        'datalen': datalen, 'ifidx': data[56], 'bsscfgidx': data[57],
        'outer_length': outer_length,
        'outer_length_relation': ('equals_captured_minus4' if outer_length == len(data) - 4
                                  else 'different_from_captured_minus4'),
        'captured_bytes_after_header': available,
        'declared_data_bytes_captured': min(datalen, available),
        'body_coverage': ('empty_declared_body' if datalen == 0 else
                          'opaque_declared_bytes_captured' if datalen <= available else
                          'declared_bytes_unavailable'),
        'trailing_bytes': trailing,
        'trailing_coverage': 'uninterpreted' if trailing else 'none',
        'body_interpretation': 'not_decoded'})]


def dns_name(data, start):
    labels, pos, end, seen = [], start, None, set()
    wire_len = 0
    for _ in range(128):
        if pos >= len(data) or pos in seen: raise DecodeError('dns_name_pointer')
        seen.add(pos)
        size = data[pos]
        if size & 0xc0 == 0xc0:
            if pos + 2 > len(data): raise DecodeError('dns_pointer_truncated')
            if end is None: end = pos + 2
            pos = ((size & 0x3f) << 8) | data[pos + 1]
            continue
        if size & 0xc0: raise DecodeError('dns_label_type')
        pos += 1
        if size == 0: return '.'.join(labels), end or pos
        if size > 63 or pos + size > len(data): raise DecodeError('dns_label_length')
        # Escape non-printable bytes losslessly, keeping label boundaries explicit.
        labels.append(''.join(chr(b) if 33 <= b <= 126 and b not in (46, 92) else f'\\{b:03d}' for b in data[pos:pos+size]))
        wire_len += size + 1
        if wire_len > 254: raise DecodeError('dns_name_length')
        pos += size
    raise DecodeError('dns_pointer_budget')


def dns(data):
    need(data, 12)
    txid, flags, qd, an, ns, ar = struct.unpack_from('!6H', data)
    if qd > 32 or an + ns + ar > 256: raise DecodeError('dns_record_budget')
    pos, result = 12, []
    response = bool(flags & 0x8000)
    for _ in range(qd):
        name, pos = dns_name(data, pos)
        if pos + 4 > len(data): raise DecodeError('dns_question_truncated')
        typ, cls = struct.unpack_from('!HH', data, pos)
        pos += 4
        result.append(('dns.question', {'name': name, 'qtype': typ, 'qclass': cls,
                      'response': response, 'transaction_id': txid, 'truncated_bit': bool(flags & 0x200),
                      'label_lengths':[len(re.sub(r'\\[0-9]{3}','x',label)) for label in name.split('.')]}))
    for index in range(an + ns + ar):
        name, pos = dns_name(data, pos)
        if pos + 10 > len(data): raise DecodeError('dns_answer_truncated')
        typ, cls, ttl, size = struct.unpack_from('!HHIH', data, pos)
        pos += 10
        if pos + size > len(data): raise DecodeError('dns_rdata_truncated')
        section = 'answer' if index < an else ('authority' if index < an + ns else 'additional')
        if typ in (1, 28) and size == (4 if typ == 1 else 16) and cls == 1:
            result.append(('dns.address', {'name': name, 'address': ip(data[pos:pos+size]), 'ttl': ttl,
                          'response': response, 'section': section, 'transaction_id': txid,
                          'rcode': flags & 15, 'truncated_bit': bool(flags & 0x200)}))
        pos += size
    return result


def dhcp(data):
    need(data, 240)
    if data[1:3] != b'\x01\x06' or data[236:240] != b'\x63\x82\x53\x63':
        raise DecodeError('unsupported_bootp')
    opts, pos, count = {}, 240, 0
    while pos < len(data):
        code = data[pos]; pos += 1
        if code == 255: break
        if code == 0: continue
        if pos >= len(data): raise DecodeError('dhcp_option_truncated')
        size = data[pos]; pos += 1
        if pos + size > len(data): raise DecodeError('dhcp_option_truncated')
        if code in (51, 53, 54):
            if code in opts: raise DecodeError('dhcp_repeated_option_unsupported')
            opts[code] = data[pos:pos+size]
        if code == 52: raise DecodeError('dhcp_option_overload_unsupported')
        pos += size; count += 1
        if count > 128: raise DecodeError('dhcp_option_budget')
    if 53 in opts and len(opts[53]) != 1: raise DecodeError('dhcp_message_type')
    if 51 in opts and len(opts[51]) != 4: raise DecodeError('dhcp_lease_length')
    lease = int.from_bytes(opts[51], 'big') if 51 in opts else None
    return [('dhcp.message', {'message_type': opts.get(53, b'\0')[0], 'op': data[0],
             'client_mac': mac(data[28:34]), 'assigned_ip': ip(data[16:20]),
             'client_ip': ip(data[12:16]), 'lease_seconds': lease,
             'transaction_id': int.from_bytes(data[4:8], 'big')})]


def tls(data):
    """First complete cleartext ClientHello/ServerHello in one captured TCP segment."""
    need(data, 5)
    if data[0] != 22 or data[1] != 3: return []
    record_size = int.from_bytes(data[3:5], 'big')
    if record_size > 18432: raise DecodeError('tls_record_budget')
    if record_size + 5 > len(data): raise DecodeError('tls_reassembly_required')
    body = data[5:5+record_size]
    need(body, 4)
    size = int.from_bytes(body[1:4], 'big')
    if size + 4 > len(body): raise DecodeError('tls_handshake_reassembly_required')
    typ = body[0]
    if typ not in (1, 2): return []
    hello = body[4:4+size]; need(hello, 35)
    meta = {'handshake_type': 'client_hello' if typ == 1 else 'server_hello',
            'legacy_version': int.from_bytes(hello[:2], 'big'), 'decryption': False}
    pos = 35 + hello[34]
    if pos > len(hello): raise DecodeError('tls_session_id_length')
    if typ == 1:
        if pos + 2 > len(hello): raise DecodeError('tls_cipher_length')
        cipher_len = int.from_bytes(hello[pos:pos+2], 'big'); pos += 2
        if cipher_len % 2 or pos + cipher_len + 1 > len(hello): raise DecodeError('tls_cipher_length')
        meta['cipher_suite_count'] = cipher_len // 2
        pos += cipher_len
        compression_len = hello[pos]; pos += 1 + compression_len
    else:
        if pos + 3 > len(hello): raise DecodeError('tls_server_length')
        meta['cipher_suite'] = int.from_bytes(hello[pos:pos+2], 'big'); pos += 3
    if pos == len(hello): return [('tls.hello', meta)]
    if pos + 2 > len(hello): raise DecodeError('tls_extensions_length')
    end = pos + 2 + int.from_bytes(hello[pos:pos+2], 'big'); pos += 2
    if end != len(hello): raise DecodeError('tls_extensions_length')
    count = 0
    while pos < end:
        if pos + 4 > end: raise DecodeError('tls_extension_truncated')
        ext, length = struct.unpack_from('!HH', hello, pos); pos += 4
        if pos + length > end: raise DecodeError('tls_extension_truncated')
        value = hello[pos:pos+length]; pos += length
        if ext == 0 and typ == 1:
            need(value, 5)
            if int.from_bytes(value[:2], 'big') != len(value)-2: raise DecodeError('tls_sni_length')
            if value[2] == 0:
                n = int.from_bytes(value[3:5], 'big')
                if n > 253 or n + 5 > len(value): raise DecodeError('tls_sni_length')
                meta['server_name'] = value[5:5+n].decode('ascii', 'backslashreplace')
        if ext == 43 and typ == 2 and length == 2:
            meta['selected_version'] = int.from_bytes(value, 'big')
        count += 1
        if count > 256: raise DecodeError('tls_extension_budget')
    return [('tls.hello', meta)]


def ndp(data, src):
    if data[0] not in (135, 136): return []
    need(data, 24)
    if data[1] != 0: raise DecodeError('ndp_code')
    target, pos, result, count = ip(data[8:24]), 24, [], 0
    while pos < len(data):
        if pos + 2 > len(data) or data[pos+1] == 0: raise DecodeError('ndp_option_length')
        typ, size = data[pos], data[pos+1] * 8
        if pos + size > len(data): raise DecodeError('ndp_option_truncated')
        if size == 8 and ((data[0] == 136 and typ == 2) or (data[0] == 135 and typ == 1 and src != '::')):
            result.append(('ndp.mapping', {'address': target if data[0] == 136 else src,
                           'mac': mac(data[pos+2:pos+8]), 'message_type': data[0]}))
        pos += size; count += 1
        if count > 128: raise DecodeError('ndp_option_budget')
    return result


def igmp_float(code):
    """RFC 9776's integer/floating code, retaining exact integer timer units."""
    return code if code < 128 else ((code & 15) | 16) << (((code >> 4) & 7) + 3)


def igmp(data):
    """Bounded, complete IGMP wire metadata; no multicast membership state.

    Source IP validity, router behavior, timing state and origin are not inferred.
    Auxiliary/trailing data are unsupported, rather than discarded as examined.
    """
    need(data, 8)
    typ = data[0]
    message = {'message_type': typ, 'checksum': int.from_bytes(data[2:4], 'big'),
        'checksum_valid': True,
        'version_semantics': 'wire_format_classification_not_host_state',
        'membership_semantics': 'observed_control_message_no_membership_state_inference'}
    records = []

    def group(raw, *, general=False):
        value = ipaddress.IPv4Address(raw)
        if not value.is_multicast and not (general and int(value) == 0):
            raise DecodeError('igmp_group_address')
        return str(value)

    def sources(start, count):
        return [ip(data[p:p+4]) for p in range(start, start+4*count, 4)]

    if typ == 0x11:
        if 8 < len(data) < 12: raise DecodeError('igmp_query_length')
        message.update(address=group(data[4:8], general=True),
                       max_response_code=data[1])
        if len(data) == 8:
            message.update(version=1 if data[1] == 0 else 2,
                           max_response_tenths=data[1] if data[1] else None)
        else:
            count = int.from_bytes(data[10:12], 'big')
            if count > MAX_IGMP_SOURCES: raise DecodeError('igmp_source_budget')
            if count and message['address'] == '0.0.0.0':
                raise DecodeError('igmp_query_group_sources')
            size = 12 + 4*count
            need(data, size)
            if len(data) != size: raise DecodeError('igmp_trailing_data_unexamined')
            message.update(version=3, max_response_tenths=igmp_float(data[1]),
                source_count=count, source_addresses=sources(12, count),
                suppress=bool(data[8] & 8), robustness=data[8] & 7,
                query_interval_code=data[9], query_interval_seconds=igmp_float(data[9]))
    elif typ in (0x12, 0x16, 0x17):
        if len(data) != 8: raise DecodeError('igmp_trailing_data_unexamined')
        message.update(version=1 if typ == 0x12 else 2,
                       address=group(data[4:8]))
    elif typ == 0x22:
        count = int.from_bytes(data[6:8], 'big')
        if count > MAX_IGMP_RECORDS: raise DecodeError('igmp_record_budget')
        message.update(version=3, group_record_count=count)
        pos = 8
        total_sources = 0
        for index in range(count):
            need(data, pos+8)
            record_type, auxiliary_words = data[pos], data[pos+1]
            source_count = int.from_bytes(data[pos+2:pos+4], 'big')
            total_sources += source_count
            if total_sources > MAX_IGMP_SOURCES: raise DecodeError('igmp_source_budget')
            end = pos + 8 + 4*source_count + 4*auxiliary_words
            need(data, end)
            if record_type not in range(1, 7): raise DecodeError('unsupported_igmp_record_type')
            if auxiliary_words: raise DecodeError('igmp_auxiliary_data_unexamined')
            records.append(('igmp.group_record', {'record_index': index,
                'record_type': record_type, 'address': group(data[pos+4:pos+8]),
                'source_count': source_count, 'source_addresses': sources(pos+8, source_count),
                'auxiliary_words': auxiliary_words,
                'membership_semantics': message['membership_semantics']}))
            pos = end
        if pos != len(data): raise DecodeError('igmp_trailing_data_unexamined')
    else:
        raise DecodeError('unsupported_igmp_type')
    # Only fully captured supported structures reach checksum validation. This
    # checks the IGMP message, not IPv4/TCP/UDP checksums or packet authenticity.
    total = sum((data[i] << 8) | (data[i+1] if i+1 < len(data) else 0)
                for i in range(0, len(data), 2))
    while total >> 16: total = (total & 0xffff) + (total >> 16)
    if total != 0xffff: raise DecodeError('igmp_checksum_invalid')
    return [('igmp.message', message), *records]


def decode(packet):
    data = packet.payload
    meta = {'protocol': 'unsupported', 'src': None, 'dst': None, 'sport': None, 'dport': None,
            'tcp_flags': None, 'src_mac': None, 'dst_mac': None, 'vlan': [], 'ip_bytes': None}
    observations, losses = [], []
    try:
        if packet.linktype == 1:
            need(data, 14)
            meta.update(src_mac=mac(data[6:12]), dst_mac=mac(data[:6]))
            typ, pos = int.from_bytes(data[12:14], 'big'), 14
            while typ in (0x8100, 0x88a8, 0x9100):
                if len(meta['vlan']) >= 4: raise DecodeError('vlan_depth_limit')
                need(data, pos + 4)
                meta['vlan'].append(int.from_bytes(data[pos:pos+2], 'big') & 0xfff)
                typ = int.from_bytes(data[pos+2:pos+4], 'big'); pos += 4
            data = data[pos:]
            if typ <= 1500:
                meta['protocol'] = 'llc'
                if len(data) < typ: raise DecodeError('truncated_8023_payload')
                observations += llc_xid(data[:typ])
                return meta, observations, losses
            if typ < 1536: raise DecodeError('reserved_ethernet_length_type')
        elif packet.linktype in (101, 228, 229):
            need(data, 1)
            if ((packet.linktype == 228 and data[0] >> 4 != 4) or
                (packet.linktype == 229 and data[0] >> 4 != 6)):
                raise DecodeError('raw_ip_linktype_family_mismatch')
            typ = 0x0800 if data[0] >> 4 == 4 else 0x86dd if data[0] >> 4 == 6 else 0
        else:
            losses.append('unsupported_linktype'); return meta, observations, losses
        if typ == 0x886c:
            # A common-header observation is partial support. Keep the coarse
            # loss on success too; it must not certify the proprietary body.
            losses.append('unsupported_ethertype')
            observations += broadcom_event_header(data)
            meta['protocol'] = 'broadcom_event'
            return meta, observations, losses
        if typ == 0x0806:
            meta['protocol'] = 'arp'; need(data, 28)
            hw, proto, hlen, plen, op = struct.unpack_from('!HHBBH', data)
            if (hw, proto, hlen, plen) != (1, 0x800, 6, 4):
                losses.append('unsupported_arp'); return meta, observations, losses
            if op not in (1,2): losses.append('unsupported_arp_opcode')
            if op in (1, 2) and data[14:18] != b'\0'*4:
                observations.append(('arp.mapping', {'address': ip(data[14:18]), 'mac': mac(data[8:14]), 'opcode': op}))
            return meta, observations, losses
        if typ == 0x0800:
            need(data, 20)
            ihl, total = (data[0] & 15)*4, int.from_bytes(data[2:4], 'big')
            if data[0] >> 4 != 4 or ihl < 20 or total < ihl: raise DecodeError('ipv4_header')
            need(data, ihl)
            meta.update(src=ip(data[12:16]), dst=ip(data[16:20]), ip_bytes=total)
            proto = data[9]
            if int.from_bytes(data[6:8], 'big') & 0x3fff:
                meta['protocol'] = 'ipv4_fragment'; losses.append('fragment_no_reassembly')
                return meta, observations, losses
            if total > len(data): losses.append('truncated_ip')
            data = data[ihl:min(total, len(data))]
        elif typ == 0x86dd:
            need(data, 40)
            if data[0] >> 4 != 6: raise DecodeError('ipv6_header')
            size = int.from_bytes(data[4:6], 'big')
            meta.update(src=ip(data[8:24]), dst=ip(data[24:40]), ip_bytes=size+40)
            if not size:
                meta['protocol'] = 'ipv6'; losses.append('ipv6_jumbogram_unsupported'); return meta, observations, losses
            proto, pos, hop = data[6], 40, data[7]
            if 40+size > len(data): losses.append('truncated_ip')
            data = data[:40+size]
            count = 0
            while proto in (0, 43, 60, 51, 44):
                if proto == 44:
                    meta['protocol'] = 'ipv6_fragment'; losses.append('fragment_no_reassembly')
                    return meta, observations, losses
                need(data, pos+2)
                length = (data[pos+1]+2)*4 if proto == 51 else (data[pos+1]+1)*8
                need(data, pos+length)
                proto = data[pos]; pos += length; count += 1
                if count > 8: raise DecodeError('ipv6_extension_limit')
            data = data[pos:]
        else:
            losses.append('unsupported_ethertype'); return meta, observations, losses
        meta['protocol'] = {6: 'tcp', 17: 'udp', 1: 'icmp', 2: 'igmp', 58: 'icmpv6'}.get(proto, 'ip_'+str(proto))
        if proto == 2 and typ != 0x0800:
            meta['protocol'] = 'ip_2'
            raise DecodeError('igmp_address_family_mismatch')
        if (proto == 1 and typ != 0x0800) or (proto == 58 and typ != 0x86dd):
            # The protocol number alone cannot establish an ICMP address family.
            # In particular, IPv4 protocol 58 must never reach IPv6 NDP handling.
            meta['protocol'] = 'ip_'+str(proto)
            raise DecodeError('icmp_address_family_mismatch')
        if proto == 6:
            need(data, 20)
            length = (data[12] >> 4)*4
            if length < 20: raise DecodeError('tcp_header')
            need(data, length)
            meta.update(sport=int.from_bytes(data[:2], 'big'), dport=int.from_bytes(data[2:4], 'big'), tcp_flags=data[13])
            app = data[length:]
            if app:
                if meta['sport'] == 53 or meta['dport'] == 53:
                    need(app, 2)
                    n = int.from_bytes(app[:2], 'big')
                    if n + 2 != len(app): raise DecodeError('dns_tcp_reassembly_required')
                    observations += dns(app[2:])
                elif app[0] == 22 and len(app) >= 2 and app[1] == 3:
                    observations += tls(app)
        elif proto == 17:
            need(data, 8)
            src, dst, length = struct.unpack_from('!HHH', data)
            meta.update(sport=src, dport=dst)
            if length < 8: raise DecodeError('udp_length')
            if length > len(data): raise DecodeError('truncated_udp')
            app = data[8:length]
            if 53 in (src, dst): observations += dns(app)
            elif {src, dst} == {67, 68}: observations += dhcp(app)
        elif proto in (1, 58):
            need(data, 4)
            observations.append(('icmp.message', {'type': data[0], 'code': data[1], 'version': 4 if proto == 1 else 6}))
            if proto == 58 and data[0] in (135, 136):
                if hop != 255: losses.append('ndp_invalid_hop_limit')
                else: observations += ndp(data, meta['src'])
        elif proto == 2:
            # A truncated v3 query may resemble a complete legacy query. The
            # original IP length must be satisfied before classifying its wire
            # version or validating only a captured prefix's checksum.
            if 'truncated_ip' not in losses: observations += igmp(data)
        else: losses.append('unsupported_transport')
    except (DecodeError, ValueError, struct.error) as exc:
        losses.append(str(exc) if isinstance(exc, DecodeError) else 'malformed_protocol')
    return meta, observations, losses
