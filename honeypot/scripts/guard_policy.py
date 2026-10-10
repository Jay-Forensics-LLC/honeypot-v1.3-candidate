"""Read-only verification of the owned nft policy; unknown semantics fail closed."""
import ipaddress
import json
import subprocess
from hp_common import config, run, utc

DNS = {'cowrie': '172.29.40.254', 'opencanary': '172.29.41.254'}
BRIDGES = ['br-hp-cowrie', 'br-hp-canary']

def match(left, right):
    return {'match': {'op': '==', 'left': left, 'right': right}}

def payload(protocol, field):
    return {'payload': {'protocol': protocol, 'field': field}}

def prefix(value):
    net = ipaddress.ip_network(value, strict=False)
    return {'prefix': {'addr': str(net.network_address), 'len': net.prefixlen}}

def expected_rules(cfg):
    incoming = match({'meta': {'key': 'iifname'}}, {'set': BRIDGES})
    outgoing = match({'meta': {'key': 'oifname'}}, {'set': BRIDGES})
    established = match({'ct': {'key': 'state'}}, {'set': ['established', 'related']})
    established['match']['op'] = 'in'
    drop, accept = {'drop': None}, {'accept': None}
    outbound = [[established, accept],
                [match(payload('ip', 'daddr'), prefix(cfg['PROTECTED_SUBNET'])), drop],
                [match(payload('ip', 'daddr'), {'set': [prefix(x) for x in
                 ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16')]}), drop]]
    for key, protocols, ports in [('APPROVED_DNS', ('udp', 'tcp'), 53),
                                  ('APPROVED_NTP', ('udp',), 123),
                                  ('APPROVED_UPDATE_IPS', ('tcp',), {'set': [80, 443]})]:
        if key == 'APPROVED_UPDATE_IPS' and cfg.get('ENABLE_UPDATE_EGRESS') != 'true':
            continue
        values = [str(ipaddress.IPv4Address(x.strip())) for x in cfg.get(key, '').split(',') if x.strip()]
        for protocol in protocols if values else ():
            outbound.append([match(payload('ip', 'daddr'), {'set': values}),
                             match(payload(protocol, 'dport'), ports), accept])
    for protocol in ('udp', 'tcp'):
        outbound.append([incoming, match(payload(protocol, 'dport'), 53), drop])
    outbound.append([drop])
    return {'outbound': outbound,
            'forward': [[outgoing, match(payload('ip', 'saddr'), '@blocked4'), drop],
                        [outgoing, match(payload('ip6', 'saddr'), '@blocked6'), drop],
                        [incoming, {'jump': {'target': 'outbound'}}]],
            'input': [[incoming, established, accept], [incoming, drop]]}

def canonical(value):
    if isinstance(value, dict):
        if set(value) == {'prefix'} and value['prefix']['len'] in (32, 128):
            return value['prefix']['addr']
        if 'match' in value and value['match'].get('left') == {'ct': {'key': 'state'}}:
            item = dict(value['match'])
            if isinstance(item.get('right'), list): item['right'] = {'set': item['right']}
            return {'match': {k: canonical(v) for k, v in item.items()}}
        if set(value) == {'set'}:
            items = sorted((canonical(x) for x in value['set']), key=lambda x: json.dumps(x, sort_keys=True))
            return items[0] if len(items) == 1 else {'set': items}
        return {k: canonical(v) for k, v in value.items()}
    if isinstance(value, list):
        return [canonical(x) for x in value]
    return value

def evaluate(document, cfg):
    expected = expected_rules(cfg)
    rows = document.get('nftables', [])
    tables = [x['table'] for x in rows if 'table' in x]
    problems = []
    if not any(t.get('family') == 'inet' and t.get('name') == 'hp_guard' for t in tables):
        problems.append('owned table missing')
    if any(t.get('flags') for t in tables): problems.append('unexpected table flags (including dormant)')
    chains, rules = {}, {name: [] for name in expected}
    counters = {'protected_drop': 0, 'egress_drop': 0, 'host_drop': 0}
    for entry in rows:
        if 'chain' in entry:
            c = entry['chain']
            if c.get('table') == 'hp_guard' and c.get('family') == 'inet':
                chains[c['name']] = c
        if 'rule' not in entry:
            continue
        rule = entry['rule']
        if rule.get('table') != 'hp_guard' or rule.get('family') != 'inet':
            problems.append('unexpected rule owner'); continue
        name = rule.get('chain')
        if name not in rules:
            problems.append('unexpected rule chain'); continue
        expr = rule.get('expr', [])
        # Logging-only rules cannot alter a verdict. Never ignore an accept,
        # return, jump, or an unfamiliar expression mixed into a log rule.
        if any('log' in x for x in expr) and all(set(x) <= {'match', 'limit', 'log', 'counter'} for x in expr):
            continue
        policy = [x for x in expr if 'counter' not in x]
        rules[name].append(policy)
        packets = sum(x['counter'].get('packets', 0) for x in expr if isinstance(x.get('counter'), dict))
        if canonical(policy) == canonical(expected['outbound'][1]) and name == 'outbound': counters['protected_drop'] += packets
        if policy == [{'drop': None}] and name == 'outbound': counters['egress_drop'] += packets
        if canonical(policy) == canonical(expected['input'][-1]) and name == 'input': counters['host_drop'] += packets
    if set(chains) != set(expected): problems.append('required chains missing or unexpected chains present')
    for name in expected:
        c = chains.get(name, {})
        if name == 'outbound':
            if any(k in c for k in ('hook', 'policy', 'prio')): problems.append('outbound must be a regular jump target')
        elif (c.get('type'), c.get('hook'), c.get('prio'), c.get('policy')) != ('filter', name, -10, 'accept'):
            problems.append(name + ' hook/priority/policy differs')
        if canonical(rules[name]) != canonical(expected[name]):
            problems.append(name + ' ordered policy differs (including DNS and final drop)')
    return {'timestamp': utc(), 'ok': not problems, 'problems': problems,
            'observed': {'chains': sorted(chains), 'rule_counts': {k: len(v) for k, v in rules.items()}},
            'expected': {'table': 'inet hp_guard', 'chains': sorted(expected), 'policy': 'current rendered policy'},
            'counters': counters}

def inspect_guard(cfg=None):
    try:
        result = run(['nft', '-j', 'list', 'table', 'inet', 'hp_guard'], check=False)
        if result.returncode: raise ValueError('nft table query failed')
        return evaluate(json.loads(result.stdout), cfg or config())
    except (OSError, ValueError, KeyError, TypeError, AttributeError, IndexError, subprocess.SubprocessError):
        return {'timestamp': utc(), 'ok': False, 'problems': ['owned policy unavailable or unreadable'],
                'observed': {'policy': 'UNKNOWN'}, 'expected': {'table': 'inet hp_guard', 'chains': ['outbound', 'forward', 'input']}, 'counters': {}}

def require_guard(cfg=None):
    result = inspect_guard(cfg)
    if not result['ok']: raise SystemExit('Containment check failed: ' + '; '.join(result['problems']))
    return result

def inspect_dns():
    result = {}
    for service, address in DNS.items():
        try:
            r = run(['docker', 'inspect', 'honeypot-' + service], check=False)
            values = json.loads(r.stdout)[0]['HostConfig'].get('Dns', []) if r.returncode == 0 else []
            result[service] = values == [address]
        except (OSError, ValueError, KeyError, IndexError, TypeError, subprocess.SubprocessError):
            result[service] = False
    return result
