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
