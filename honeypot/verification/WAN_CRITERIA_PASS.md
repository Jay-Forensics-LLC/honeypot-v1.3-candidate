# WAN criteria pass — 2026-09-30

Source-only candidate. No router rules were changed. `DECOY_BIND` was not
changed. This build did not touch `/home/joe/honeypot-staging/honeypot` and
did not run `compose up`.

Baseline is `honeypot-v1.2-lab-2026-09-29.zip`
(`3400c483f9b52406c4302cc41af383366e4c9267af4046ed41bf7858e899ac15`), not the
older pre-lab tree. Candidate is this directory.

## OBSERVED

### This source tree

- Unit tests: 47 (lab baseline) → 60, `python3 -B -m unittest discover -s tests -v`, OK.
- `python3 -B scripts/validate.py`: 11 PASS, 6 NOT TESTED (no PyYAML, YARA, Docker, Suricata, Alloy, or live Ubuntu in this sandbox).
- `python3 -B scripts/hp.py wan matrix` printed five rows. Eligible: 2222, 2223, 8080, 2121. Redis 16379 `wan_eligible: false`.
- `python3 -B scripts/hp.py wan status` on `.env.example`: `DECOY_BIND=127.0.0.1`, `MANAGEMENT_BIND=127.0.0.1`, WAN mode asserted false.
- `python3 -B scripts/hp.py wan check` on `.env.example` wrote six `wan_*.json` results, all PASS for loopback: management isolation, port matrix, rendered egress, detector-only source fidelity (`scope` would be `detector`, not enough to start WAN), PCAP interfaces `br-hp-cowrie,br-hp-canary`, approval not required. UPnP/IGD: no. Those JSON files are runtime output and are not in the source package.
- Gates: non-loopback `exposure_gate` still needs `--exposure-approved` and readiness younger than 24h, then `state/wan-approval.json` matching the bind. `0.0.0.0` is rejected even when approved. `rendered_start_gate` rejects non-matrix and non-eligible published decoy ports. Management ports stay loopback. `start` also requires `WAN_SOURCE_MODE` of `iptables-dnat` or `ipvlan` plus fresh `wan_source_fidelity` with `scope` `netns` or `observation`. `boot-start` stays loopback-only. Redis publish is hardcoded `127.0.0.1` in `docker-compose.yml`.
- Readiness `REQUIRED` is still the original 12 names. The six `WAN_REQUIRED` names are added only when `WAN_CRITERIA=true` or `state/wan-approval.json` exists.
- `state/wan-approval.example.json` and `configs/wan/wan-approval.example.json` have `approved: false`. `.gitignore` ignores `state/**` except that example.
- Bait inventory is created once, matched on token values (including OpenCanary `FILENAME`), and not installed into the Cowrie image. Intel packs drop password fields and `HPAKIA` token text. Alert bus stays disabled unless `configs/alert-bus.yml` exists and says `enabled: true`.
- Grafana panel id 19 is “Bait hits”. It shows bait ids, not passwords.
- Docs: [WAN criteria](../docs/WAN_CRITERIA.md), [operator model](../docs/OPERATOR_MODEL.md), [open blockers](OPEN_BLOCKERS.md) item 3, CHANGELOG, TODO Internet section, REQUIREMENTS, SECURITY.

### Operator paste, IdeaPad, 2026-09-30 (not re-run here)

Runtime tree `/home/joe/honeypot-staging/honeypot`, still the lab source, not this candidate:

- `honeypot-pcap.service` was `active` before `daemon-reload`.
- `guard status` at `2026-09-30T09:04:41Z`: `ok: true`, chains forward/input/outbound, rule counts outbound 6, forward 3, input 2, counters protected_drop 0, egress_drop 0, host_drop 44.
- Seven containers healthy. Published ports were loopback only, including Redis `127.0.0.1:16379` and Grafana `127.0.0.1:3000`.
- `tests/local-integration.py` PASS (cowrie session, canary probe, suricata syntax and EVE, artifact hash, incident report, loki, grafana query, backup restore).
- `tests/pcap-ring.py` PASS on `lo` only.
- `tests/firewall-netns.py` printed `PASS isolated containment and rollback` and did not print a source-fidelity line. That is the lab script. This candidate’s netns surrogate was not the program that ran.
- `suricata -T` inside the running container loaded the config (existing SYN-only rule warnings).
- `systemctl daemon-reload` was run from `~/hp-src/honeypot`. The paste does not restart PCAP.

### Readiness was run in the wrong tree

