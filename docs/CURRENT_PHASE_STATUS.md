# HoneyTrace current phase status — 2026-10-20 UTC

**Supervised loopback beta: BLOCKED. Independent Phase 7 closeout: PENDING.
Phase 8 execution: NOT GREEN-LIT. Phase 10: PLANNED — PENDING — DO NOT IMPLEMENT.**

The source integration branch is `fix/phase7-source-integration-20261019`.
Its implementation checkpoint is
`8070509d1ef9ee83a9c6f8c67f71fd05260d827b`; subsequent changes update
current-phase documentation. The exact final PR head/tree and command receipts
are recorded in the private integration handoff. Qualification must pin that
final clean SHA, independently accepted images, target and boot. No candidate
source checkpoint described here is deployed or accepted.

The refreshed default was `cf9954282f51981aa2aba9c36b856431aebe9f41`.
The integration retains both reviewed parents: desktop
`2780f6d0131112a93d6748147dbbe485eb4a68e3` and laptop PR #23
`3874261c01c6e28aa2cce1b3d929cacbb517854b`. Original dirty source and all 27
preserved file hashes remain unchanged. The original Stage 8 draft stays separate.
The newer default's security policy and review guidance are retained; unrelated
coverage-workflow PR #26 remains separate.

The integration restores durable late-duplicate fences, strict typed preservation
metadata and streaming bounded static enumeration. Startup/update/boot-start now
require a separately pinned image approval. Startup freezes configuration with
immutable image IDs, creates without starting, verifies exact owned container IDs,
then starts those IDs. Qualification rejects dirty source and requires the same
approval digest, also bound into the schema-2 clean-room context. Runtime locks
and observed IDs cannot authorize themselves. All seven Compose restart policies
are disabled; startup and qualification reject automatic daemon restart policies.
Quarantine/unquarantine reject unexpected mounts. Qualification binds exact runtime
Compose bytes to the reviewed source, detects file drift, and forces untracked-file
enumeration despite local Git status settings. Startup and locator name discovery
stream directory entries and stop at their entry bound. No deployed policy changes.
See
[operations](../honeypot/docs/OPERATIONS.md) and
[clean-room qualification](../honeypot/docs/CLEANROOM_QUALIFICATION.md).

Offline validation: 584 unit tests and 89 retained Stage 7 tests pass with no
skips; `make verify` passes. The full repository validator passes its 21 tooling
tests, archive/provenance checks, source checks and required suite invocations.
An additional local Compose 2.40.3 canonical JSON parser round-trip reproduced
and corrected double-escaping in the initial frozen snapshot, retaining literal
dollars and immutable IDs despite environment changes. Both failed and corrected
receipts are private source evidence, with no daemon/container action.
The original 11-method cross-branch failure replay is retained separately:
desktop 19 failed assertions/subtests and eight errored subtests; laptop control
zero failures/errors/skips. Mock-only startup reproductions on both old tips
still demonstrate the prior bypass. Independent review is requested on the
integration PR; it is not implied by these self-checks or historical reviews.
Independent review additionally identified five startup/mount/enumeration/source
binding gaps. Seven initial reproduction methods yielded eight failing assertions
or subtests against the unchanged candidate; all fixes and thirteen focused
regression methods are now committed. These are not eight separate test methods.
Repository validation first rejected the new test file's inherited 664 mode; its
mode was corrected to 644, and the validator then passed 224 source files. Both
failed receipts remain retained. Review of this corrected checkpoint is pending.

The user selected the laptop as the intended Phase 8 target; desktop live results
are separate and remain unacquired/unverified. A fresh non-modifying laptop
acquisition on October 20 at approximately 03:21 UTC observed boot
`38cd65f9-4ba0-4d37-8998-e1a45877f50b`, system Docker at `/run/docker.sock`,
`/var/lib/docker`, and exactly seven healthy staging-owned containers. OpenCanary's
current log is now nonempty. The existing health JSON at 03:20:06.707666Z reports
only clock synchronization failure and has `boot_id: null`; no service invocation
or boot attribution is assigned to that JSON. Direct timedatectl/Chrony readings
remain unsynchronized, stratum 0, six sources Reach=0; cause is unresolved.

The selected laptop is Ubuntu 26.04.1 x86_64/Python 3.14.4/Compose 2.40.3, with
distro Docker 29.1.3. **It does not meet mandatory B17** (dedicated Ubuntu 24.04
x86_64/Python 3.12/Compose v2). No package installation, OS change or contract
change is authorized. Runtime source is older than the integration; source/image
provenance, semantic guard/DNS/capture readiness, migration preservation, B15
operator workflow, B16 package provenance, B18 deployment/rollback and current-build
live qualification remain open. Container health does not prove these gates.

Historical matrix `stage7-fresh-ewnrhtur` remains pinned to source
`1a2b8c73106763d824999091c4e56c64f061f59e`, boot
`67a93065-7f07-40e5-aa12-806d9ff14dcc`, report SHA-256
`97bee3ef001e17c0c65b376cf472ea183fff5ce6e37db6c938278dcf50fcbdbc`.
Operator-reported 78/78 linked hashes and 8/8 packet checks are complete and
independently tuple-matched. All 1,196 historical prefix CONTENT hashes are
accounted for, including rotated/compressed siblings. Pinned-source receipt replay
verified classifications, seven stored rows and stored Loki/postflight results.
These results supersede the old all-eleven-hashes-pending statement.

The October 20 03:39:41Z operator audit reports exit 0 and PASS for the actual
recovery bundle: five unique ordered records, four original intact ranges,
separately reconstructed fifth record, original/derivative hashes and manifest/
metadata/provenance relationships. Its auditor SHA-256 is
`a48f453375695bfad521d0b4cb9e52f3cdfa173b1cba5650da189ab391e32c0c`.
The agent independently matched that code hash and returned values. Protected
bytes remain operator-acquired; no raw terminal-transcript hash is asserted.
The new audit also verified 734 retained custody copies across 1,183 incidents,
and six stored offset relationships, within their stated scopes.

**Historical global event-location consistency is AMBIGUOUS.** A separate exact
stored-report enumeration found 20,569 unique event IDs, with 8,963 IDs in multiple
incidents (25,751 extra locations, up to five per ID). Five directly re-read sample
IDs match their original preserved prefix hashes in both locations; the raw
objects agree while normalized objects differ. Per-incident counts/custody hashes
do not establish global deduplication. Preserve all copies; do not select an
unsupported canonical incident. The corrected candidate's ambiguity-fence behavior
was rehearsed on two actual conflicting specimens without changing those originals.
Full-state acquisition/reconciliation, migration/publication review and independent
closeout remain required. A full historical acquisition stopped before migration
on the first metadata hash drift (five stored IDs versus thirty current IDs, with
all five retained). Its partial acquisition and failure receipt remain preserved;
today's changing metadata cannot impersonate the exact historical snapshot.
No historical restart-matrix rerun is authorized to
compensate for this finding. No claim of zero loss, accurate absolute time, reboot
continuity, corruption cause or power-loss durability follows from these checks.

Deployment/rollback, supported-installation and exact-build qualification plans
are in the private handoff. All host actions remain PROPOSED — NOT APPLIED / NOT
EXECUTED. No merge, deployment, package install, service action, live probe,
restart matrix, boot test, unit enablement, release or WAN change occurred.
