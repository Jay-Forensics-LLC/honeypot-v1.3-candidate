# Lab validation evidence — 2026-09-29

Environment OBSERVED: Ubuntu 24.04.4 container, Linux 6.12.8+, root, systemd
`offline`, no Docker, nftables v1.0.9 userspace, YARA 4.5.0. Kernel accepted
nft `counter`/`drop`/`ct`/`jump` and rejected `limit rate` and `log prefix`
(`nft_limit`/`nft_log` absent). Overlay root; not a disposable WAN-isolated
workstation. No host `/etc` units were installed. No decoys were started.

## Checks

| Check | Result | Command / evidence |
|---|---|---|
| Hardening ZIP checksum | PASS | `sha256sum -c honeypot-v1.2-hardening-2026-09-29.zip.sha256` |
| MANIFEST.sha256 | PASS | verified after extract |
| Patch applies to closeout | PASS | `git apply --check` on v1.2-closeout tree |
| Unit tests | PASS | 47 tests, including verdict-only strip |
| validate.py | PASS 15 / NOT TESTED 4 | Docker/Suricata/Alloy/live integration missing |
| YARA compile | PASS | yara-python 4.5.0 |
| nft full policy `-c` | NOT TESTED | kernel missing log/limit |
| nft verdict-only `-c` | PASS | `firewall.py test` |
| Isolated netns isolation | PASS | protected and host blocked; inbound allowed |
| Isolated netns rollback | PASS | connectivity restored after delete table |
| Docker Compose | NOT RUN | docker missing |
| systemd runtime | NOT RUN | `is-system-running=offline` |
| Cowrie/OpenCanary live | NOT RUN | no Docker |
| Loki/Grafana/PCAP | NOT RUN | no Docker / no pcap unit |
| Guard-table delete drill | NOT RUN | not an isolated lab console |
| WAN / auto-boot | NOT RUN | gated |

INFERRED: drop/accept ordering in the owned table is sufficient to block the
netns protected and host paths when log/limit lines are omitted. UNKNOWN:
identical behavior with the full template on a stock Ubuntu kernel, Docker
bridge publication, and watcher stop latency.

Live lab acceptance remains blocked until those NOT RUN items pass on a
real Ubuntu host with Docker and a complete nftables kernel.