`sudo python3 scripts/readiness.py` from `~/hp-src/honeypot` reported `No target test evidence` for the ten integration names. Those tests had just been run under staging, so the JSON landed in staging’s `state/test-results/`. `firewall_isolation` and `firewall_rollback` PASS were evidence already stored under hp-src. `container_and_health`, `cowrie_logs`, `canary_logs`, and `eve_logs` FAIL because hp-src is not the running Compose project. `outbound_containment` PASS is the host nft chain, which is not tree-specific.

That FAIL is not a WAN criteria result and not a regression of the staging lab. Run readiness from `/home/joe/honeypot-staging/honeypot`.

## INFERRED

- If readiness is run from staging after the three tests above, the original 12 file checks should be fresh. Live log and health rows were not re-checked in that directory after the tests, so staging readiness itself is not claimed PASS.
- A later `start --exposure-approved` with this source, on the IdeaPad, still refuses until the approval file, source mode, and fresh fidelity evidence exist. It still keeps management and Redis on `127.0.0.1`. It still prints that it changes no router rules.
- Binding a decoy to `10.0.0.149` would put it inside `PROTECTED_SUBNET=10.0.0.0/24`. `hp_guard` would still drop decoy egress toward that subnet. That is not a DMZ. See [network map](../NETWORK_MAP.md).

## UNKNOWN

- Live WAN bind, router forwards, and source fidelity on real `wlp2s0` DNAT.
- Whether `tests/firewall-netns.py` source-fidelity surrogate passes on this IdeaPad kernel. It is coded and not run here.
- Table-delete while the oneshot guard unit stays active. Automatic boot. Preview watcher latency. Neither is enabled.
- Ubuntu 26.04 / Docker 29 bind quirks were not re-proven against this candidate.
- PyYAML parse of the port matrix and Compose safety on a host with PyYAML. Every decoy port string in Compose still contains `127.0.0.1`; Redis does not follow `DECOY_BIND`.
- Bait tags inside the running incidentd container. The image copies `scripts/` at build, and Compose mounts `./state/bait`. The current container will not tag until that image is rebuilt. Do not rebuild while treating this as an in-place live upgrade.
- Whether `daemon-reload` changed the running PCAP process. The unit was not restarted.

## Not done

Live exposure, automatic boot, preview watcher enablement, Redis on the WAN, extra protocols, UPnP, reputation lookups, sample execution, and `compose up` from `~/hp-src` while staging is the runtime.

## Residual risk

This host has one NIC, `wlp2s0` `10.0.0.149/24`. There is no honeypot VLAN in this bundle. A future decoy address on that LAN shares a broadcast domain with the operator. `hp_guard` plus DNS blackholes are the containment boundary, not the Docker bridges. Prefer a separate interface before any forward. Until then, single-NIC exposure stays a known limitation, not a PASS.

## Future approved window

Do this only on the runtime tree after this candidate has been reviewed and copied without unpacking over logs, secrets, `.env`, incidents, or PCAPs. Do not copy `.env.example` onto the live `.env` (`PROTECTED_SUBNET` there must stay `10.0.0.0/24`). Still no automatic boot.

```bash
cd /home/joe/honeypot-staging/honeypot
sudo python3 scripts/readiness.py
sudo python3 tests/firewall-netns.py
# edit state/wan-approval.json from the example: approved true, approver, timestamp,
# allowed_ports subset of 2222/2223/8080/2121, bind_address, test_source_cidr,
# residual_risk_acknowledged true
# set DECOY_BIND to one specific address (not 0.0.0.0), MANAGEMENT_BIND=127.0.0.1
# set WAN_CRITERIA=true WAN_SOURCE_MODE=iptables-dnat WAN_INGRESS_IFACE=<iface>
# add that iface to PCAP_INTERFACES without removing the two bridges
sudo python3 scripts/hp.py wan check
sudo python3 scripts/ops.py stop
sudo systemctl start honeypot-pcap.service
sudo python3 scripts/hp.py guard apply --apply
sudo bash scripts/start.sh --exposure-approved
```

Confirm Grafana is still `127.0.0.1:3000` and Redis is still `127.0.0.1:16379`. Only then add matching router forwards by hand. Never forward 3000, 3100, 12345, or the Docker API.

Revert:

```bash
# set DECOY_BIND=127.0.0.1 and WAN_CRITERIA=false WAN_SOURCE_MODE=off
sudo python3 scripts/ops.py stop
sudo python3 scripts/hp.py guard apply --apply
sudo systemctl start honeypot-pcap.service
sudo python3 scripts/ops.py boot-start
```

`boot-start` refuses a non-loopback bind on purpose.

No router rules were changed.

The patch diffstat is printed with the handoff. It is not copied into this file, so the manifest can be hashed once after this text is frozen.
