# Ubuntu target deployment

Source of truth: [Operator model](docs/OPERATOR_MODEL.md), the rendered Compose configuration, and the live verified hp_guard policy.

Decoy bridges are non-internal so Docker 29 can publish loopback ports. They are NOT a Docker isolation boundary. Egress and host access are enforced by hp_guard + DNS blackholes + start gates. Observability remains an internal network. The preferred extra boundary is a DMZ/VLAN, which this bundle does not configure.

Supported baseline: Ubuntu 24.04 LTS, x86_64, Docker Engine with the Compose v2
plugin. Container image pins in `.env.example` remain Ubuntu 24.04. The live
IdeaPad is Ubuntu 26.04 and still needs target validation; do not treat the
24.04 pin as a 26.04 certification. Use a dedicated host; numeric group
2000 is the restricted evidence group. Check `getent group 2000` first: do not
allow unrelated members to inherit evidence access. Do not run these operations
on the Windows build machine. Commands below act on the Ubuntu target only.

1. Transfer ZIP and its checksum together. Verify checksum before extraction and
   MANIFEST.sha256 afterward. SHA-256 detects modification relative to this copy;
   it is not an authenticated signature. Confirm the checksum over a trusted channel.
2. Extract to a path without spaces (recommended `/opt/honeypot`). If extracted
   elsewhere, move the complete new directory deliberately; never overwrite an
   existing deployment. Run `bash scripts/preflight.sh`; its report is saved in
   `work/preflight.json`. Inspect interface names, disk, ports, route conflicts,
   time synchronization, virtualization and memory. Quietly missing preflight
   dependencies are NOT TESTED and must be resolved, not treated as a clean host.
3. `cp -n .env.example .env`. Edit plain unquoted values, set the actual protected
   LAN and trusted management subnet, retain both bindings as 127.0.0.1. The
   current template sets PCAP_INTERFACES=br-hp-cowrie,br-hp-canary and captures both
   decoy bridges in one finite ring. A physical ingress interface requires separate
   review; do not infer external visibility from the bridge-only capture.
4. Review and explicitly approve target package installation:
   `sudo bash scripts/install-dependencies.sh --install`. This uses Ubuntu's package
   repositories, installs Docker/Compose/nftables/dumpcap and validation tools, and
   may start Docker through the package manager. It does not start the honeypots.
   Verify that Docker exposes no TCP API: inspect `systemctl cat docker` and `ss -lntp`.
5. `bash scripts/validate.sh` performs possible static checks. Native Suricata and
   Alloy validators can be unavailable until their images are built; this is
   reported explicitly. `sudo bash scripts/bootstrap.sh` creates directories and
   a new Grafana password without replacing existing configuration/secrets.
6. Preview scoped temporary containment using
   `sudo bash scripts/apply-containment.sh`. It prints rules and exits nonzero
   until `--apply` is supplied. Review, then run
   `sudo bash scripts/apply-containment.sh --apply`. It backs up the complete
   existing ruleset and a separate scoped snapshot, validates atomically, and
   applies only inet hp_guard. This local temporary rule is required before the
   internal stack starts; broader network isolation is reviewed later.
7. `sudo bash scripts/start.sh`. Image pulls/builds use host Docker's networking;
   build output is not an offline installation. Decoys receive no runtime default
   external network. Suricata starts after the bridges exist. Allow startup time,
   then `sudo bash scripts/status.sh` and inspect failing service logs.
8. `sudo python3 scripts/install-systemd.py --install` installs reviewed project
   timers. `sudo systemctl start honeypot-pcap.service` starts the finite capture.
   Timers do not install permanent firewall rules. After reboot/Docker restart,
   reapply hp_guard and use start.sh; decoys use on-failure:5 and do not auto-start
   after a daemon restart. Do not replace their restart policy without a boot guard.
9. Run the actual acceptance tests:

```bash
sudo python3 tests/local-integration.py
sudo python3 tests/pcap-ring.py
sudo python3 tests/firewall-netns.py
sudo bash scripts/healthcheck.sh
sudo bash scripts/readiness-check.sh
```

The namespace test creates temporary, unattached namespaces and veth pairs. It
does not modify host routing, send to a physical LAN, or scan external IPs. The
ring test captures synthetic traffic only on loopback for ten seconds. Static
tests can be rerun with `python3 -B -m unittest discover -s tests -v`.

10. Inspect Grafana locally at http://127.0.0.1:3000. Read the initial secret with
    `sudo cat secrets/grafana_admin_password`; do not paste it into tickets or logs.
    The admin account is `admin`. For remote viewing use an existing authorized
    host SSH session: `ssh -L 3000:127.0.0.1:3000 admin@HOST`. This command connects
    to management SSH, not Cowrie. Review authenticated dashboards and incident reports.
11. Readiness requires fresh (<24 h) PASS records for each acceptance test plus
    current healthy containers/logs. A quiet decoy can be marked idle; run the
    local probes before readiness. Health tests can create harmless telemetry.
12. Review topology and external firewall policy. Prefer DMZ isolation. Confirm
    management never shares the attacker forwarding policy. Record explicit
    approval in your change-control system. Then stop the stack, deliberately
    change DECOY_BIND to the dedicated host address, leave MANAGEMENT_BIND at
    127.0.0.1, and start with `sudo bash scripts/start.sh --exposure-approved`.
    This requires a recent passing readiness report. It does not create router
    rules. Configure only approved router ports manually and test from an approved
    external test source. Never forward 3000/3100/12345/Docker API ports.
    Before that window, run `python3 scripts/hp.py wan check` and follow
    docs/WAN_CRITERIA.md. Redis stays on 127.0.0.1. Non-loopback start also
    requires `state/wan-approval.json`, `WAN_SOURCE_MODE`, and fresh
    source-fidelity evidence. The script still changes no router rules.

No validation flag constitutes authorization to expose services. Complete the
network review even if all technical tests pass. Persisting firewall policy or
altering host management access requires a separate approved change.

Optional DNS/NTP/update IP allowlists are template capabilities and default empty.
Decoy bridges are non-internal for Docker 29 loopback publishing. hp_guard, not
Docker internal networking, enforces their egress policy. Design an approved
egress proxy/network before allowing downloads. Package/image
updates normally happen via the host, while decoys remain isolated. Private/LAN
destinations remain denied before any optional egress allowances.
