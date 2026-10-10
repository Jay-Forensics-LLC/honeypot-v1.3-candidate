# Production readiness — 2026-09-30

This file grades the v1.3 source candidate. It is not live WAN approval.
No router rules were changed. `DECOY_BIND` was not changed. Services were
not enabled.

Grades mean:

- **OBSERVED** — this source tree, or a command run against it, showed the fact.
- **INFERRED** — a reasonable conclusion from observed code or older notes. Not proof.
- **UNKNOWN** — not measured, and not the same as a failed test.
- **NOT TESTED** — the check exists, but this environment or this session did not run it. Not a PASS.

## Repository-complete (OBSERVED in this tree)

| Item | Evidence |
|---|---|
| Loopback decoy and management binds in the example and Compose defaults | `.env.example`, `docker-compose.yml`; Redis publish string stays `127.0.0.1` |
| Per-decoy DNS blackholes | `172.29.40.254` Cowrie, `172.29.41.254` OpenCanary |
| Semantic `hp_guard` verifier | [scripts/guard_policy.py](../scripts/guard_policy.py) |
| Table-loss watcher, decoys only, preview and default off | [scripts/guard_watch.py](../scripts/guard_watch.py), [systemd/preview](../systemd/preview) |
| Valid policy does not request a stop | `tests/test_hardening.py` |
| Missing or invalid policy requests stop of `cowrie` and `opencanary` only | same tests; Grafana, Loki, Alloy, incidentd are not in the stop command |
| Watcher does not delete or rewrite nftables | `guard_watch.py` only calls `docker compose stop` |
| `boot_start` uses existing containers, `compose start` only, loopback, DNS, quarantine, guard, PCAP gate, health-deadline stop of both decoys | [scripts/ops.py](../scripts/ops.py) |
| WAN port matrix; Redis not eligible | [configs/wan/port-matrix.yml](../configs/wan/port-matrix.yml) |
| Non-loopback start needs flag, fresh readiness, approval file, `WAN_SOURCE_MODE`, and fidelity evidence | `ops.py`, `wan_criteria.py` |
| Start rejects fidelity evidence unless `evidence_passes` accepts it (`live: true`, fresh `netns` or `observation`) | `wan_criteria.source_mode_rejection` |
| Source fidelity PASS only for fresh `scope` `netns` or `observation` with `live: true` | `readiness.evidence_passes` |
| Detector self-check recorded `NOT TESTED`, not PASS | `wan_criteria.check` |
| Bait tokens deployment-unique, not committed, `HPAKIA` stripped from intel packs | `scripts/bait.py`, `scripts/intel_pack.py` |
| Alert bus disabled unless `configs/alert-bus.yml` exists and `enabled: true`; one delivery attempt; rate limit; FAILED health | `scripts/alert_bus.py` |
| Searchable paths do not grow a password field | `hp_common.redact`, alert allowlist, intel scrub |

## Target-tested items already written down (not re-run here)

[LIVE_EVIDENCE_SUMMARY.md](LIVE_EVIDENCE_SUMMARY.md) records a **2026-09-28** loopback bring-up of an earlier tree: seven healthy containers, loopback ports, `hp_guard` active and not persisted. That is historical OBSERVED evidence for that session. It is **not** a test of this v1.3 ZIP on the laptop.

[WAN_CRITERIA_POLISH.md](WAN_CRITERIA_POLISH.md) records sandbox results for the pre-v1.3 tree (60 tests, validator 14 PASS / 5 NOT TESTED). Re-run results for v1.3 are in the release notes of the pack that contains this file, not assumed from that polish note.

## Live-only — must stay NOT TESTED until an operator runs them

- Native Docker Compose validation on the IdeaPad (`docker compose config`).
- Target Suricata config validation.
- Target Alloy validation.
- YARA validation where the host has YARA and this sandbox does not.
- Supervised deletion of `inet hp_guard` while `honeypot-hp-guard.service` stays `active (exited)`.
- Actual `wlp2s0` source-IP fidelity (DNAT or ipvlan). The netns surrogate is code; it was not executed in this packaging sandbox.
- VLAN or DMZ isolation. This bundle does not create one.
- Rebuilt incidentd image actually tagging bait. The Compose mount exists; the running image was not rebuilt.
- Delivery to a real alert endpoint. No destination is configured.
- Controlled burn-in.
- Internet exposure.

## Approval required before any of these

