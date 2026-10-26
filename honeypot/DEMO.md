# HoneyTrace demonstration

**Current disposition — October 26:** see [current phase status](../docs/CURRENT_PHASE_STATUS.md)
for HoneyWatch through PR #38, source validation, review outcomes and remaining
Phase 7 gates. Independent acceptance remains pending; Phase 8 execution and
public beta remain unauthorized. The observations/command block below are a
historical handoff, not a fresh operational direction. October 20 packet/prefix
and recovery checks superseded the protected-access-only blocker; full-state
ambiguity and current-build live qualification remain open. Do not rerun the
completed matrix or old acquisition solely to update this document.

HoneyTrace is a defensive deception prototype. It records activity aimed at
decoy services, turns telemetry into incidents, and retains supporting evidence
for an operator to review. It never attacks an outside system.

## Historical Phase 7 closeout record

The operator's `stage7-fresh-ewnrhtur` matrix completed all seven restart rows
with **PASS**, final postflight PASS and exit 0. The report records Stage 7 PASS
and Stage 8 `READY_FOR_OPERATOR_DIRECTION`. **Independent closeout is pending
protected packet/evidence access; Stage 8 execution is NOT TESTED and separately
authorized. WAN remains unauthorized.** Do not rerun the completed matrix or
the guarded demo merely to reconfirm these milestones.

Report: `work/live-qualification/stage7-fresh-ewnrhtur/report.json`, SHA-256
`97bee3ef001e17c0c65b376cf472ea183fff5ce6e37db6c938278dcf50fcbdbc`.
Full row, strict runtime, eight raw/normalized/incident/classification/Loki
relationships, final sweep accounting and postflight metadata were independently
verified locally. The agent could not read the protected captures; `sudo -n`
requires interactive authentication. This is an access boundary, not a failed
packet test. PROJECT_STATUS.md records the exact coverage and remaining limits.

Run this single **read-only completion check**, not another restart matrix:

```bash
sudo python3 -B "/home/joe/Jay Forensics/HoneyTrace/honeypot-v1.3-polish2/honeypot/work/stage7-verified-completion-phaovlwf/verify-completion.py"
stage7_closeout_exit=$?
printf 'EXIT_CODE: %s\n' "$stage7_closeout_exit"
```

It verifies the original report/baseline/row hashes, tested implementation and
only explicitly allowed handoff-documentation differences. It preserves private
copies of the linked evidence, re-parses all eight exact packet markers, checks
complete final evidence accounting/recovery hashes and finite baseline prefixes,
and checks the retained final runtime/postflight. It changes no live data or
permissions, makes no decoy connections, restarts nothing and runs no Stage 8
test. It uses a 120-second deadline and finite copy/prefix allowances. Every
invocation creates a new private audit bundle; originals are never overwritten.

Expected result: `VERIFIED_STAGE7_PASS`, Stage 7 PASS, Stage 8
`READY_FOR_OPERATOR_DIRECTION`, exit 0, with report path and SHA-256. Keep those
outputs for final independent handoff review. Any failed or unreadable mandatory
evidence leaves closeout blocked; diagnose it without automatically retrying
traffic or restarts. This verifier does not collect a new live runtime inventory
or prove host-reboot continuity, zero packet loss or power-loss durability.

## Historical Phase 7 retry handoff — already executed

**Stage 7 BLOCKED; Stage 8 eligibility BLOCKED, execution NOT TESTED;
WAN unauthorized.** Phase 7 means the existing seven-service restart matrix,
not host boot/recovery. The guarded FTP demo below is retained historical PASS;
do not repeat it merely to reconfirm that milestone.

The operator's October 10 `stage7-fresh-u4vb87q6` matrix stopped after the first
OpenCanary restart. The FTP event correctly became MEDIUM after its incident
reached three distinct services; the harness incorrectly required LOW. The
exact username packet was preserved and independently found retrospectively.
The original run remains FAILED, with six rows not run. Its row postflight
passed; the outer postflight failed against the old start/endpoint/MAC anchor
and discarded its observation. Do not resume that checkpoint or rerun its old
wrapper. PROJECT_STATUS.md links the immutable reports and packet hashes.

