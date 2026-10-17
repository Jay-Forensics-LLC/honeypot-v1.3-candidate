# HoneyTrace

## Current supervised beta acceptance — October 14, 2026 UTC

The first beta scope is frozen to operator-supervised, localhost-only use; new
features are deferred. The single [acceptance checklist](docs/BETA_ACCEPTANCE.md)
has 18 required initial-beta gates: **3 PASS / 4 FAIL / 11 NOT TESTED**. Release
disposition is **FAIL**; the deliverable remains an unverified source candidate.
Phase 8 and WAN have separate deferred gates and do not count toward those 18.

Implementation is pinned to 9ede54cb732182a396960f892d980780aff05bfc. The latest
retained application checks at that commit passed 302 tests and make verify;
native/live coverage remains separate. A fresh isolated replay at that same
commit passed without decoy traffic, with implementation/evidence hashes checked
independently. Seven clean-checkout qualification modules remain absent. Docker
API ownership, inactive PCAP and failed health/logrotate are demonstrated failures;
fresh live acceptance, current complete preservation, independent Stage 7
closeout and supported clean installation remain unqualified.

The latest operator read-only report was independently verified: stable known
unit/file/process identities and empty jobs, plus eight restricted-input hashes.
It does not clear live acceptance or prove the effects of future generator runs.
Daemon-reload remains **on HOLD** for global definition/generator review, missing
runner policy coverage, dispatch revalidation, partial-failure preservation,
reviewed recovery semantics and specific approval. No reload was executed.

On resume, the restricted Codex session reports a kernel boot ID different from
the last privileged operator report. That does not refresh target service state;
the prior observations remain historical and current-boot reconciliation is
pending. The checklist links the narrow observation and its limitations.

Priorities: resolve the reviewed Docker recovery prerequisites and prepare its
smallest separately approved action; verify fresh guarded live acceptance and
Stage 7 closeout; make required qualification tooling portable and validate a
current package/fresh supported installation. Original master, staging, reports,
evidence and the older package remain preserved. No deployment or publication.

## Historical beta preparation — October 13 local / October 14, 2026 UTC

**v1.3.0-beta.1 is an unverified private source candidate; release BLOCKED.**
See [acceptance and progress](docs/BETA_ACCEPTANCE.md) and
[source quickstart](docs/BETA_QUICKSTART.md). Work is isolated on
`beta/2026-10-13-local-candidate` from frozen `2054c4f`; master and staging are
unchanged. No deployment, push, release, traffic or host-policy change occurred.

Native host inspection confirms two active daemons (system PID 2756, Snap PID
4847), inactive PCAP, and current boot `311d16db-a3bd-4966-b961-75f0b50d67f1`.
The exact Docker CLI error is permission denied: native joe cannot access
root:docker 0660. This is an agent inspection failure, not HoneyTrace/Python SDK
failure or a successful zero-container inventory. A subsequent privileged
read-only acquisition succeeded and its hash was independently verified:
`db1f31709e01303a784e7f31c267dcbf4b4a000146827f397b47686c024daf92`.
The pathname API reaches Snap `/var/snap/docker/common/var-lib-docker`, zero
containers, server 29.8.0/API 1.56. System containerd retains the exact seven
original running task IDs and persisted staging ownership in `/var/lib/docker`.
Health/security/capture are still unqualified; no service changes occurred.

Source-only fixes add bounded ownership diagnostics and fail-closed startup/demo
gates, and finite CLI log reads with honest idle/unavailable states. Final
`make test` passed **298 tests**, exit 0; `make verify` passed, exit 0,
with static **17 PASS / 2 NOT TESTED**. Isolated real-engine replay PASS,
including reload deduplication; Loki and packets explicitly NOT TESTED.
Context precedence and version/error handling have negative-case coverage.
The clean-checkout retained
`make stage7-test` is BLOCKED,
exit 2, because seven ignored test modules/helpers are absent. Do not reuse old
counts to qualify this candidate. Final validation/package evidence is retained
in the private beta preparation bundle, outside source control.

Independent Stage 7 closeout remains PENDING. Seven historical operator restart
rows passed on another boot; no current handoff is issued. Stage 8 NOT TESTED,
WAN unauthorized, historical gaps and corruption/power-loss cause UNKNOWN.
The earlier statuses below remain historical observations.

Current Prototype Version: local-demo slice 0.3, based on v1.3 polish2

Date: 2026-10-10 UTC

Preservation Checkpoint: `d3105257d1eba8ee3e36238de3f5aa84378450b7`

The existing development changes, including incidentd/evidence durability work,
are preserved in a local source checkpoint; nothing was pushed or deployed.
The prototype has **working replay and a verified operator-run guarded localhost
FTP demonstration**. Production qualification remains incomplete; this is not
an Internet-exposure certification.

## Current Phase 7 disposition — seven restart rows passed; closeout pending

The operator's `stage7-fresh-ewnrhtur` report records **Stage 7 PASS**, all seven
restart rows PASS, postflight PASS and exit 0. Its Stage 8 gate is
`READY_FOR_OPERATOR_DIRECTION`; Stage 8 execution remains **NOT TESTED** and
separately authorized. **Independent closeout is pending protected packet and
evidence reads; a verified Stage 8 handoff has not yet been issued.** WAN remains
unauthorized. Do not rerun the completed restart matrix.

The locally hash-verified report is
`work/live-qualification/stage7-fresh-ewnrhtur/report.json`, SHA-256
`97bee3ef001e17c0c65b376cf472ea183fff5ce6e37db6c938278dcf50fcbdbc`.
The formal baseline SHA-256 is
`35d4ee88fbb460c22085dae858b204cdfede5a0d98e7e045d4b2ac811661e9d2`;
it was acquired at **2026-10-10 06:38:38 UTC**, on boot
`67a93065-7f07-40e5-aa12-806d9ff14dcc`, qualified source
`1a2b8c73106763d824999091c4e56c64f061f59e`. The matrix ran from
**06:38:38 to 06:47:48 UTC**. These observations describe that completed run,
not a new current runtime inventory.

Independent non-root verification passed for the full linked rows in approved
order: OpenCanary, Cowrie, Suricata, Alloy, Loki, Grafana and incidentd. Each row
contains all 11 mandatory PASS checks. Container/image identities, unchanged
boot and security properties, intended target lifecycle changes, bounded
recovery, metadata/count/dedup/custody/offset relationships, eight exact
raw/normalized/incident/classification/Loki links, and final postflight
observations were checked. Hash-pinned implementation still matches the
executed offline validation: 42 focused, 87 retained Stage 7, 275 application
and 7 handoff tests. No old failed row was combined with this matrix.

