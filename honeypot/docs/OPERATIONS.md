Readiness, `wan check`, and lab scripts write `state/` in the directory you run them from. Use the live runtime tree. Do not treat a second source checkout as the Compose project.

# Operator runbook

Daily: status, health JSON, failed timers, parser errors, incident queue and storage.
Weekly: verify a backup checksum/read, review inactive sensors and capture losses,
review image/security advisories and test a restoration into a new directory.
No broad automated updates are enabled. All startup paths require the same
separately reviewed version-1 image manifest: exactly seven service names, each
with `reference` and immutable `id`. Supply its independent SHA-256 using
`HONEYTRACE_IMAGE_APPROVAL_SHA256` (or `--image-approval-sha256` for lifecycle
commands). Use `HONEYTRACE_IMAGE_APPROVAL_FILE` for an absolute canonical manifest
outside source, keeping the reviewed checkout clean. The empty source template
intentionally authorizes no images. The manifest and digest belong in the approved
deployment transaction; observations and editable runtime locks cannot bless them.

Startup freezes the full rendered configuration with the approved image IDs,
removes build directives, creates containers with `--no-build --pull never`, then
checks seven unique container IDs, image IDs and project/runtime ownership before
starting those exact IDs. All seven services require `restart: "no"`; startup
and qualification also verify the actual daemon restart policies. Docker must not
execute a service before these gates on daemon startup or after a failure. This
supervised policy means a failed service stays stopped for operator investigation.
Existing deployed policies are not changed by a source checkout and require a
separately approved deployment transaction. Mutable tags, environment files and Compose overrides
are not resolved again for execution. `start(build=True)` is rejected. A DNS
postcheck failure stops the verified IDs before Suricata starts.

Startup requires every existing owned project container to be stopped, with
disabled daemon restart policies, before creating anything. An active owned
project is stopped by captured IDs and refused for operator review; startup is
not an idempotent operation on a running stack. Foreign ownership blocks without
stopping foreign containers. Before execution, the new stopped containers must
pass actual network, bind, security and resource checks. Their command,
entrypoint, environment, healthcheck, working directory and stop signal are
compared with the frozen model plus defaults from the approved immutable images.
All lifecycle Compose calls select exactly one file and the explicit project.
Automatic override files and additional COMPOSE_FILE/environment inputs are
refused; qualification applies the same checks and compares actual execution
fields even when no override file remains.
Inventory refuses diagnostic container execution when runtime configuration is
unsafe. The explicit cleanly-stopped-decoy mode still requires the incident
pipeline's configuration and health to pass before its diagnostic process runs.

An update still requires `--apply --image-approval-sha256 SHA256`, the verified
stopped Grafana backup, and separate deployment approval. It checks approval
before backup/stop, pulls/builds, validates available images, and passes the same
pin into startup. Only `state/images.observed.json` is written after verification;
review manifests and historical locks are never overwritten. Retain previous
images and evidence for a separately reviewed rollback.

The existing `boot-start` entrypoint now checks the same approval and the seven
owned image/container identities and disabled restart policies, then starts only
the two captured decoy IDs. With automatic restarts disabled, it does not start
the other five services after a cold boot or provide complete boot ordering.
Its preview unit has no approval pin and will fail closed until a separately
reviewed Phase 8 transaction supplies one. This source repair enables no unit and
qualifies no boot behavior.

Qualification requires byte-identical reviewed-source and runtime Compose files,
bounded regular-file reads before and after observation, and an explicit Git
untracked-file check regardless of local status configuration. A clean unrelated
source checkout cannot qualify an edited runtime Compose file. Quarantine and
unquarantine validate every mount, including only the known Cowrie image volumes
and the reviewed `/tmp` tmpfs, before logs, pause or unpause are requested.


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
copytruncate. Stable IDs deduplicate retained events.jsonl records across receipt
windows, UTC days and incident segments. Recovery uses the original normalized
record for missing incident metadata. Reports, normalized events and incident
summaries are republished before a replay can complete its source checkpoint.
Query logs remain at-least-once: consumers must deduplicate event IDs and select
the latest summary for an incident ID. Field lists cap at 100 values; event
evidence is segmented at 1000 records or 64 MiB. Shared signals expire after the
configured window and are not persistent identity claims.
There is no exactly-once distributed event pipeline or tamper-proof remote archive.

The single incidentd writer reserves each stable ID's incident location in
state/incidentd/event-locations.sqlite3 before appending evidence. These locations
do not expire with correlation groups. Preserve the locator with incidentd state
and evidence during an approved recovery; backup.sh's metadata archive does not
include incidentd state or the locator. A missing locator requires bounded
historical backfill before any source checkpoint can advance. Discovery makes one
streaming name inventory, capped at 100,000 entries including day directories;
payload inspection is capped at 32 incidents per call and resumes from a durable
SQLite queue after interruption. These are engine migration limits, not changes
to the separate Stage 7 qualification budgets. Migration pins file identities and
hashes, and refuses completion if the inventoried directories or inspected files
change. state/incidentd/migration-status.json reports progress and up to 32 blocked
or quarantined entries; the complete inventory remains in SQLite.

Backfill does not rewrite retained evidence. One recognizable historical damage
pattern is isolated: complete identifiable JSON records followed only by NUL
padding, with valid bounded metadata identifying every intact record. The original
and metadata hashes are pinned, the whole incident is blocked for writes, and all
intact/metadata event IDs are fenced against replay into another incident. Healthy
unrelated ingestion can continue after inventory completion. No damaged record is
reconstructed or accepted as original evidence. Any other malformed content,
missing/inconsistent metadata, or unreadable history keeps migration blocked for
operator review. Duplicate stable IDs across intact legacy locations quarantine
both incidents and block ambiguous replay; they do not select an original or erase
either copy. Their disposition requires separate provenance review.
Conflicts discovered after migration are also committed to SQLite before
reporting a diagnostic failure. All conflicting incidents remain blocked for
new appends and ambiguous replay across writer restarts; deleting the locator
would erase that fence and is not a repair.

Inspect logs/system/evidence-integrity.jsonl, including original_sha256 when the
file can be safely hashed. Invalid locator state emits HOLD_CHECKPOINT in
logs/system/event-locator-integrity.jsonl and must not become a parser skip.
Locator corruption and reuse with a different resolved incident root fail closed.
Do not delete state or automatically rebuild the locator to bypass these gates;
relocation and recovery require a reviewed plan.

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