Source-only verifier/reporting repairs pass 42 focused tests, 87 retained Stage 7
tests and 275 application tests, with no skips. `make verify` passes; native
Suricata/Alloy validation and Ubuntu live integration remain NOT TESTED.

The reviewed command below was executed to produce the completed matrix above.
It is retained as historical provenance; do not run it again for closeout:

```bash
bash "/home/joe/Jay Forensics/HoneyTrace/honeypot-v1.3-polish2/honeypot/work/stage7-classification-repair-epbyx9vc/run-stage7.sh" --execute-restarts
```

It checks the clean source checkpoint, current validation and preserved failure
hashes before sudo. It first performs read-only current reconciliation against
the verified recovered OpenCanary state: complete integrity/preservation,
exact failed-run event/Loki/packet linkage, configuration, two-bridge capture,
stable second observation and postflight. Any failure prevents the matrix.
Only then does it acquire fresh active prerequisites and a stable formal
baseline. It restarts the seven existing staging containers once, in order:
OpenCanary, Cowrie, Suricata, Alloy, Loki, Grafana, incidentd. The full sweep keeps
the 512 MiB / 16 MiB event / 1 MiB metadata / 4,000 incident / 120-second limits.
Restart response, readiness (150 seconds), unique localhost packet/pipeline
probes, preservation and bounded postflight are mandatory. A failed gate stops
further restarts; Ctrl+C retains ABORTED and exit 130. No automatic retry occurs.

The runner retains immutable baseline, per-row and final JSON reports. The
wrapper prints `EXIT_CODE`, `REPORT` and `SHA256`; keep stdout/stderr and those
outputs for independent verification. Do not claim completion from shell exit 0
or a summary alone: require all seven linked PASS rows, final independent packet
verification, complete evidence sweep and successful final postflight. A failure
requires diagnosis/reconciliation before any new matrix. `--reconcile-only`
performs just the new read-only reconciliation; `--check-source` checks the
local pins without sudo or live inspection. Neither mode restarts capture, recreates
containers, deploy source, change boot/security settings or execute Stage 8.

Historical preparation: `work/stage7-classification-repair-epbyx9vc/diagnosis-report.json`,
`validation.json` and `handoff.json`; the previous contract's requirements and
finite safety limits are unchanged. Older wrappers describe historical attempts;
the current closeout command is at the top of this document. Historical capture gap and original
corruption cause remain UNKNOWN; reconstruction is separate derivative evidence.

## What this prototype demonstrates

The **replay demo works without root or Docker**. It uses the actual incidentd
file reader, normalizer, classifier, correlation state, and durable evidence
writer. Three synthetic Cowrie-format records become a HIGH incident. Restarting
the engine against the same sandbox proves that the records are not duplicated.
Searchable telemetry excludes the synthetic password. A browser report shows the
incident, source, severity, event ID, evidence hash, and validation steps.

Replay does not start a decoy or simulate a successful firewall/PCAP/Loki check.
Those checks are explicitly NOT TESTED. The separate live mode exercises an
already-running local stack; it requires operator validation on the target.

## Quick demo

From this checkout:

```bash
python3 -B scripts/hp.py demo
```

Open the `OPEN IN BROWSER` path printed by the command. Each run creates a new
private directory under `work/demo/`, with `index.html`, `report.json`, and the
retained sandbox source records and incident evidence. No web server is needed.
The report can be viewed offline; it loads no external resources.

## Expected result

The command exits zero and prints `HoneyTrace — PASS_REPLAY (replay)`.
The incident has HIGH severity from emulated command input. No command from the
records is executed. `loki` and `capture` correctly remain `NOT TESTED`.

The visible `honeytrace-demo-…` identifier is unique for each run. The report
contains `synthetic: true` and `source: test`. This label applies to this demo's
matching records; it does not convert unrelated incident activity into test data.

## Local live demo — operator step

