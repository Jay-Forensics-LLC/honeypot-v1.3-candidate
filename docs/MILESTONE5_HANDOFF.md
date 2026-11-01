# Milestone 5 local-case workflow handoff — 2026-11-01

Working copy: `/workspace/work/honeytrace-milestone5`.
Review branch: `codex/local-case-workflow-20261101`.
Implementation base: `1bfdc26` (including concurrent review-branch fixes).
Target: local Linux dashboard with unprivileged synthetic source validation.

## Source scope

The [installation guide](INSTALL.md) leads from the portable launcher and module
settings to **Honeypot → Try a synthetic interaction → Open case**. Existing saved
Cowrie sessions and OpenCanary interactions use the same native local analysis/case boundary.
`--telemetry-root` selects an existing application data directory for reading.
Source selection does not start sensors or change their configuration.

Selected normalized logs retain their provenance and become a derived analysis
input. A command transcript is retained when available. Verified preserved packet
support requires a unique tuple/time match with a two-second tolerance; missing,
ambiguous or over-budget support is reported as log-only. The combined source
budget remains 64 MiB.

Case review provides Overview, Timeline, Leads and Custody. Lead explanations
retain supporting observations, rule thresholds and benign alternatives; operator
assessment remains separate from the original finding. Custody records retain
private artifacts and hashes, import/acquisition information and available
equipment snapshots, with a text report and separate artifact downloads.
Unknown acquisition, identity and historical equipment details remain unknown.

The named Packet Squirrel route accepts a stopped, finished PCAP/PCAPNG through
file selection or drop. Files above 64 MiB remain rejected with a clear visible
state. Original files stay unchanged; private analysis inputs and attachments
survive completion and are included in custody finalization. A custody failure
after import preserves the known case ID and private inputs and is reported as
`custody_failed`, without automatic retry.

The launcher checks Python 3.11+ and its standard-library SQLite module. The
local dashboard requires no pip/npm packages, Docker or cloud account. Update
and recovery instructions preserve private policy, state and diagnostics.

## Validation record

The integrated offline baseline passed in an unprivileged, network-isolated QA
sandbox. It runs the required `make -C honeypot test` and
`make -C honeypot verify`, as well as source, dependency and bundled-engine checks.

| Check | Result |
| --- | --- |
| HoneyTrace behavioral suite | 864 run; 857 passed, 7 skipped |
| Repository tools | 73 passed |
| Stage 7 offline suite | 89 passed |
| Sentinel iOS diagnostics suite | 31 passed |
| Sentinel evidence-lab suite | 427 run; 385 passed, 42 skipped |
| Static deployment checks | 14 passed, 5 not tested |
| Native session-to-case integration | Matched PCAPNG + log case and OpenCanary log-only case passed |
| Custody regression suite | 12 passed, including corruption, aliases, source binding and immutable snapshots |
| Desktop/mobile browser walkthrough | 8 workflow checks passed; no page errors |

The browser walkthrough starts from empty private state, enables the bundled
analyzer in Settings, creates an equipment entry, opens a synthetic interaction,
reviews the native lead and packet references, records a false-positive decision,
downloads the custody text and original retained capture, and imports that stopped
capture through the Packet Squirrel file picker. Keyboard case tabs and mobile
navigation fit; the oversized-file alert survives dialog close/reopen and no
oversized capture request is sent. HTTP tests independently reject oversized
Content-Length before consuming its body. Inputs and inventory snapshots remain
unchanged by subsequent review or inventory edits/deletion.

CI additionally exposed an import/poll race: case progress could read the store
while its import held the exclusive write lease. Case polling now uses the same
operation lock as imports and returns a coherent committed-case/job snapshot. A
deterministic HTTP regression rejects the former 503 response under that lease.
The preparation-deadline test advances a separate mocked job clock after the
worker enters preparation, avoiding a 10 ms scheduler assumption without
changing the production deadline. Validation output now names failed tests and
static checks rather than showing only a count summary.

The focused source review corrected two presentation errors: mixed real/demo
catalogs retain the server's synthetic flag, and a missing custody receipt no
longer asserts that a case predates recording. Public custody views separate
sensor, import and receipt times and label account/device identity as unverified.
The wider legacy React/Base44 and Deno audit remains incomplete; this receipt is
not a comprehensive security clearance for those inactive services.

[Synthetic session](images/milestone5-sessions.png) ·
[Custody page](images/milestone5-custody.png) ·
[Packet Squirrel size state](images/milestone5-squirrel.png)

A fresh complete source archive also passed extraction and first-case analysis
without Git metadata. The portable launcher ran from another directory, ignored
a stale `HP_ROOT`, and reached a two-source case with custody and grounded lead
support while Python site packages were disabled. No package installation,
Docker or external account was used.
Historical [forensic acceptance](FORENSIC_ACCEPTANCE.md) observations retain their
original source scope. Live capture, hardware, firewall, Docker/systemd, WAN,
independent lab acceptance and native real-dataset qualification were not run.

## Operational boundary

This source milestone covers local saved-evidence workflows. It does not
establish live honeypot/runtime qualification. The prior containment, deployment,
WAN and service lifecycle status remains in
[current phase status](CURRENT_PHASE_STATUS.md). Live RF/BLE/Wi-Fi acquisition,
cloud AI/provider clients, SaaS dependencies, large-case streaming and native
installer packages are outside this increment.