The runner's final evidence sweep covered **1,183/1,183 incidents**:
**284,951,608 bytes planned / 284,953,028 bytes read**, with accounted growth,
within the unchanged 512 MiB allowance. Preservation verified the baseline's
**1,174 incidents and 22 log prefixes**, event counts, offsets and custody.
The final recorded capture PID/start identity stayed **35114 / 238919**, on
both decoy bridges; hp_guard fingerprint stayed
`7d71bbf63586343b61d6ccf80bfe2fe99c3235df6d438531fcf900f65eec1ddd`.
Seven services were healthy, restart counts stayed 0, WAN was disabled, and
the historical original and separate recovery/provenance checks passed in
the retained run. Eight uniquely marked packet proofs are linked by hash.

The agent independently verified the metadata and artifact links, but a direct
read of the protected capture was denied. Its narrow `sudo -n` verification
attempt returned **interactive authentication required**, exit 1. Packet bytes,
offline parser matches and current finite baseline-prefix verification are
therefore **NOT TESTED by the closeout verifier yet**. This access boundary is
not evidence of capture failure and does not alter the original PASS report.

Private closeout preparation and preserved acquisitions:
`work/stage7-verified-completion-phaovlwf/`. Metadata verification report SHA-256:
`88f92bab6e88ee19fdb432a8938fcae3d6e53778d8f8f031d054b1b5ba5f2161`.
**Exact next action:** run DEMO.md's single read-only privileged completion
verifier, retain its report/hash/exit code, and independently inspect the result.
It never restarts services, generates traffic or executes Stage 8. Historical
capture gaps, corruption cause and power-loss durability remain unresolved;
recovery remains derivative evidence. No deployment or security-policy change
occurred during this closeout preparation.

## Historical Phase 7 disposition — classification verifier repaired

**Phase 7 is the implementation's Stage 7. Stage 7: BLOCKED.
Stage 8 eligibility: BLOCKED; execution: NOT TESTED / separately authorized.
WAN remains unauthorized.**

The operator's `stage7-fresh-u4vb87q6` run failed after OpenCanary restarted and
recovered. Its baseline was acquired at **2026-10-10 05:23:33 UTC**, boot
`67a93065-7f07-40e5-aa12-806d9ff14dcc`; SHA-256
`732c43897cd64ee41f34b626563286b2b3a6f8af3171ad0c43853661ee3dbf52`.
Fresh prerequisite coverage was **1,149/1,149 incidents**, **282,575,558 bytes
planned/read**, within the unchanged 512 MiB allowance. These are that run's
observations, not today's current inventory.

The immutable FAILED report SHA-256 is
`cf23d6b6460e88fb8d483d92298b752a65883bbea62996b43f9720e0b7f94ed4`.
Only OpenCanary restarted; identity, configuration, runtime comparison and its
row postflight passed. The probe failed because the harness required LOW, while
the correct event severity was MEDIUM. The six later rows did not run.

Retained raw/normalized/incident records prove the exact probe was the third
distinct service in its correlation group: `firewall`, `failed`, `ftp`. That
meets the configured service threshold of three. The auth count at that event
was one; the containing incident's HIGH aggregate severity is separate.
The exact FTP username was also found retrospectively in packet frame 33,
TCP stream 0, from `172.29.41.1:47758` to `172.29.41.2:2121` at
`1791609881.295612578` epoch seconds. Its retained 8,032-byte segment hash is
`73ee6078d0301eb374abeaefb241b4cd09727f16c99bbec02eea3bf0cd5c3242`.
Independent offline parsing passed. This does not qualify the incomplete row.

The original outer postflight failed against a stale pre-restart anchor and
discarded its observation on the comparison exception. Its historical result
remains FAILED. Future failed comparisons retain their observations; a verified
target lifecycle can anchor final safety checks without qualifying a failed row.
Source-only repairs now derive exact LOW/MEDIUM expectations from hash-pinned
rules and receipt-order history, retain early probe failure diagnostics, and
independently recheck classification alongside the mandatory packet evidence.
Wrong source/service/severity, altered rules, missing packets and unrelated
runtime/security drift remain rejected. No incidentd deployment is required.

Current offline validation: **42 focused tests**, `make stage7-test` (**87**),
`make test` (**275**), and `make verify` all pass, exit 0, no unit-test skips.
Static validation: **16 PASS / 3 NOT TESTED** (native Suricata, native Alloy,
Ubuntu live integration). The initial targeted failures were retained and fixed:
an interruption flag had to survive anchor rejection; a test's mocked rules
reader incorrectly intercepted its private artifact read.

Private preservation/diagnosis: `work/stage7-classification-repair-epbyx9vc/`.
Diagnosis SHA-256:
`8f966d90507b7bb3fd5c6cd0e78e949b99e56dd2ccaf3af3070d557b82a3d9a1`.
Original failed reports, source checkpoint, adjacent captures and matching
incident records are preserved locally; no retained data is staged for Git.
Current privileged reconciliation and a complete new matrix remain required.

**Exact next action:** the new command in DEMO.md first reconciles this failed
run read-only, verifies current complete evidence/preservation and stable safety,
then conditionally establishes a new baseline and runs one full seven-service
matrix. It never resumes or combines old rows. Stage 8 remains blocked until
all rows and final independent verification pass. Historical corruption cause,
power-loss durability and reboot capture gap remain UNKNOWN; recovery remains
a separate derivative. No staging deployment or security-policy change occurred.

## Historical Stage 7 disposition — verified reconciliation

**Stage 7: BLOCKED pending a complete fresh restart matrix.
Stage 8: BLOCKED / NOT TESTED. WAN unauthorized.**

The operator's read-only post-interruption reconciliation passed at
**2026-10-10 02:41:24–02:41:34 UTC**, exit **0**, with **postflight PASS**.
Locally verified report:
`work/stage7-interruption-repair-sh46ipi2/current-reconciliation-16xzlj7t/report.json`,
SHA-256 `689d434c0085fcb5a8d8971f0d905f09fbc89756e64050866917d806db59d2dd`.
All seven services were running/healthy, with restart counts 0, unchanged
container/image identities and no unexpected runtime differences. OpenCanary's
health logs show successful checks and the actual configured 60-second interval.
Its current healthy state does not establish the interrupted run's recovery time.

The full sweep covered **1,099/1,099 incidents**, **278,394,548 bytes planned/read**,
within the unchanged 512 MiB allowance. Every acquisition entry was independently
accounted for. Only the pinned historical damaged original remains; its hash,
separate derivative recovery and raw/rotated-normalized provenance passed.
Preservation passed for the interrupted baseline's **1,093 incidents**, **22 logs**,
event counts/deduplication, ingestion offsets and custody hashes. The six additional
incidents were included in the current full integrity sweep. Exact historical Loki
ingestion, routes, mounts, bindings, configuration, permissions/quarantine,
stable second observation and postflight passed.