**Latest demonstrated result (October 10, 00:45:36 UTC): `PASS_LIVE`.**
The operator ran one guarded localhost FTP demo. Safety, source telemetry,
normalization, classification, incident evidence, Loki, exact packet proof and
postflight all passed. Report: `work/demo/run-irv_hi81/report.json`, SHA-256
`be680acbf866dbbef9b8c4df31c0338a9678131ce6ba3b6dca30be3e07787a2d`.
Open `work/demo/run-irv_hi81/index.html` locally to show the real result.
The matching FTP event is LOW severity; the containing correlated incident is
HIGH and includes another record. Only the matching event is labeled synthetic.

Exact readable raw/normalized/incident records and the pre/post manifests were
independently verified. The tool reports a matching 3,792-byte PCAP snapshot,
SHA-256 `8addc8592c727be99340ccfbae46e2b2fd1fffc8bcab5ce3b37d34611d2ad059`.
The protected snapshot is present outside the rotating ring. The operator
subsequently ran `sudo sha256sum` on that snapshot twice; both supplied results
match the hash above. **Retained packet-integrity confirmation is complete.**
Direct rehash and offline packet parsing by this Codex session remain NOT TESTED
because it cannot read the protected file without operator authentication.
Keep its permissions unchanged. Command execution timestamps were not supplied.

Preservation and closeout: `work/live-demo-closeout-oibsa5is/`.
The separate operator confirmation is
`work/live-demo-hash-confirmation-gyflu16g/confirmation-report.json`; it supersedes
the earlier closeout's pending rehash status without modifying that report.
Do not repeat this successful demo merely to complete preservation.
**Current next action: a fresh, explicitly directed Stage 7 restart matrix.**
The operator's read-only reconciliation passed at October 10 **02:41 UTC**,
exit **0**, with **postflight PASS**. Report:
`work/stage7-interruption-repair-sh46ipi2/current-reconciliation-16xzlj7t/report.json`,
SHA-256 `689d434c0085fcb5a8d8971f0d905f09fbc89756e64050866917d806db59d2dd`.
All seven services were healthy, including successful OpenCanary health checks.
Containment, WAN-off state, stable two-bridge capture identity, configuration,
permissions/quarantine, historical provenance and exact Loki ingestion passed.
The full sweep covered **1,099/1,099 incidents**, **278,394,548 bytes**, with only
one pinned known damaged original. Baseline history/custody and all three acquired
capture hashes were verified. This establishes current safety, not a completed
restart row or the interrupted run's missing recovery/postflight proof.

One earlier attempt had a planning/acquisition byte mismatch; the next was
interrupted during OpenCanary health recovery. The following observation saw
OpenCanary `starting` about 45 seconds after restart, before its recorded
60-second health interval. Original failures and interrupted artifacts remain
unchanged. No complete matrix row is qualified yet.

The source-only repair retains complete byte accounting, ABORTED/exit 130 and
restart diagnostics, and attempts bounded postflight. Its verified offline
validation remains `make stage7-test` **87 PASS**, `make test` **259 PASS** and
`make verify` **259 unit / 16 static PASS, 3 static NOT TESTED**, all exits 0.
The implementation hashes still match; no new staging deployment is needed.
No boot, WAN or guard-delete qualification has been executed.

This command explicitly directs **one new seven-service matrix** after another
complete live prerequisite review and a stable fresh baseline:

```bash
bash "/home/joe/Jay Forensics/HoneyTrace/honeypot-v1.3-polish2/honeypot/work/stage7-verified-reconciliation-pk9919s3/run-stage7.sh" --execute-restarts
```

It requires the tested clean source and verified reconciliation/validation hashes.
The order is OpenCanary, Cowrie, Suricata, Alloy, Loki, Grafana, incidentd.
Allow the bounded health wait to complete: decoy checks run at 60-second intervals
and Alloy/Loki checks at 120-second intervals. WAIT messages show progress; the
existing recovery deadline is 150 seconds. Ctrl+C aborts, records exit 130 and
attempts read-only postflight; it does not resume or retry automatically.
Stop at the first failed row and retain stdout/stderr, exit code, REPORT path and
SHA256. No additional restart is permitted after a failed safety/recovery check.

