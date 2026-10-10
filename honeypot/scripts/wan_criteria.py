#!/usr/bin/env python3
"""WAN technical criteria. Does not bind addresses, forward ports, or touch a router."""
import datetime as dt
import ipaddress
import json
import os
from pathlib import Path
import re
import time
from hp_common import ROOT, atomic_json, config, utc

DECOY_SERVICES = ('cowrie', 'opencanary')
BRIDGE_GATEWAYS = {'172.29.40.1', '172.29.41.1', '172.29.42.1', '172.17.0.1'}
WAN_RESULT_NAMES = (
    'wan_management_isolation',
    'wan_port_matrix',
    'wan_egress_still_denied',
    'wan_source_fidelity',
    'wan_pcap_coverage',
    'wan_approval_record',
)
SOURCE_MODES = ('iptables-dnat', 'ipvlan')

def _coerce(value):
    if value in ('true', 'false'):
        return value == 'true'
    if re.fullmatch(r'-?\d+', value):
        return int(value)
    if len(value) >= 2 and value[0] == value[-1] and value[0] in '"\'':
        return value[1:-1]
    return value

def load_matrix(path=None):
    path = Path(path) if path else ROOT / 'configs/wan/port-matrix.yml'
    rows, current = [], None
    for raw in path.read_text(encoding='utf-8').splitlines():
        line = raw.split('#', 1)[0].rstrip()
        if not line.strip() or line.strip() == 'ports:':
            continue
        if line.startswith('  - '):
            current = {}
            rows.append(current)
            rest = line[4:].strip()
            if rest:
                key, value = rest.split(':', 1)
                current[key.strip()] = _coerce(value.strip())
            continue
        if current is not None and line.startswith('    '):
            key, value = line.strip().split(':', 1)
            current[key.strip()] = _coerce(value.strip())
    required = ('service', 'container_port', 'host_port', 'proto', 'wan_eligible', 'intel_value', 'require_source_preservation', 'notes')
    for row in rows:
        missing = [name for name in required if name not in row]
        if missing:
            raise ValueError('port matrix row missing ' + ','.join(missing))
        if row['wan_eligible'] not in (True, False):
            raise ValueError('wan_eligible must be boolean')
        if row['service'] not in DECOY_SERVICES:
            raise ValueError('port matrix service is not a decoy')
    return rows

def eligible_ports(matrix=None):
    matrix = matrix if matrix is not None else load_matrix()
    return {int(row['host_port']) for row in matrix if row['wan_eligible']}

def _host_ip(port):
    if isinstance(port, str):
        return port.split(':')[0]
    return str(port.get('host_ip') or '')

def _target(port):
    if isinstance(port, str):
        parts = port.split(':')
        return int(parts[-1]) if parts and parts[-1].isdigit() else None
    for key in ('target', 'container_port', 'published'):
        if port.get(key) is not None and str(port.get(key)).isdigit():
            return int(port[key])
    return None

def _is_loopback(value):
    try:
        return bool(value) and ipaddress.ip_address(value).is_loopback
    except ValueError:
        return False

def management_ports_loopback(rendered_compose):
    problems = []
    for name, service in (rendered_compose or {}).get('services', {}).items():
        if name in DECOY_SERVICES:
            continue
        for port in service.get('ports') or []:
            host = _host_ip(port)
            if not _is_loopback(host):
                problems.append(f'{name} published port is not loopback ({host or "empty"})')
    return problems

def published_decoy_ports(rendered_compose):
    found = []
    for name, service in (rendered_compose or {}).get('services', {}).items():
        if name not in DECOY_SERVICES:
            continue
        for port in service.get('ports') or []:
            if _is_loopback(_host_ip(port)):
                continue
            found.append((name, _target(port), _host_ip(port)))
    return found

def decoy_ports_allowed(rendered_compose, matrix, wan_mode=False):
    known = {(row['service'], int(row['container_port'])): row for row in matrix}
    problems = []
    for name, target, host in published_decoy_ports(rendered_compose):
        if not wan_mode and _is_loopback(host):
            continue
        if target is None:
            problems.append(f'{name} non-loopback port has no target')
            continue
        row = known.get((name, target))
        if row is None:
            problems.append(f'{name} port {target} is not in the WAN port matrix')
        elif not row['wan_eligible']:
            problems.append(f'{name} port {target} is not WAN-eligible')
    return problems

