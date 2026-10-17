# Original October 16 source export

This document and `source-sync-manifest.json` describe the original export in
source-sync commit `633b29a7ddbc2696ca1b0d70beaf8771fd6c55ff`, based on local
`ee0b7e3cb11c57c9713681e33e395e4674e3a009` plus preserved uncommitted candidate
changes. The original candidate and frozen ZIP were preserved in place.

The original allowlist contained 198 candidate files. The export copied 194
candidate files and retained the public evidence-exclusion notice, for 195
application files. Generated reports, the historical source patch/test transcript,
and the private live-evidence narrative were excluded. Fourteen named Python
qualification sources under `honeypot/work/live-qualification/` were included;
other work outputs, captures, incidents, artifacts, secrets, live environments,
logs, credentials and backups were excluded.

The original source-sync manifest remains an unchanged receipt for that export.
It is not a checksum manifest for the subsequently integrated working tree, and
its workflow hash does not describe later GitHub Actions version changes. The
historical ZIPs, import manifest and application MANIFEST.sha256 also retain their
original meaning. Current code is identified by its Git commit and validated with
current behavioral, static, dependency and source-exclusion checks.

[Integration review](INTEGRATION_REVIEW.md) describes the reconciliation with
PR #14. Original snapshot verification remains available explicitly for an actual
copy of the original snapshot. The normal CI path checks immutable archives
separately from evolving source, while still enforcing the exact names and hashes
of retained qualification work sources from the original receipt.

**Beta BLOCKED; independent Stage 7 PENDING; daemon-reload HOLD.** Source
publication and passing offline checks do not qualify packet flow, continuity,
retained evidence, fresh installation, migration or release acceptance. WAN
remains unauthorized.