For a **read-only** baseline, invoke the same wrapper with `--baseline-only`.
No arguments or an invalid mode exit 2 before sudo. Interactive operator sudo
is needed when existing narrow access cannot authenticate. This wrapper never
recreates/deploys containers or starts Stage 8, and does not repeat the completed
guarded demo. The old wrappers and interrupted checkpoint must not be reused.

Stage 7/8 remain BLOCKED; WAN remains unauthorized.

The operator-run fresh matrix stopped at OpenCanary on October 10, **01:48:31 UTC**:
`work/live-qualification/stage7-fresh-1mbqjtep/report.json`, SHA-256
`5127e173f9760fd88056efa058fdabd2b4bd344dbff407ceef37e56d633511fb`.
Docker returned exit 0, preserving the inspected full container/image identity,
but qualification rejected stdout before waiting for health. The installed CLI
prints a deprecated `--time` warning on stdout; the failure mechanism was
reproduced with daemon-free `--help`. Original stdout was not retained. Postflight
saw `health: starting` less than a second after restart and remains FAILED.
No new synthetic probe ran; the remaining six services were NOT TESTED.

The formal baseline, SHA-256
`3e7f646dec47d2f53e2f97a5df3e2e1432aadb2a9a8b8fe2d199f99058ac4a1e`,
passed a **1,081/1,081** incident sweep (**276,944,209 bytes**) and a stable second
runtime observation on boot `67a93065-7f07-40e5-aa12-806d9ff14dcc`. This is
historical after that restart; a retry requires a new tested baseline.

The source-only fix uses `--timeout`, records stdout/stderr and keeps exact
full-ID checks. The operator's subsequent read-only reconciliation is locally
hash-verified: `current-reconciliation-xqhl03ki/report.json` under
`work/stage7-restart-response-repair-hp852b0v/`, SHA-256
`4f91698616305c32c5bebc30c7bf40d6861449a94b557ee2cbf341d2c01b15ef`,
exit **0**, **postflight PASS**, October 10 **02:08 UTC**. All seven services were
healthy; containment, unchanged capture identity, configuration and preservation
passed. The full sweep scanned **1,089/1,089 incidents**, **277,505,991 bytes**.
No traffic or runtime mutation occurred. This does not qualify the failed row or
establish its bounded recovery time; both gates remain blocked.

The historical wrapper `work/stage7-reconciled-retry-odclc246/run-stage7.sh`
was used for the three subsequent attempts described above. Its source and
reconciliation pins are now stale. Do not execute it again unchanged. The
fresh wrapper above replaces it after the verified reconciliation.

### Fresh Stage 7 restart qualification

`scripts/stage7_qualification.py` requires a hash-verified active prerequisite
report, a clean local source checkpoint, and a current hash-verified validation
report covering `make stage7-test`, `make test` and `make verify`. Without
`--execute-restarts`, it only prepares a read-only baseline. With that explicit
flag it first refreshes the complete prerequisites within 120 seconds, then
restarts only the existing staging containers, sequentially:
OpenCanary, Cowrie, Suricata, Alloy, Loki, Grafana, incidentd.

The operator command must supply the exact validation artifact path and hash
printed by preparation; do not substitute an old validation report. Each restart
uses a new uniquely marked loopback FTP interaction; the Cowrie row also sends
one synthetic SSH client banner. No SSH authentication or shell command is sent.
Every probe requires raw telemetry, normalization, classification, retained
incident evidence, exact Loki ingestion and hashed packet proof. The runner
attempts bounded read-only postflight even on failure and never retries a failed
restart or interaction automatically. Reports and captures stay private under
`work/live-qualification/stage7-fresh-*/`; they must not be committed.

Only a complete seven-row PASS plus final independent evidence checks may clear
Stage 7 and mark Stage 8 `READY_FOR_OPERATOR_DIRECTION`. Stage 8 itself remains
NOT TESTED. See [the handoff](docs/STAGE8_HANDOFF.md) for its separate supervised
boot/recovery requirements. No boot, WAN, firewall or deployment change is
included in this runner.

