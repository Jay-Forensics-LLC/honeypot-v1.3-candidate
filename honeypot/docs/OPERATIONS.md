Readiness, `wan check`, and lab scripts write `state/` in the directory you run them from. Use the live runtime tree. Do not treat a second source checkout as the Compose project.

# Operator runbook

Daily: status, health JSON, failed timers, parser errors, incident queue and storage.
Weekly: verify a backup checksum/read, review inactive sensors and capture losses,
review image/security advisories and test a restoration into a new directory.
No broad automated updates are enabled. update.sh --apply performs metadata backup,
stops, pulls/builds reviewed versions, validates and restarts. Keep prior image digests.

`sudo journalctl -u honeypot-health.service` shows health failures. Inspect
logs/system/health.jsonl and state/health.json. Systemd timers execute as root because
health needs Docker status/journal/PCAP stop access; incidentd remains unprivileged.
Health LOW means all monitored checks passed. Idle decoy logs generate MEDIUM even
on a quiet network; run a local probe before declaring capture broken. cumulative
Suricata drop counts require operator interpretation; they are not per-minute rates.

To record an independently verified boundary observation, root may append one JSON
object to state/trusted/boundary.jsonl, e.g. timestamp, event_type=host.compromise,
verified=true, source_ip if known. Allowed types: host.compromise, container.escape,
management.access, protected.access, outbound.attack, unauthorized.host_activity.
Only append after verification and link corroborating evidence in incident notes.
Do not manufacture such a signal from untrusted Cowrie command text. There is no
generic host intrusion agent in this first version.

CRITICAL requests are processed by the host containment timer only when
AUTO_CONTAINMENT=true. It preserves incident files first, then saves container
metadata/logs and pauses both decoys. Requests and receipts are JSON under state/.
Pausing both avoids guessing which remote actor owns an outbound flow. Review each
incident before unpausing. HIGH incidents trigger evidence snapshots and reports;
the correlator polls at one second for five minutes, and the operator can
temporarily block a single source while reviewing the increased telemetry.
Automated high-severity source blocking is not enabled by this bundle.

Logs can rotate between polls. The correlator checkpoints inode/offset and retries
incomplete lines; a truncated/rotated file can still leave a gap during outages or
copytruncate. Stable IDs deduplicate report indexes on normal replay; events.jsonl
and query logs can contain a replayed record after a crash. Replay IDs are explicit.
Field lists cap at 100 values; event evidence is segmented at 1000 records. Shared
signals expire after the configured window and are not persistent identity claims.
There is no exactly-once distributed event pipeline or tamper-proof remote archive.

Native Cowrie daily rotations, TTY recordings, samples and incidents require
capacity review. Standard logrotate handles active raw files; it does not delete
TTY/evidence. Use `du -sh logs/* state/cowrie/tty artifacts incidents captures`
on the target. After approved retention review, archive old sessions offline; no
automatic script deletes forensic evidence. If raw Cowrie timestamped files grow,
use the supplied cold-log retention policy only after reviewing its scope.

PCAP evidence: automatic copies include up to three closed segments preceding the
incident. To capture later completed segments, briefly stop incidentd, run
`sudo bash scripts/preserve-evidence.sh /absolute/incident/directory`, then restart
incidentd with `sudo docker compose start incidentd`. Always inspect metadata.json
for gaps, hashes, timestamps, caps and changed-during-copy flags. Timestamps and
SHA-256 manifests are custody aids, not legal-grade immutability or trusted signing.
