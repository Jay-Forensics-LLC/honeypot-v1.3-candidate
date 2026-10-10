# Open blockers before Internet exposure

## 1. Guard-table loss while guard unit remains active — OPEN

Phase-B manual testing proved the systemd unit relationship: stopping `honeypot-hp-guard.service` caused the bound decoy-control unit to stop Cowrie/OpenCanary. It did **not** test deletion of `inet hp_guard` while the oneshot guard service remains `active (exited)`.

OBSERVED: preview-only ordered policy checker and decoy-stop watcher, with unit tests for deletion while the oneshot unit remains active and for a valid policy making no stop call. INFERRED: this closes the detection path when the preview watcher is later activated and Docker stop succeeds. NOT TESTED: live Ubuntu table-delete behavior and stop latency; the supervised drill in docs/HARDENING_VALIDATION.md remains required. Installing/enabling any timer or watcher remains approval-required.

## 2. Automatic decoy boot — NOT ENABLED

The experimental `honeypot-stack.service` passed a manual non-enabled install-test and was removed. Do not treat this as approval to enable it on boot. Automatic decoy boot remains a separate change decision.

## 3. Final exposure topology — APPROVAL REQUIRED

Live router/WAN bind remains approval-required; **technical WAN criteria suite now exists** (OBSERVED in source; live bind UNKNOWN until operator). Management remains loopback-only. Prefer a dedicated DMZ/VLAN or separate honeypot-facing interface before public forwarding. See docs/WAN_CRITERIA.md. Redis 16379 is not WAN-eligible. Scripts still create no router rules.

## Closed during 2026-09-28 session

- Docker embedded DNS escape from the two decoys was closed with per-service blackhole DNS (`172.29.40.254` Cowrie, `172.29.41.254` OpenCanary) and live-tested to return temporary resolution failure.
- Direct public/protected-network TCP egress remained blocked by `hp_guard`.
- Phase-A persistent hp-guard boot restoration was supervised and passed.

## Patch-specific verification - OPEN

- nft JSON serialization, native nft syntax, systemd unit verification, Docker
  rendered configuration, Alloy validation, and dashboard queries require Ubuntu.
- The watcher is not installed/enabled by this source patch; a polling window and
  Docker availability remain containment dependencies. PCAP-loss binding is open.
- Retained raw evidence and old Loki/normalized data remain sensitive; upgrade
  sanitization applies to new events and does not delete historical records.
- Freshness is file last-write age, not proof of delivery. No-event sources may
  legitimately be absent. Counter resets and first samples have UNKNOWN rate.