**Earlier prerequisite observation (October 10, 00:27:48 UTC):**
`ACTIVE_PREREQUISITES_PASSED`. All 1,054 incidents were scanned (274,872,352 bytes),
with only the unchanged pinned historical defect accepted after its full recovery
and source-provenance checks. All seven services, containment, loopback bindings,
PCAP unit/source, fresh capture output and storage checks passed. The second
runtime observation and comparison passed with no differences.
Report: `work/live-qualification/stage7-recovery-review-rrewlyrh/report.json`;
SHA-256: `2349438d2541e64463aa3f206b544535eef71ddf7d70243b5fbfdbc22c58e852`.
This is prerequisite evidence, not a formal new baseline or Stage 7/8 PASS.

This prerequisite observation preceded the successful guarded demo above.
The development session's attempted demo stopped at sudo authentication before
execution; the operator subsequently ran it successfully. The repeatable demo
command below remains available for a future separately requested run.
The read-only review used to establish these prerequisites was:

```bash
sudo python3 -B \
  "/home/joe/Jay Forensics/HoneyTrace/honeypot-v1.3-polish2/honeypot/scripts/stage7_recovery_check.py" \
  --runtime-root /home/joe/honeypot-staging/honeypot --active
```

It checks active service health, bindings and placement, containment, WAN-off
state, quarantine, capture unit and source, disk watermarks, fresh capture output,
and retained evidence/recovery provenance. A second inventory must preserve
the security and capture identities throughout this inspection. It
creates a private report readable by the invoking operator. It sends no traffic
and starts nothing. `ACTIVE_PREREQUISITES_PASSED` only permits review of a fresh
baseline and guarded demo; it does not establish a new baseline or clear a gate.
Unexpected configuration, evidence defects, failed commands, or unavailable
privileges leave it BLOCKED. Return its report path, hash and exit code.
The printed `EVIDENCE_SWEEP` must report all inventoried files scanned before
accepting a complete sweep. `bytes_read` accounts for completed stable file pairs;
aborted/unstable reads are not completed evidence. Plans or runtime growth beyond
the finite allowance block; unreadable branches cannot be silently skipped.
Budget repair/checkpoint: `work/stage7-budget-review-9s59ew37/`.
Verified follow-up/preserved report: `work/stage7-prerequisites-followup-fyfrsia4/`.

Normalized provenance follows only the pinned device/inode in the current log or
its ten existing rotation slots, and verifies both the qualified snapshot and
the recovery acquisition snapshot. It reports the current/recorded path and
hashes separately. It never rewrites the original manifest, restores a log,
creates a replacement recovery record or treats a copied event as original.
Preservation/diagnosis: `work/stage7-rotation-preservation-s96b8h3g/`.

The default mode, without `--active`, still requires cleanly stopped decoys and
an unstarted capture service and can only return `READY_FOR_GUARDED_RECOVERY_REVIEW`.
It refuses an active stack and directs the operator to the active mode. Neither
mode changes services. Do not run recovery against an already active stack.

Any future live demo requires a new active preflight; this run has already passed.
The previous Stage 7 checkpoint remains
`INVALIDATED_BY_HOST_REBOOT`. Stage 7 then needs a fresh controlled restart matrix
with evidence, logging, network, firewall and capture-continuity checks before
Stage 8 can be considered. No boot-policy change is included in this procedure.

First collect a no-traffic, read-only preflight for review:

```bash
sudo python3 -B scripts/live_demo_preflight.py \
  --runtime-root /home/joe/honeypot-staging/honeypot
```

Provide its complete output, exit code and report path. This reads current Docker,
hp_guard and capture state and PCAP service diagnostics. It writes a new workspace
report but makes no HTTP probes, test connections or service changes. A successful
preflight is an observation for review; the live demo independently repeats its
gates. A stopped capture remains a blocker until its cause is established.
Diagnostics include retained boot boundaries and previous-boot PCAP journal
entries; unavailable historical journals leave startup/stop provenance UNKNOWN.

For the observed static, unstarted PCAP unit after reboot, the separate recovery
helper supports one explicit operator start:

```bash
sudo python3 -B scripts/pcap_demo_recovery.py \
  --runtime-root /home/joe/honeypot-staging/honeypot --start
```

