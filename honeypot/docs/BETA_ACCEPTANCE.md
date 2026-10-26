# HoneyTrace supervised beta acceptance checklist

Candidate: **v1.3.0-beta.1 — UNVERIFIED SOURCE CANDIDATE**.

**October 26 reconciliation:** [CURRENT_PHASE_STATUS](../../docs/CURRENT_PHASE_STATUS.md)
records HoneyWatch through merged PR #38, verified CI totals/skips, superseded
PRs #23/#30, review dispositions and outstanding Phase 7 gates. It supersedes
current-state wording in the dated observations below without rescoring this
historical checklist. B17 and current-build live acceptance remain unaccepted;
Phase 8 execution and public beta remain unauthorized.
The observations and scoring below are retained historical scopes. The selected
Phase 8 target is the laptop; its October 20 read-only acquisition reports Ubuntu
26.04/Python 3.14, seven healthy owned services and an unsynchronized clock. It
does not meet B17's dedicated Ubuntu 24.04 x86_64/Python 3.12 requirement. No
installation, deployment, current-build qualification or boot execution is accepted.
The previously empty OpenCanary current log is now nonempty; fresh end-to-end
logging/rotation acceptance remains pending. Health JSON still has no boot ID.

Initial-beta release disposition: **BLOCKED — acceptance incomplete**.

**2026-10-17 reconciliation:** [current phase status](../../docs/CURRENT_PHASE_STATUS.md)
is the latest disposition. It supersedes the October 16 current-state statements
below while preserving their historical evidence. Current system Docker ownership
and seven healthy services are observed; a closed capture sample contains 74
packets. The new boot's clock is unsynchronized, containment/evidence acceptance
is incomplete, and independent Stage 7 closeout remains PENDING. No beta gate is
silently advanced by these scoped observations or the new source regressions.

**Historical October 16 observation — successful health unit and healthy state reported.**
[E33][e33] supersedes the earlier health-failure snapshot: the unit completed with
Result=success and ExecMainStatus=0 at 2026-10-16 20:08:37 UTC. A later health JSON
timestamped 20:10:39.708822 UTC reports clock_synchronized, pcap_running and
log_forwarding true, with problems=[] and warnings=[]; both read queries exit 0.
These are separate scoped PASS observations. The JSON projects boot_id=null
and is 122.708822 seconds newer than the unit exit, so the supplied InvocationID
must not be assigned to it or treated as a matched current-boot acquisition.

Clock/health troubleshooting closes for these observations. [E32][e32] confirms
tracking Normal and manager synchronized=yes, with an approximately 98 ms
conditional instantaneous error bound assuming a correct upstream reference.
Earlier failures and time uncertainty remain preserved in E29–E31. E28 retains
seven healthy services after staging recovery; E29 retains loaded guard rules
and active/header-only capture. Fresh actual packets, complete containment,
deployment/source identity, evidence integrity and full live postflight remain
unverified. No host change is selected; the unchanged ZIP predates these observations.

Assessment: **2026-10-16 UTC**, incorporating 2026-10-15/16 evidence. Linked records distinguish saved acquisitions, operator-pasted output, operator-reported reboot observations and synthetic source validation.

This is the single release checklist for the first beta: an **operator-supervised,
localhost-only deception lab**. New features are frozen. Changes may repair a
confirmed acceptance blocker, make existing qualification tooling portable, add
necessary regression coverage, or complete operator documentation and packaging.
Evidence Explorer, additional decoys, cloud integrations, a new frontend and
multi-host operation are deferred. Grok findings must be verified; in-scope
release defects enter the existing gates, while feature proposals remain deferred.

The initial beta does not include automatic decoy boot, unattended recovery or WAN
exposure. Those modes have separate requirements below. The explicitly requested
PCAP-only boot enablement was applied by the operator using an Install-only
drop-in [E21][e21]. E22 reported enabled/active, the drop-in and
NeedDaemonReload=yes before the disruption. E28 reports inactive capture followed
by manual start and active state; current enablement/loaded properties were not
reacquired. Reconciliation and automatic capture after an enable reboot remain
NOT TESTED. This exception does not qualify Phase 8 boot ordering, fail-closed recovery or continuity.
Initial-beta scope does not waive Stage 7 closeout, evidence integrity or mandatory
durability obligations.

## Implementation provenance and scoring

- **I — frozen beta implementation:** 9ede54cb732182a396960f892d980780aff05bfc,
  branch beta/2026-10-13-local-candidate, in the existing linked source worktree.
- **C — current local source baseline:** ee0b7e3cb11c57c9713681e33e395e4674e3a009,
  clean before the preserved local documentation/install-metadata edits.
- **W — current uncommitted candidate:** C plus those edits and the reviewed
  qualification-portability patch applied on 2026-10-16 [E24][e24]. A Git HEAD alone
  does not identify W; exact source hashes are retained with the integration and
  distribution records. No commit or deployment is implied.
- **F — preserved polish2 checkpoint:** 2054c4f7762b01d969619629f785185e81413c09.
  Master and original reports are preserved. Post-E27 staging/evidence integrity
  is UNKNOWN until assessed; no preservation claim follows from a directory name.
- **H — historical restart-matrix implementation:** 1a2b8c73106763d824999091c4e56c64f061f59e.
- **P — older packaged source:** a9414aef5cc7aeee6b7db542d1efa939fa987ee9.
  Its archive is historical and cannot validate I or a later candidate.
- W includes updated acceptance/quickstart documentation, the existing Install-only
  candidate PCAP template addition, and fifteen reviewed qualification paths. The
  qualification patch is **APPLIED — UNCOMMITTED**; its synthetic tests do not
  establish live Stage 7 closeout. The matching full-unit append [E20][e20] remains
  **PROPOSED — NOT APPLIED**; the operator chose the live drop-in [E21][e21]. The
  agent made no live change, commit or deployment. Application/evidence logic and
  source-to-image qualification remain unchanged.

**PASS** means the stated scope has supporting evidence at its identified source
revision. **FAIL** means a demonstrated requirement remains unmet. **NOT TESTED**
means required coverage is absent, incomplete, inaccessible or from an unsuitable
revision/boot. Every B gate must pass before release; partial pipeline success and
a helper's summary alone are insufficient. The current B-gate totals are
**4 PASS / 0 FAIL / 14 NOT TESTED**. PASS runtime rows describe the supplied
2026-10-15/16 observations within their individual scopes, not deployment identity (B06), complete Stage 7 closeout
(B11), or a newly qualified beta package. The post-recovery subchecks below
preserve narrower PASS results where a composite gate remains NOT TESTED.

