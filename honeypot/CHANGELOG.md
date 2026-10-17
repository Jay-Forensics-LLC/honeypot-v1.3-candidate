# Changelog

## v1.3.0-beta.1 unverified source candidate — 2026-10-13

- Added bounded read-only Docker ownership/context/API diagnostics and startup
  gates. Concurrent daemons, denied access and cross-checkout ownership block.
- Bounded CLI log reads; empty, unreadable, malformed and partial telemetry
  remain distinct. Structured secret redaction is retained.
- Added focused negative-case tests and beta quickstart/acceptance guidance.
- Corrected the Stage 8 claim: current critical-disk handling stops PCAP only.

Source-only, not deployed, not published. Independent Stage 7 closeout pending;
Phase 8 NOT TESTED; WAN unauthorized. This is not a qualified beta release.

## v1.3 second polish - 2026-09-30

- Non-loopback start now uses `readiness.evidence_passes` for source
  fidelity. A PASS file without `live: true`, or with a bad epoch, is
  rejected instead of accepted.
- Alert payloads drop `HPAKIA` tokens even when the caller does not pass
  the deployment token list.
- Current entry points no longer call embedded DNS an open blocker.
  Dated 2026-09-28/30 notes stay historical.

No router rules were changed. `DECOY_BIND` was not changed.

## v1.3 production candidate - 2026-09-30

- Source-fidelity readiness is PASS only for fresh `netns` or `observation`
  evidence with `live: true`. A detector self-check is `NOT TESTED`, not PASS.
- Alert payloads omit command text and drop usernames that contain key,
  transcript, or secret material. Intel packs drop TTY/private-key fields
  and PEM blocks.
- Regression: a valid `hp_guard` does not request a decoy stop. The watcher
  stays preview-only and is not enabled.
- `verification/PRODUCTION_READINESS.md` separates OBSERVED, INFERRED,
  UNKNOWN, and NOT TESTED.

No router rules were changed. `DECOY_BIND` was not changed. Automatic boot
was not enabled. Live table-delete and `wlp2s0` fidelity remain NOT TESTED.

## v1.2 WAN criteria polish - 2026-09-30

- Docs only: README names this WAN source ZIP and checksum; readiness is
  documented as per-tree; Ubuntu 24.04 image pin vs live 26.04 is labeled;
  `.env.example` warns not to overwrite the live `PROTECTED_SUBNET`;
  duplicate WAN approval examples are explained.
- No gate, bind, matrix, or feature-behavior change.

OBSERVED: source consistency. UNKNOWN: live WAN bind. No router rules were changed.

## v1.2 WAN criteria - 2026-09-30

- Technical WAN criteria suite (`hp.py wan status|check|matrix`) with a port
  matrix, approval-record gate, and fail-closed source-fidelity requirement.
  Redis 16379 stays loopback. No router changes, no UPnP, no automatic boot.
- Sanitized intel pack (`hp.py intel pack`), per-deployment bait tripwires
  (`hp.py bait`), and a disabled-by-default redacted alert bus.
- Loopback readiness keeps the original 12 required names. WAN names are
  required only when `WAN_CRITERIA=true` or `state/wan-approval.json` exists.
- Closeout: OpenCanary `FILENAME` is a bait field, intel packs strip
  `HPAKIA` token text, and readiness evidence stays in the tree that ran the test.

OBSERVED: unit tests and source gates only. UNKNOWN: live WAN bind, router
forwards, and `wlp2s0` DNAT source fidelity. No exposure was performed.

## v1.2 lab-validation tooling - 2026-09-29

- `firewall.py test` now reports missing `nft_log`/`nft_limit` kernel support
  instead of raising an uncaught CalledProcessError, and can confirm
  verdict-only syntax on those kernels.
- Isolated netns test falls back to verdict-only policy when log/limit
  expressions are unavailable, and records the variant used.
- Added `scripts/target-validate.py` / `make verify` / `make verify-full`.
- OBSERVED on the packaging container: verdict-only netns isolation and
  rollback passed; Docker, systemd runtime, full log/limit policy, decoys,
  and the table-delete drill remain NOT RUN.

## v1.2 hardening packaging closeout - 2026-09-29

- Finished the interrupted closeout: regenerated FILE_TREE and MANIFEST,
  restored POSIX execute bits, excluded leftover unit-test audit logs,
  and produced the source ZIP, checksum, and baseline patch.
- Validator now requires the operator CLI, guard modules, and hardening docs.
- No containment, telemetry, or unit-test behavior changes versus the
  2026-09-28/29 source patch. Live Ubuntu drills remain open.

## v1.2 hardening source patch - 2026-09-28

- Shared ordered nft policy checks, independent TCP/UDP DNS drops, stronger
  explicit start gates, and a preview-only decoy-stop watcher.
- Rendered systemd previews; two explicit flags for draft installation, with no
  automatic draft activation or decoy boot.
- Secret-aware audit, sanitized searchable decoy streams, parser/audit Alloy
  sources, freshness/counter telemetry, rate-based packet-drop warnings, and
  optional backup-age gating (`BACKUP_REQUIRED=false`).
- Unified hp CLI, three additional dashboard panels, operator one-pager,
  regression tests, and opt-in Ubuntu verification instructions.
- Corrected non-internal decoy network documentation and static validator.

OBSERVED: source changes and local verification only; see the current validation
report. UNKNOWN: live Ubuntu behavior for this patch. Historical close-out live
evidence below is not proof of the new watcher. No WAN or boot enablement.

## v1 — 2026-09-27

Initial portable Ubuntu deployment candidate. Added isolated decoy networks,
loopback defaults, temporary scoped containment, bounded capture, structured
correlation and evidence reports, starter Suricata/Sigma/YARA rules, separate
observability, target acceptance tests, health/backup timers and recovery guidance.
Native Ubuntu integration remains required where build-host dependencies were
unavailable. No Internet exposure, host firewall modifications or services were
performed by the bundle build. See docs/VALIDATION_REPORT.md for actual results.

## 2026-09-28 — live bring-up / v1.1 verification candidate

- Fixed empty env-value parser bug.
- Added Docker 29 loopback publication workaround and dedicated Grafana management bridge.
- Replaced OpenCanary HTTP-404 acceptance probe with structured FTP authentication probe.
- Corrected event-driven log freshness health logic.
- Moved PCAP runtime storage to `/var/lib/honeypot/captures`.
- Added dual-bridge PCAP capture and group-readable evidence files.
- Replaced invalid numeric systemd `Group=2000` with resolved host evidence group.
- Live-verified incidentd read access to pcapng evidence.
- Live-verified direct TCP egress blocking from both decoys.
- Closed Docker embedded DNS egress from both decoys with per-service blackhole DNS and live validation.

## 2026-09-28 — close-out snapshot

- Added `ops.py boot-start`: existing Cowrie/OpenCanary containers only; no build/pull/create/recreate; loopback, quarantine, hp_guard, PCAP-startup, DNS-blackhole, and health gates.
- Added durable per-decoy DNS blackholes in Compose: Cowrie `172.29.40.254`, OpenCanary `172.29.41.254`.
- Preserved reviewed Phase-A guard and Phase-B manual-test systemd unit drafts under `systemd/preview/`.
- Phase A supervised reboot: persistent hp-guard restored successfully and decoys stayed stopped until manual start.
- Phase B manual/non-enabled install-test: guard UNIT stop propagated to decoy stop; observability stayed up; tested stack unit then removed.
- Remaining gap: deletion of `inet hp_guard` while guard unit remains `active (exited)` is NOT TESTED. Automatic decoy boot and WAN exposure remain unapproved.
