# HoneyTrace Forensic Dashboard source receipt — 2026-11-01

Working copy: `/workspace/work/honeytrace`.
Review branch: `codex/forensic-workflows-20261101`.
Base publication: `77a04369922333a514db43d3a729c639f8271b8f`.
Target: managed Linux source workspace, unprivileged isolated synthetic tests.

## Delivered behavior

- The full 1,416-file Sentinel source, bundled with its AGPL-3.0 license and one recorded demo-literal publication patch
  and import manifest. Its exact upstream Git tree is
  `45e7025dd351732dfa0d321362891ff353f8b940`.
- Automatically discovered Sentinel capture jobs with progress, cancellation, process
  resource limits and private, persistent safe history.
- Verified case selection, exact-time timeline search/filter/pagination,
  observation provenance, coverage and isolated minimized exports.
- Structured suite logging across operator, dashboard, import/store/job, health,
  guard and incident daemon boundaries; rotating private logs and diagnostics UI.
- Private local dashboard management without an HTTP Server banner and prepared
  file-server/web-server decoy identities that preserve sensor controls.
- My equipment with custom class/value, private inventory and sourced, timestamped status.
- Approved assessment review, exact-asset grouping, immutable provenance and private triage/reporting.
- Static website download/dashboard-preview component at
  `docs/site/honeytrace-preview/`, including real synthetic-workflow screenshots.

## Verification

Focused case, job, logger, decoy-profile and dashboard regressions passed.
The source baseline passed `tools/validate_baseline.py`, which includes repository
tooling tests, `make -C honeypot test` and `make -C honeypot verify`. Application
tests: 801 run, 794 passed, seven native-tool skips. Static validation: fourteen
PASS and five NOT TESTED. Repository tooling tests: 71 passed. Native tshark and
Docker-dependent tests remain skipped in this workspace.

Both bundled offline suites passed: diagnostic ingestion 31/31; Evidence Lab
427 run, 385 passed and 42 missing-native/schema-tool skips. The initial 128 MiB
test scratch mount failed Sentinel's existing free-space guard; an adequately
sized 2 GiB isolated scratch mount passed without changing that guard or the
imported source. Snapshot validation reproduces every Git blob/mode and the exact
upstream tree. Three incident UI files affected by outer ignore rules were
explicitly retained.

The actual bundled Sentinel analyzer at
`187bec14835fc9497b05594ca467a49259553d64` analyzed its own synthetic 27-packet
fixture through the job engine. Bundle verification, source-hash preservation,
34 timeline events, four review leads, protocol/text filters, pagination and
minimized authenticated API exports passed. This caught and corrected the real
exporter's pseudonymized coverage-name compatibility issue. Supporting timeline
and observation records retain their original normalized contents and IDs.

Seven Chromium workflow checks passed: actual analysis from the UI, protocol
filter/provenance, case download, diagnostic download without sensitive fields,
concrete decoy configuration download, suppressed Server header and mobile
navigation without horizontal overflow. No console errors were observed.
Screenshots use synthetic data and are included with the static preview source.
Five additional browser checks passed equipment creation/custom fields/status/persistence,
assessment review with multiline triage/export, original source provenance and mobile
layout. An integrated browser check caught and corrected a read-only DOM property
assignment in the class suggestion input; the actual workflow passed afterward.

Independent source review corrected empty job-history recovery, newest-job
ordering, joined-record identity, CLI help severity and combined-store overview
handling. The extra conflict pass also resolved a valid protocol-histogram limit
mismatch and prevented nested tests from creating caches in the pinned bundle.
Generic object quotas remain unchanged. The companion remains trusted code with process resource limits;
those limits are not an OS/network sandbox for an installed analyzer.

## Handoff and limits

Stop the old local dashboard before switching source branches. Fetch the review
branch into the existing clean desktop checkout, then run the portable launcher.
Ignored local policy, evidence and logs stay local. Use a separate checkout if
the desktop has source edits you need to preserve.

Large-case streaming, continuous sysdiagnose monitoring/alerts, payload backup
recovery, live provider clients and hardware capture remain follow-up work.
The prior comprehensive security audit remains incomplete. This receipt covers
source behavior and synthetic workflows, not runtime qualification or deployment.

The connected Sites account did not expose jayforensics.com during preparation.
Its download/preview component is ready; no website deployment, DNS change or
unrelated Site modification was performed. The existing site's project access
is required to finish the requested in-place publication.

Publication note: GitHub push protection rejected a credential-shaped value in
Sentinel's mocked code-audit input. That one demo literal is replaced by an
explicit placeholder, with a modification notice. The source manifest records
both effective and upstream tree identities and the one changed file. Snapshot
validation verifies both trees; all 1,416 source files and the license remain.