- Copying this ZIP onto `/home/joe/honeypot-staging/honeypot` (do not extract over logs, secrets, `.env`, incidents, or PCAPs).
- `compose up` or image rebuild.
- `DECOY_BIND` other than loopback. Never `0.0.0.0`.
- Filling `state/wan-approval.json` (`configs/wan/wan-approval.example.json` is not an approval).
- `WAN_CRITERIA=true`, `WAN_SOURCE_MODE=iptables-dnat` or `ipvlan`, and `WAN_INGRESS_IFACE`.
- Router forwards. Never forward 3000, 3100, 12345, or the Docker API.
- Installing or enabling `systemd/preview/*`, especially the guard-watch timer and `honeypot-stack.service`.
- Enabling `honeypot-pcap.service` (it is a manual static unit).
- Changing live `PROTECTED_SUBNET` away from `10.0.0.0/24`. Do not copy `.env.example` over the live `.env` (the example subnet is still `192.168.0.0/16`).

## Rollback

1. Set `DECOY_BIND=127.0.0.1`, `WAN_CRITERIA=false`, `WAN_SOURCE_MODE=off`.
2. `sudo python3 scripts/ops.py stop` on the **runtime** tree only.
3. Remove any hand-added router forwards. This repository does not do that.
4. `sudo python3 scripts/hp.py guard apply --apply` only when decoys are stopped, from the runtime tree, with `PROTECTED_SUBNET=10.0.0.0/24`.
5. `sudo systemctl start honeypot-pcap.service` (do not `enable`).
6. `sudo python3 scripts/ops.py boot-start` (refuses a non-loopback bind).
7. Do not delete incidents, PCAPs, raw logs, or secrets as part of rollback.

`hp_guard` is not in `/etc/nftables.conf`. A reboot drops it until guard apply is repeated with decoys down.

## WAN prerequisites

All of [WAN criteria](../docs/WAN_CRITERIA.md) W1–W11, plus fresh readiness from the runtime tree, plus fidelity evidence whose `scope` is `netns` or `observation` and whose `live` field is true. Single-NIC fact: `wlp2s0` `10.0.0.149/24` sits inside `10.0.0.0/24`. That is a residual risk, not a DMZ. See [open blockers](OPEN_BLOCKERS.md).

## Residual risks

- Preview watcher is not installed. Until the live table-delete drill passes, "guard unit active" does not prove `inet hp_guard` is still present.
- Decoy bridges are not a Docker isolation boundary.
- PCAP loss does not by itself stop decoys. PCAP is only a startup gate.
- Userland proxy would hide attacker addresses. This tree does not flip the Docker daemon. `WAN_SOURCE_MODE=off` cannot start a non-loopback bind.
- Readiness JSON is per tree. `~/hp-src` does not see staging evidence.
- Historical raw logs can still contain passwords. New alerts and intel packs are sanitized; old files are not deleted.
- Ubuntu image pin remains 24.04. The IdeaPad host is 26.04. Both are labeled in [DEPLOYMENT.md](../DEPLOYMENT.md). This session did not re-validate either.

## This packaging session (OBSERVED)

The first v1.3 cut recorded 63 tests OK and validator 11 PASS / 6 NOT TESTED.
The second polish kept that count and closed two source gaps: start-time
fidelity now uses `evidence_passes`, and alert payloads drop `HPAKIA` tokens
without a caller-supplied token list. Live-only items below were not run.

Commands run on the first cut, and re-run after the second polish:

- `python3 -B -m unittest discover -s tests -v` — 63 tests, OK.
- `python3 -B scripts/validate.py` — 11 PASS, 6 NOT TESTED, 0 FAIL.
- NOT TESTED in this sandbox: YAML (no PyYAML), YARA, Docker Compose, Suricata, Alloy, live Ubuntu.
- `python3 -B scripts/hp.py wan matrix` — eligible 2222, 2223, 8080, 2121. Redis 16379 ineligible.
- `python3 -B scripts/hp.py wan status` — `DECOY_BIND=127.0.0.1`, `MANAGEMENT_BIND=127.0.0.1`, WAN mode not asserted.
- `project_uses_upnp()` — false.

## Completion estimate

- **SOURCE / REPOSITORY COMPLETION: 94/100.** Repo-testable gates, regressions, and this document are in the tree. Not 100 because the watcher is preview-only by design, PCAP-loss binding is still open, and target binaries were not available here.
- **LIVE DEPLOYMENT VALIDATION: 22/100.** Ancestor loopback notes exist. This v1.3 ZIP was not installed, and the live-only list above was not run.

No router rules were changed.