The source column identifies the relevant implementation or historical subject.
I is not asserted to be deployed. Runtime image revision labels are not established;
fresh acceptance must retain container/image identities and reviewed module/config
hashes. Private helpers are identified by SHA-256 in the evidence, rather than
being falsely attributed to a Git commit.

Evidence links point to the existing private local preparation and qualification
bundles. Their contents stay outside Git and the distributable package. A clean
package needs its own sanitized, revision-matched acceptance record. Historical
phase checklists remain reference records; they do not clear this checklist.

The older restricted-session and target observations are historical. [E18][e18]
records the 2026-10-15 post-recovery output on boot
397b28e3-ef69-4047-9b06-f9d33ac748f6 and the subsequent reboot attestation supplied
by the operator. The new post-reboot boot ID/raw transcript and exact packet-decode
output were not supplied. Do not invent them or treat summary hashes as raw-evidence
hashes. [E15][e15] and [E16][e16] are independently rehashed pre-repair acquisitions;
their PIDs and invocation pins must not be used as current dispatch prerequisites.

## Required initial-beta gates

| Gate | Status | Acceptance requirement | Evidence and present limitation | Source commit |
|---|---|---|---|---|
| B01 — scope and source provenance | **PASS** | Freeze supervised loopback scope; identify source/branch, preserve the original checkpoint, and separate source from staging and publication copies. | [E01][e01]; this scope decision and the preserved checkpoints. No deployment or publication claim. | [I](#implementation-provenance-and-scoring); [F](#implementation-provenance-and-scoring) |
| B02 — application regressions and fast static checks | **PASS** | Recorded application tests and fast validation succeed for the pinned implementation. Track native/live checks separately. | [E02][e02]: 302 tests, make test exit 0; make verify exit 0 with 17 static PASS, 2 NOT TESTED and live checks NOT RUN. Fifteen artifact/source hashes were rechecked in the original 2026-10-14 assessment. E20 adds 37 focused capture/recovery PASS tests; E23/E24 add 89 Stage 7 + 8 runner synthetic PASS on clean source and a copy identical to the applied W. Full make test/make verify were not rerun for W; the recorded PASS remains scoped to I. | [I](#implementation-provenance-and-scoring) |
| B03 — isolated synthetic replay | **PASS** | Real normalization, classification, incident attachment, retained records, retry deduplication and searchable-password exclusion work in an isolated sandbox. | [E03][e03], [report][replay]: recorded PASS_REPLAY, exit 0 in the original assessment; ten implementation hashes, seven offline steps, three normalized records and evidence/metadata uniqueness checked independently. Loki and capture are NOT TESTED by replay. | [I](#implementation-provenance-and-scoring) |
| B04 — portable qualification tooling | **PASS** | All required offline qualification tests and reviewed dependencies run from a clean source extraction without private history, retained-data fixtures or ignored local files. | [E23][e23]: clean ee0b7e3 extraction plus exact reviewed patch imports seven modules and passes 89 Stage 7 + 8 runner tests. [E24][e24]: same patch a7e9a630… applied without conflicts, uncommitted in W; an identical copy again passes 89+8, with 198 source hashes stable and 183 outside-allowlist files unchanged. Synthetic fixtures only; full application/package/live qualification is separate. E04 retains the historical failure. | [W](#implementation-provenance-and-scoring), based on [C](#implementation-provenance-and-scoring); full patch SHA in E24 |
| B05 — Docker endpoint and workload ownership | **NOT TESTED** | Identify the approved daemon/socket/data root and its seven owned services; account for both daemons and unrelated workloads before any service action. | E18 established known system-store ownership before interruption. E27 removed/recreated project resources; E28 later reports seven named healthy services started from staging. Explicit current endpoint/store, container IDs, labels/mount sources and stopped/unrelated workload accounting are not supplied; old pins remain stale. | Observed runtime; deployed commit unverified; [C](#implementation-provenance-and-scoring) record |
| B06 — tested deployment identity and seven healthy services | **NOT TESTED** | Retain container/image IDs, reviewed deployed source/config hashes, mounts, policies and health for all seven expected services. Document any unestablished image revision label. | E28 supersedes the E27 outage snapshot: all seven expected services show Up 22 minutes (healthy) after operator staging-root recreation. This narrow health subcheck PASS does not supply current container/image IDs, deployed hashes, actual mounts/policies or source-to-image identity. | [I](#implementation-provenance-and-scoring) / [C](#implementation-provenance-and-scoring) acceptance target; deployed revision unverified |
| B07 — containment and protected management | **NOT TESTED** | Verify actual hp_guard semantics, decoy networks/DNS blackholes, expected bindings/mounts/security properties, management loopback-only, WAN off and no container Docker-socket mount. | E29 expands E28 to a full displayed hp_guard policy with decoy input/forward hooks, protected-network/DNS/egress drops and a host-drop counter of 194 packets/31,188 bytes. This supports a loaded policy and recorded drops, not a fresh behavioral probe or the full DNS/network/mount/security/no-socket inventory after recreation. | Observed runtime; [C](#implementation-provenance-and-scoring) record; source equivalence unverified |
| B08 — active packet collection | **NOT TESTED** | Verify capture process identity, both expected decoy bridges, permissions, finite ring/resources and fresh actual packets. Active state or a header-only segment cannot pass. | E28 reports manual start; E29 reports active state and rotating 300-byte segments. tcpdump of ring_00014_20261016075020.pcapng displays a file header but no packet rows. Quiet traffic, interface attachment and other causes are not distinguished. Producer exit was not retained separately from head. Actual fresh packets, capture PID/interfaces and gap bounds remain unverified; current loaded/enablement and automatic startup also remain untested. | Observed deployed capture; deployed module revision unverified; [C](#implementation-provenance-and-scoring) record |
| B09 — fresh guarded live demonstration and postflight | **NOT TESTED** | One bounded, uniquely marked owned-loopback interaction must link source record → normalized event ID → correct classification/incident → exact Loki event/operator visibility → hashed matching packet evidence. Complete postflight health, logging, capture and configuration-preservation checks. | E18/E26 retain prior controlled HIGH incident, closed-copy receipts and scoped Loki visibility; retained SSH-match and exact HIGH-session Loki gaps remain. E27 interrupted/replaced the live deployment. E33 adds successful health observations but no new controlled chain or complete, identity-bound postflight. Completed synthetic tests do not qualify that runtime. | Observed runtime; [C](#implementation-provenance-and-scoring) acceptance target; deployed revision unverified |
| B10 — complete current integrity and preservation | **NOT TESTED** | Cover every inventoried incident within reviewed finite limits; retain completed/read bytes, custody, log prefixes, offsets, counts/deduplication and stable observations. Verify the pinned damaged original and separate recovery/provenance without treating a derivative as original evidence. | Prior preservation/integrity remained incomplete. E27 includes deletion of the temporary checkout and its generated state/data; scope of lost temporary evidence and integrity/completeness of original staging data/backups are UNKNOWN. Preserve surviving originals before any recreation/bootstrap/credential action. | [I](#implementation-provenance-and-scoring) acceptance target; private review source pins in E07 |
| B11 — independent Stage 7 closeout and current handoff | **NOT TESTED** | Independently verify retained report/row hashes, actual packet matches and preservation; then reconcile the current boot before issuing a current handoff. Preserve every mandatory Stage 7 obligation. | [E11][e11]: seven historical operator rows PASS on H, but independent packet/evidence closeout remains PENDING. Later boots do not erase that historical run or qualify the current runtime. Do not repeat its completed matrix. | [H](#implementation-provenance-and-scoring) historical; [I](#implementation-provenance-and-scoring) current acceptance target |
| B12 — health and logging continuity | **NOT TESTED** | Sensors, forwarding, ingestion heartbeat, health reporting and log rotation recover and remain observable. Missing/unreadable telemetry must be reported as unavailable rather than idle. | E33 supersedes E29's failed-unit snapshot: Result=success, ExecMainStatus=0 at 20:08:37 UTC; a separate 20:10:39.708822 UTC state reports clock/capture/forwarding true and no problems/warnings. Both read exits 0. The JSON boot_id projection is null and its invocation is unbound; complete current-boot continuity, ingestion/source identity and post-recreation logrotate acceptance remain incomplete. No additional clock/health troubleshooting or automatic rerun is selected. | Observed runtime; [C](#implementation-provenance-and-scoring) record; deployed monitor revision unverified |
| B13 — clock and timestamp qualification | **NOT TESTED** | Measure clock state/uncertainty and support the selected packet/event verification windows. Preserve UNKNOWN historical capture gaps rather than reporting zero. | E32 passes current synchronization: Normal, stratum 3, timedatectl yes, both exits 0. The reported offset/dispersion/delay give a conditional instantaneous bound of 0.097524714 s assuming a correct reference. Retain this for the next live acceptance; it does not bound past unsynchronized intervals, future stability or independently prove the selected packet/event window. No new boot/acquisition time/raw transcript hash supplied; reference time is not acquisition time. | Observed runtime; [C](#implementation-provenance-and-scoring) acceptance target |
| B14 — supervised capacity and failure response | **NOT TESTED** | Verify ring/writer limits, storage headroom, watermarks, protected-evidence growth/retention plan, alerts, and the documented manual decoy response to capture/storage loss. Validate bounded recovery without deleting evidence or restart loops. | [E18][e18]: finite ring and reported 397G free / 11% use support point-in-time capacity. Manual logrotate policy omits template maxsize/maxage and cowrie.log coverage; due-rotation/forwarding and full growth/watermark/failure-response acceptance remain untested. PCAP-only enablement [E20][e20] keeps Restart=no and adds no automatic decoy shutdown. | [I](#implementation-provenance-and-scoring) / [C](#implementation-provenance-and-scoring); deployed behavior separately observed |
| B15 — operator workflow and limitations | **NOT TESTED** | Walk through the existing interface/quickstart on the supported setup: distinguish healthy/idle/unavailable, explain severity, show supporting references and explicit evidence gaps, redact ordinary views, and give the next safe action. | [quickstart](BETA_QUICKSTART.md), [operator model](OPERATOR_MODEL.md), [E02][e02], [E03][e03]. Source behavior is covered; a new operator's live walkthrough and supported-target usability are not. Extend existing reports only as required by a confirmed gate defect. | [I](#implementation-provenance-and-scoring) |
| B16 — current sanitized package and provenance | **NOT TESTED** | Build an allowlisted source/templates package for the accepted commit, review contents, exclude secrets/live state/raw evidence/backups/historical source copies, and verify checksums and manifest. | [E25][e25] records a sanitized install-test distribution candidate from W, with explicit allowlist, source identity and checksum/manifest verification. It remains UNVERIFIED; accepted-source/release package qualification is open. E12/E13 concern P and do not qualify W; preserve all older archives. E27 is a later outage; the preserved ZIP/checksum are unchanged and its acceptance snapshot does not describe current runtime readiness. | [I](#implementation-provenance-and-scoring) acceptance target; [P](#implementation-provenance-and-scoring) historical package |
| B17 — clean extraction and supported installation | **NOT TESTED** | From the current package, verify manifest, required offline suites and native configs, then a fresh installation on the documented dedicated Ubuntu 24.04 LTS x86_64 / Python 3.12 / Docker Compose v2 environment. | E25 package/extraction/synthetic checks pass within their recorded scope. E27 is a temporary extraction and Compose collision on the same IdeaPad, not a fresh supported installation. Printed 89-test OK and static COMPOSE_CONFIG_OK are preserved; zero-test discovery, missing-secret runtime failure and starting-only health do not establish installation PASS. | [I](#implementation-provenance-and-scoring) acceptance target; [P](#implementation-provenance-and-scoring) historical extraction |
| B18 — reviewed manual deployment and rollback | **NOT TESTED** | Before any needed target installation/change, review exact file/unit allowlist, prerequisites, preservation, prior enablement/policies, commands, stop/abort behavior and rollback. Verify supervised startup gates and owned-service recovery without affecting unrelated workloads. | [quickstart](BETA_QUICKSTART.md), [recovery](../RECOVERY.md), [E10][e10]. Broad synchronization, old-boot runners and transactional-rollback claims are unacceptable. Live changes require separate authorization. E27 demonstrates same-daemon resource overlap and unreviewed recreation/removal. No recovery/rollback action is approved; first assess surviving original staging data and preservation prerequisites. | [I](#implementation-provenance-and-scoring) acceptance target; [F](#implementation-provenance-and-scoring) preserved rollback source |

## Historical 2026-10-15/16 post-recovery and source-integration subchecks

These are scoped observations from before E27, not current runtime readiness.
Synthetic/source results remain valid for their pinned bytes; runtime recovery
results must not be carried across the later removal/recreation. These outcomes
preserve history without weakening the 18 composite B requirements. [E18][e18] records provenance; operator attestation is labeled and
is not an independently captured transcript. No new live tests were run here.

| Observed subcheck | Status | Evidence / remaining distinction |
|---|---|---|
| System Docker API/store and seven owned services | **PASS** | /var/lib/docker; normal socket restored; known Snap store empty, then Snap disabled; E18. |
| Seven settled healthy containers and successful health unit | **PASS** | All seven healthy, health status=0/SUCCESS and problems=[]; E18. |
| hp_guard policy and reported enforcement | **PASS** | Displayed input/forward/outbound policy; operator reports enforcing, including after reboot; full B07 inventory remains NOT TESTED. |
| Packet collection after manual start | **PASS** | Identity/interfaces/finite ring shown; tcpdump session match in then-active ring 5 reported by operator; E18. |
| Controlled HIGH incident and closed-PCAP preservation receipts | **PASS** | Incident 1d569241dc8adceeefbbfd8e-0000, 15 references, two stable/hash receipts for rings 3/4; E18. |
| Matching SSH packets in the retained incident copies | **NOT TESTED** | Live-ring-5 match is reported; metadata still lists rings 3/4. Capture and incident preservation are separate; closed-ring snapshot excludes the newest open ring by design. |
| Health/logrotate failure recovery | **PASS** | Health exits 0 with problems=[]; logrotate and cold-retention commands exit 0. Bounded-retention policy and due rotation remain B14 work. |
| Loki normalized-event and incident-summary visibility | **PASS** | E26 visible range-query response returns source=normalized and source=incidents, both LOW. Response is truncated; no producer exit is established. Exact controlled HIGH incident/event matching remains B09 work. |
| Qualification portability in the applied candidate | **PASS** | E23/E24: exact reviewed patch applied uncommitted; clean-extract and identical candidate-copy suites each pass 89 Stage 7 + 8 runner tests. This does not close live Stage 7. |
| Docker/Snap/container/guard return after reboot | **PASS** | Operator reports correct ownership, Snap still disabled, seven healthy and guard enforcing; new boot ID/raw console transcript not supplied. No boot-order/continuity claim. |
| PCAP boot enablement | **PASS** | [E21][e21]: exact Install-only drop-in and multi-user wants link independently read; [E22][e22] operator query confirms enabled, active/running and the expected DropInPaths, CHECK_EXIT=0. No new file hashes are claimed by E22. |
| PCAP loaded-definition reconciliation | **FAIL** | [E22][e22]: NeedDaemonReload=yes confirms the pending manager state. MainPID=12268 and InvocationID=d127388e91f64ef48b28fd7f10f0be6d are operator-reported at this query; no boot/time or fresh packet observation was supplied. Exact changed input and host-wide effects remain unknown; further reload remains HOLD. |
| PCAP automatic capture after a later reboot | **NOT TESTED** | Enablement is configured; no post-enable reboot/capture identity or continuity evidence is supplied. |

The PCAP proposal adds only `[Install]` / `WantedBy=multi-user.target`. ExecStart,
User/Group, capabilities, ring parameters, dependencies and Restart=no are unchanged.
It does not change containment, Docker/Snap, decoy startup or closed-ring/HIGH-only
preservation. The snapshot excludes the newest open ring by design. The HIGH
incident's two closed-copy receipts therefore do not prove that matching SSH packets
were retained: ring 5 was the then-active ring and is not listed in those receipts.
No automatic later snapshot or packet-match PASS is inferred. Enablement is not a
Phase 8 PASS. The template change remains local
and uncommitted; the operator applied only the drop-in alternative. The agent did
not write live configuration or operate the manager. New drop-in/unit identity must
be reconciled with strict readers; their checks were not weakened.

A failure or incomplete scan blocks acceptance. Frozen Stage 7 qualification remains
512 MiB aggregate, 16 MiB/event file, 1 MiB/metadata file, 4,000 incidents and the
existing 120-second prerequisite deadline. The operator-selected 640 MiB allowance
applies only to the new current-recovery review. It is not an automatic amendment
to historical qualification or permission to omit evidence. An exceeded allowance
requires diagnosis and a separately reviewed bounded change.

Historical corruption cause, separate recovery derivative, unknown reboot capture
gaps and power-loss limitations stay in the handoff. Documenting a limitation does
not waive a mandatory integrity/durability check.

## Current post-interruption disposition

| Recovery subcheck | Status | Scope / remaining distinction |
|---|---|---|
| Seven expected named services healthy | **PASS** | E28 operator inventory reports all seven Up 22 minutes (healthy); complete B06 identity/mount/hash requirements remain NOT TESTED. |
| PCAP manually started and active | **PASS** | E28 inactive before start, active afterward; E29 again shows active and recent rotating files. No actual packet/identity/interface proof. |
| Full displayed hp_guard policy and recorded host drops | **PASS** | E29 full table, NFT_EXIT=0, expected decoy bridge hooks/drop categories and host-drop counter. No fresh behavioral test or complete B07 inventory is inferred. |
| Fresh post-recreation packets and gap measurement | **NOT TESTED** | E29 tcpdump displays only a file header from the newest 300-byte segment. No packet rows, new boot/capture identity or gap bounds supplied. |
| Successful health unit completion | **PASS** | E33 Result=success, ExecMainStatus=0, InvocationID=d2fc8ac8c85d4e21b20ebbc2f2adb8bd, exit time 2026-10-16 20:08:37 UTC. Read query exits 0; this supersedes E29's failure snapshot. |
| Later healthy state fields | **PASS** | E33 JSON timestamp 20:10:39.708822 UTC reports clock_synchronized, pcap_running and log_forwarding true, problems=[] and warnings=[]; read exits 0. These are producer assertions, not fresh independent packet/integrity tests. |
| Matched current-boot health provenance | **NOT TESTED** | JSON boot_id projects null (missing or explicit null unknown). JSON is 122.708822 s newer than supplied unit exit; do not attach that earlier InvocationID. Another timer run is possible, not proved. Candidate strict snapshot reader requires a matching current boot; no live producer edit is inferred or applied. |
| Chrony source selection | **PASS** | E31 has ^* best and ^+ combined IPv6 sources, nonzero Reach and sources/activity exits 0. Two IPv4 sources remain unusable; cause unknown. |
| Current tracking and manager synchronization | **PASS** | E32 tracking Normal, stratum 3, 3.402560 ms system-to-NTP correction and manager yes; both query exits 0. No clock/service change was run by the agent. |
| Reported conditional instantaneous clock uncertainty | **PASS** | E32 calculated 0.003402560 + 0.005918098 + 0.176408112/2 = 0.097524714 s, assuming the upstream reference is correct. This is not an independent UTC measurement. |
| Supported verification window and historical timing | **NOT TESTED** | Current snapshot cannot retroactively qualify earlier unsynchronized time or measure historical capture gaps. Use contemporaneous timing support in the next guarded live acceptance; do not repeat completed clock diagnosis. |
| Reported forwarding and visible Loki health warning | **PASS** | E29 log_forwarding=true and a visible health-stream record. Body truncated; LOKI_EXIT follows echo, so the Docker/curl producer exit is not retained. No exact controlled-session match is claimed. |
| Current logrotate and full logging continuity | **NOT TESTED** | E33 adds scoped health/forwarding success but no new logrotate result, complete identity-bound forwarding inventory or measured continuity across the disruption. |
| Original evidence integrity/private preservation | **NOT TESTED** | E29 directory listings show incidents/captures exist, not complete contents or integrity. Original staging data loss is not established; deleted temporary data is not restored by recreation. |

The original E27 outage and E29/E30 failures are preserved. E28 supplies reported
service recovery; E31/E32 establish later source selection/synchronization; E33
supplies successful unit completion and a separate healthy state. Clock/health
diagnosis closes for these observations. Current-boot/source provenance, complete
continuity and timing support for fresh live acceptance remain incomplete.
Current daemon/store, actual mounts and full guard/network state still need
read-only reconciliation. Fresh supported installation remains
NOT TESTED: a temporary checkout on the same daemon is not a new target. A -p flag
alone is insufficient with fixed names, bridges, host sensor and published ports.
The completed synthetic/package checks remain valid for their pinned bytes. The
ZIP is unchanged; no full Stage 7 closeout, continuity or post-enable boot PASS is
claimed. No more container recreation or host mutation is selected by this record.

## Daemon-reload hold: specific prerequisites

**Daemon-reload remains on HOLD.** Docker ownership recovery was reported without
a reload; the historical R review below is preserved, not the current Docker repair
plan. The user permits only a separately approved PCAP install-metadata proposal
[E20][e20], not blanket reload authority. `daemon-reload` is manager-wide: it cannot
be limited to PCAP. The proposed Install-only enablement can use `enable --no-reload`
without invoking it; any explicit manager reload still requires the applicable
effect review and specific approval. E21 records the operator reload/enable/start,
followed by a stale-definition warning. The operator's property follow-up [E22][e22]
reports enabled/active/running and the expected drop-in, but NeedDaemonReload=yes.
No further reload is approved or run by the agent. The command order is a plausible
explanation, not proof of the exact changed input or of one-unit-only effects.
Any next reload requires the applicable current effect review and specific approval;
no service restart or repeat installation is selected.

| Review prerequisite | Status | Required resolution / retained evidence | Source commit |
|---|---|---|---|
| R01 — point-in-time identity basis | **PASS** | [E06][e06]: operator report independently rehashed; two identical observations of boot, six unit/file states, daemon executable/start identities and empty jobs. Eight input hashes cover 3,554 bytes. This is acquisition evidence, not future atomic confirmation. | [F](#implementation-provenance-and-scoring) plus private collector SHA in E06 |
| R02 — scoped six-unit comparison | **PASS** | [E10][e10]: 74 compared directive groups match and no applicable six-unit drop-ins/shadows were found. Commands/error policy, hard/soft limits, socket properties and PCAP restrictions were examined. Six metadata declarations are separate. | [F](#implementation-provenance-and-scoring) plus private comparison source in E10 |
| R03 — host-wide definitions and generator effects | **NOT TESTED** | Review relevant manager defaults, other changed definitions/drop-ins, effective generators/inputs/dependencies and expected runtime-file writes; retain current pins and explicitly bound unknown effects. Eight input hashes are not semantic review. Original cached text/historical input hashes are unavailable and must never be described as reconstructed. [E10][e10]. | [F](#implementation-provenance-and-scoring) basis; private review in E10 |
| R04 — full critical runner policy coverage | **FAIL** | Original POLICY omits several inspected directives, including pre/post commands and sandbox/limits/socket/environment-file properties. Revise the runner and add negative drift coverage before presenting it again. [E10][e10]. | [F](#implementation-provenance-and-scoring) helper basis; original runner SHA in E10 |
| R05 — revalidation at dispatch | **FAIL** | After the long snapshots, original code rechecks only source pins/boot. Revalidate required files, process/InvocationID/start identities and empty jobs at the bounded dispatch boundary, recording acquisition age and aborting on drift. Do not promise atomicity. [E10][e10]. | [F](#implementation-provenance-and-scoring) helper basis; original runner SHA in E10 |
| R06 — complete failure preservation and postflight | **FAIL** | Preserve partial snapshot/failed-field evidence before raising; collect bounded safety/identity diagnostics when possible. The current fallback is six-unit state only. Retain one-attempt/no-retry behavior and uncertain completion after client timeout. [E10][e10]. | [F](#implementation-provenance-and-scoring) helper basis; original runner SHA in E10 |
| R07 — effects and recovery procedure reviewed | **NOT TESTED** | Describe stopping further requests separately from restoring prior configuration. Identify restorable files/state and separately approved recovery; cache/generated-output rollback cannot be promised from missing originals. Any generator writes and residual uncertainties must be in the concrete revised proposal. [E10][e10]. | [F](#implementation-provenance-and-scoring) helper basis; revised proposal not prepared |
| R08 — revised proposal validation and specific approval | **NOT TESTED** | Review the final diff, source/test/observation pins and meaningful revised-runner regressions; refresh required observations immediately before an approved action. Obtain approval for that exact proposal. [E10][e10] records the existing gaps; no old passing test count clears them. | [I](#implementation-provenance-and-scoring) scope; revised source revision not yet established |

Resolving R03 means a defensible current semantic/effect review with explicit
remaining historical uncertainty, not inventing an impossible original-text
comparison. No authorization is requested by this checklist. All required R items
must be resolved and the specific revised action approved before reviving that
historical reload runner. E20 supplies a separate PCAP-only proposal and preserves
the manager-wide reload limitation; no old runner is approved by the new evidence.

## Separate Phase 8 and WAN work

These gates do not count toward the 18 initial-beta requirements. The beta makes
no unattended-uptime or Internet-exposure claim.

| Deferred gate | Status | Acceptance scope and evidence | Source commit |
|---|---|---|---|
| P81 — host boot ordering | **NOT TESTED** | Bridges/networks before actual containment; every decoy startup path gated by storage, capture identity/interfaces and actual fresh packet readiness. [Stage 8 handoff](STAGE8_HANDOFF.md). Implementation remains gated on independent Stage 7 closeout. | [I](#implementation-provenance-and-scoring) scope; [F](#implementation-provenance-and-scoring) handoff |
| P82 — fail-closed boot/capture/disk recovery | **NOT TESTED** | Stop owned decoys safely on failure; distinguish intentional watermark stops; controlled recovery without automatic loops. Current code stops PCAP only at critical disk usage. [Stage 8 handoff](STAGE8_HANDOFF.md). | [I](#implementation-provenance-and-scoring) scope; [F](#implementation-provenance-and-scoring) deployed behavior |
| P83 — boot-time observability and evidence preservation | **NOT TESTED** | Restore sensors/ingestion with offsets, custody and deduplication intact; measure packet gaps with clock uncertainty and preserve power-loss limitations. [Stage 8 handoff](STAGE8_HANDOFF.md). | [I](#implementation-provenance-and-scoring) scope; [H](#implementation-provenance-and-scoring) historical restart evidence |
| P84 — console-supervised boot qualification | **NOT TESTED** | Separately reviewed implementation/deployment/rollback, bounded failure scenarios and abort conditions, then supervised host boot testing. Installing/enabling units, policy changes and reboot need separate approval. [Stage 8 handoff](STAGE8_HANDOFF.md). | [I](#implementation-provenance-and-scoring) scope; implementation/target test absent |
| W01 — WAN authority and exposure review | **NOT TESTED** | Written exposure authorization, approved threat/management/storage/recovery criteria and precise firewall/router/binding changes. WAN authorization is NONE. [WAN criteria](WAN_CRITERIA.md). | [I](#implementation-provenance-and-scoring) scope |
| W02 — WAN qualification | **NOT TESTED** | After separately authorized exposure, verify externally reachable intended decoys, protected management, egress containment and evidence continuity. No external probe or public deployment is authorized here. [WAN criteria](WAN_CRITERIA.md). | [I](#implementation-provenance-and-scoring) scope |

## Execution priorities and exit criteria

1. **Consolidate current deployment, containment and capture assessment.** E33
   supplies health success and E32 supplies synchronized tracking; do not repeat
   completed clock/health diagnosis. Before a fresh guarded localhost acceptance,
   obtain one separately reviewed read-only assessment of current boot, daemon/store,
   seven container/image IDs, actual staging mounts, bindings/security/DNS/guard,
   capture identity/interfaces and selected deployed-module hashes. Include the
   unresolved health boot/schema provenance in that assessment, rather than another
   standalone probe or a guessed live fix. E28/E29 preserve narrower successful
   runtime observations. Do not repeat recreation, adjust time or use stale IDs.
   Preserve surviving evidence and
   qualify integrity/private preservation; do not replay old runners or use a
   temporary checkout for Compose. Any later host change needs its own exact
   effects/rollback review. Do not repeat the historical Stage 7 matrix.
2. **PCAP-only persistence proposal.** Review E20's Install-only diff and rollback.
   The operator has applied the drop-in alternative E21. Do not enable, start,
   reload or reboot from the agent. E22 confirms NeedDaemonReload=yes. Review
   manager-wide pending effects before separately authorizing a reload; actual
   post-enable boot capture remains NOT TESTED. This exception does not implement
   Phase 8 or decoy boot policy.
3. **Clean-install/package validation.** B04 now passes: E23/E24 record the
   reviewed patch applied to W and verified synthetic 89+8 results. Do not repeat
   the completed integration. E25 supplies the unverified install-test candidate;
   retain its worktree identity, manifest and exclusions. Complete remaining full
   source/native/package qualification and a fresh supported-target installation.
   Do not start a second stack on staging. Exit: B16/B17 pass, followed by complete
   checklist/evidence/source review before any release.

## Evidence ledger

Hashes are of retained reports; they are not qualification substitutes. Private
runtime reports, captures, credentials, original corruption/recovery material and
generated replay sandboxes stay out of source control and the package.

| ID | Linked evidence | SHA-256 / provenance and scope |
|---|---|---|
| E01 | [Source/publication comparison][e01] | 3f85084e97d70b71e5331bf1572e96f06182723cfa3b25cdb7660dc5522d8025. Preserved F and the separate publication layout; I remains a local implementation. |
| E02 | [302-test/source validation][e02] | aa3f60d5af5cd0bba0039e604ae70835ea30c7dcb0f015e69163f9fef2ca59ff. beta_commit=I; recorded sources and output artifacts rehashed. No new live qualification. |
| E03 | [Fresh offline replay verification][e03], [synthetic report][replay] | Verification 101113c38499ad95d93162f712c34f46d8184008e47d86edb4e63628e34dc2c6; report 2f07bedc1f057116443e612c96ca59f164d0e936f34acd8df3129eda5c88b05b. Command exit 0 at I; implementation hashes checked. No live traffic/Loki/PCAP. |
| E04 | [Offline integration result][e04] | 4122b73bb534d5eaf770ae795faa7381a0835f5216412b5d03918f2415ad90fd. Recorded make stage7-test exit 2; seven missing paths rechecked. No missing test executed. |
| E05 | [Docker ownership observation][e05] | f09678b9b4d69f3ceaff362b4646e6bc8cc2cc36a1301f5cf43d6214ce8b799b. Same last-observed boot as E06; original identities and wrong API store, not health. |
| E06 | [Operator input/process report][e06], [independent verification][e06verify] | Report 7d743d482a1870027fa9be82f5375122c512d2c85570fc2de93d42f5cb5cfa5d; verification 0d678ce161d19424e32883d75120b57c77efacfaadfe50652ba999cf8726a477. Acquired 2026-10-14 10:58:12 UTC, reported exit 0. Private collector SHA c2cca091c904e3c44cbb71b0a9d90b1820a23cd1bc457197cc1fc26c6c3832e9; no generator/API/evidence scan. |
| E07 | [Current recovery review failure][e07] | 69cc142c12b01622d512c253101bf738658e3a692630c6b42ae9a3f42a8ca844. Ownership failed before integrity/preservation completion; explicit current-review 640 MiB policy remains scoped. |
| E08 | [Earlier candidate completion][e08] | 6125e48abdce41beac28ec8d9ca7eebbc5d496824ccf088b11bf673015c19104. P source-only candidate; historical failures/untested live work, not a new beta PASS. |
| E09 | [Scoped host metadata][e09] | e7ecdb344404da3278dcda7fa8b0765711f899e615ef5b1e70633b0964bbb3d0. Includes retained failed health/logrotate states; whole-host definitions and current container health are not cleared. |
| E10 | [Reload review][e10], [full review text][e10text], [six-unit comparison][e10compare] | Review f4c512b863f57c283fb9ee5ed5e0bf8abc0d74de58977252c68c76db2933b8cb; comparison ec2e201e97a707e020b5c196e914341f593fe88c571b5637ad82c8ba305bd1a4. Original private runner SHA e61765160fdd623c14afb7193b0573c0d2e70ba4d967b5621f97b3a4c578792b. Twenty-six tests cover the audit/reader, not a repaired reload runner. |
| E11 | [Preserved historical Stage 7 record][e11], [matrix report][matrix] | The historical record links matrix SHA 97bee3ef001e17c0c65b376cf472ea183fff5ce6e37db6c938278dcf50fcbdbc at H. This checklist does not independently rehash protected packets or clear closeout. |
| E12 | [Older package provenance][e12], [content review][e12review] | Candidate metadata ae36d8e3b4c755b8e543758f7e211efd1c119712e079177bd21117562836acff. P archive SHA 056a8e9cd98bd3eccb6b60531b5933d59872ccd4b15ef093d8e5e4fa3bb5ae96; preserved UNVERIFIED artifact. No history-wide/public-release clearance claimed. |
| E13 | [Older clean-extraction checks][e13] | 7543b2047136caeafaeb94b4fe9f1074fc33ce1bd516265a06829a2b714a0fd1. P manifest/static checks passed; current I package and fresh supported installation remain untested. |
| E14 | [Resume boot observation][e14] | a9263248f45e01dcc8c9fba5f9298f6f74479b62d436f0acb60d4ccb3df15e0f. Restricted-session identity/boot-file read only, acquired 2026-10-14 20:32:31 UTC; differs from E06. No fresh target service/API/evidence qualification; clock synchronization unverified. |
| E15 | [Current-boot listener report][e15] | b517f8b94577891727db56aea020dac2b0a580022190da80f2cdee634f9f8bb6, independently rehashed; metadata only, before recovery. |
| E16 | [Current-boot ownership report][e16], [transcript][e16text] | Report 64a9ba3fd089ae25466b101c181fcccf231d331840c5903f9821548d649f3796; transcript 965b7616ec69bae81e0626a10975fb9f22e4caa36bff52a247164e0233ac18ac. Independently rehashed before-repair evidence, not current PID pins. |
| E17 | [Postflight/source review][e17] | 57c91dc3bc036d872c3f0738584b072db9d1cacaede2a8a5ce33a6d20b5e380b. Review of operator paste/source only; captures timing/retention limitations, not raw target verification. |
| E18 | [2026-10-15 runtime/reboot evidence record][e18] | Current-task operator attestation plus earlier pasted successful API, health, guard, capture and logrotate output. Summary hash is recorded with E20 proposal checksums; it is not a raw packet/reboot transcript hash. Matching live ring 5 is reported; matching retained incident copy remains NOT TESTED. |
| E19 | [Qualification portability revalidation][e19] | ZIP da5dec745d0387e28a9faa95caf0aec8adedc918dad2cebec7227594cb6c40bb; original patch a7e9a630b2903796ab8120ab4cb2b394febc34c4a866e603e8c9e6e2fc103753. Two fresh extracts each 89+8 synthetic PASS; patch was UNAPPLIED at that historical snapshot. E24 records the later candidate application. |
| E20 | [PCAP-only boot proposal and operator/rollback commands][e20] | Local candidate template and prepared live-unit diff add only [Install]/WantedBy. Static validation/private unit copies/checksums retained beside the proposal. Full-unit append PROPOSED — NOT APPLIED; operator selected the drop-in alternative E21. Post-enable reboot NOT TESTED. |
| E21 | [Operator PCAP drop-in application review][e21] | Main unit remains a700f842de891cc9ae9aa21e4911f75487bf2ba996ce52ca22c9a7679e684a4e; exact Install-only drop-in hash 83f7c45531645efa6c9d9cade152e80620c1864608ad3349917b3998978fb238 and enable link independently read. Operator reports enabled/active/setup exit 0, with explicit outdated-loaded-definition warning. Post-enable reboot NOT TESTED. |
| E22 | [PCAP manager-state follow-up][e22] | Operator-pasted systemctl show, CHECK_EXIT=0: enabled, active/running, expected main/drop-in paths, NeedDaemonReload=yes, MainPID=12268, InvocationID=d127388e91f64ef48b28fd7f10f0be6d. Saved transcription/checksums are review provenance, not independent target acquisition. No boot ID/time or packet/reboot test supplied; no host action by agent. |
| E23 | [Clean-extract qualification integration][e23] | RESULT.json SHA c09cd584f5a9a954c16f696c7ac34f13b60e340769938604714347d5fed5b0df. Exact patch a7e9a630… applied only to a fresh C extraction; seven modules, 89+8 synthetic PASS, all 198 resulting hashes stable. Historical candidate-unapplied status is superseded by E24. |
| E24 | [Candidate qualification-patch application][e24] | RESULT.json SHA 0a779861cb5b5cb83bb68062f21c59be35713df84f5c0bc921ed8bcefe38178e; full patch SHA a7e9a630b2903796ab8120ab4cb2b394febc34c4a866e603e8c9e6e2fc103753. Applied without conflicts to W, uncommitted; identical copy 89+8 PASS. Existing edits/index preserved; no live gate cleared automatically. |
| E25 | [Current sanitized distribution-candidate review][e25] | Install-test artifact from W; source/worktree manifest, generated metadata, explicit exclusions and local extraction checks are held with this record. UNVERIFIED candidate, not a released beta or fresh supported installation. |
| E26 | [2026-10-16 operator Loki visibility][e26] | Operator-pasted range-response prefix visibly returns normalized event 297cef45… and incident summary abd86a9a… (LOW), distinct from the controlled HIGH incident. Truncated body and echo-derived exit are explicitly limited. Four services healthy/PCAP active also reported; no new boot identity or agent host action. |
| E27 | [Same-host Compose interruption review][e27] | Sanitized interpretation of operator paste, not a new acquisition. Fixed project/container/network identities plus removal output show deployment overlap. Final ps has no running rows. Deleted temporary data and original staging integrity need assessment; current runtime gates supersede earlier PASS snapshots. No agent host action. |
| E28 | [Operator-reported staging recovery][e28] | Supplied staging-root Compose creation, later seven healthy services, PCAP inactive then active after manual start, new 300-byte ring, and three-line guard-table excerpt. Scoped state recovery only; no new boot/API identity, actual packets, full guard or health/Loki postflight. No agent host action. |
| E29 | [Postflight and clock-failure interpretation][e29] | Operator-pasted full guard output, active capture/header-only ring, health ExecMainStatus=1 at displayed 2026-10-16 11:52:56 UTC with synchronization unconfirmed, truncated Loki health-stream record and directory metadata. No raw transcript hash or new boot ID supplied. Project-source review establishes the candidate clock predicate only; deployed source identity and root cause remain unverified. No agent host action. |
| E30 | [Chrony synchronization follow-up][e30] | Operator-reported successful timedatectl no/exit 0; pasted missing timesyncd-unit message and Chrony tracking with Reference ID 00000000, stratum 0, unset reference time and Not synchronised. Provider query was piped to head; its exit was not retained. Visible output establishes unsynchronized tracking, not actual clock error or root cause. No new boot/time/raw transcript hash; no agent host action. |
| E31 | [Chrony source-selection follow-up][e31] | Operator-pasted sources/activity, both exit 0: one ^* IPv6 best source, one ^+ combined, two ^- sampled, two ^? IPv4 with Reach 0. Activity: 4 online, 2 burst-return-online, 0 offline, 0 unknown addresses. Source selection progresses beyond E30; fresh tracking/manager flag and health outcome are not supplied. No new boot/time/raw transcript hash; no agent host action. |
| E32 | [Confirmed synchronization and uncertainty][e32] | Operator-pasted tracking Normal, stratum 3, reference time 2026-10-16 20:05:37 UTC, system offset 0.003402560 s, root dispersion 0.005918098 s, root delay 0.176408112 s; tracking exit 0. timedatectl yes, exit 0. Conditional bound calculation retained with assumptions; reference time is not acquisition time. No new health result, boot ID or raw transcript hash; no agent host action. |
| E33 | [Successful health observations][e33] | Operator-pasted unit success/status 0, InvocationID d2fc8ac8c85d4e21b20ebbc2f2adb8bd, exit time 2026-10-16 16:08:37 EDT = 20:08:37 UTC. Later JSON 20:10:39.708822 UTC has clock/capture/forwarding true, no problems/warnings and boot_id null projection; both read exits 0. Separate successful observations; same-run/current-boot binding not established. No agent host action or rerun. |

[e01]: ../../github-source-provenance-4yz2mktq/comparison-report.json
[e02]: ../../unit-state-review/validation.json
[e03]: ../../beta-acceptance-freeze-20261014-y5hyyaz8/offline-replay-verification.json
[replay]: ../work/demo/run-qtpjhp8f/report.json
[e04]: ../../integration-before-docs.json
[e05]: ../../docker-readonly-097vr4p6/report.json
[e06]: ../../unit-reload-preapproval-j1zu54jp/operator-readonly-lmeabfqr/report.json
[e06verify]: ../../unit-reload-preapproval-j1zu54jp/operator-readonly-lmeabfqr-independent-verification.json
[e07]: ../../growth-review-proposal/operator-preparation-UezZS76k/report.json
[e08]: ../../completion.json
[e09]: ../../unit-reload-preapproval-j1zu54jp/observations.json
[e10]: ../../unit-reload-preapproval-j1zu54jp/approval-review.json
[e10text]: ../../unit-reload-preapproval-j1zu54jp/approval-review.txt
[e10compare]: ../../unit-reload-preapproval-j1zu54jp/comparison-report.json
[e11]: ../../../../PROJECT_STATUS.md
[matrix]: ../../../live-qualification/stage7-fresh-ewnrhtur/report.json
[e12]: ../../candidate.json
[e12review]: ../../package-source-review.json
[e13]: ../../package-verification.json
[e14]: ../../beta-acceptance-freeze-20261014-y5hyyaz8/resume-boot-observation.json
[e15]: ../../listener-check-current-boot-20261015-hd531sk1/observation-OIFNVzPT/listener-observation.txt
[e16]: ../../docker-readonly-70wvqnc0/report.json
[e16text]: ../../consolidated-readonly-Acnp0x9Y/commands.txt
[e17]: ../../post-recovery-operator-review-20261015-yphzsag6/POSTFLIGHT_EVIDENCE_REVIEW.md
[e18]: ../../pcap-boot-proposal-20261015-odgcdnt8/RUNTIME_EVIDENCE.md
[e19]: ../../qualification-portability-revalidation-20261015-_27_5pm6/honeytrace-qualification-portability-PROPOSED-ee0b7e3.zip
[e20]: ../../pcap-boot-proposal-20261015-odgcdnt8/PCAP_BOOT_PROPOSAL.md
[e21]: ../../pcap-boot-proposal-20261015-odgcdnt8/PCAP_DROPIN_APPLICATION_REVIEW.md
[e22]: ../../pcap-boot-proposal-20261015-odgcdnt8/PCAP_MANAGER_STATE_REVIEW.md
[e23]: ../../qualification-integration-20261016-ra3427bv/RESULT.json
[e24]: ../../qualification-candidate-apply-20261016-xoikb96_/RESULT.json
[e25]: ../../distribution-candidate-20261016-_wogotla/PACKAGE_REVIEW.md
[e26]: ../../distribution-candidate-20261016-_wogotla/LOKI_OPERATOR_EVIDENCE.md
[e27]: ../../deployment-interruption-20261016-5vju104_/INTERRUPTION_REVIEW.md
[e28]: ../../deployment-interruption-20261016-5vju104_/OPERATOR_RECOVERY_REVIEW.md
[e29]: ../../postflight-clock-review-20261016-yxjrxi_y/POSTFLIGHT_REVIEW.md
[e30]: ../../chrony-review-20261016-38lxng54/CHRONY_REVIEW.md
[e31]: ../../chrony-source-selection-20261016-udo_032q/REVIEW.md
[e32]: ../../clock-synchronized-review-20261016-to4duxfl/REVIEW.md
[e33]: ../../health-success-review-20261016-z5lubbko/REVIEW.md
