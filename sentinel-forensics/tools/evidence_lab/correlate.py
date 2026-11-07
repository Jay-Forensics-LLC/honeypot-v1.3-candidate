"""Versioned, finite, scoped associations; never merge devices or people."""
import json
from core import canonical, IngestError

VERSION = '1.0.0'
MAX_CONFLICT_PAIRS = 100000
CONFLICT_EXPLANATION = ('Contradictory observed IP/MAC mappings overlap in one explicit capture context; '
                        'spoofing, proxies, reassignment and clock error remain alternatives.')


def mapping_conflicts(db):
    """Sweep ordered mappings with disk-backed active intervals and candidates.

    Expiry removes intervals at their exclusive end and point observations only
    after their instant. Indexed MAC ranges skip all active statements of the
    same mapping without comparing their pairs. Every remaining match is an
    actual conflict, and the existing output-pair budget still applies.
    """
    db.execute('''CREATE TEMP TABLE active_mappings(
        association_id INTEGER PRIMARY KEY, mac TEXT, end_ns INTEGER, is_point INTEGER)''')
    db.execute('CREATE INDEX temp.active_mapping_mac ON active_mappings(mac,association_id)')
    db.execute('CREATE INDEX temp.active_mapping_expiry ON active_mappings(is_point,end_ns)')
    db.execute('''CREATE TEMP TABLE conflict_candidates(
        association_a INTEGER,association_b INTEGER,PRIMARY KEY(association_a,association_b)) WITHOUT ROWID''')
    scope = None
    pairs = 0
    try:
        mappings = db.execute('''SELECT id,context,left_value,right_value,start_ns,end_ns
            FROM associations WHERE left_type='ip' AND right_type='mac' AND start_ns IS NOT NULL
            ORDER BY context,left_value,start_ns,id''')
        for ident, context, address, mac, start, end in mappings:
            if type(start) is not int or type(end) is not int or end < start:
                raise IngestError('correlation_invalid_mapping_interval')
            current_scope = context, address
            if current_scope != scope:
                db.execute('DELETE FROM active_mappings')
                scope = current_scope
            db.execute('DELETE FROM active_mappings WHERE is_point=0 AND end_ns<=?', (start,))
            db.execute('DELETE FROM active_mappings WHERE is_point=1 AND end_ns<?', (start,))
            for comparison in ('<', '>'):
                active = db.execute(f'''SELECT association_id FROM active_mappings
                    WHERE mac {comparison} ? ORDER BY mac,association_id''', (mac,))
                for (other,) in active:
                    pairs += 1
                    if pairs > MAX_CONFLICT_PAIRS:
                        raise IngestError('correlation_conflict_pair_budget')
                    first, second = sorted((ident, other))
                    db.execute('INSERT INTO conflict_candidates VALUES (?,?)', (first, second))
            db.execute('INSERT INTO active_mappings VALUES (?,?,?,?)', (ident, mac, end, int(start == end)))
        db.execute('''INSERT INTO conflicts(association_a,association_b,explanation)
            SELECT association_a,association_b,? FROM conflict_candidates ORDER BY association_a,association_b''',
            (CONFLICT_EXPLANATION,))
    finally:
        db.execute('DROP TABLE temp.active_mappings')
        db.execute('DROP TABLE temp.conflict_candidates')


def correlate(db):
    for ident,kind,context,when,raw in db.execute('''SELECT o.id,o.kind,o.context,
        o.utc_ns+COALESCE(a.offset_ns,0),o.data_json FROM observations o
        LEFT JOIN adjustments a ON a.source_id=o.source_id
        WHERE o.kind IN ('arp.mapping','ndp.mapping','dhcp.message','dns.address','wifi.association','wifi.disassociation','wifi.client')
        ORDER BY o.id'''):
        data = json.loads(raw)
        left_type = right_type = left = right = relation = None
        end = when
        limitations = ['Association is source evidence, not authenticated identity.',
                       'No attribution through NAT, shared addresses, randomized MACs, IPv6 privacy addresses or rotating BLE identifiers.',
                       'Context boundaries are explicit; no automatic cross-network merge.',
                       'Clock precision is retained; no unconfigured clock alignment.']
        if kind in ('arp.mapping','ndp.mapping'):
            relation, left_type, left, right_type, right = kind, 'ip',data['address'],'mac',data['mac']
            explanation = 'Observed address statement at this event time only; no persistence interval inferred.'
            limitations.append('ARP/NDP may be spoofed, stale or a proxy response.')
        elif kind == 'dhcp.message' and data['message_type'] == 5 and data['op'] == 2 and data['assigned_ip'] != '0.0.0.0':
            relation,left_type,left,right_type,right = 'dhcp.lease','ip',data['assigned_ip'],'mac',data['client_mac']
            lease = data.get('lease_seconds')
            if when is not None and isinstance(lease,int) and 0 < lease < 2**32-1 and when + lease*10**9 < 2**63:
                end = when + lease*10**9
            explanation = 'Observed DHCP ACK proposes this mapping for the advertised lease interval; actual continued use is unverified.'
            limitations.append('Lease may end early, be revoked or superseded; absent/infinite lease remains a point, never an indefinite binding.')
        elif kind == 'dns.address' and data['response'] and data.get('rcode') == 0 and data['section'] == 'answer':
            relation,left_type,left,right_type,right = 'dns.answer','dns_name',data['name'],'ip',data['address']
            if when is not None: end = min(2**63-1,when+data['ttl']*10**9)
            explanation = 'Observed DNS answer and advertised TTL in this resolver/client context; no claim that a connection used it.'
            limitations.append('Multiple answers and changing DNS records are normal; response authenticity is unverified.')
        elif kind in ('wifi.association','wifi.disassociation','wifi.client') and data.get('client_mac') and data.get('bssid'):
            relation,left_type,left,right_type,right = kind,'mac',data['client_mac'],'bssid',data['bssid']
            explanation = 'Explicit export event at this instant.' if kind != 'wifi.client' else 'Recon client row states this mapping; association event and persistence are unverified.'
            limitations.append('SSID and BSSID do not identify a person; repeated station addresses can have different owners.')
        if relation:
            if when is None: limitations.append('Time unresolved: association has no usable validity interval.')
            db.execute('INSERT INTO associations VALUES (NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                       (relation,context,left_type,left,right_type,right,when,end,ident,'association.'+relation,VERSION,
                        'direct_observation',explanation,canonical(limitations).decode()))
    mapping_conflicts(db)
