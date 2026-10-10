# Lab acceptance checklist

Use this list on an isolated Ubuntu lab. Record PASS, FAIL, or NOT RUN.
NOT RUN is not a pass. WAN and automatic boot stay separately gated.

Run `python3 -B scripts/target-validate.py` locally, then
`sudo python3 -B scripts/target-validate.py --runtime` on the lab host.

| Check | Required tools | Status owner |
|---|---|---|
| Unit tests | python3 | `make verify` |
| Static validate.py | python3, bash | `make verify` |
| nft full policy `nft -c` | nftables + nft_log + nft_limit | `firewall.py test` |
| Isolated netns drop/accept/rollback | root, ip, nft | `tests/firewall-netns.py` |
| Docker Compose config | docker compose | `docker compose config --quiet` |
| systemd is-system-running | systemd as PID 1 | lab host |
| Apply hp_guard (loopback lab) | root, nft, decoys stopped | `hp.py guard apply --apply` |
| PCAP active before decoys | honeypot-pcap.service | documented start order |
| Observability up | docker | Loki/Alloy/Grafana/incidentd |
| Decoys loopback-only | docker inspect HostIp | `hp.py start` |
| DNS blackholes | docker inspect Dns | compose + runtime check |
| Synthetic Cowrie/OpenCanary probe | localhost ports | operator |
| Searchable streams omit password values | Loki / normalized jsonl | operator |
| Raw evidence retains synthetic marker | incidents/*/events.jsonl | operator |
| Backup then restore into a temp directory | backup.sh / restore-check.sh | operator |
| Guard-table delete drill | isolated console, approval | HARDENING_VALIDATION.md |
| WAN / DECOY_BIND | explicit approval | not part of lab mode; technical criteria suite is source-only until the operator window in docs/WAN_CRITERIA.md |
| Automatic decoy boot | explicit approval | preview units stay off |

Do not extract a new source ZIP over live `logs`, `secrets`, `.env`, PCAPs, or incidents.
