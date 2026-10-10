# Operator model

1. hp_guard present
2. PCAP running
3. observability up
4. decoys up

If 1 disappears, 4 must disappear.
Grafana is local-only.
WAN is a later approved mode, not a default. Technical criteria, the port
matrix, and the revert path are in [WAN criteria](WAN_CRITERIA.md). Meeting
those checks does not configure a router and does not enable automatic boot.

Decoy bridges are non-internal so Docker 29 can publish loopback ports. They are NOT a Docker isolation boundary. Egress and host access are enforced by hp_guard + DNS blackholes + start gates. Observability remains an internal network. The preferred extra boundary is a DMZ/VLAN, which this bundle does not configure.

Repeatable checks: `make verify` (unit + static) and, on the isolated Ubuntu
lab, `sudo make verify-full` (adds nft/netns/compose/systemd probes). Neither
command starts decoys or enables boot.

Use `python3 scripts/hp.py` or `bash scripts/hp.sh`:
`status`, `health`, `start`, `boot-start`, `stop`, `guard status`,
`guard apply [--apply]`, `pcap status`, `logs --source audit last 20`,
`incident list`, `readiness`, `wan status|check|matrix`, `bait status|render`,
`intel pack`. Each command explains its effect and approval.
`status` and `health` show the dated last health snapshot; run
`sudo python3 scripts/healthcheck.py` to refresh it.

`start` is first deploy / explicit rebuild: it may create containers after live
containment and rendered DNS/bind checks. `boot-start` is a fail-closed restart
of existing loopback decoys: no build, pull, create, or recreation, and PCAP
must already be active. Neither command enables automatic boot.

The table-loss watcher is **preview-only, not installed, not enabled** by this
patch. Installation requires `--install-preview --approved`; activation is a
separate approved manual step. Until that supervised test is completed, the
"If 1 disappears" rule is a requirement, not a proven production guarantee.
See [validation and opt-in drill](HARDENING_VALIDATION.md).

Raw captured passwords remain in protected raw logs and incident evidence.
Searchable decoy streams contain `password_present`, never the password field.
