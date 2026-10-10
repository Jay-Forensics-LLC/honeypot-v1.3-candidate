# Honeypot verification handoff — 2026-09-28

## Scope
This bundle is a reconstructed source snapshot of the Ubuntu honeypot after the live bring-up and fixes performed on the Ryzen 7 5825U laptop. It intentionally excludes `.env`, secrets, runtime logs, captured credentials, runtime state, and PCAP evidence. It is for independent code/config review before Internet exposure.

## Live host observations
- Ubuntu host: Lenovo IdeaPad Slim 3 15ABR8, Ryzen 7 5825U.
- Docker Engine 29.1.3; Compose 2.40.3.
- All seven containers reached healthy state: Cowrie, OpenCanary, Suricata, Loki, Alloy, Grafana, incidentd.
- Management/decoy host bindings remained loopback-only during validation.
- `hp_guard` nftables table was active. Phase A later installed and supervised a persistent boot-time guard unit; final close-out state was `enabled` + `active (exited)`.
- Health reached `severity=LOW`, `problems=[]`; all readiness checks passed before the explicit live-egress probe.

## Source changes applied in this reconstructed bundle
1. Fixed empty `.env` value parsing in `scripts/hp_common.py`.
2. Docker 29 workaround: Cowrie/Canary bridge networks are non-internal so loopback host publishing works; `hp_guard` remains the decoy egress control. Grafana has a dedicated non-internal `management` network solely for localhost publication; observability remains internal.
3. OpenCanary acceptance test uses a synthetic FTP authentication event because a generic HTTP 404 is only an access log, not a structured OpenCanary event.
4. Cowrie/OpenCanary quiet event logs no longer create false-positive health failures; Suricata EVE freshness remains enforced.
5. PCAP runtime path default moved to `/var/lib/honeypot/captures`.
6. Continuous PCAP captures both `br-hp-cowrie` and `br-hp-canary`.
7. `dumpcap -g` creates group-readable pcapng evidence.
8. Systemd resolves/creates a real host group for GID 2000 (`honeypot-evidence`) instead of using `Group=2000`.
9. incidentd is expected to mount `${PCAP_PATH}` read-only and was live-verified reading pcapng magic `0a0d0d0a`.

## Live validation evidence
- Cowrie synthetic SSH session: PASS.
- OpenCanary synthetic FTP auth structured event: PASS.
- Suricata syntax and EVE: PASS.
- Loki normalized events: PASS.
- Authenticated Grafana datasource query: PASS.
- Artifact SHA-256 discovery: PASS.
- Incident report generation: PASS.
- Backup/restore safe-read verification: PASS.
- Isolated nftables namespace containment/rollback: PASS.
- Continuous PCAP systemd service: active/running after path/group fixes.
- Production pcapng reported two interfaces: `br-hp-cowrie` (6 packets) and `br-hp-canary` (6 packets).
- Controlled `tshark -i any` capture showed synthetic Cowrie traffic on 172.29.40.0/24 and OpenCanary traffic on 172.29.41.0/24.
- Live direct TCP egress attempts from both decoys to protected LAN (10.0.0.1:80) and public Internet (1.1.1.1:443) were blocked; `hp_guard` protected/general drop counters increased from 0 to 4 packets each.

## DNS egress — CLOSED DURING LIVE SESSION
Cowrie and OpenCanary were given per-service non-resolving DNS addresses (`172.29.40.254` and `172.29.41.254`). Both `getaddrinfo()` tests then failed with temporary name-resolution errors while direct public TCP remained blocked.

## Other pre-exposure work
- Phase A reboot-safe `hp_guard` restoration was supervised and passed. Automatic decoy startup remains disabled.
- Remaining gap: table deletion while the guard oneshot remains `active (exited)` is NOT TESTED and has no installed watcher.
- Re-run full readiness after any DNS/network change.
- Update documentation/manifest after final changes.

## Notes for reviewer
Treat `hp_guard` counters, the Docker embedded DNS path, Docker 29 host-port behavior, and boot ordering as the highest-value review targets. Do not recommend broad host firewall persistence or Internet exposure without explicit approval and rollback design.