Boot ID stayed `67a93065-7f07-40e5-aa12-806d9ff14dcc`. PCAP PID **35114**,
start ticks **238919**, both decoy bridges, finite ring, fresh output and storage
passed. hp_guard fingerprint stayed
`7d71bbf63586343b61d6ccf80bfe2fe99c3235df6d438531fcf900f65eec1ddd`.
WAN was disabled. Only the interrupted OpenCanary restart's documented start,
endpoint ID and unconfigured MAC differed from that baseline; network IDs,
assigned IPs and security/configuration fields stayed strict.

Nine reconciliation/validation artifacts were copied into
`work/stage7-verified-reconciliation-pk9919s3/` with acquisition times, hashes and
private permissions. All three retained capture copies were locally rehashed.
They remain potentially incomplete historical prefixes, not restart probe proof
or uninterrupted capture certification. No traffic or runtime mutation occurred.
The source-only repair's tested implementation still matches its hash-verified
validation artifact; documentation changes do not deploy it into staging.

**Next action:** explicitly direct one fresh matrix using
`work/stage7-verified-reconciliation-pk9919s3/run-stage7.sh --execute-restarts`.
The wrapper pins the clean checkpoint, this reconciliation, acquired prerequisites
and unchanged tested implementation. It requires a new full live prerequisite
review and stable formal baseline before the first restart. `--baseline-only`
performs read-only baseline acquisition. Neither mode resumes the interrupted
checkpoint; no failed restart/traffic step is retried automatically. Health may
wait up to the existing 150-second deadline per row; WAIT messages show progress.
Ctrl+C records ABORTED/exit 130 and attempts bounded read-only postflight.

No complete matrix row is qualified yet. Historical interruption-time postflight,
original corruption cause and reboot capture gap remain unproven; derivative
recovery is not original evidence. Stage 8 boot/recovery execution still requires
separate authorization after all seven Stage 7 rows and final verification pass.

## Previous interrupted-retry diagnosis — historical

**Stage 7: BLOCKED. Stage 8: BLOCKED / NOT TESTED. WAN unauthorized.**
No complete restart row is qualified. The latest attempts are preserved separately
in `work/stage7-interruption-repair-sh46ipi2/`; original artifacts are unchanged.

- `stage7-fresh-n_yzcw83`: BLOCKED before any restart. Its fresh review verified
  1,093/1,093 incidents, 277,751,582 planned bytes and 277,760,173 acquired bytes.
  Postflight passed. The runner incorrectly required the planning estimate to
  equal the later stable-read total. The exact files responsible for the 8,591-byte
  difference were not recorded; append-only growth is plausible, not established.
  Report SHA-256: `c2c1678b9fa1e652e6b2da5f3330e7f54e25c7528db75165f821fa44b361ec7a`.
- `stage7-fresh-daver7kb`: interrupted with Ctrl+C, exit 130, during OpenCanary
  health recovery. Baseline SHA-256:
  `f47bd35487d2b6f0d0bd97f823346fbb9e00835abc6fb4b755d3323b50df602e`,
  boot `67a93065-7f07-40e5-aa12-806d9ff14dcc`. The old runner did not retain a
  final row/report on interruption. Historical postflight, bounded recovery and
  probe results are NOT TESTED; this baseline must not be resumed.
- `stage7-fresh-ngrosf75`: BLOCKED before any additional restart, with a failed
  postflight. Its sole runtime problem was OpenCanary `starting`, about 45 seconds
  after the interrupted restart. The hash-verified baseline records a 60-second
  health interval. A persistent service failure is not established. Other six
  services, containment, disabled WAN and capture identity passed that observation.
  Report SHA-256: `b1e62367da57f1d0cb395ea6f27d1af924dd09eafdfc39999d3d054edfda75c6`.

Focused source-only fixes now account for every incident's planned/acquired bytes
and accept fully verified, bounded growth without requiring equal estimates.
Incomplete coverage, unstable reads, shrinkage, defects and exceeded allowances
still block acceptance. The 512 MiB aggregate, 16 MiB event, 1 MiB metadata,
4,000-incident and 120-second prerequisite limits are unchanged.
Ctrl+C records ABORTED/exit 130, restart intent/response and recovery observations,
attempts bounded read-only postflight and stops further restart/probe work.
The 150-second health deadline is unchanged; progress messages show the wait.
These harness repairs require no staging deployment or service-policy changes.
Offline verification: 26 qualification tests and 28 recovery-review tests passed;
`make stage7-test` 87 PASS, `make test` 259 PASS, `make verify` 259 unit tests
PASS plus 16 static PASS / 3 NOT TESTED; all commands exited 0. Runtime validation,
WAN exposure, automatic boot and guard-delete qualification were NOT RUN.
Validation: `work/stage7-interruption-repair-sh46ipi2/validation.json`, SHA-256
`55571070757e35d2e947bcb934f913a4a3f0a8a2f5785e52a20462479ba8a99c`.

**Previous next action, now completed by the reconciliation above:**
run the read-only `reconcile-interrupted-run.py` command in
DEMO.md. Existing noninteractive sudo failed with interactive authentication
required, so current health, protected capture preservation and live reconciliation
are NOT TESTED in this session. Do not rerun the old retry wrapper. Only a passing
reconciliation followed by a new tested baseline can precede another explicitly
directed matrix. Historical corruption cause and reboot capture gap remain UNKNOWN.

## Earlier Stage 7 verification — historical

**Stage 7: BLOCKED pending an explicitly directed fresh matrix.
Stage 8: BLOCKED / NOT TESTED. WAN unauthorized.**

The operator's read-only reconciliation passed at **02:08:29–02:08:39 UTC**,
exit **0**, with **postflight PASS**. Locally verified report:
`work/stage7-restart-response-repair-hp852b0v/current-reconciliation-xqhl03ki/report.json`,
SHA-256 `4f91698616305c32c5bebc30c7bf40d6861449a94b557ee2cbf341d2c01b15ef`.
All seven services were healthy, with restart counts 0 and unchanged container
and image identities. Relative to the failed-run baseline, only OpenCanary's
intended start, endpoint ID and unconfigured dynamic MAC changed. Network IDs,
IP addresses, bindings, mounts, execution configuration and containment remained
strictly unchanged. PCAP PID **35114**, start ticks **238919**, both decoy bridges,
fresh output and storage checks passed; the boot ID remained
`67a93065-7f07-40e5-aa12-806d9ff14dcc`. WAN was disabled.

