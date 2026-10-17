# HoneyTrace current phase status — 2026-10-17

**Active phase: supervised localhost beta qualification, including independent
Stage 7 closeout. Overall status: BLOCKED.** This is the current phase disposition;
the detailed obligations remain in
[BETA_ACCEPTANCE.md](../honeypot/docs/BETA_ACCEPTANCE.md). Stage 8 boot/recovery
and WAN qualification remain separate, unaccepted work. Phase 10 is
**PLANNED — PENDING — DO NOT IMPLEMENT**.

## Source and evidence authority

The original polish2 directory is a dirty local `master` export at
`2054c4f7762b01d969619629f785185e81413c09`, with no remote. Its 27 modified or
untracked files were preserved before work. Development uses a separate clone,
branch `fix/current-phase-qualification-20261017`, based on GitHub default branch
`HoneyWatch` at `3e23eabc31bf1ca0a93adfafc6601df28739dc23`.

GitHub confirms PR #21 merged on October 17. Its inherited description still
contains an earlier merge hold; the merge record and default-branch commit
supersede that source-publication statement. PR #19 remains open as the original
review record. Four subsequent reproduced review defects remained in the merged
source. This follow-up completes a preserved local draft addressing those defects;
the draft's original directory is unchanged. Review and merge of this follow-up
remain pending. No issue or historical review thread is declared resolved here.

The last completed historical seven-service matrix remains
`stage7-fresh-ewnrhtur`, October 10, source
`1a2b8c73106763d824999091c4e56c64f061f59e`, boot
`67a93065-7f07-40e5-aa12-806d9ff14dcc`. Its report hash is
`97bee3ef001e17c0c65b376cf472ea183fff5ce6e37db6c938278dcf50fcbdbc`.
All seven historical rows are recorded PASS; independent closeout is PENDING.
Rehashing linked artifacts in this session verified 67 hashes; 11 protected
packet/recovery inputs remain unavailable. Packet parsing and finite-prefix
custody verification are incomplete. Do not rerun that completed historical
matrix or apply its clean-source/current-boot verifier to a changed build or boot.
A separately reviewed current-build plan is needed after any approved deployment.

## Read-only current host observations

Acquired approximately 23:31–23:36 UTC, boot
`9b677efc-3972-4a13-910a-ffa2568fe6db`. The clock was unsynchronized; these are
reported host times with no established accuracy bound. They supersede the
October 16 clock/health observations for this acquisition only.

- System Docker owns the seven named HoneyTrace containers through
  `unix:///run/docker.sock`, data root `/var/lib/docker`, daemon ID
  `3612472c-c10a-4958-ad15-ce8f00884ec8`. All seven are healthy, restart counts 0,
  with staging-root Compose labels. The Snap daemon is inactive/disabled; its
  alternate socket is absent. No dual running daemon was observed.
- Inspected units report `NeedDaemonReload=no`. The reload approval disposition
  remains **HOLD**: this observation authorizes no manager or service action.
- All published HoneyTrace ports are loopback-only. Container root filesystems
  are read-only and none is privileged. Full semantic containment acceptance is
  incomplete: the guard unit is active/exited, but reading the actual nftables
  table requires root. Unit activity alone cannot prove guard policy.
- Capture PID 5941 is `dumpcap` on both expected decoy bridges, with 100,000 KiB
  size, 1,000-file and 300-second rotation settings. `Restart=no`; the Install-only
  drop-in and PCAP enablement are present. A closed current-boot 13,140-byte
  segment was acquired unchanged by hash and parsed: **74 packets**, parser exit
  0. A separate older 300-byte sample has zero packets. These establish scoped
  packet collection, not event attribution, continuous coverage or safe boot.
- Staging source differs from this candidate. It lacks `runtime_inventory.py`,
  `health_snapshot.py` and `state/images.lock.json`; the deployed evidence-store
  module is 2,421 bytes, substantially older than the candidate. Current image
  IDs are observations, not reviewed image approvals. No newer code is deployed.
- The installed raw-log policy uses daily/rotate 7/copytruncate. It lacks the
  candidate's maxsize/maxage and `cowrie.log` coverage. Retention enforcement,
  complete evidence integrity and log ingestion continuity remain unqualified.
- `timedatectl` reports synchronization **no**; Chrony reports stratum 0,
  reference ID 0 and leap status **Not synchronised**. Do not reuse October 16's
  reported clock bound for this boot or manufacture a packet/event time window.

Private acquisition: `work/development-handoff-20261017-ebuqjgre/` under the
original project directory. `host-acquisition.json` pins exact commands, times,
exit codes and output hashes; `host-source-hashes.json`,
`historical-hash-audit.json` and `capture-samples.json` record the remaining
observations. Raw host, packet and incident artifacts stay private.