def approval_record_valid(path, expected_bind=None, published_ports=None):
    path = Path(path)
    if not path.exists():
        return False, 'approval file missing'
    try:
        row = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return False, 'approval file unreadable'
    if row.get('approved') is not True:
        return False, 'approved is not true'
    if not str(row.get('approver', '')).strip():
        return False, 'approver empty'
    stamp = str(row.get('timestamp', ''))
    try:
        dt.datetime.fromisoformat(stamp.replace('Z', '+00:00'))
    except ValueError:
        return False, 'timestamp not ISO-8601'
    if row.get('residual_risk_acknowledged') is not True:
        return False, 'residual risk not acknowledged'
    try:
        bind = ipaddress.ip_address(str(row.get('bind_address', '')))
    except ValueError:
        return False, 'bind_address invalid'
    if bind.is_loopback or bind.is_unspecified or bind.is_multicast:
        return False, 'bind_address must be one specific non-loopback address'
    if expected_bind is not None and str(bind) != str(ipaddress.ip_address(expected_bind)):
        return False, 'bind_address does not match requested decoy bind'
    try:
        ipaddress.ip_network(str(row.get('test_source_cidr', '')), strict=False)
    except ValueError:
        return False, 'test_source_cidr invalid'
    ports = row.get('allowed_ports')
    if not isinstance(ports, list) or not ports or not all(isinstance(item, int) for item in ports):
        return False, 'allowed_ports must be a non-empty list of integers'
    allowed = eligible_ports()
    if any(item not in allowed for item in ports):
        return False, 'allowed_ports includes a port that is not WAN-eligible'
    if published_ports is not None and not set(published_ports) <= set(ports):
        return False, 'published decoy ports exceed the approval record'
    return True, 'approval record accepted'

def guard_egress_policy_present(nft_json_or_text, protected='10.0.0.0/24'):
    if isinstance(nft_json_or_text, dict):
        from guard_policy import evaluate
        cfg = {'PROTECTED_SUBNET': protected, 'ENABLE_UPDATE_EGRESS': 'false'}
        return bool(evaluate(nft_json_or_text, cfg)['ok'])
    text = str(nft_json_or_text)
    network = str(ipaddress.ip_network(protected, strict=False))
    needles = ('table inet hp_guard', network, 'udp dport 53', 'tcp dport 53', '10.0.0.0/8', 'counter drop')
    return all(needle in text for needle in needles)

def source_fidelity_ok(observed_src, expected_src):
    try:
        observed = str(ipaddress.ip_address(str(observed_src)))
        expected = str(ipaddress.ip_address(str(expected_src)))
    except ValueError:
        return False
    if observed != expected:
        return False
    if ipaddress.ip_address(observed).is_loopback:
        return False
    if observed in BRIDGE_GATEWAYS:
        return False
    return True

def detector_self_check():
    return (source_fidelity_ok('203.0.113.10', '203.0.113.10')
            and not source_fidelity_ok('127.0.0.1', '203.0.113.10')
            and not source_fidelity_ok('::1', '203.0.113.10')
            and not source_fidelity_ok('172.29.40.1', '203.0.113.10'))

def project_uses_upnp(root=ROOT):
    """Source-static: this project does not call UPnP/IGD. Docs may name the prohibition."""
    root = Path(root)
    needles = ('miniupnpc', 'upnp', 'igd', 'portmapper')
    allowed_suffix = {'.py', '.yml', '.yaml', '.sh', '.nft', '.in'}
    skip = {'wan_criteria.py'}
    for path in root.rglob('*'):
        if not path.is_file() or path.suffix not in allowed_suffix or path.name in skip:
            continue
        if any(part in ('logs', 'state', 'work', 'incidents', 'artifacts', 'backups', '.git', 'tests', 'docs', 'verification') for part in path.parts):
            continue
        try:
            text = path.read_text(encoding='utf-8', errors='ignore').lower()
        except OSError:
            continue
        if any(needle in text for needle in needles):
            return True
    return False

def wan_mode_asserted(cfg, root=ROOT):
    flag = os.environ.get('WAN_CRITERIA', cfg.get('WAN_CRITERIA', 'false')).lower() == 'true'
    return flag or (Path(root) / 'state/wan-approval.json').exists()

def synthetic_rendered(cfg):
    bind = cfg.get('DECOY_BIND', '127.0.0.1')
    mgmt = cfg.get('MANAGEMENT_BIND', '127.0.0.1')
    def port(host, number):
        return {'host_ip': host, 'target': int(number), 'published': str(number)}
    return {'services': {
        'cowrie': {'ports': [port(bind, cfg.get('COWRIE_SSH_PORT', 2222)), port(bind, cfg.get('COWRIE_TELNET_PORT', 2223))]},
        'opencanary': {'ports': [port(bind, cfg.get('CANARY_HTTP_PORT', 8080)), port(bind, cfg.get('CANARY_FTP_PORT', 2121)),
                                  {'host_ip': '127.0.0.1', 'target': int(cfg.get('CANARY_REDIS_PORT', 16379)), 'published': str(cfg.get('CANARY_REDIS_PORT', 16379))}]},
        'grafana': {'ports': [port(mgmt, cfg.get('GRAFANA_PORT', 3000))]},
    }}

def pcap_coverage(cfg, asserted):
    ifaces = [item.strip() for item in cfg.get('PCAP_INTERFACES', '').split(',') if item.strip()]
    missing = [name for name in ('br-hp-cowrie', 'br-hp-canary') if name not in ifaces]
    ingress = cfg.get('WAN_INGRESS_IFACE', '').strip()
    if ingress and ingress not in ifaces:
        missing.append(ingress)
    if missing:
        return False, 'missing capture interfaces: ' + ','.join(missing)
    if asserted and not ingress:
        return False, 'WAN mode without WAN_INGRESS_IFACE; single-NIC coverage of the physical NIC is UNKNOWN until set'
    return True, 'finite manual ring; interfaces ' + ','.join(ifaces)