The current complete sweep scanned **1,089/1,089 incidents**,
**277,505,991 bytes planned/read** within the unchanged 512 MiB allowance,
with only the verified pinned historical defect. Preservation comparison passed
for the baseline's 1,081 incidents, 22 logs, event counts/deduplication, ingestion
offsets and custody hashes. Current newly created incidents were included in the
full 1,089-file sweep. Recovery/provenance, routes and exact historical Loki event
checks passed; stable second observation and postflight showed no further drift.
Three preserved capture copies were independently rehashed locally. They remain
potentially incomplete historical prefixes, not proof of restart test traffic
or uninterrupted packet capture. No traffic or runtime mutation occurred.

This clears the current safety blocker, not the failed qualification row:
its bounded recovery time and synthetic packet/telemetry checks were never
completed. The repair remains source-only. Reconciliation copies, original hashes
and acquisition times are preserved in `work/stage7-reconciled-retry-odclc246/`.
The next matrix must acquire a new formal baseline on the tested clean source.

The first fresh restart matrix stopped on OpenCanary at **01:48:31 UTC**.
The actual Docker command returned exit 0 and the retained postflight shows the
same full container and image IDs with a new start timestamp. Qualification
failed before its health-recovery loop: the installed Docker 29.1.3 CLI prints
the deprecated `--time` warning to stdout, which the runner compared in full
with the container ID. This mechanism was reproduced using `--help`, without
contacting the daemon or generating traffic. The original restart stdout was
not retained, so its exact bytes remain unknown.

The unchanged FAILED report is
`work/live-qualification/stage7-fresh-1mbqjtep/report.json`, SHA-256
`5127e173f9760fd88056efa058fdabd2b4bd344dbff407ceef37e56d633511fb`.
No synthetic probes ran; the other six restarts were not attempted. The original
postflight saw OpenCanary `starting` less than a second after restart; it is
**FAILED**, not proof of a persistent recovery failure. Its firewall validation,
WAN-off state and two-bridge capture identity still passed. The separate
reconciliation above supersedes the pending current-health check;
it does not change that original FAILED postflight. No automatic restart or
traffic retry has been performed.

The hash-verified formal baseline is `stage7-fresh-1mbqjtep/baseline.json`
under `work/live-qualification/`, SHA-256
`3e7f646dec47d2f53e2f97a5df3e2e1432aadb2a9a8b8fe2d199f99058ac4a1e`,
boot `67a93065-7f07-40e5-aa12-806d9ff14dcc`, tested source checkpoint
`8f08ebf9b8ca8603b3d42e82c7d4b5739c093ec9`. Its fresh prerequisite inventory
scanned **1,081/1,081 incidents**, **276,944,209 bytes planned/read**, with a
stable second runtime observation. It is historical after the attempted restart
and must not be reused for a new matrix.

The focused source-only repair uses `--timeout`, retains bounded stdout/stderr,
exit/timeout diagnostics, and requires exact command/response proof in the final
matrix acceptance check. Full container/image/network/configuration identity,
containment, evidence and packet requirements remain strict. No staging source,
service policy, firewall, binding, credential or boot setting was changed.
Repair validation at **01:57:53–01:58:00 UTC**: `make stage7-test`
**87 PASS**, `make test` **250 PASS**, and `make verify` **250 unit tests PASS**
plus **16 static PASS / 3 NOT TESTED**; all exits 0. The 19 targeted qualification
tests passed, including the actual installed-CLI warning reproduction. Syntax
and diff checks passed. Runtime validation, WAN exposure, boot startup and the
guard-delete drill were NOT RUN. The repaired live restart matrix remains
NOT TESTED. The subsequent privileged
reconciliation passed as recorded above; a source repair is not a live PASS.
The hash-verified validation artifact is
`work/stage7-restart-response-repair-hp852b0v/validation.json`, SHA-256
`75957bbe7bb4ffb3717a873a52652fe6225aa6db3e282d4271450be2fad034ba`.

Private preservation and diagnosis:
`work/stage7-restart-response-repair-hp852b0v/`. All six failed-run artifacts
were copied with acquisition times, byte sizes and hashes. The CLI reproduction,
pre-change source, test outputs and a read-only reconciliation helper are retained
there. Original reports and damaged evidence remain unchanged. Sensitive artifacts
stay out of Git. The helper preserves available adjacent capture segments before
the full integrity sweep and labels potentially active copies incomplete rather
than claiming atomic capture continuity.

**Historical next action, superseded by the interrupted retry above:**
explicitly direct one fresh seven-service matrix using
`work/stage7-reconciled-retry-odclc246/run-stage7.sh --execute-restarts`.
The wrapper pins the clean local source checkpoint, verified reconciliation and
current validation, then requires another full prerequisite scan and stable new
baseline before any restart. It stops at the first failed row and does not retry.
Calling it without an explicit mode does nothing. `--baseline-only` is available
for a read-only baseline. The old
`work/stage7-fresh-preparation-495g94iv/run-stage7.sh` must not be rerun unchanged.
Neither the reconciliation nor this preparation clears Stage 7 or Stage 8.

The original corruption cause and historical reboot capture gap remain UNKNOWN.
The pinned damaged original is write-blocked and its verified derivative recovery
is separate evidence. Current process-restart preservation/deduplication still
requires the full matrix. The separate supervised boot qualification is described
in [Stage 8 handoff](docs/STAGE8_HANDOFF.md); it remains blocked by Stage 7 and
requires separate operator direction.

Earlier observations below are historical.
The prior Stage 7 checkpoint remains invalidated by host reboot. The operator
completed one guarded live demo below. No restart, service start, deployment or
Stage 8 execution was performed in this closeout.

### Guarded live demonstration passed — October 10, 00:45:36 UTC

Locally verified the operator-run `work/demo/run-irv_hi81/report.json`, SHA-256
`be680acbf866dbbef9b8c4df31c0338a9678131ce6ba3b6dca30be3e07787a2d`.
It records **PASS_LIVE**, including fresh safety/storage/capture gates, one
localhost FTP interaction, matching raw and normalized telemetry, classified
incident evidence, the exact event ID in Loki, retained packet proof and
**postflight PASS**. No second interaction was generated during this closeout.

Synthetic marker: `honeytrace-demo-63cb1f813cf54ad7b6802fe02cc80a16`.
Event ID: `17d6f0d8c1af3470ce73298b90d5ddd5ee639436802c5b45a180a0e7ed4b602b`.
Incident: `672211b631bf17b0fbee716b-0000`. The FTP event is LOW; its containing
correlated incident is HIGH and includes another record. Only the matching event
is labeled synthetic. Exact readable source/normalized records and retained
evidence were independently matched, including canonical record SHA-256
`d5b6806b1d37e8b6016a9a3f02d84a8fd8c7aa4da47f977e1e8f99add349fe52`.

