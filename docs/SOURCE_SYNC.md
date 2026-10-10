# Reviewed HoneyTrace source synchronization

This is a preservation checkpoint for review, not a production-qualified release.
Stage 7: **BLOCKED**. Stage 8: **BLOCKED / NOT TESTED**. WAN remains unauthorized.

## Provenance and archive preservation

The source was acquired from the clean local `master` working tree at
`538b3f550c4aa0a0c48cf550c081f97c527f8528`. That newer documentation checkpoint
supersedes the last observed `6c8ae61f822dce16d94742344dad901bcc714e76`.
The original repository has no remote; its branch, index and history are untouched
by synchronization. No staging files were copied or modified.

The existing complete Git bundle through `6c8ae61` passed `git bundle verify`:
SHA-256 `573201e9c54ea201404e14e9f519d06ed6ffea3fc53e503b98ece81bece53bdc`.
A separate complete bundle through `538b3f5` passed the same check:
SHA-256 `d5e82b0fd5116dba91585a789b3c302b93c89dee64241053c6cd46e92477b6f8`. Bundles and content/acquisition review records remain
local in `work/github-source-sync-hf2i8qk0/`, outside the published tree.

The separate synchronization checkout starts at the exact imported GitHub branch
`source-baseline/polish2-2026-10-10`, commit
`12606f7661adb144ccd32c90b987bb629205d897`. All 160 baseline blobs and the
baseline tree were verified. Local `master` history is not merged into it.
Application source remains under `honeypot/`.

Both original root archives and their checksum files are unchanged:

- `honeypot-v1.3-production-candidate-2026-09-30-polish2.zip`:
  `918badc9d84c81cbef12ac5262e812c86f0816db1384e676031569044ffa45e6`.
- `honeypot-v1.3-production-candidate-2026-09-30.zip`:
  `30bfa139a84ed32f01b3b95fd3546e257c8f4352a9e69714df65ae04536d6362`.

`docs/import-manifest.json` and `docs/SOURCE_BASELINE.md` retain the original
import history. `honeypot/MANIFEST.sha256`, image references and dated review notes
are historical archive records, not certification of this updated source.
The new `docs/source-sync-manifest.json` records exact current file hashes, sizes,
modes, local source origins, explicitly reviewed baseline differences, omissions
and the qualification-source allowlist. It supplements the archive record.

## Included source and excluded runtime data

Included: reviewed application and operator scripts, tests, detection rules,
Grafana assets, documentation, portable Compose/configuration/systemd templates,
and fourteen exact qualification-source paths. Configuration templates and
`.env.example` retain their reviewed loopback/WAN-off defaults; a live `.env`,
rendered configuration or deployment identity is never copied.

The qualification code includes the six retained policy/provenance helpers, seven
offline test modules and a constructed `synthetic_stage7.py` fixture. They support
`make stage7-test` and the current qualification imports. Historical deployment
and remediation entry points are retained as source for dependency/regression
review; no such entry point was executed. They still require separate operational
authorization and local private evidence. Do not run an older helper as a fresh
baseline or deploy it merely because it is present.

Three retained test modules previously read local runtime reports or staging
configuration. This snapshot changes only their fixtures to constructed data and
this checkout's portable Compose configuration. Negative checks for identity,
image/source, membership, CIDRs, bindings, guard, capture, WAN and evidence
changes remain enforced. The constructed fixtures do not prove a live restart.
Original local tests/helpers and their private evidence remain untouched.

Excluded from the extracted source: credentials/secrets, live configuration,
logs, captures, incidents, backups, generated reports, historical source copies,
and retained-evidence fixtures. Specifically omitted are
`honeypot/docs/validation-results.json`,
`honeypot/verification/RECOVERY_REVIEW_TEST_RESULTS_2026-09-30.txt`, and
`honeypot/verification/SOURCE_CHANGES.patch`. The imported
`honeypot/verification/LIVE_EVIDENCE_SUMMARY.md` exclusion notice is preserved
instead of publishing the local retained-data narrative. Original ZIP contents
remain immutable; these exclusions apply to the updated extracted source.

Paths/hashes in code and status documentation identify required local evidence;
the evidence bytes, acquisition reports and generated artifacts are not published.
The ignored source exceptions name exact reviewed files, not arbitrary work data.

## Offline validation and review

From the repository root, with Python 3 and the existing PyYAML dependency:

```bash
python3 -B tools/validate_baseline.py
```

This validates both ZIPs, original archive entries, the complete current source
inventory, explicit old/new hashes, executable modes, source exclusions and
Python/JSON/YAML/bash syntax. It then runs six checkpoint-validator regression
tests and, from `honeypot/`, `make stage7-test`, `make test`, and `make verify`.
Local verification returned exit 0: 6 checkpoint tests, 87 offline
Stage 7 tests, 259 application tests; verification repeats 259 tests and reports
16 static PASS / 3 NOT TESTED. Local stdout/stderr, exit codes and acquisition
UTC times are retained privately, outside this source tree. GitHub Actions uses
this same offline command; local results are not a claim that Actions passed.

New fixtures initially exposed a missing synthetic timing field and a mount
mutation that did not change the constructed value. Only the constructed fixture
was corrected; assertions were not weakened. Final verification passed after correcting the constructed data and recording
normalized source modes before computing the manifest. The new validator rejects changed/missing/extra files, unreviewed
work, live environment files, symlinks, traversal, binary content and unaccounted
changes to imported source. Content review accompanies these automated checks;
file extensions alone were not treated as evidence of safe content.

The first published snapshot failed Actions because a newly constructed fixture
was recorded with local mode `0664`, which Git checks out as `0644`. Its copied
source mode and manifest were corrected, and a regression now rejects modes
outside Git-representable `0644`/`0755`. Original source/evidence permissions were
not changed. Fresh-checkout validation is required for the correction.

No privileged/live tests, container operations, listener changes, packet generation,
firewall/routing changes, boot changes or deployment were performed for this
checkpoint. The three unavailable native/environment-dependent validation checks
remain NOT TESTED. Neither reconciliation nor offline test counts clear live gates.

## Offline Actions runtime

The workflow pins reviewed official `actions/checkout` and `actions/setup-python`
v6 commit SHAs. Both pinned action manifests declare Node.js 24, replacing the
Node.js 20 deprecation warning reported on the original v4/v5 actions. Python
3.12, the existing PyYAML pin, read-only repository permissions, disabled credential
persistence and the offline validation command are unchanged. The workflow hash
is recorded and verified by the source-sync manifest. This changes GitHub CI only,
not host services, deployment, application dependencies or boot policy.

## Remaining qualification obligation

The latest local reconciliation recorded `RECONCILED_CURRENT_SAFE` and postflight
PASS. It established current observation only. A complete, fresh seven-service
Stage 7 restart matrix, its formal baseline, exact retained packet/log/incident
proof and independent final integrity/preservation verification remain required.
No complete restart row is qualified. Historical host-reboot capture continuity
and the original incident-corruption cause remain UNKNOWN. Derivative recovery
is not original evidence, and damaged originals must remain unchanged.

The next qualification action is operator review of the private, hash-pinned
fresh-matrix handoff with current prerequisites; never resume the interrupted
baseline from this source clone. Stage 8 boot/recovery execution requires separate
authorization after Stage 7's complete acceptance set passes. WAN authorization
is a separate obligation and is not granted by this checkpoint.
