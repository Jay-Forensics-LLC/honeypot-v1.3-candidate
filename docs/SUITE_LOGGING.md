# Suite operational logging

HoneyTrace uses structured JSONL events across the operator CLI, dashboard HTTP
API, module settings, parser workers, import store, offline jobs, health checks,
guard checks and incident daemon lifecycle. Existing sensor, evidence and custody
logs keep their own formats and purpose.

Open **Diagnostics** to search recent operational events, filter their level or
component, inspect structured details and export a sanitized diagnostic report.
This works even while offline imports are disabled. HTTP operations carry a
correlation ID into their nested worker/store events. Jobs also carry safe job
IDs. Timestamps use UTC, with severity, component, fixed event code and applicable
status, count and duration fields.

The default host file is `honeypot/logs/system/host-suite.jsonl` relative to the selected
operator/runtime root. It rotates at 20 MiB and retains ten archives. New suite
files use mode 0600 and new directories 0700. Existing shared directory
permissions are preserved. Writers serialize append/rotation and reject file
aliases. Logging errors do not abort unrelated operator actions, but incidentd
refuses to start if its required private diagnostics sink cannot be written. The
Diagnostics status reports write failures instead of silently claiming success.

The incident daemon runs as UID 10001 and writes its operational events to the
separate private `logs/system/incidentd-suite.jsonl` sink. Its parser and daemon
errors use `parser-errors-incidentd.jsonl` and `incidentd-errors-private.jsonl`;
these files retain private ownership and permissions. Alloy reads these
incidentd-owned files under the matching service identity. In Diagnostics, select
**Incident daemon diagnostics** to read that sink explicitly. A reader without
the file owner's identity reports it as unavailable, except the explicitly selected
incidentd sink may be read by the privileged host operator. File modes are not widened.
Existing `suite.jsonl` logs are preserved and can be selected as **Previous
combined diagnostics** when the reading identity is permitted to access them.

Use `HP_LOG_LEVEL=DEBUG`, `INFO`, `WARNING`, `ERROR` or `CRITICAL` when launching;
the default is `INFO`. Unknown values use `INFO`. For example:

```sh
HP_LOG_LEVEL=DEBUG bash tools/launch-dashboard.sh --port 8765
```

When the selected runtime root belongs to another user or privileged tools, give
the unprivileged dashboard its own private log root:

```sh
bash tools/launch-dashboard.sh --log-root /private/operator-workspace
```

The dashboard and its nested operations then log beneath that root. CLI launch
events and separately invoked legacy tools use their selected runtime root.
No permission widening or automatic ownership change is performed.

## Data boundaries

The logger accepts a closed schema of structured metadata. It drops unsupported
fields rather than serializing arbitrary text. Session tokens, credentials,
HTTP headers/bodies, source paths, captured identifiers, evidence contents and
raw exception messages are excluded. Failures record exception types and fixed
error codes. Reading/exporting revalidates persisted rows through the same
schema, so a diagnostic export does not become a raw log download.

The viewer returns at most 200 newest events and scans at most 2 MiB across
active/rotated files. A selected level includes that severity and higher levels.
The truncation indicator distinguishes a bounded view from the complete history.
Retention is by rotation, not an automatic day-based deletion policy. Diagnostics
are operational history, not an evidence-custody ledger or a tamper-proof audit.

## Private management and decoy identities

Dashboard management is loopback-only, session-authenticated and restricted by
Host/Origin checks. Assets load locally, responses are not cached, the session
fragment is removed after login, and the HTTP Server banner is suppressed.

On **Honeypot → Decoy identity**, prepare a file-server or web-server profile,
review its complete configuration and hashes, and download the files. Profiles
change known hostname/node/banner presentation fields only. Ports, listeners,
enabled services, logging and containment stay intact. Preparation does not apply
the profile or restart services; normal target-specific deployment controls still
apply. These profiles reduce obvious labels, but protocol behavior and SSH
fingerprints remain detectable. There is no claim of an undetectable honeypot.
