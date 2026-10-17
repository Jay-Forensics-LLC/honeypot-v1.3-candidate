# Archived source baseline and synchronization gap

This is a review baseline, not a deployment or production-readiness certification.

Current validation separates the immutable archive receipt from evolving source.
See [dependency update policy](DEPENDENCY_UPDATE_POLICY.md) for the current checks;
the original import chronology below remains historical.

## Provenance

Imported from `honeypot-v1.3-production-candidate-2026-09-30-polish2.zip`, 493,390 bytes, verified SHA-256 `918badc9d84c81cbef12ac5262e812c86f0816db1384e676031569044ffa45e6`.
Base branch: `HoneyWatch`; base commit: `4d5194c7a5e4ff748d64a528f6b95567ce72a058`; base tree: `d4fc4c28c96fd90d6ef05d4447d5c3e4db5fb321`.
The selected commit is dated September 30; the reported October 6 push date is not a source revision date.

The ZIP has 153 entries: 150 files under `honeypot/` and three empty evidence/output directories. Paths were checked for traversal, absolute paths, and symlinks before isolated extraction. Original executable modes were preserved. Both existing archives, checksum files, and the original root README remain unchanged in Git history and this branch.

`import-manifest.json` records each original and imported hash and mode. The archived `honeypot/MANIFEST.sha256` is historical and describes the archive, not the modified import. Do not use it as a current source integrity certificate.

## Scope and exclusions

No packaged `.env`, private key, PCAP, raw log, incident, backup, or non-example runtime state file was found. Credential-pattern review found synthetic test values, bait markers, and credential-handling code; no real credential was identified. This is a bounded source scan, not a guarantee that the unchanged private archives contain no sensitive narrative information. Keep the repository private.

The three empty output directories are omitted. `verification/LIVE_EVIDENCE_SUMMARY.md` is replaced with an exclusion notice so historical links resolve without importing the reconstructed live session details. Other dated validation reports, review prompts, and the historical source patch are retained as historical documentation, not fresh operational evidence.

The only test change passes a fixed September 30 UTC clock to both intel-pack calls. Without it, the redaction fixture ages out of the seven-day window, producing one failure among 63 tests. Runtime code is unchanged. Deployment configuration, `.env.example`, Compose, Dockerfiles, systemd files, and all other imported source bytes are unchanged.

## Validation

Run `python -m pip install PyYAML==6.0.2`, then from the repository root run `python -B tools/validate_baseline.py`.
The workflow checks the archive checksum, per-file provenance and executable modes, evidence/secret exclusions, Python/JSON/YAML/bash syntax, and the existing behavioral unit suite. It does not run privileged integration scripts or start services. When intentionally editing imported files in later work, review and update their `import_sha256` and status in the provenance manifest and adjust the explicit modification allowlist; never change their archive hashes.

Docker Compose, Suricata, Alloy, YARA, host firewall behavior, capture integration, and runtime health require separate target validation. A green source check is not live acceptance.

## Newer development comparison

At inspection, the accessible candidate repository had only `HoneyWatch`. Connected repository searches for `honeypot` returned this repository; `HoneyTrace` returned none. The isolated workspace contained no newer local HoneyTrace checkout. The user's Ubuntu host and `/home/joe/honeypot-v1.3-polish2/honeypot` are not mounted here. No file-level comparison to October 7 development was possible, and no newer changes were imported.

User-reported October 7 live-demo status: localhost FTP interaction, OpenCanary event normalization/classification, retained incident evidence, and matching Loki event passed; matching packet evidence timed out; overall demo failed; postflight stability was not checked. Original report and corresponding source are unavailable here. These are reported findings, not independently reproduced results. The packet failure does not establish whether capture, buffering, rotation, or verification caused it. Later local source and remediation remain unverified and unsynchronized.

## Safe synchronization checklist

1. Preserve the latest local tree in place. Record its Git HEAD, branch, status, tracked diff, untracked source inventory, tool versions, and validation timestamps. Preserve runtime evidence separately with restricted permissions and hashes. Do not upload `.env`, secrets, approval records, captures, logs, incidents, backups, or work outputs.
2. Fetch this branch into a new checkout or worktree outside staging. Never extract either ZIP over staging; never replace the live `.env` or change `DECOY_BIND`, protected subnet, bridge/interface settings, or deployment secrets from this import.
3. Compare the clean imported source with a reviewed, sanitized copy of local source. Review deletions and untracked scripts as well as tracked diffs. Explicitly inspect `work/live-qualification` for source scripts; that directory is ignored because it may mix scripts and live evidence. Move approved qualification code to a source-only directory in a follow-up branch, leaving reports and artifacts private.
4. Commit the reviewed local-source changes to a separate synchronization branch and document provenance. Preserve original import hashes; update current hashes only after review. Re-run offline tests and native configuration validation without starting or altering staging.
5. Preserve and inspect the October 7 failure report. Diagnose PCAP matching using capture interfaces, timestamps, closed-segment selection, buffering, and ring rotation before claiming success. Run a controlled end-to-end demonstration on the authorized target, retaining application-to-incident-to-Loki-to-packet correlation and postflight stability results separately.
6. Review the synchronization PR before any deployment. Keep archived historical passes distinct from fresh source checks and fresh live acceptance. WAN exposure requires its own existing approval and acceptance process; this source import grants none.