## Source corrections and validation

The updater requires a separately reviewed `configs/images.approved.json` and
its explicit SHA-256 before stopping services. Prospective images must match
before startup, which disables rebuilding/pulling; container identities are
checked afterward. Post-start receipts are written to `images.observed.json`
and cannot create approval. Qualification uses the candidate's approval, not
runtime-generated locks. The shipped approval is intentionally empty: no
production image identity has been approved by this patch.

Custody checks require finite typed numbers, real timezone-aware timestamps and
monotonic growth. Duplicate event locations discovered after migration commit
durable conflict fences before diagnostics can fail; every conflicting incident
remains blocked across writer restarts. Static configuration rejects special
files and symlinks before opening, with finite file and inventory limits.

Validation environment: Ubuntu development host, Linux 7.0.0-38, Python 3.14.4.
Tested source commit: `8b1bff8a97d0b8933d5d034e44a74ef9b81d1d6e`.
All 115 recorded script/test/configuration/validator hashes match that commit.
Validation receipt SHA-256:
`ca2b0ae78c81480ecffa562b53be2a8c1d387e17823de279e04b61bc0d9c3a2b`.
The subsequent documentation commit does not change those files. Supported Python 3.12/Ubuntu 24.04
installation acceptance remains separate.

| Command | Observed result | Limits |
|---|---|---|
| `python3 -B -m unittest discover -s tests -p test_pr21_review.py -v` in `honeypot/` | 17 passed, 0 failed, 0 skipped; exit 0 | Synthetic controls and regressions |
| `python3 -B tools/validate_baseline.py` at repository root | exit 0 | Runs all rows below, archive/source/dependency checks |
| validator's `unittest discover -s tools/tests -v` | 21 passed, 0 failed, 0 skipped | Validator regressions |
| validator's `make stage7-test` | 89 passed, 0 failed, 0 skipped | Retained synthetic qualification suite |
| validator's `make test` | 436 passed, 0 failed, 0 skipped | Application regressions |
| validator's `make verify` | 436 unit tests pass; 17 static PASS / 2 NOT TESTED; exit 0 | Native Suricata and Ubuntu live integration NOT TESTED; live checks NOT RUN |

Full output and source hashes: private `validation-oc50mli2/validation.json` and
adjacent stdout/stderr files. Initial sandbox Unix-socket denial and initial
group-writable checkout-mode rejection were preserved; the focused fixture ran
outside the sandbox and only the isolated checkout's modes were normalized to
Git's recorded modes. Neither result was relabeled as a code failure or PASS.

**SOURCE_VALIDATED** applies to these checks. **CONFIGURATION_VALIDATED**, full
**RUNTIME_VALIDATED**, **END_TO_END_VALIDATED** and **RELEASE_ACCEPTED** are not
established by this session.

## Remaining acceptance and ordered next deliverables

1. Independently review these four source corrections. Establish expected image
   IDs from reviewed download/build provenance; never copy observed running IDs
   into the approval merely to clear qualification.
2. Complete protected read-only containment/evidence acquisition and historical
   Stage 7 audit, including all eight exact packet links, recovery provenance and
   finite baseline prefixes. Missing or rolled-away inputs stay unresolved.
3. Reconcile clock health, deployed build/static mounts and complete current
   custody. Preserve consistent source/evidence/locator/checkpoint copies and
   rehearse the corrected migration on an isolated copy. No original is rewritten.
4. Prepare an exact reviewed deployment/rollback for the accepted source and
   images, with finite preservation and abort limits. Obtain separate approval
   before target changes. No broad Compose recreation or daemon reload is implied.
5. Qualify the accepted current build/boot: seven healthy owned services, actual
   containment/DNS, clock bound, guarded event-to-Loki-to-packet demonstration,
   complete evidence preservation, logging/rotation, capacity/manual failure
   response, and independent Stage 7 final review (B05–B14).
6. Finish operator walkthrough, accepted-source package/clean extraction,
   supported installation and manual recovery/rollback qualification (B15–B18).
   B01–B04 historical successes retain their exact source scope; source CI does
   not extend them to a fresh installation or live deployment.

**OPERATOR MUST RUN IN TERMINAL:** the private
`operator-protected-readonly.sh` and `operator-historical-hashes.sh` are labeled
**PROPOSED — NOT APPLIED / NOT EXECUTED** and syntax-checked only. They read
observations; they do not repair policy, stop/start services or qualify gates.
Review their complete output before choosing any live correction. Interactive
sudo is the remaining access boundary, not an instruction to stop offline work.

Service changes, clock configuration, firewall changes, daemon reload,
deployment, merge, reboot, release/tag and WAN exposure require their separate
operator gates. No such action occurred in this session. Historical corruption
cause, power-loss durability and capture gaps remain unresolved.
