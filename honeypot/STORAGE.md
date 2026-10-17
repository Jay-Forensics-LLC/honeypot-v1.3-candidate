# Storage and retention

A nominal 500 GB SSD provides about 466 GiB before formatting. The requested
planning ranges are OS + Docker 50–80 GB, live logs/Loki 75–100 GB, PCAP 100–150 GB,
incident evidence/artifacts about 100 GB, and at least 15–20% free. Their upper
ends do not fit simultaneously. Choose lower limits and monitor actual usable
space; do not allocate every range as a hard partition. For example budget 60 GB
OS/images, 70 GB logs/Loki, 100 GB PCAP, 85 GB evidence, and 90 GB free/reserve.
These are planning budgets, not quotas automatically installed by this bundle.

Default dumpcap ring: 100 MB per segment, 1000 segments, at most roughly 100 GB
plus a packet/format overhead; it also rotates at five minutes. The wrapper limits
configured budget to 150000 MB and checks critical disk watermarks before starting.
Dumpcap's ring overwrites old unprotected captures; incident copies are outside it.
Use PCAP_PATH, ARTIFACT_PATH and INCIDENT_PATH for alternate absolute mountpoints.
Avoid spaces and symlinks in deployment/systemd paths. Bootstrap maps numeric owners;
new dedicated filesystems should use nodev,nosuid,noexec where practical. noexec
is not a substitute for never feeding a sample to an interpreter.

Loki retains 336 hours (14 days) using TSDB v13 and its compactor. It has rate,
query and memory limits, but filesystem storage has NO hard byte cap. Set
LOKI_RETENTION_HOURS deliberately; max_query_lookback in the YAML must be updated
if longer searches are needed. A shorter retention does not instantly reclaim
all chunks. Raw Cowrie/Suricata active files use project logrotate every 15 minutes:
100 MB trigger, daily rotation, configured count/days, compression and delaycompress.
Copytruncate can lose concurrent lines or be missed by a tailer during truncation;
raw backups and immutable incident snapshots reduce but do not eliminate gaps.

OpenCanary's rotating writer keeps 20 x 10 MB files. Normalized, health, firewall
and audit writers keep approximately 10 x 20 MB plus the active file. These are
count/size policies rather than guaranteed calendar-day histories. LOG_RETENTION_DAYS
controls logrotate's raw-file policy only. Docker stdout logs keep 3 x 10 MB per
container. Loki, raw logs and normalized events intentionally duplicate some data.
Native Cowrie timestamped rotations and TTY session files must also be reviewed;
see docs/OPERATIONS.md for cold-log retention and session capacity management.

HIGH/CRITICAL incident PCAP snapshots have a 350 MB per-incident copy limit and
artifact snapshots a 50 MB limit. Active ring files are excluded to avoid corrupt
live copies. A later closed-segment snapshot is supported. Evidence omissions,
stability mismatches and time-window limits are recorded in metadata.json. Three
closed segments are not a guarantee of complete session coverage. Increase limits
only with a deliberate capacity review.

INCIDENT_RETENTION_DAYS=manual is policy, not an automatic deletion scheduler.
Incidents, TTY sessions, artifact files, hash manifests and backups are preserved
until a human follows an approved evidence-retention policy. Their growth is not
bounded by logrotate. At 80% filesystem usage health emits MEDIUM; at 90% HIGH;
at 95% CRITICAL and root health stops nonessential PCAP. It checks separate mounted
evidence filesystems too. Investigate at 80%, before preservation runs out of space.
There is no automatic deletion of protected evidence or backups.

The durable event-location index at state/incidentd/event-locations.sqlite3 grows
with retained event IDs. It uses disk storage rather than an in-memory history,
and correlation-window pruning does not remove its entries. Include its storage
in capacity planning and preserve it with incidentd state during recovery. The
metadata backup archive excludes this state; see docs/OPERATIONS.md for the
backfill and recovery gates. Index retention is manual, like incident evidence.

For a larger HDD use dedicated mountpoints, copy while services are stopped,
verify hashes, edit .env, rerun bootstrap and review unit ReadWritePaths. Metadata
backups can optionally copy HIGH/CRITICAL evidence to SECONDARY_EVIDENCE_PATH via
`sudo bash scripts/backup.sh --copy-evidence`; it must be an existing mountpoint.
Every backup uses a fresh directory, checks copies, and never blindly copies the
entire live ring. Keep an offline/off-host copy; one disk is not a reliable backup.