This command changes runtime state: it starts only `honeypot-pcap.service` once.
It requires PCAP to be the sole runtime blocker, current containment and WAN-off
verification, reviewed unit and deployed source hashes, no current-boot activation
history, valid bridges/ring limits and disk headroom. It verifies capture process
and fresh output afterward. It sends no test traffic, enables no boot service,
performs no restart and changes no firewall. Without `--start`, it only checks
readiness. If PCAP is already active, it verifies the current runtime, unit/source,
disk headroom, interfaces and fresh capture output, then returns
`CAPTURE_READY_FOR_DEMO` without starting or restarting it—even if `--start` was
supplied. For the already-active verification, run:

```bash
sudo python3 -B scripts/pcap_demo_recovery.py \
  --runtime-root /home/joe/honeypot-staging/honeypot
```

Recovery reports a semantic before/after comparison. Mount and network inventory
presentation order is normalized; their identities and values remain strict.
Only a verified, requested inactive-to-active capture transition is allowed to
change process identity. Already-active process identity must remain stable.
Security drift lists the affected fields and keeps the result BLOCKED.

A failed post-start check leaves the result BLOCKED and records whether
the start was attempted; it does not repeatedly restart or automatically stop
capture. Run the live demo only after `CAPTURE_READY_FOR_DEMO`.

The earlier capture-start/drift-check observation is superseded by the complete
active prerequisite review above. Capture is already active in that observation;
do not run a recovery start against it. Historical gaps and Stage 7/8 remain
unresolved.

The following command validates the existing staging stack and then sends one
synthetic FTP login attempt to its inspected **127.0.0.1** OpenCanary binding:

```bash
sudo python3 -B \
  "/home/joe/Jay Forensics/HoneyTrace/honeypot-v1.3-polish2/honeypot/scripts/hp.py" \
  demo --mode live \
  --runtime-root /home/joe/honeypot-staging/honeypot --timeout 60
```

It checks all seven containers, their placement, mounted paths, published ports,
DNS blackholes, hp_guard rules, internal HTTP readiness, deployed pipeline module
hashes, disk headroom, and the dumpcap process/interfaces/ring before interaction.
It then waits up to 60 seconds for the matching source record, normalized event,
incident evidence, and exact event ID in Loki. Individual inspections and socket
operations also have bounded timeouts. The complete command can take longer
than the telemetry wait when performing preflight and postflight checks.

Success is `PASS_LIVE`. A single FTP attempt may correctly be LOW severity;
an existing correlated incident can have a higher severity. Both are displayed.
Any missing component or changed runtime prevents a PASS. The script does not
start, rebuild, restart, or recover services. A failing gate is an instruction to
investigate, not permission to bypass it. `PASS_LIVE` additionally requires the
unique FTP username marker in a packet addressed to the inspected Canary IP and
port after interaction begins. A bounded, hashed capture snapshot is retained;
missing packet evidence prevents success. This does not prove continuity across
an earlier reboot. The retained operator run above proves this live flow once;
it is not a restart/reboot-resilience qualification.
Run it once and retain the report path, hash and exit code. Do not automatically
repeat a failed demo. Require `postflight: PASS` as well as matching packet proof;
a later successful observation cannot fill a failed run's historical postflight.

Packet verification uses the existing `tshark` executable offline. It refuses
traffic if the tool, recent capture output or disk headroom is unavailable.
Snapshot inspection is limited to the newest three ring segments, at most 64 MiB
per segment and 128 MiB per attempt. Larger segments fail closed. A split username
that cannot be matched in a single packet also prevents PASS. The retained capture
snapshot is mode 0600 and may contain unrelated sensitive telemetry; the browser
summary does not expose packet payloads. Failed temporary snapshots are removed;
original capture files are never changed.

For the October 7 failed run, the preservation step below has now been completed.
The original report was verified unchanged on October 8. Source checkpoint
`d3105257d1eba8ee3e36238de3f5aa84378450b7` is a preservation checkpoint, not a
qualified deployment. The local private backup is `work/preservation-20261008/`.
Current capture/incident access is denied to the development session; do not
change socket, directory or evidence permissions to bypass that boundary.

```bash
sudo python3 -B /home/joe/honeypot-v1.3-polish2/honeypot/work/preservation-20261008/acquire-retained.py
```