def record(root, name, ok, detail, **extra):
    status = extra.pop('status', 'PASS' if ok else 'FAIL')
    row = {'status': status, 'epoch': time.time(), 'timestamp': utc(), 'detail': detail}
    row.update(extra)
    atomic_json(Path(root) / 'state/test-results' / f'{name}.json', row)
    print(status + ' ' + name + ': ' + detail)
    return status == 'PASS'

def enforce_nonloopback(bind, root):
    addr = ipaddress.ip_address(bind)
    if addr.is_unspecified or addr.is_multicast or str(addr) == '::':
        raise SystemExit('Decoy bind must be one specific address, not ' + bind)
    ok, detail = approval_record_valid(Path(root) / 'state/wan-approval.json', expected_bind=bind)
    if not ok:
        raise SystemExit('WAN approval record rejected: ' + detail)

def source_mode_rejection(cfg, root):
    mode = cfg.get('WAN_SOURCE_MODE', 'off')
    if mode not in SOURCE_MODES:
        return 'WAN_SOURCE_MODE=' + mode + ' does not preserve attacker source addresses. Use iptables-dnat or ipvlan. No router rules were changed.'
    path = Path(root) / 'state/test-results/wan_source_fidelity.json'
    try:
        row = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        row = {}
    # Same predicate as readiness. A PASS file without live=true is not evidence.
    from readiness import evidence_passes
    if not evidence_passes('wan_source_fidelity', row if isinstance(row, dict) else {}):
        return 'WAN source-fidelity evidence missing or stale (need fresh netns or observation evidence with live=true). No router rules were changed.'
    return ''

def check(cfg, root=ROOT, rendered=None):
    root = Path(root)
    asserted = wan_mode_asserted(cfg, root)
    rendered = rendered or synthetic_rendered(cfg)
    matrix = load_matrix()
    mgmt = management_ports_loopback(rendered)
    if cfg.get('MANAGEMENT_BIND') and not _is_loopback(cfg.get('MANAGEMENT_BIND')):
        mgmt.append('MANAGEMENT_BIND is not loopback')
    record(root, 'wan_management_isolation', not mgmt, 'loopback management' if not mgmt else '; '.join(mgmt))
    matrix_problems = decoy_ports_allowed(rendered, matrix, wan_mode=asserted or any(not _is_loopback(host) for _, _, host in published_decoy_ports(rendered)))
    redis = next(row for row in matrix if int(row['host_port']) == 16379)
    if redis['wan_eligible']:
        matrix_problems.append('Redis must remain WAN-ineligible')
    record(root, 'wan_port_matrix', not matrix_problems, 'matrix accepted' if not matrix_problems else '; '.join(matrix_problems))
    from firewall import render
    policy = render(cfg)
    egress_ok = guard_egress_policy_present(policy, cfg.get('PROTECTED_SUBNET', '10.0.0.0/24'))
    record(root, 'wan_egress_still_denied', egress_ok, 'rendered hp_guard still denies protected, RFC1918, and DNS' if egress_ok else 'rendered egress policy incomplete')
    observation = root / 'state/wan-fidelity-observation.json'
    if observation.exists():
        try:
            seen = json.loads(observation.read_text(encoding='utf-8'))
            ok = detector_self_check() and source_fidelity_ok(seen.get('observed_src'), seen.get('expected_src'))
            record(root, 'wan_source_fidelity', ok, 'observation ' + str(seen.get('observed_src')), scope='observation', live=ok)
        except (OSError, ValueError):
            record(root, 'wan_source_fidelity', False, 'observation file unreadable', scope='observation', live=False)
    elif asserted:
        record(root, 'wan_source_fidelity', False, 'WAN mode asserted and no live or netns observation', scope='detector', live=False, status='NOT TESTED')
    else:
        # A detector self-check is not evidence of attacker-IP preservation.
        record(root, 'wan_source_fidelity', False, 'detector self-check only; live ingress NOT TESTED', scope='detector', live=False, status='NOT TESTED')
    pcap_ok, pcap_detail = pcap_coverage(cfg, asserted)
    record(root, 'wan_pcap_coverage', pcap_ok, pcap_detail)
    if not asserted:
        record(root, 'wan_approval_record', True, 'not required while WAN mode is not asserted')
    else:
        ports = [target for _, target, _ in published_decoy_ports(rendered) if target]
        ok, detail = approval_record_valid(root / 'state/wan-approval.json', expected_bind=cfg.get('DECOY_BIND'), published_ports=ports or None)
        record(root, 'wan_approval_record', ok, detail)
    upnp = project_uses_upnp(root if (root / 'scripts').exists() else ROOT)
    print('No router rules were changed. UPnP/IGD used by this project: ' + ('YES' if upnp else 'no'))
    return 0

def main():
    cfg = config()
    print('No router rules were changed.')
    return check(cfg, ROOT)

if __name__ == '__main__':
    raise SystemExit(main())
