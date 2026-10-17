# Source and dependency-safeguard reconciliation

PR #14 consolidates the source snapshot from PR #12, commit
`633b29a7ddbc2696ca1b0d70beaf8771fd6c55ff`, with the dependency/backup safeguards
from `42972f0f2b3f80ca0754dba23762e4578e4350ac`. The default branch is not merged
or deployed by this work.

## Conflict decisions

The operator update workflow retains the latest candidate's startup changes and
PR #14's working-directory/mount checks and verified stopped-state Grafana backup.
The local-daemon ownership gate also runs before the update workflow can issue
its Docker inspection, stop, pull or build commands.
The requirements extraction remains pinned to OpenCanary 0.9.10, with the actual
nested repository paths used for pip coverage. Grafana's source fallback remains
held at 12.4.1 to match the existing example environment and image inventory.
This is not an instruction to downgrade any running instance.

The source validator preserves immutable archive checks and runs current-source
checks independently. The original export receipt is unchanged. Retained
qualification sources must have the exact explicit names, byte counts and hashes
recorded by that receipt; other work files and live data remain prohibited.
Historical snapshot verification retains its regression coverage but is invoked
explicitly rather than treating old snapshot hashes as permanent hashes of all
current code. Workflow checks enforce read-only permissions, non-persistent
checkout credentials and actual execution of the validator while allowing normal
GitHub Actions version changes.

The combined CI path runs dependency consistency, archive/source regressions,
synthetic Stage 7 tests, application tests and static validation. Both source
families are tested together. No original candidate edits or source archives are
modified by the integration.

## Restoration test scope

The new restoration tests create a real SQLite fixture database and plugin file,
create a private Grafana-format state archive through the actual backup code,
mutate the synthetic original, and restore the archive to a new private directory.
They verify the separate checksum receipt, each restored file's bytes, SQLite
integrity and the original SQL rows. They also reject a corrupt archive before
creating a restore directory and refuse to overwrite an existing directory.

The extraction helper is test-only. It is not installed as an operator restore
command. It does not overwrite a runtime path, set production ownership, start
Grafana or test Grafana's actual schema migration. Snapshot receipts continue to
say `RESTORE_NOT_TESTED` for their target context; a synthetic test result cannot
qualify every future archive.

Actual Grafana-version compatibility, service identities/ownership, production
configuration, supported-target restoration and v13 migration/rollback acceptance
remain **NOT TESTED**. The actual running Grafana image remains **UNKNOWN** here.
A separately approved disposable target is needed before those claims can be made.

## Review and merge controls

The repository rule was separately enabled on October 17 to require
`offline-validation` from GitHub Actions and testing against the latest base.
All other rules and the empty bypass list were preserved.

PR #12's review discussions remain the record of the original source findings.
Integration does not resolve comments, approve their suggestions, or prove the
underlying issues fixed. Incident recovery/resource bounds, runtime identity,
rotation acceptance and evidence-custody findings still need review. Keep the
integrated PR in draft until these findings and target qualification are handled.

**Beta remains BLOCKED, independent Stage 7 PENDING and daemon-reload HOLD.**
Packet flow, continuity, retained-evidence and release acceptance remain
unqualified. No host assessment, container operation, daemon change or deployment
was performed during this source reconciliation.

## Post-merge debugging of PR 14 — 2026-10-17

Reviewed baseline: `d01e5ec6b17fe01e6188420f043e27e822125e93`. Follow-up
tracking is in issues #16 (ingestion), #17 (runtime trust), and #18 (custody).
The original PR 12 discussions remain available; merging did not resolve them.

The follow-up candidate adds regression fixtures and these corrections:

- Inspect incident directories incrementally and validate the active directory
  before use. Metadata-only corruption is blocked; missing first-event metadata
  permits exact-ID replay. Damaged or unrelated orphan segments are preserved
  and new events go into a fresh segment rather than stopping ingestion.
- Use a bounded, stat-invalidated evidence offset/hash index. Decode at most one
  requested historical record instead of all previous payloads on each append.
  Cap aggregate incident bytes and index entries; roll full healthy segments.
- Republish normalized telemetry during checkpoint replay after metadata commit.
  Search telemetry remains at-least-once; evidence remains deduplicated.
- Compare tmpfs options, exact mounted static file sets/hashes, and immutable image
  IDs with reviewed source/provenance. A missing `state/images.lock.json` blocks
  runtime qualification. Never manufacture trust by copying unreviewed running
  image IDs into the lock; establish reviewed build/download provenance first.
- Check the capture process's executable identity, not only its argv.
- Reject a rotation without proof the old checkpoint reached the old file's final
  observed length. Preserved bytes alone do not establish completed ingestion.
- Require unchanged incident metadata hashes without new events; with new events,
  preserve identity, prior values, and monotonic severity/time/counters.
- Replace historical reconciliation assertions with unconditional checks, including
  optimized Python. `qualification-source-updates.json` pins the reviewed helper
  amendment against its original export hash; historical receipts remain unchanged.

These are source and synthetic-test results. Incremental startup inspection is
not an assertion that all retained history has already been inspected. Offline
fixtures do not certify current host identity, crash/power-loss durability, old
capture continuity, fresh target installation, or beta acceptance. No service,
Docker daemon, firewall, live capture, runtime file, or historical evidence was
changed. Independent Stage 7 remains pending; Phase 8 remains untested.

## PR 19 replay and migration correction — 2026-10-17

This correction follows reviewed head `489269b339d87204396572bac7d7c8c89da66ca8`
and addresses issue #20 plus the five reproduced PR 19 findings. Stable event
locations are reserved durably before evidence append and resolved before current
receipt-window grouping. Orphan metadata uses the retained normalized record;
metadata-committed replay republishes the incident summary before checkpointing.
Integrity diagnostics include safely available original hashes, and candidate
static-mount policy rejects bind/tmpfs masking and unreviewed source redirection.

Initial migration uses a durable, bounded inventory/inspection queue. Recognizable
complete-prefix/NUL-tail history is preserved and quarantined with original and
metadata hashes pinned; affected IDs cannot replay into another incident. This
retains healthy unrelated ingestion without accepting damaged records. Other
unknown damage blocks migration. Duplicate historical IDs preserve both locations
and block ambiguous replay. File/directory changes during migration block its
completion. Invalid locator state holds checkpoints and emits an integrity
diagnostic. See `honeypot/docs/OPERATIONS.md` for limits and recovery behavior.

The corrected application suite passes 415 tests; the unchanged separate Stage 7
offline suite passes 89 tests. `make verify` passes with 17 static categories PASS
and two NOT TESTED. A prior isolated verification reported a unit failure without
retaining its assertion; a subsequent diagnostic retained full output and passed,
as did the normal check targets. That earlier failure's cause remains unknown;
these results do not establish an explanation or power-loss acceptance.

This is a source correction for review. Issue closure, merge, deployment, current
host identity, actual mount/packet verification, independent Stage 7 closeout and
Phase 8 acceptance remain separate. No live operation or historical evidence edit
is performed by this patch. Other-session Stage 8 working-tree changes are excluded.