This session-local helper verifies the failed report hash, prioritizes candidate
capture copies outside the rotating ring, records acquisition times/sizes/hashes,
preserves accessible referenced incident files, then performs a read-only current
observation. Copies are private and explicitly non-atomic/potentially incomplete.
It generates no traffic and never starts/stops services. Operator execution
produced `operator-acquisition-6qsfgzt7`; its hashes have been verified. Candidates are selected
by report references and filename/mtime near the run; only packet inspection can
establish coverage. Missing segments or copy-budget limits are recorded as errors.

Inspect the copies for `honeytrace-demo-b1c38bcf00394b8ab2cc261fc31fe2b9`, accounting
for port 2121, stream reassembly and localhost translation to `172.29.41.2`.
Do not rerun the demo until that diagnosis and fresh safety gates pass. A later
packet match cannot change the original FAILED result or supply its missing
historical postflight. The live demo now attempts bounded read-only postflight
on success and failure; postflight errors are recorded separately without masking
the primary failure. This behavior is source-tested, not live-qualified.

**Current stopping point (October 8):** retrospective inspection found the exact
marker packet. The verifier's workspace file was denied by tshark confinement;
an identical private temporary copy parsed successfully. The source fix uses
that allowed temporary location, verifies byte equality, removes only its own
temporary files, and retains hashed evidence in the report bundle. No policy or
packet-proof requirement changed. The original failed report remains unchanged.

The subsequent read-only shutdown journal correlates both clean exit-code-zero
decoy stops at `2026-10-08T02:54:56Z` with host shutdown. Their `on-failure:5`
policy does not restart that clean exit. The static PCAP unit has no current-boot
activation record; this does not establish an exact historical packet gap.
Use the current-state review above as the next action. Do not change restart
or boot policies as a shortcut.

For offline Stage 7 regressions, use `make stage7-test`: ordinary unittest
discovery skips the retained hyphenated filenames. The explicit runner requires
all seven retained test modules and fails when one is absent or empty. These
private workspace qualification files are required; a source-only clone without
them reports BLOCKED rather than claiming qualification. Offline PASS never
clears either live gate.

`runtime-before.json` and `runtime-after.json` record source hashes, candidate Git
revision/dirty state, image/container identities, configuration fingerprints,
networks, bindings, containment and capture identity. An image's deployed Git
revision remains UNKNOWN when no reliable revision metadata exists.

The existing Grafana dashboard source includes a new **Local demo markers**
panel. It has not been deployed or live-validated by this development session.
After reviewed deployment, open the local Grafana dashboard and compare the run
ID/event ID with the generated report. A username marker alone is not trusted
proof that an arbitrary event was generated by this tool.

## Architecture

```text
Replay: synthetic Cowrie source file ──────────────┐
                                                 ↓
Live: localhost → OpenCanary → source log → incidentd
                                      normalize / correlate / classify
                                                 ↓
                                    incident + retained evidence
                                                 ↓
                                    CLI / offline browser report

Live searchable output → Alloy → Loki → Grafana
Live decoy bridges     → Suricata + dumpcap
Live decoy access      → hp_guard containment
```

## Safety and limits

Replay writes only to a new workspace sandbox. Live mode creates normal
synthetic telemetry through one local decoy connection; it does not overwrite
logs, inject fake records into live source files, or modify evidence. It uses no
real credentials and has no external target argument. Management access,
firewall policy, outbound controls, and WAN settings are unchanged.

The demo does not qualify Stage 7 or Stage 8 and does not authorize WAN exposure.
PCAP automatic recovery remains disabled; manual recovery must respect disk and
containment gates. Do not start a second stack from this checkout while staging
is the runtime. The new healthcheck requires `capture_status.py` alongside it
when these source changes are eventually deployed.

`python3 -B scripts/hp.py status` displays a saved observation, not a fresh
runtime check. It now returns failure for missing, unhealthy, older-than-180-second,
future-dated or previous-boot snapshots. Legacy snapshots without a boot ID must
be refreshed on the runtime host. Deploy `health_snapshot.py` alongside `hp.py`
and `healthcheck.py`; this source change has not been installed in staging.