The demo's packet verifier records the unique USER marker directed to
`172.29.41.2:2121` at 00:45:37.490606 UTC. Its 3,792-byte retained snapshot is
`work/demo/run-irv_hi81/capture-match.pcapng`, reported SHA-256
`8addc8592c727be99340ccfbae46e2b2fd1fffc8bcab5ce3b37d34611d2ad059`.
The protected original is present outside the rotating ring. The operator
subsequently supplied **two independent `sudo sha256sum` results**, both matching
this recorded hash. This completes retained packet-integrity confirmation for
the guarded live demo. Direct packet rehash and offline parsing by this Codex
session remain **NOT TESTED** because access requires operator authentication;
the operator's command outputs are recorded as operator-supplied evidence.
Execution times for those two commands were not supplied. Permissions were not
broadened, and the original demo report was not modified.

Source hashes match the tested implementation checkpoint
`80aab296c48478f942a6e20ddaa74f65efcb3dd3`. The readable pre/post manifests
independently compare without runtime/security drift. All seven services were
healthy; WAN remained disabled and capture identity was stable. No new source
implementation or tests were changed; this closeout preserved evidence and
updated documentation. Restricted backup/acquisition details:
`work/live-demo-closeout-oibsa5is/`.

Linked packet-integrity confirmation and documentation checkpoint:
`work/live-demo-hash-confirmation-gyflu16g/confirmation-report.json`.
The earlier closeout report remains unchanged; its pending rehash status is
superseded by this separate confirmation.

**Single next action:** perform a read-only review of a fresh Stage 7 baseline
before its separate controlled restart matrix. Stage 7 and Stage 8 stay BLOCKED.
Historical capture continuity remains UNKNOWN, and the original incident-corruption cause
remains an evidence-durability obligation. The October 7 FAILED demo and its
missing historical postflight remain unchanged.

### Active prerequisites complete — October 10, 00:27:48 UTC observation

Verified `stage7-recovery-review-rrewlyrh/report.json` against SHA-256
`2349438d2541e64463aa3f206b544535eef71ddf7d70243b5fbfdbc22c58e852`.
It returned **ACTIVE_PREREQUISITES_PASSED**. All **1,054 inventoried incidents**
were scanned, accounting for **274,872,352 bytes**. The only accepted defect is
the unchanged pinned historical original; its recovery bundle and exact
normalized/raw provenance passed. No additional malformed/NUL/count/ID defects
were reported within this sweep's scope. The cause of the historical damage
remains unresolved; recovered records are not original evidence.

All seven services were healthy with restart counts zero. Expected loopback
bindings, network placement, containment and deployed pipeline source hashes
passed. WAN was off. PCAP was active on both expected decoy bridges. The second
runtime observation at 00:27:52 UTC and comparison passed with no differences,
including capture identity. Historical capture continuity remains UNKNOWN.
This clears the rotation and aggregate-budget inspection barriers for the
recorded observation; it neither establishes a formal new baseline nor qualifies
Stage 7 or Stage 8. The old checkpoint remains invalidated by reboot.

Implementation checkpoint: `8a5213d432ae32c385dd2d18dd8930ec816a7c36`.
Preserved report, acquisition record and this follow-up:
`work/stage7-prerequisites-followup-fyfrsia4/`. Existing demo tests **46 PASS**;
packet-verifier tests **18 PASS**, both exit 0. No implementation change was
needed after these prerequisites passed. The attempted privileged demo command
stopped at sudo authentication before script execution. At that checkpoint the
fresh demo and its postflight were **NOT TESTED**. The prerequisite comparison
does not replace the October 7 failed demo's missing historical postflight.

The operator subsequently completed the single guarded demo above. The earlier
sudo blocker applies to the development session's attempt, not that later run.
Its successful report is separate from this prerequisite observation and the
original October 7 failure. Fresh baseline and restart qualification remain
separate work; no Stage 8 execution or WAN authorization is included here.

### Aggregate evidence allowance — October 10, 00:00:18 UTC observation

Verified `stage7-recovery-review-k6vcywgd/report.json` against SHA-256
`abf7dc1e93f17b846d93538ac52cf97227f7031204bc23fb6249e2ea7f6503eb`.
Its initial runtime, containment, capture setup/source and storage checks passed,
then the incident sweep exceeded its 256 MiB aggregate allowance. The final
runtime comparison did not run. This report remains BLOCKED and unchanged.

Read-only metadata inventory subsequently found **1,050 incidents totaling
274,447,389 bytes** (about 261.7 MiB). Every event file is within the existing
16 MiB limit, and every metadata file within 1 MiB. This supports a resource
allowance failure, not a claim that all contents are clean. The historical
incident-corruption cause remains a separate unresolved obligation.

The source-only review now has a finite **512 MiB** aggregate allowance justified
by that inventory. The 4,000-incident cap, per-file limits and 120-second deadline
remain unchanged. A complete size plan precedes the sweep; an oversized plan
blocks before reading incident contents. Reports retain counts, planned bytes,
completed file-pair bytes and limits on failures. Unreadable directory branches
cannot be silently omitted. Symlinks, special files, changed reads, malformed
records, extra corruption and incomplete coverage remain blockers; no sampling
or hash exceptions were added. Additional corruption stops the sweep immediately.

Private report/source backup and metadata inventory:
`work/stage7-budget-review-9s59ew37/`. Targeted review tests **26 PASS**; full unit
suite **220 PASS**; retained Stage 7 suite **86 PASS**; static validation
**16 PASS, 3 NOT TESTED**. Exact outputs: `verification.json` in that directory;
final repair/checkpoint details: `repair-report.json`.

The subsequent 00:27:48 UTC active review above completed both the evidence sweep
and final runtime comparison, followed by the guarded live demo described above.
No staging deployment or service restart was needed for this source-side
inspection repair. Its original BLOCKED report stays unchanged. The fresh
baseline, restart matrix and Stage 8 remain pending. WAN remains unauthorized.

### Active evidence blocker at 23:45:59 UTC — rotation diagnosed

Locally verified `stage7-recovery-review-dt51vbyw/report.json` against SHA-256
`73aaa06c9ec373480b8971a209b179f027e4469c48b268e5543f071be1982076`.
Runtime, containment, active PCAP unit/source checks, disk watermarks and fresh
capture output passed before recovery provenance verification stopped with
`RECORD_BOUNDARY_CHANGED: preceding LF missing`. The final incident sweep and
second runtime inventory did not run; overall status remains BLOCKED.

