# Operator checklist

## Pre-deployment
- [ ] Transfer ZIP and verify trusted checksum, then MANIFEST.sha256.
- [ ] Run preflight; fill UNKNOWN inventory values and check GID 2000 membership.
- [ ] Confirm Ubuntu/Docker versions, free disk, time sync and subnet/port conflicts.
- [ ] Review .env, rules, paths, retention, approvals and management access.
- [ ] Review/approve target dependency installation and systemd timers.

## Deployment
- [ ] Bootstrap without overwriting existing config/secrets.
- [ ] Apply temporary owned containment after preview/backup.
- [ ] Build/pull images and record deployment digests/package versions.
- [ ] Start internal services and bounded PCAP, enable reviewed timers.
- [ ] Inspect Grafana authentication and provisioned dashboard.

## Testing
- [ ] Pass unit/static validators and native Suricata/Alloy validators.
- [ ] Pass localhost SSH and Canary probes, Loki/Grafana query tests.
- [ ] Pass finite loopback PCAP rotation and isolated namespace firewall/rollback.
- [ ] Verify artifact hashes, incident OBSERVED/INFERRED/UNKNOWN reports and backup read.
- [ ] Review sensor packet drops and actual capture interface/source-IP fidelity.
- [ ] Verify Docker restart/reboot behavior and quarantine/unquarantine on target.
- [ ] Obtain fresh PASS from readiness-check.sh; investigate every missing test.

## Internet exposure (separate approval)
- [ ] Confirm router/DMZ blocks protected networks and no management port forwarding.
- [ ] Run `python3 scripts/hp.py wan check` and keep Redis off the WAN matrix.
- [ ] Fill `state/wan-approval.json` (the shipped example is not an approval).
- [ ] Set `WAN_SOURCE_MODE` and fresh source-fidelity evidence before any non-loopback start.
- [ ] Obtain explicit authorization for selected public decoy ports/topology.
- [ ] Stop stack, choose one deliberate decoy address (not `0.0.0.0`), restart with `--exposure-approved`.
- [ ] Configure selected router forwards manually and verify from the approved test source.
- [ ] Monitor bait hits, alert spool, and `hp.py intel pack` output. Do not ship raw evidence.

## Ongoing
- [ ] Review 80% disk warnings and avoid filling protected evidence storage.
- [ ] Review raw/TTY growth, parser errors, hashes, incident custody and timer failures.
- [ ] Update pinned versions only after release/security review and a recovery backup.
