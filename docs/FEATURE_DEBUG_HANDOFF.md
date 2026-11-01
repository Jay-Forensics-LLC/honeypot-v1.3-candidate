# Feature debugging handoff — 2026-11-01

Review branch: [`codex/feature-debug-20261101`](https://github.com/Jay-Forensics-LLC/honeypot-v1.3-candidate/tree/codex/feature-debug-20261101).
Baseline: `14ef5386206d0c0469142312a8f3672967985933`.
Cloud source checkout: `/workspace/work/honeytrace-debug` (not a desktop path).
This branch contains source changes for review; it does not merge or deploy them.

[Download complete source ZIP](https://github.com/Jay-Forensics-LLC/honeypot-v1.3-candidate/archive/refs/heads/codex/feature-debug-20261101.zip)
· [Feature review and remaining limits](FEATURE_REVIEW_2026-11-01.md)

Extract the ZIP, open a terminal in the extracted folder containing `tools/`,
and run as your normal Linux user with Python 3.11+ and its SQLite module:

```sh
bash tools/launch-dashboard.sh --port 8765
```

Open the private session link printed in that terminal. In Settings enable
Sentinel Forensics, save, then choose Honeypot → Try a synthetic interaction →
Open case. The dashboard and local analyzer require no pip/npm install, Docker
or cloud service. Use [INSTALL.md](INSTALL.md) for saved data, updates and recovery.

## What changed

- Preserve saved review notes, unsaved dialog drafts and settings across async
  completion; refresh finalized evidence/custody while retaining draft edits.
- Keep equipment filters, counts, focus and mobile navigation consistent;
  accept bounded multiline descriptions and optional unknown sensor association.
- Lease the job workspace to one manager; retain unavailable-history fallback
  and clean only unadmitted input writes. Save policies and manifests within the
  same byte limits their readers enforce.
- Correct exact timestamps, radio summaries, DNS support, invalid TCP eligibility,
  configuration preflight, reconstruction continuation and memory reporting.
  Retain legacy record timestamp compatibility with strict original reconciliation.
- Separate operational logs by UID; bind artifact copies to content versions;
  repair STIX references/address families and chronological incident/intel ranges.
  Require confirmed stopped state before manual preservation and retain actual
  alert delivery failure through suppression.
- Honor supported storage/group settings, retain observation age and hash the
  report bytes actually parsed. Correct current documentation: automatic alert
  delivery remains unintegrated, and startup remains strictly loopback.

## Validation

Parent-controlled offline sandbox, synthetic data only, no external network:

| Check | Result |
| --- | --- |
| `python3 -B tools/validate_baseline.py` | PASS |
| `make -C honeypot test` |888 tests;7 skipped |
| `make -C honeypot verify` | PASS; behavioral rerun888; static14 PASS/5 NOT TESTED |
| Bundled EvidenceLab |443 tests;42 skipped |
| Bundled sysdiagnose |31 tests passed |
| Root source/tool tests |73 tests passed |
| Stage 7 offline tests |89 tests passed |
| Browser workflow and delayed-response checks |9 checks passed;0 console/page errors |
| Exact upstream tree and local overlay manifest | PASS; original upstream tree retained |
| Clean extracted source, Python site packages disabled |5 checks passed; native two-source case, custody and lead support |

The clean-source check used commit `93b31be` without Git metadata, launched from
another directory with a stale `HP_ROOT`, and completed the first synthetic case.
Only review documentation changed afterward.

The full suite caught and drove corrections for timestamp/reconstruction and
rule-version/dashboard integration mismatches. A separate source review also
corrected degraded job-storage startup and saved-observation conversion handling.

Native TShark/real-dataset qualification, privileged target operations, deployed
containment, live hardware and WAN exposure are NOT TESTED. Read the review for
six unconfirmed security leads, two blocked authority facts and the formal audit
validator limitation. Passing offline tests does not qualify a running target.

Milestone 6 portable case handoff/real-world validation remains future work.
