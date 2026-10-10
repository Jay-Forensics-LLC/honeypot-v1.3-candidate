import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import ops
import readiness
import wan_criteria


def rendered(bind='127.0.0.1', redis='127.0.0.1', grafana='127.0.0.1'):
    def port(host, target):
        return {'host_ip': host, 'target': target, 'published': str(target)}
    return {'services': {
        'cowrie': {'dns': ['172.29.40.254'], 'ports': [port(bind, 2222), port(bind, 2223)], 'networks': {'cowrie': {}}},
        'opencanary': {'dns': ['172.29.41.254'], 'ports': [port(bind, 8080), port(bind, 2121), port(redis, 16379)], 'networks': {'canary': {}}},
        'grafana': {'ports': [port(grafana, 3000)]},
    }, 'networks': {
        'cowrie': {'driver_opts': {'com.docker.network.bridge.name': 'br-hp-cowrie'}},
        'canary': {'driver_opts': {'com.docker.network.bridge.name': 'br-hp-canary'}},
    }}


class WanCriteriaTests(unittest.TestCase):
    def test_matrix_denies_redis_and_lists_only_known_ports(self):
        matrix = wan_criteria.load_matrix()
        redis = [row for row in matrix if row['host_port'] == 16379]
        self.assertEqual(len(redis), 1)
        self.assertFalse(redis[0]['wan_eligible'])
        self.assertEqual(wan_criteria.eligible_ports(matrix), {2222, 2223, 8080, 2121})

    def test_management_nonloopback_rejected_even_when_approved(self):
        problems = wan_criteria.management_ports_loopback(rendered(grafana='10.0.0.149'))
        self.assertTrue(problems)
        with self.assertRaises(SystemExit):
            ops.rendered_start_gate(rendered(grafana='10.0.0.149'), True)

    def test_loopback_matrix_accepts_redis_on_loopback_only(self):
        matrix = wan_criteria.load_matrix()
        self.assertEqual(wan_criteria.decoy_ports_allowed(rendered(), matrix, wan_mode=False), [])
        problems = wan_criteria.decoy_ports_allowed(rendered(bind='203.0.113.10', redis='203.0.113.10'), matrix, wan_mode=True)
        self.assertTrue(any('16379' in item or 'not WAN-eligible' in item for item in problems))

    def test_approval_example_is_not_approved_and_filled_record_is(self):
        ok, detail = wan_criteria.approval_record_valid(ROOT / 'state/wan-approval.example.json')
        self.assertFalse(ok)
        self.assertIn('not true', detail)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'wan-approval.json'
            path.write_text(json.dumps({
                'approved': True, 'approver': 'operator', 'timestamp': '2026-09-30T12:00:00Z',
                'allowed_ports': [2222, 8080], 'bind_address': '203.0.113.10',
                'test_source_cidr': '198.51.100.0/24', 'residual_risk_acknowledged': True,
            }), encoding='utf-8')
            ok, _detail = wan_criteria.approval_record_valid(path, expected_bind='203.0.113.10', published_ports=[2222])
            self.assertTrue(ok)
            bad, _detail = wan_criteria.approval_record_valid(path, published_ports=[2222, 16379])
            self.assertFalse(bad)

    def test_source_fidelity_detector(self):
        self.assertTrue(wan_criteria.source_fidelity_ok('203.0.113.10', '203.0.113.10'))
        self.assertFalse(wan_criteria.source_fidelity_ok('127.0.0.1', '203.0.113.10'))
        self.assertFalse(wan_criteria.source_fidelity_ok('172.29.40.1', '203.0.113.10'))
        self.assertTrue(wan_criteria.detector_self_check())

    def test_egress_text_and_upnp_and_loopback_readiness_names(self):
        text = 'table inet hp_guard\nip daddr 10.0.0.0/24 counter drop\nudp dport 53 counter drop\ntcp dport 53 counter drop\nip daddr { 10.0.0.0/8 } counter drop\n'
        self.assertTrue(wan_criteria.guard_egress_policy_present(text, '10.0.0.0/24'))
        self.assertFalse(wan_criteria.guard_egress_policy_present('table inet filter', '10.0.0.0/24'))
        self.assertFalse(wan_criteria.project_uses_upnp(ROOT))
        self.assertEqual(readiness.REQUIRED, [
            'cowrie_session', 'canary_probe', 'suricata_syntax', 'suricata_eve', 'pcap_rotation',
            'artifact_hash', 'incident_report', 'loki_logs', 'grafana_query', 'backup_restore',
            'firewall_isolation', 'firewall_rollback'])
        self.assertEqual(readiness.wan_names({}), readiness.REQUIRED)

    def test_unspecified_bind_rejected_and_source_mode_required(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'state').mkdir()
            with patch.object(ops, 'ROOT', root):
                (root / 'state/readiness.json').write_text(json.dumps({'ready': True, 'checked_epoch': time.time()}))
                with self.assertRaises(SystemExit):
                    ops.exposure_gate('0.0.0.0', True)
            reason = wan_criteria.source_mode_rejection({'WAN_SOURCE_MODE': 'off'}, root)
            self.assertIn('No router rules were changed', reason)
            self.assertIn('WAN_SOURCE_MODE', reason)
            (root / 'state/test-results').mkdir()
            now = time.time()
            (root / 'state/test-results/wan_source_fidelity.json').write_text(json.dumps({
                'status': 'PASS', 'epoch': now, 'scope': 'netns', 'live': False,
            }), encoding='utf-8')
            loose = wan_criteria.source_mode_rejection({'WAN_SOURCE_MODE': 'iptables-dnat'}, root)
            self.assertIn('live=true', loose)
            (root / 'state/test-results/wan_source_fidelity.json').write_text(json.dumps({
                'status': 'PASS', 'epoch': 'not-a-number', 'scope': 'netns', 'live': True,
            }), encoding='utf-8')
            self.assertIn('live=true', wan_criteria.source_mode_rejection({'WAN_SOURCE_MODE': 'ipvlan'}, root))
            (root / 'state/test-results/wan_source_fidelity.json').write_text(json.dumps({
                'status': 'PASS', 'epoch': now, 'scope': 'netns', 'live': True,
            }), encoding='utf-8')
            self.assertEqual(wan_criteria.source_mode_rejection({'WAN_SOURCE_MODE': 'iptables-dnat'}, root), '')

    def test_detector_scope_is_not_a_readiness_pass(self):
        now = time.time()
        self.assertFalse(readiness.evidence_passes('wan_source_fidelity', {
            'status': 'PASS', 'epoch': now, 'scope': 'detector', 'live': False}, now))
        self.assertFalse(readiness.evidence_passes('wan_source_fidelity', {
            'status': 'NOT TESTED', 'epoch': now, 'scope': 'detector', 'live': False}, now))
        self.assertTrue(readiness.evidence_passes('wan_source_fidelity', {
            'status': 'PASS', 'epoch': now, 'scope': 'netns', 'live': True}, now))
        self.assertTrue(readiness.evidence_passes('cowrie_session', {'status': 'PASS', 'epoch': now}, now))
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cfg = {
                'DECOY_BIND': '127.0.0.1', 'MANAGEMENT_BIND': '127.0.0.1',
                'PROTECTED_SUBNET': '10.0.0.0/24', 'PCAP_INTERFACES': 'br-hp-cowrie,br-hp-canary',
                'WAN_CRITERIA': 'false', 'WAN_SOURCE_MODE': 'off', 'WAN_INGRESS_IFACE': '',
                'APPROVED_DNS': '', 'APPROVED_NTP': '', 'ENABLE_UPDATE_EGRESS': 'false',
            }
            wan_criteria.check(cfg, root)
            row = json.loads((root / 'state/test-results/wan_source_fidelity.json').read_text(encoding='utf-8'))
            self.assertEqual(row['status'], 'NOT TESTED')
            self.assertEqual(row['scope'], 'detector')
            self.assertFalse(row['live'])


if __name__ == '__main__':
    unittest.main()
