# HoneyTrace feature review and debugging — 2026-11-01

Reviewed baseline: `14ef5386206d0c0469142312a8f3672967985933`. Source changes are on `codex/feature-debug-20261101`; no merge, deployment, service, firewall or live capture action is included.

## Result and scope

The implemented local suite received source review, independent defect validation, targeted synthetic reproductions, minimal repairs and a separate conflict/regression review. Forty-one proposals consolidate to **39 distinct functional repairs or documented implementation gaps**. Automatic alert production delivery and nonloopback startup remain explicitly unsupported; their misleading activation claims were corrected.

The review mapped **37 feature families** across the private dashboard, equipment, sessions, capture upload, jobs, custody, leads, imports, mock intelligence, iMazing metadata, logs, decoy preparation, incident correlation, preservation, intel export, health, lifecycle, guard, backup, offline analyzers, reconstruction, qualification, packaging and CI. Four reconnaissance passes and nine source hunters covered133 active boundary/invariant units in two waves. Immediate post-wave critics and a different final critic accepted no remaining active source assignments. Covered means reviewed for the selected invariant, not proved secure.

The435 retained inactive React/Base44/Deno units remain outside this local-feature review. No active cloud console, scanner, hardware acquisition or new Milestone6 feature was implemented. Upstream source, AGPL notices, historical receipts and original evidence remain preserved.

## Review and debugging passes

1. Freeze the published baseline and map feature entrypoints, authority, data and test coverage.
2. Read implementation, callers, tests and current documentation in parallel; keep functional faults separate from security claims.
3. Independently challenge every functional proposal. Reproduce important state/data faults using tiny synthetic fixtures and the real local browser interface.
4. Apply the smallest complete corrections, with focused regressions. Preserve custody, hashes, unknown states, opt-in policy and containment.
5. Review the changed integration and analytical code independently. Correct newly identified unavailable-workspace startup and saved-observation conversion edges.
6. Run focused, full offline, browser and clean-source-install validation; publish only the review source.

All execution occurs inside a parent-controlled OS sandbox: external networking disabled, minimal environment, read-only source/tools, private finite scratch, CPU/memory/process/output/wall limits, and descriptor-checked promotion of declared result logs. Only synthetic evidence and isolated loopback traffic are used. No real incident records, installed privileged services, deployed network, credentials or hardware are tested.

## Functional dispositions

| Feature defect | Disposition | Main source |
| --- | --- | --- |
| A case opened between import and custody completion keeps a stale Overview | Corrected | `honeypot/scripts/phase10/jobs.py` |
| Rejected synchronous starts leave job directories or inputs outside history | Corrected | `honeypot/scripts/phase10/jobs.py` |
| An unavailable optional inventory blocks cases even with equipment set to unknown | Corrected | `honeypot/scripts/dashboard.py` |
| Two dashboards sharing a store can overwrite each other's job history | Corrected | `honeypot/scripts/dashboard.py` |
| Quick case-review status actions replace the current note with an empty note | Corrected | `honeypot/dashboard/app.js` |
| Saving settings during an existing refresh can leave the old policy displayed | Corrected | `honeypot/dashboard/app.js` |
| A dismissed modal operation can close a newer modal and redirect its user | Corrected | `honeypot/dashboard/app.js` |
| The multiline equipment description editor submits text the API always rejects | Corrected | `honeypot/dashboard/app.js` |
| Closed mobile navigation remains in keyboard and accessibility navigation | Corrected | `honeypot/dashboard/styles.css` |
| Focused equipment cards can remain visible after they stop matching the active filter | Corrected | `honeypot/dashboard/app.js` |
| Oversized decoy configuration returns the capture workflow's incorrect 64 MiB error | Corrected | `honeypot/scripts/decoy_profiles.py` |
| Settings can save a valid policy that the next read rejects | Corrected | `honeypot/scripts/phase10/policy.py` |
| A successful import can exceed the manifest inventory reader budget | Corrected | `honeypot/scripts/phase10/store.py` |
| Deployment guide still describes unapproved build-on-start and the old restart policy | Corrected | `honeypot/DEPLOYMENT.md` |
| Approved non-loopback startup is unconditionally rejected by the stopped-container validator | Claims corrected; strict loopback validator preserved | `honeypot/DEPLOYMENT.md` |
| PCAP recovery rejects correctly installed units when GID2000 has an existing different group name | Corrected | `honeypot/scripts/evidence_group.py` |
| Enabling alert configuration does not deliver the promised incident pages | Claims corrected; durable automatic delivery remains follow-up | `honeypot/docs/WAN_CRITERIA.md` |
| STIX export uses IPv4 types for IPv6 sources and references absent address objects | Corrected | `honeypot/scripts/intel_pack.py` |
| Quarantine diagnostics ignore the configured incident storage root | Corrected | `honeypot/STORAGE.md` |
| Qualification sweep and permission checks ignore configured evidence roots | Corrected | `honeypot/STORAGE.md` |
| Operations guide contradicts current idle-log and drop-rate health behavior | Corrected | `honeypot/docs/OPERATIONS.md` |
| Standalone diagnostic ingestion repairs invalid UTC offsets into invented times | Corrected | `sentinel-forensics/tools/ios_sysdiagnose/ingest.py` |
| DNS long-label findings display a range that includes unsupported short questions | Corrected | `sentinel-forensics/tools/evidence_lab/rules.py` |
| Source summaries lose radio times and can invert mixed-precision capture ranges | Corrected | `sentinel-forensics/tools/evidence_lab/analyze.py` |
| TCP packets rejected by header decoding can still generate supported-pattern leads | Corrected | `sentinel-forensics/tools/evidence_lab/network.py` |
| Analyzer CLI bypasses bounded regular-file loading for key and configuration inputs | Corrected | `sentinel-forensics/tools/evidence_lab/analyze.py` |
| Unsupported mapping thresholds pass configuration validation and fail only after full analysis | Corrected | `sentinel-forensics/tools/evidence_lab/rules.py` |
| Diagnostic export contract documents an obsolete parser version and incomplete statuses | Corrected | `sentinel-forensics/tools/ios_sysdiagnose/EXPORT.md` |
| Root health and unprivileged incidentd compete for one owner-private suite log | Corrected | `honeypot/scripts/operational_log.py` |
| Incident source-time bounds can exclude earlier or later retained events | Corrected | `honeypot/scripts/incidentd.py` |
| Artifact preservation selects a mutable pathname instead of the requested content version | Corrected | `honeypot/scripts/hash-artifacts.py` |
| Preservation treats a failed daemon-state lookup as permission to update evidence | Corrected | `honeypot/scripts/preserve-evidence.py` |
| Rate-limit suppression hides a failed alert delivery from health | Corrected | `honeypot/scripts/alert_bus.py` |
| Committed replay bypasses the normal correlation-state bounds | Corrected | `honeypot/scripts/incidentd.py` |
| Bundled-source notice understates the current Sentinel modifications | Corrected | `THIRD_PARTY_NOTICES.md` |
| A page cap below a whole cohort creates a continuation that cannot progress | Corrected | `sentinel-forensics/tools/evidence_lab/reconstruct.py` |
| Qualification can pass memory gates when process RSS was unavailable | Corrected | `sentinel-forensics/tools/evidence_lab/qualify.py` |
| WAN check refreshes source-fidelity evidence from an observation whose age was never checked | Corrected | `honeypot/scripts/wan_criteria.py` |
| Retrospective diagnosis can report a digest of bytes different from the report it parsed | Corrected | `honeypot/scripts/demo_capture_diagnosis.py` |

