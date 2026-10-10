# Architecture and trust boundaries

Source of truth: [Operator model](docs/OPERATOR_MODEL.md), the rendered Compose configuration, and the live verified hp_guard policy.

Decoy bridges are non-internal so Docker 29 can publish loopback ports. They are NOT a Docker isolation boundary. Egress and host access are enforced by hp_guard + DNS blackholes + start gates. Observability remains an internal network. The preferred extra boundary is a DMZ/VLAN, which this bundle does not configure.

Cowrie provides an emulated SSH/Telnet shell, JSON authentication and command
records, TTY sessions and uploaded-file capture. Its real forwarding and proxy
features are disabled. Download commands can be recorded, but outbound retrieval
fails under the default egress policy. This is an intentional security boundary.

OpenCanary runs HTTP, FTP and Redis emulations as a non-root process. Additional
configured examples remain disabled. Each decoy has its own non-internal bridge;
neither shares a network with Loki, Grafana, Alloy or incidentd. Each decoy can
write only its own runtime mounts. No service receives the Docker socket.

Suricata observes both decoy bridges using AF_PACKET. It uses host network mode
because those bridge devices are host interfaces. NET_RAW opens packet sockets;
NET_ADMIN supports AF_PACKET interface operation; SETUID/SETGID are retained for
the distro application's privilege handling. No privileged mode is used. This
sensor is a trusted, more privileged workload; host networking means its compromise
would be more serious than a decoy compromise. It does not intentionally listen
for public requests. For physical ingress visibility add the discovered NIC as
another af-packet entry, with a distinct cluster-id, after reviewing duplicates.

Raw decoy logs -> incidentd sanitized per-source JSON -> Alloy -> internal Loki -> Grafana.
Alloy also reads normalized events, incident updates and host health/firewall JSON.
Positions persist under state/alloy. It does not ingest its own output or the
entire logs directory recursively. Password fields are removed from searchable decoy events;
IPs, URLs and sessions remain fields, not indexed stream labels. Small fixed source/job labels avoid cardinality growth.

incidentd reads sources locally, normalizes and correlates them, hashes stable
payloads and writes JSON/Markdown reports. A 15-minute receipt-time window groups
source IPs; Cowrie session IDs restore missing IP fields. Cross-IP shared usernames,
fingerprints, user agents, domains, URLs, hashes and normalized command patterns
create INFERRED links without merging identities. NAT, spoofed fields, encrypted
traffic and reused passwords limit attribution. Suricata flow IDs are not SSH
sessions. Outbound workload IPs are not silently attributed to remote attackers.

Host root scripts own nftables, dumpcap, journal reads, Docker quarantine and
backup timers. The correlator submits constrained requests but cannot directly
run Docker or nftables. Trusted CRITICAL boundary records are a separate read-only
mount from state/trusted/boundary.jsonl, writable only by target root. Cowrie escape
strings remain HIGH indicators; they are not proof of actual host escape.

The temporary inet hp_guard table denies new decoy egress and host access while
allowing replies. Decoy bridges are non-internal; observability remains internal. Existing host
firewall tables still apply; an accept in hp_guard cannot override a later drop.
This is single-host defense in depth, not VM-grade separation. A dedicated DMZ
firewall/VLAN that denies production LAN access remains the preferred architecture.

Expected steady memory is workload-dependent; configured container ceilings total
approximately 7 GB. Leave RAM for the OS, page cache and capture. There is no
Elasticsearch/OpenSearch, Wazuh or Zeek. Future additions belong on separate
observability infrastructure after measuring need; see docs/EXTENDING.md.
