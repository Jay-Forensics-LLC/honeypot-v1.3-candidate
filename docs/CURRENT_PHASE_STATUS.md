# HoneyTrace current phase status — 2026-10-20 UTC

**Supervised loopback beta: BLOCKED. Independent Phase 7 closeout: PENDING.
Phase 8 execution: NOT GREEN-LIT. Phase 10: PLANNED — PENDING — DO NOT IMPLEMENT.**

The source integration branch is `fix/phase7-source-integration-20261019`.
Its implementation checkpoint is
`ce2d5b3f16ebf610a04bcfb665f5eab5faf0c233`; subsequent changes add regressions and
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
and observed IDs cannot authorize themselves. See
[operations](../honeypot/docs/OPERATIONS.md) and
[clean-room qualification](../honeypot/docs/CLEANROOM_QUALIFICATION.md).

Offline validation: 570 unit tests and 89 retained Stage 7 tests pass with no
skips; `make verify` passes. The full repository validator passes its 21 tooling
tests, archive/provenance checks, source checks and required suite invocations.
The original 11-method cross-branch failure replay is retained separately:
desktop 19 failed assertions/subtests and eight errored subtests; laptop control
zero failures/errors/skips. Mock-only startup reproductions on both old tips
still demonstrate the prior bypass. Independent review is requested on the
integration PR; it is not implied by these self-checks or historical reviews.

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
These results supersede the old all-eleven-hashes-pending statement. Recovery
semantics/full custody review still require their separate receipt; protected
bundle access is not a reason to repeat the historical matrix. No claim of zero
loss, accurate absolute time, reboot continuity, corruption cause or power-loss
durability follows from these historical checks.

Deployment/rollback, supported-installation and exact-build qualification plans
are in the private handoff. All host actions remain PROPOSED — NOT APPLIED / NOT
EXECUTED. No merge, deployment, package install, service action, live probe,
restart matrix, boot test, unit enablement, release or WAN change occurred.