The normalized operational log rotated by rename. The historical file is now
`logs/normalized/events.jsonl.1`, retaining device/inode `64513:7500510`.
Its exact 513-byte event at offset 160902 matches the pinned record hash. Both
the complete 2,909,600-byte qualified snapshot and the 2,961,538-byte recovery
snapshot match their original hashes. The current live filename has a new inode
and cannot use the historical offset. Raw Suricata retains its original identity,
record and qualified prefix. This proves the reference failure is rotation;
it does not resolve the cause of the original damaged incident.

Preserved closed rotated log, bounded live-log snapshots and original reports
in private `work/stage7-rotation-preservation-s96b8h3g/`. Acquisitions are
non-atomic, with copied bytes reverified and later appends excluded. Rotated log
SHA-256: `4313e7ae5fd3ffe793e3b5d70ee4f78eb4edc82769871fb6e1dd453b374db7a7`.
The source-only reconciliation fix accepts only that pinned identity in the
existing filename or ten configured rotation slots. It still requires exact
record boundaries, hash, event identity/semantics and full historical snapshots;
copies with different inodes, rewrites, missing/unreadable files and ambiguous
identities fail. Original reports, recovery manifest and damaged evidence stay
unchanged. No runtime deployment is necessary for this diagnostic fix.

Verified against the actual rotated source. Targeted rotation tests **11 PASS**;
recovery-review tests **17 PASS**; full unit suite **211 PASS**; retained Stage 7
suite **86 PASS**; static validation **16 PASS, 3 NOT TESTED**. The unprivileged
full evidence sweep cannot read the protected recovery bundle; it remains
NOT TESTED pending the operator's privileged active review. Final results:
`work/stage7-rotation-preservation-s96b8h3g/repair-report.json`.

**Single next action:** rerun the exact `--active` read-only command in DEMO.md.
Require its full evidence sweep and second runtime inventory before a fresh
baseline, guarded localhost demo or controlled Stage 7 restart matrix.
Stage 8 is still blocked; historical capture continuity remains UNKNOWN.

### New active observation at 23:33:44 UTC

Locally verified `stage7-recovery-review-1s6uxnn1/report.json` against SHA-256
`cef276d4cbeba9606567dbdc0b79a55a6c589898fd3c0ae77c6e63cd5b3d227b`.
Its live inventory passed: all seven containers healthy, restart counts zero,
expected loopback bindings and placement, matching deployed pipeline hashes,
unchanged configuration/guard fingerprints, WAN disabled, and dumpcap PID 35114
on both expected bridges. Boot ID is now `67a93065-7f07-40e5-aa12-806d9ff14dcc`.
This supersedes the earlier stopped-service observation; startup provenance and
historical capture continuity are still unqualified.

The overall report was BLOCKED because the requested mode required stopped
decoys and inactive capture. Active endpoints and bindings correctly fail that
precondition. The command stopped before storage, unit/source and evidence checks;
their completion must not be inferred from the healthy inventory.

Added an explicit read-only `--active` mode. It retains unit/source/storage,
containment and evidence checks, verifies fresh capture output, and requires
unchanged runtime/capture security properties in a second inventory. It starts
nothing and cannot clear Stage 7/8 or mark a new baseline ready. The stopped
mode remains strict and gives an actionable mode-selection error.
Targeted recovery checks: **17 PASS**; full unit suite **200 PASS**; retained
Stage 7 offline suite **86 PASS**; static validation **16 PASS, 3 NOT TESTED**.
Results are retained in
`work/stage7-active-review-fix-20261009-1s6uxnn1/report.json`.
This mode repair preceded the later active review and rotation diagnosis above.
No recovery start is indicated by the verified active observations.
The following bullets document the earlier
08:51 checkpoint and remain historical.

- Earlier operator observation: `live-demo-preflight-40191b593b6c.json` at
  `2026-10-09T08:51:03.590691Z`. hp_guard passed and WAN was disabled;
  incidentd, Suricata, Loki, Alloy and Grafana reported healthy. Cowrie and
  OpenCanary were stopped; PCAP was inactive and capture output stale.
  The saved report is root-owned and unreadable to this session, so its local
  hash has **not** been verified. These findings are from supplied operator output.
- Read-only journals correlate the decoys' clean stops with host shutdown at
  `2026-10-08T02:54:56Z`, not an established application crash. Their existing
  `on-failure:5` policy preserves the guarded startup model. PCAP's static unit
  has no recorded activation in the current boot; continuity remains UNKNOWN.
- Reproduced and fixed two qualification-tool barriers: ordinary unittest
  discovery executed zero retained hyphenated tests; recovery verification used
  an obsolete absolute source path after the repository move. `make stage7-test`
  executes all seven required modules, while the recovery locator accepts only
  the exact retained bundle at the reviewed new location after checking the
  original pinned report hash. Original reports and evidence are unchanged.
- Stopped configuration inspection now distinguishes configured bindings/CIDRs
  from missing active endpoints. It never treats stopped decoys as live-ready.
  A new bounded read-only prerequisite tool checks configuration, containment,
  capture setup/storage, quarantine and historical evidence reconciliation.
  This is preparation for recovery review, not automatic recovery or qualification.
- Fresh offline checks: `make stage7-test` **86 PASS**; `make test` **194 PASS**;
  `make verify` passes its unit/static checks, including native Compose rendering
  (**16 static PASS, 3 NOT TESTED**). The first unit run hit the sandbox's obsolete
  writable path; the identical non-root suite passed outside that restriction.
  Suricata/Alloy native validation and live integration remain NOT TESTED.
- All changes are source-only. Current privileged recovery/evidence checks,
  current packet capture, the fresh live demo and the restart matrix remain
  NOT TESTED. Damaged-original preservation and derivative reconciliation remain
  separate tracked obligations; reconstructed records are not original evidence.
- **Single next action:** run the exact read-only `stage7_recovery_check.py`
  command in DEMO.md and review its private report. A successful review must
  precede any capture-first recovery, active preflight and fresh Stage 7 baseline.

The older entries below describe historical checkpoints, not present readiness.

## Focused checkpoint and repair — October 8

- Verified the original failed live report `work/demo/run-4ezstkw8/report.json`,
  timestamp `2026-10-07T04:34:00.048649Z`. Its SHA-256 remains
  `d4dd6f373eac478926144c6d5a1000afae0439d0d063ed1c8a6ebbdd9a65f3b5`.
- Private local backup: `work/preservation-20261008/`. It contains source,
  prior Git history, index/diffs, ignored qualification Python source, and three
  readable run artifacts. All 167 checkpoint source files matched the backup
  byte-for-byte through `git archive`. No live data or secrets were committed.
