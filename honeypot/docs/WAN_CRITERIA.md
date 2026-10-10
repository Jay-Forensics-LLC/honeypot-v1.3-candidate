# WAN criteria

WAN criteria PASS means the source tree can prove the technical gates below.
It is not live Internet exposure. These scripts do not create router rules, do not
use UPnP/IGD, and do not change `DECOY_BIND` by themselves.

Loopback readiness is unchanged unless `WAN_CRITERIA=true` or `state/wan-approval.json`
exists. The original 12 readiness names stay required either way.
Run readiness and the lab scripts from the runtime tree
(`/home/joe/honeypot-staging/honeypot`). They write `state/test-results/` next
to that tree. A second source checkout does not see those files.

## What PASS means

| ID | Gate |
|---|---|
| W1 | Non-decoy published ports and `MANAGEMENT_BIND` stay loopback. `--exposure-approved` does not override that. |
| W2 | Non-loopback `DECOY_BIND` still needs `--exposure-approved` and readiness PASS younger than 24h. `.env.example` stays `127.0.0.1`. `0.0.0.0` is rejected. |
| W3 | Only `configs/wan/port-matrix.yml` ports with `wan_eligible: true` may be published off loopback. Default eligible: 2222, 2223, 8080, 2121. Redis 16379 is default deny and is published on `127.0.0.1` even if other decoy ports move. |
| W4 | Rendered `hp_guard` still drops protected-subnet, other RFC1918, and unapproved DNS. |
| W5 | Docker userland-proxy would hide the attacker address. Non-loopback start therefore requires `WAN_SOURCE_MODE=iptables-dnat` or `ipvlan` plus fresh `wan_source_fidelity` evidence whose `scope` is `netns` or `observation`. This tree does not flip the Docker daemon setting. |
| W6 | `PCAP_INTERFACES` must include both decoy bridges. If WAN mode is asserted, `WAN_INGRESS_IFACE` must be set and included. PCAP stays a manual static unit. |
| W7 | `PROTECTED_SUBNET` must parse. On this single-NIC IdeaPad the decoy address would sit inside `10.0.0.0/24`. That is a residual risk, not a DMZ. The approval record must acknowledge it. |
| W8 | Commands print `No router rules were changed.` `project_uses_upnp()` is source-static and must stay false. |
| W9 | `require_guard` and bridge-name checks still run. WAN start is not weaker than loopback start. The preview watcher is not production. |
| W10 | `hp.py wan check` writes `state/test-results/wan_*.json`. Missing or stale is FAIL when WAN mode is asserted. |
| W11 | `state/wan-approval.example.json` and `configs/wan/wan-approval.example.json` are the same template (`approved: false`). The `state/` copy exists because `.gitignore` ignores `state/**` except that file. A real `state/wan-approval.json` is operator-filled and is not shipped. |


## Approval templates

Use either example file. They are identical on purpose. Copy to
`state/wan-approval.json` on the **runtime** tree only. Filling the example
in a source checkout does not approve staging.

## Single-NIC residual risk

Host fact: `wlp2s0` `10.0.0.149/24`, `PROTECTED_SUBNET=10.0.0.0/24`.
There is no separate honeypot NIC and this bundle does not configure a VLAN.
If decoys are later bound to `10.0.0.149`, attacker traffic and the operator's
LAN share a broadcast domain. Prefer the DMZ/VLAN map in `../NETWORK_MAP.md`.
Until that exists, treat source fidelity on real `wlp2s0` DNAT as UNKNOWN.

## Operator commands

```text
python3 scripts/hp.py wan matrix
python3 scripts/hp.py wan status
python3 scripts/hp.py wan check
python3 scripts/hp.py bait status
python3 scripts/hp.py bait render
python3 scripts/hp.py intel pack --since 7d
```

`wan check` on a loopback tree PASSes management, matrix, and rendered egress.
Source fidelity is recorded `NOT TESTED` with `scope=detector` unless fresh
`netns` or `observation` evidence exists. A detector self-check is not a PASS.
Readiness accepts `wan_source_fidelity` only when `status` is PASS, `scope` is
`netns` or `observation`, and `live` is true. Non-loopback `ops.py start`
uses that same `evidence_passes` predicate. A PASS file with `live` false,
a detector scope, or a non-numeric epoch is rejected.

## Future approved exposure window

Do this only on the runtime tree (`/home/joe/honeypot-staging/honeypot` today),
never by `compose up` from a second source tree. Still no automatic boot.

```bash
cd /home/joe/honeypot-staging/honeypot
# copy the new scripts/configs in first; do not extract a ZIP over logs, secrets, .env, or incidents
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

Confirm with `ss` that Grafana is still `127.0.0.1:3000`, Redis is still
`127.0.0.1:16379`, and only matrix ports listen on the decoy address.
Then, and only then, add matching router forwards by hand. Never forward
3000, 3100, 12345, or the Docker API.

Revert:

```bash
# set DECOY_BIND=127.0.0.1 and WAN_CRITERIA=false WAN_SOURCE_MODE=off
sudo python3 scripts/ops.py stop
sudo python3 scripts/hp.py guard apply --apply
sudo systemctl start honeypot-pcap.service
sudo python3 scripts/ops.py boot-start
```

`boot-start` refuses a non-loopback bind on purpose.

## Intel pack, bait, alerts

`hp.py intel pack` reads incident `events.jsonl` normalized fields only.
It writes `work/intel-packs/<stamp>/pack.json`, `pack.stix.json`, `brief.md`,
and `MANIFEST.sha256`. Password fields are removed. Bait hits are OBSERVED ids,
not a claim of identity. ASN stays UNKNOWN unless evidence already carried it;
this pack does not perform reputation lookups.

Profit path: a weekly `brief.md` plus the STIX bundle is the retainership
artifact. Do not send raw TTY, PCAPs, or `secrets/`.

`hp.py bait render` creates per-deployment tripwires under `state/bait/` the
first time and will not overwrite an existing inventory. Tokens use the
`HPAKIA` prefix plus randomness. They are not valid credentials anywhere.
Rendering does not rebuild Cowrie. Copy the honeyfs fragment only under a
separate change. Grafana panel "Bait hits" shows ids from `{source="normalized"}`.
Indicator counts are the pack's cluster list, not a second password panel.

`configs/alert-bus.yml.example` is disabled. Copy it to `configs/alert-bus.yml`
and set `enabled: true` plus a webhook or SMTP target to page on HIGH, CRITICAL,
and bait hits. Payloads carry `password_present` and never the password, TTY, or
command text that contains a password or a bait token. Unconfigured is healthy.
Configured plus `state/alerts/last.json` status FAILED is a health problem.
There is no VirusTotal or other phone-home.

## Still open

Table-delete while the oneshot guard unit stays active, and automatic decoy
boot, are not closed by this work. The preview watcher is not installed.
Live router state and live `wlp2s0` source fidelity are UNKNOWN until an
operator runs the window above.
