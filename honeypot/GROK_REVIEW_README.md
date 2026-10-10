# Grok review entry point

Start with `docs/VERIFICATION_HANDOFF_2026-09-28.md`, then review `docker-compose.yml`, `configs/nftables/hp-guard.nft.in`, `scripts/firewall.py`, `scripts/pcap.py`, `scripts/healthcheck.py`, `scripts/readiness.py`, and the systemd units.

The 2026-09-28 embedded-DNS observation is historical. Current v1.3 closes that path with per-decoy blackholes (`172.29.40.254` Cowrie, `172.29.41.254` OpenCanary). See `verification/OPEN_BLOCKERS.md`. The open item before Internet exposure is the supervised guard-table deletion drill, not Docker DNS. Do not treat this archive as WAN approval.

This archive excludes live `.env`, secrets, logs, state, artifacts, and PCAP evidence by design.