- Capture segments and live incident files could not be acquired: current
  permissions deny access and sudo requires interactive authentication. A fresh
  no-traffic observation was BLOCKED; it is not historical postflight evidence.
- Packet-match finding: **ANALYSIS INCOMPLETE — access denied**. No live segment
  was parsed; absence of capture or of the marker has not been established.
- Source-only repairs: postflight is attempted even after verification fails,
  with separate error recording; inaccessible capture directories now raise
  errors rather than appearing empty; retrospective results distinguish missing
  segments, incomplete parsing, and no match in available inspected segments.
- Packet filters, proof requirements and timeouts are unchanged. The missing
  historical postflight is explained by the former success-only control flow;
  the historical packet-timeout cause remains UNKNOWN.
- Fresh verification: **168 unit tests PASS**; validator **16 PASS, 3 NOT TESTED**;
  Compose and diff checks PASS. The initial regression exposed an expired fixed
  fixture in the intel-pack test; its existing clock parameter is now pinned,
  preserving all assertions. Full output: `work/preservation-20261008/repair-validation-final.json`.
- No fresh demo was attempted because its diagnostic/preflight prerequisites
  remain blocked. No services, capture lifecycle, policies or runtime files changed.
- **Next action:** run the restricted acquisition command in DEMO.md, then inspect
  the copied packets for this exact marker before authorizing the conditional run.
  Historical damaged-evidence reconciliation remains a separate obligation;
  no damaged original was modified or reconstructed evidence called original.

### Acquisition inspected — October 8, after operator preservation

The operator acquired nine artifacts in `operator-acquisition-6qsfgzt7` under
the private backup. All hashes verified. Offline inspection of all six copied
captures found the exact failed-run marker in frame 6, TCP stream 0, on
`br-hp-canary`, from `172.29.41.1:60374` to `172.29.41.2:2121` at
`2026-10-07T04:34:01.177356125Z`. The FTP exchange includes 220/331/530 replies.
The copied incident event's canonical hash also matches the original demo report.
Matching capture SHA-256:
`ebb7f61122b9950e8068647147f2f5a802470df79d18cdbb28c68a43668c98a9`.

Tshark denied the workspace file but parsed identical bytes in private `/tmp`.
Its installed AppArmor profile explicitly permits owner temporary files. The
verifier now parses a hashed, mode-0600 disposable copy in a mode-0700 temporary
directory and retains matching evidence in the workspace. No AppArmor rule or
file access control was relaxed. The unchanged packet filter matches the actual
preserved marker with this repair. Confidence is high in this mechanism; the
original report did not retain historical parser stderr or flush timings.

The original FAILED status and absent historical postflight remain unchanged.
This is retrospective packet proof, not a fresh demo or continuity qualification.
Full findings: `work/preservation-20261008/operator-acquisition-6qsfgzt7/retrospective-proof/findings.json`.
Source tests: **169 PASS**, including native tshark with workspace evidence,
wrong-marker rejection, private temporary-file modes and timeout cleanup.

The operator's current observation at `2026-10-08T07:06:27.920587Z` is BLOCKED:
hp_guard passes, but Cowrie/OpenCanary are not running and healthy, their active
bindings/membership checks fail, PCAP is inactive/dead with MainPID 0, and capture
output is stale. There were additional boots after the failed demo. No fresh demo
or service recovery was attempted. **Next: read-only diagnosis of the stopped
decoys**, before planning any separately authorized service recovery. Stage 7/8
remain BLOCKED and WAN remains unauthorized. This supersedes the acquisition
command as the next action; the backup and original reports remain preserved.

The following October 7 observations remain historical, not fresh runtime claims.

## WORKING

- `python3 -B scripts/hp.py demo` creates a real, isolated pipeline run and an
  understandable offline browser report.
- Actual incidentd ingestion, normalization, correlation, HIGH classification,
  evidence persistence, checkpoint reload, and duplicate prevention run in the
  demonstration. Searchable password redaction is checked.
- Unique synthetic run markers and exact event IDs link the report to evidence.
- The live demo refuses traffic when its safety preflight cannot establish
  the required runtime state. A Docker-permission failure was observed before
  any interaction in this session.
- Repository unit tests, static safety checks and native Compose rendering pass.
- Saved status now rejects missing, stale, previous-boot and unhealthy snapshots;
  health observations record boot identity. This improvement is source-tested,
  not deployed to staging.
- Native offline tshark verification detects a synthetic FTP username packet
  and rejects a different marker. This test creates no network traffic.

## PARTIALLY WORKING

- The local live demo is implemented and its rejection paths are unit-tested.
  The retained operator-run report now verifies OpenCanary → incidentd → Loki
  for one synthetic event. Packet proof and overall PASS_LIVE remain incomplete.
- `PASS_LIVE` now requires matching packet evidence, in addition to source,
  normalized event, classified incident, retained evidence and Loki ingestion.
  The read-only preflight helper prepares current state for operator review;
  its unprivileged execution was BLOCKED by Docker/system-bus permissions and
  capture-directory access. PCAP stop cause and reboot continuity remain UNKNOWN.
- Seven healthy services were shown in earlier operator evidence, including
  the 13:21:23 EDT health report. This is historical evidence, not current proof.
- Runtime manifests record deployed pipeline hashes, images, mounts, networks,
  configuration and containment fingerprints. The deployed Git revision is
  UNKNOWN without reliable image revision metadata.
- PCAP health now checks MainPID, process start identity, dumpcap arguments,
  configured bridges, destination and finite ring. This code is unit-tested;
  it is not deployed. Process health does not prove captured packet coverage.
- The Grafana dashboard source has a demo marker panel. Its new query has not
  been tested against live Grafana/Loki or deployed.

## NOT YET IMPLEMENTED

- A qualified PCAP boot/recovery lifecycle that preserves disk-watermark and
  containment gates. The static unit still has `Restart=no`; no auto-recovery
  was added merely to make the demonstration pass.
- A completed fresh Stage 7 restart matrix and formal Stage 8 boot qualification.
- A production deployment revision label for every image.
- Multi-tenant management, customer onboarding, billing, or a managed service.

## VALIDATION

- `python3 -B -m unittest discover -s tests -q`: **162 tests PASS**.
- PCAP recovery and semantic drift tests: **26 PASS**. Operator reported an actual
  successful start; the refined already-active validator awaits privileged rerun.
- Firewall canonicalization regressions: **3 PASS**. Logging prefixes remain
  strings; address-prefix normalization and verdict-change detection are retained.
- Saved-health regression tests: **9 PASS**, covering reboot drift, stale/future
  timestamps, absent/malformed state and unhealthy observations.
