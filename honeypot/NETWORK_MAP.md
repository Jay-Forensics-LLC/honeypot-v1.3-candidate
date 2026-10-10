# Reference and preferred network maps

Source of truth: [Operator model](docs/OPERATOR_MODEL.md), the rendered Compose configuration, and the live verified hp_guard policy.

Decoy bridges are non-internal so Docker 29 can publish loopback ports. They are NOT a Docker isolation boundary. Egress and host access are enforced by hp_guard + DNS blackholes + start gates. Observability remains an internal network. The preferred extra boundary is a DMZ/VLAN, which this bundle does not configure.

These are designs, not observed network discovery. Actual NIC name, LAN range,
gateway, disk model and management address remain UNKNOWN until preflight.

## Base: one physical NIC behind a normal router

```text
Internet
  |
Router/firewall [NO port forwards at first boot; UPnP disabled for this host]
  |
Ordinary LAN [protected clients must be listed in PROTECTED_SUBNET]
  |
Ubuntu dedicated laptop [one NIC; name UNKNOWN]
  +-- localhost:3000 Grafana (access locally or SSH tunnel)
  +-- localhost:2222/2223 -> Cowrie      -> br-hp-cowrie 172.29.40.0/24
  +-- localhost:8080/2121/16379 -> Canary -> br-hp-canary 172.29.41.0/24
  +-- internal observability network    -> 172.29.42.0/24
       Alloy -> Loki -> Grafana; incidentd
```

Decoy bridges are non-internal and separate. hp_guard blocks new decoy -> LAN/host/
Internet sessions, including IPv6 via its final drop. The host itself retains its
normal networking; do not mistake this for containment of an already-compromised
host. No automatic management INPUT policy is applied.

## Preferred deployment

```text
Internet -> router/firewall -> dedicated DMZ/VLAN -> honeypot Ubuntu host
                                  |
                                  +-- deny DMZ -> production/trusted networks
Trusted management subnet -> narrow management firewall rule -> host SSH/tunnel
```

A VLAN-capable switch/router or a separate physical firewall can provide the DMZ;
a second laptop NIC is not required for the initial deployment. Obtain approval
for VLAN/subnet/routing changes. Do not put Grafana, Loki, Docker API or the host
management SSH service in the attacker port-forward group. Standard router mappings
may later forward public 22 -> host 2222 and public 23 -> host 2223, public 80 ->
host 8080. Host SSH stays on its actual administrative port and trusted subnet.

Verify no overlap with 172.29.40/41/42.0/24. Changing these requires synchronized
Compose IPAM, Suricata HOME_NET, bridge names if changed, hp_guard interface matches,
and tests. Suricata sees post-DNAT destinations on bridges; inbound source IPs may
be rewritten by Docker's userland proxy, especially localhost probes. Validate
source preservation on the actual approved ingress path before relying on it.
