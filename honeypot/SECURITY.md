# Security policy

Source of truth: [Operator model](docs/OPERATOR_MODEL.md), the rendered Compose configuration, and the live verified hp_guard policy.

Decoy bridges are non-internal so Docker 29 can publish loopback ports. They are NOT a Docker isolation boundary. Egress and host access are enforced by hp_guard + DNS blackholes + start gates. Observability remains an internal network. The preferred extra boundary is a DMZ/VLAN, which this bundle does not configure.

Use only for an authorized honeypot environment. Never attack, retaliate, connect
back to attacker infrastructure, or reuse captured credentials. No live attacker
addresses or malware are bundled. Do not run exploit traffic against external IPs.
WAN criteria checks do not authorize Internet exposure or router changes.

## Change approval

AUTO-APPROVED within the authorized project: file/config creation, detection rules,
dashboards, health checks, log parsing, safe local validation, evidence hashing,
backups, reversible tooling, increased logging and temporary containment tooling.

APPROVAL REQUIRED: new Internet-facing services; permanent firewall/routing changes;
management-access changes; VLAN/subnet changes; major infrastructure installation;
disabling controls; changing management credentials; broad permanent IP blocks;
changes that could interrupt unrelated services. The target installation commands
have explicit flags and must be executed only under that approval. Bootstrap
creates an initial secret only when absent and never changes an existing password.

NEVER AUTOMATIC: deleting protected forensic evidence, wiping drives, formatting
disks, destroying backups, disabling host networking, irreversible destructive
actions. Normal bounded live log/PCAP retention is distinct from protected evidence.

## Boundaries and access

All published ports default to loopback. Loki is internal and has no authentication
because it is confined to an internal network; never publish it directly. Grafana
requires its generated secret, has no anonymous access or self-signup, and does not
phone home. There are no Docker daemon interfaces or socket mounts in containers.

Cowrie and OpenCanary use non-root UIDs, capability drops, resource ceilings,
read-only root filesystems, bounded Docker logs and separate non-internal decoy bridges protected by hp_guard.
hp_guard must be loaded before start.sh. Only this table is replaced; unrelated
firewall policy is neither flushed nor restored wholesale. Stop decoys before
removing/replacing an existing guard. Automatic CRITICAL quarantine is disabled
by default; enabling AUTO_CONTAINMENT=true opts into pausing the two known decoys
after incident evidence exists. Source blocks take a single IP, expire after
3600 seconds, and never expand into CIDRs.

Captured files are hostile. NEVER execute a sample on the host; open macros;
run captured scripts; install APK/EXE/ELF payloads; or try captured credentials
against any other service. Permitted static triage includes hashing, file type,
strings, metadata and reviewed YARA. Even parsers have bugs: run optional tools
inside a separate offline disposable sandbox with limits and an updated parser.
Reputation queries and dynamic sandboxes require separate data-sharing/network
review. No automatic upload or lookup is implemented.

Safe operator static examples (in an offline analysis environment):
`file -- sample.bin`, `strings -a -n 8 -- sample.bin`,
`yara detections/yara/suspicious-artifacts.yar sample.bin`. Avoid displaying
untrusted control characters directly in a terminal; redirect output to a file.
Hashing runs automatically, analysis execution does not.

Raw passwords, session content, source IPs and artifacts can contain personal or
confidential data. Restrict evidence group 2000, use an encrypted target disk and
encrypted offline backups if approved, and limit operator access. Never publish
raw incidents/dashboard screenshots containing credentials. The ZIP contains no
live secrets. The secret scanner is a heuristic, not proof of future content safety.

An actual host escape cannot be detected reliably by this small stack. The trusted
boundary file accepts verified host/operator observations; it is not an EDR agent.
Use independent host auditing for higher assurance. Event correlation and signatures
are heuristic, cannot identify a person, and cannot prove successful external harm.

## Searchable telemetry and evidence

New normalized events and per-source Cowrie/OpenCanary streams remove password
fields and retain `password_present`. Alloy reads those sanitized decoy streams,
parser errors, and allowlisted operator audit records. Raw Cowrie/OpenCanary files
and incident evidence retain captured credentials under evidence permissions.
TTY, PCAP and secrets/ are not Alloy sources. Commands, URLs, usernames, sensor
records, and historical Loki entries can still contain sensitive free text;
structured field redaction is not a general secret detector. Treat Loki access
as sensitive. This patch does not erase historical Loki data or protected evidence.
Existing pre-patch normalized files may contain passwords: review and relocate
those files to protected evidence while incidentd/Alloy are stopped before upgrade.
Do not reingest the old unsanitized files.

Audit is an operational record, not tamper-proof evidence against host root or
compromise of the existing shared logs mount. Missing/unreadable nft policy is
unsafe; the preview watcher requests decoy-only stop even when systemd remains
active (exited). Polling, Docker failures, and host compromise remain limitations.