- Targeted demo tests: **36 PASS**. Capture/health tests: **11 PASS**.
- Packet/preflight/retrospective-diagnosis tests: **14 PASS**, including native tshark parsing,
  rejection, cleanup, preserved existing files and no-socket preflight wiring.
- `python3 -B scripts/validate.py`: **16 PASS, 3 NOT TESTED, 0 FAIL**.
- `docker compose config --quiet`: **PASS**.
- Repeated `hp.py demo` executions: **PASS_REPLAY** with new retained bundles.
- Live demo attempt: **BLOCKED at preflight** by Docker socket permissions.
  No synthetic connection was sent.
- NOT TESTED: current privileged containment/capture, live demo completion,
  native Suricata/Alloy validators (binaries unavailable), browser rendering,
  Grafana panel execution, full container builds, fresh Stage 7/8 qualification.
- No failing automated tests remain. Replay is not counted as live integration.
- Prior-session command output remains in `work/prototype/final-validation.json`.
  This session's output is in `work/prototype/revalidation-0.2.json`; paths to
  the fresh replay bundles are recorded there (local, ignored artifacts).
- Live-preparation verification is retained in `work/prototype/live-preparation-0.3.json`.

### Operator observation at 2026-10-07T04:13:21Z

The supplied privileged preflight output reported hp_guard **PASS**, but the
collector then failed when fingerprinting a logging prefix as an address object.
That source bug is fixed and regression-tested; a fresh privileged rerun is still
required. The report file itself is root-owned and unreadable in this session;
these observations come from the operator's supplied terminal output.

PCAP was inactive/dead, MainPID 0, unit static, with no current-boot service
journal entries and capture output approximately 6.5 hours old. Current disk use
was well below the configured watermarks. These observations do not establish
the historical stop cause or exact reboot gap. No start/restart was requested.
Both operator attempts failed before synthetic interaction. The preflight now
also collects retained boot boundaries and previous-boot PCAP journal entries.

### Operator observation at 2026-10-07T04:15:16Z

The corrected collector completed runtime inventory. All seven services reported
healthy with restart count zero. Source module hashes matched the checkout;
network placement, gateways, bindings and hp_guard checks reported no differences.
WAN was disabled. The sole collector failure was inactive PCAP. Internal HTTP
readiness and the live telemetry path remain NOT TESTED.

Previous-boot journals showed ongoing capture/rotation. Current-boot service
timestamps were empty and the journal had no PCAP entries; the unit is static
without an installation/boot target. This supports a missing recorded post-reboot
capture start, not an exact stop time or zero gap. A new gated, one-time operator
start helper has been implemented and tested. It is not automatic recovery or
formal Stage 8 qualification, and no service start was performed by Codex.

### Reported capture recovery and semantic-validation refinement

The operator subsequently reported active/running PCAP (MainPID 59227), correct
bridge arguments, fresh capture output and a complete post-start runtime PASS.
The helper nevertheless returned BLOCKED from its raw container-inventory check.
The original check compared boot ID, an aggregate fingerprint and raw containers;
it did not directly compare capture state. A mount-list permutation reproduces
a false BLOCK under that predicate. The exact differing live field is not yet
verified because the root-owned recovery report is unreadable in this session.

The helper now compares explicit security properties and emits classified field
differences. It normalizes mount/network inventory presentation order, permits
only verified expected PCAP lifecycle changes, and rejects unexpected runtime
drift. Already-active validation never issues a service start/restart command.
This narrow change has not cleared Stage 7/8 or established a PASS_LIVE result.

### Live demo run `run-4ezstkw8`

The readable retained report records a successful guarded localhost FTP attempt,
matching OpenCanary source event, normalization, LOW event classification,
retained evidence and exact event ID in Loki. Event ID:
`5c5b898e38fb39ab768d02a80dea7568f0a2dd0bc0b6c3c1a67026f100b4a136`.
The correlated incident was HIGH; that does not change the synthetic event's LOW
severity. Packet proof timed out, so the overall run remains FAILED and postflight
runtime stability was not checked. No complete PASS_LIVE has been established.

An offline retrospective packet diagnostic now records skipped segments and
parser failures and can inspect the original segment after rotation. Capture
loss, buffering and parser failure remain competing explanations pending that
privileged inspection. The failed report is preserved unchanged.

## CURRENT ARCHITECTURE

Cowrie and OpenCanary use separate decoy bridges. hp_guard enforces host and
egress restrictions; these bridges alone are not an isolation boundary.
Suricata and dumpcap observe the decoy bridges. incidentd normalizes raw logs,
classifies incidents and retains evidence. Alloy forwards searchable streams
to internal Loki; Grafana is published only on loopback. The demo extends the
existing `hp.py` entrypoint and uses the real engine rather than another parser.

## RECENT DEVELOPMENT

- Connected ingestion, classification, durable evidence and operator output in
  one repeatable, unprivileged replay workflow.
- Added a guarded localhost demo and before/after runtime manifests.
- Added direct PCAP process checks to health monitoring and corrected the
  saved capture status after a successful critical-disk stop.
- Added a labeled demonstration panel to the existing Grafana dashboard source.
- Added regression coverage for exposure, placement, mounts, capabilities,
  unhealthy services, failed capture, evidence corruption and HTML escaping.
- Preserved the existing uncommitted demo implementation and repaired the
  operator status command's success exit on stale or failed health evidence.
- Added a no-traffic privileged preflight and mandatory packet-level live-demo
  evidence. Enforced Compose project/service labels, expected sensor bridge names
  and gateways, and rejection of paused/restarting/dead/OOM-killed runtime state.

## NEXT MILESTONES

1. Operator-run live demo; inspect the exact matching event in Loki and verify
   its packet coverage. Resolve any failed preflight without weakening controls.
2. Reconcile post-reboot evidence and establish a fresh Stage 7 baseline, then
   run an explicitly authorized restart matrix. Do not resume the old checkpoint.
3. Repair and qualify PCAP boot/recovery with disk and containment safeguards;
   complete Stage 8 before considering any separately approved WAN evaluation.

## COMMERCIAL DIRECTION

A local deception appliance that makes suspicious interactions understandable
through incident summaries, service health and traceable evidence. The current
work demonstrates core processing and operator tooling. Operational reliability,
deployment provenance and security qualification still need target validation
before making commercial-readiness claims.

## Qualification and security state

The prior Stage 7 session was invalidated by a host reboot. The last rebaseline
report was incomplete because privileged inspection required interactive sudo.
Capture-gap duration remains UNKNOWN. Stage 7 and Stage 8 remain BLOCKED; the
demo creates no substitute qualification evidence. WAN remains unauthorized.

This development slice changed no live WAN exposure, firewall policy, management
access, outbound policy, or credentials. No forensic evidence was deleted.
