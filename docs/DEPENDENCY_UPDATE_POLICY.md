# Dependency updates and merge checks

Beta remains **BLOCKED**, independent Stage 7 closeout **PENDING**, and
daemon-reload **HOLD**. Source tests do not establish runtime acceptance.

## Immediate source correction

PR #9 changed only the Grafana Compose fallback to 13.2.4. The example environment
and registry inventory still pinned 12.4.1. This follow-up holds the source fallback
at its previous 12.4.1 digest so all declarations agree while a Grafana 13 migration
and rollback are qualified. This does not downgrade a running instance or authorize
deployment. The actual live version is UNKNOWN; an operator must establish it
before any separately approved deployment or rollback.

The existing metadata backup intentionally excludes runtime state. The update
workflow now adds a separate private Grafana archive after confirming the container
has stopped. Before any metadata backup or stop, it checks that the inspected
Grafana container's working-directory label and state bind mount belong to this
checkout. It records the original immutable image identity, verifies SQLite
integrity, archives all regular state files and directories, checks every archived
file's hash, and rechecks the stopped container identity before pulling/building.
Archives and checksum receipts are created with mode 0600. These archives can
contain database credentials and stay excluded from Git.

Missing/ambiguous container identity, a different mount, a running/paused process,
symlinks, hardlinks, nonregular files, a nonempty WAL, invalid SQLite, copy failure,
changed state or archive mismatch stop the update. A failure after the stack has
stopped leaves it stopped for operator review. There is no automatic restart,
checkpoint, restore, cleanup or recovery on that failure path.

Archive verification is not restore acceptance. An isolated restoration drill,
version-specific migration test and reviewed rollback procedure are still required
before adopting Grafana 13. Grafana's [upgrade guide](https://grafana.com/docs/grafana/latest/upgrade-guide/upgrade-v13.0/)
describes the storage migration and need for a pre-upgrade database backup. This
change does not run a migration or restore anything.

## Checks that catch repeated errors

Run these source-only checks from the repository root:

```bash
python3 -B tools/check_dependencies.py
python3 -B tools/validate_baseline.py
```

The first checks the six image pins across `.env.example`, Compose fallbacks,
build arguments, Dockerfile defaults and `docs/IMAGE_REFERENCES.json`. Change these
declarations together. Registry observations such as platform digests and check
timestamps must be independently recollected; never relabel old metadata for a new
image. The second verifies unchanged historical ZIPs against their archived
receipts, checks current source separately, then runs regression, application and
static checks. It no longer treats an original import hash as a permanent hash of
evolving source. `docs/import-manifest.json` and historical ZIPs remain unchanged.

Dependabot uses the actual nested repository paths. Local build output tags are
excluded from registry checks. Automatic major-version image proposals are held;
major upgrades should use a dedicated PR with compatibility, migration, backup and
rollback evidence. Minor/patch updates also require review and passing checks.
OpenCanary's existing 0.9.10 requirement is now a pip manifest installed inside its
image, with pip coverage at `/honeypot/docker/opencanary`; no host pip install is
part of this change.

Dockerfile `ARG` image defaults, Compose build arguments, environment overrides,
APT packages and documentation metadata still need coordinated maintenance.
Dependabot is a proposal generator, not a runtime acceptance test.

## Proposed repository settings — NOT APPLIED

The inspected `HoneyWatch` ruleset contained an empty `required_status_checks`
array. Require the `offline-validation` GitHub Actions check and keep branches up
to date before merging. Review bypass permissions so routine merges cannot ignore
failed checks. These settings need separate approval and have not been changed by
this PR. Do not remove existing signature, linear-history, CodeQL or conversation
rules to make a PR mergeable.

Resolve an AI review thread after fixing and verifying its issue, recording why it
does not apply, or linking a consciously deferred issue. Resolving threads does not
fix code or replace a required check. Re-review the new diff after each merge.

The outstanding source-sync PR #12 changes overlapping operator and validation
files. Reconcile it with this fix before merging either PR; retain these safeguards
when resolving conflicts and rerun CI against the combined source. No acceptance
or private evidence should be published to make the source check pass.