The STIX family/reference reports were merged into one repair. Adjacent valid-time intel cluster ordering and inaccurate anonymization labels were corrected in that exporter. Existing review notes, original packet/log records and retained failed-job evidence are not rewritten. Optional unknown sensor association remains usable when inventory is unavailable; explicitly selected sensors still require a valid inventory match.

## Verification

Validation results are recorded in [the review handoff](FEATURE_DEBUG_HANDOFF.md). Before-fix observations established note loss, stale case/modal/settings views, inconsistent focus/filter state, rejected-job debris, competing-manager history loss, save/reload limit mismatches, unsupported threshold preflight, incorrect analytical support/time ranges and promised empty continuations. Regression tests check the resulting behavior rather than copying implementation branches.

Qualification now reports process memory honestly: strict live RSS reads, bounded retries, separate parent/worker process samples and the analysis worker's own `ru_maxrss`. `capture-qualification/3` explicitly excludes descendants from the sampled process metric. Reconstruction retains its separate strict tree sampler; native TShark/real-dataset qualification is NOT TESTED here.

## Security disposition and limits

**Zero confirmed security vulnerabilities. Six source-grounded leads remain NEEDS VALIDATION**, each checked by one fresh candidate verifier and a different final-record verifier. They concern retained artifact scan work, sparse-file hashing work, incident exception isolation, host diagnostic read bounds/record isolation, and conditional quarantine output confinement. Effective deployed identities, ownership, quotas, supervision and consequential runtime effects remain unobserved. No severity or exploitation claim is assigned. Two additional ancestor-confinement review facts remain blocked. Functional corrections do not close these security leads.

The formal security-audit run is **incomplete**. Its [SKILL.md](skill://plugins_6ab3634387ec81919729f26fb2a8e67b/security-audit/SKILL.md) permits a completed run only when “all Phase 6 artifacts are written and both validators pass”. Both exact packaged validator resources failed retrieval. Explicitly noncanonical local schema/ledger checks passed; they are not represented as the required validators. Private audit records retain the exact blocked and out-of-scope dispositions.

Automatic approval review previously rejected privileged-file/quarantine redirected-write validation, poisoned timestamp/incident-record validation and privileged diagnostic-reader validation for possible cyber risk. Those actions and substitute proofs were not run. Existing owner configuration and routine observations are the remaining validation path; this source review is not deployment qualification.
