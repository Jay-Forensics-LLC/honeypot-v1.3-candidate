# Current HoneyTrace source snapshot

The application under `honeypot/` is exported from local source commit
`ee0b7e3cb11c57c9713681e33e395e4674e3a009` plus its preserved uncommitted beta
acceptance, quickstart, PCAP template and qualification changes. The local branch
was `beta/2026-10-13-local-candidate`. This publication commit is a source snapshot;
it does not claim that those edits were committed in the original working copy.

The reviewed qualification patch is
`a7e9a630b2903796ab8120ab4cb2b394febc34c4a866e603e8c9e6e2fc103753`.
The source adds fail-closed module-inventory checks and synthetic qualification
fixtures; it does not install or execute its operational helper entrypoints.

## Source inventory and exclusions

The local allowlist contains 198 source files. This export copies 194 unchanged
candidate files and preserves the existing public historical-evidence exclusion
notice, for 195 application files. The generated validation JSON, historical test
transcript, historical source patch and private live-evidence narrative are
excluded from the candidate export. Their paths/dispositions are recorded in
[source-sync-manifest.json](source-sync-manifest.json).

Fourteen explicitly named qualification Python sources under
`honeypot/work/live-qualification/` are allowed. Other work directories, private
reviews, logs, captured credentials, incidents, artifacts, PCAPs, secrets, live
environment files and backups are excluded. `.env.example` and the WAN approval
example are templates, not live configuration.

Application contents, Git-compatible modes, byte counts and SHA-256 values are
recorded in the source manifest. The repository's offline validator and six
source-checkpoint regression tests reuse the versions already present on the
repository's diagnostic branch. The original import manifest and both September
30 ZIPs/checksums remain unchanged; they describe historical artifacts, not the
current source tree. The old application MANIFEST.sha256 likewise remains an
historical package receipt; use the current source-sync manifest for this tree.

## Validation and release limits

The source validator checks immutable historical archives separately from current
source hashes/modes, exact inventory, exclusions and syntax. It runs the source
manifest regression tests and the existing application/qualification/static targets.
No deployment, capture, listener, firewall or manager action is part of publication.

The local publication validation results are summarized in the pull request.
Native validators and target-runtime qualification remain separate from offline
source checks. An unavailable check is not a passing check.

**Beta remains BLOCKED. Independent Stage 7 closeout remains PENDING.
Daemon-reload remains HOLD.** Packet flow, continuity, retained-evidence acceptance,
the fresh supported installation and release acceptance are not established by a
GitHub push or passing source tests. WAN remains unauthorized. Existing historical
application documentation keeps its recorded chronology; this snapshot does not
rescore beta gates or update live staging.
