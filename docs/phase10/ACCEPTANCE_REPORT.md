# Phase 10 source acceptance report

**Status: MILESTONE 1 SOURCE FOUNDATION COMPLETE — 2026-11-01.**

The user authorized Phase 10 source work. This report does not authorize
deployment, active assessment, external enrichment or release. The earlier
repository security audit is partial and cannot supply independent acceptance.

| Evidence | Current result |
| --- | --- |
| Source base | HoneyWatch `bce3d92c608202db20a51c00cd8ee2c64093bf9e` |
| Working branch | `codex/phase10-offline-20261101` |
| Final tested revision/worktree | Local dirty worktree on the source base above; no commit or push |
| Test environment and observation time | Managed Linux, Python 3.13, isolated offline test runner, 2026-11-01 |
| Focused Phase 9/10 tests | PASS, including actual parser-worker and CLI round trips |
| `make -C honeypot test` | PASS through final source baseline: 723 tests run, 716 passed, 7 skipped |
| `make -C honeypot verify` | PASS through final source baseline; 14 static categories PASS, 5 NOT TESTED |
| Repository tooling tests | PASS, 68 tests |
| Source baseline validation | PASS: `python3 -B tools/validate_baseline.py`, exit 0 |
| Native capability skips/missing validators | Six TShark test skips, one Docker CLI skip; native YARA/Compose/Suricata/Alloy and live integration not tested |
| Protected-runtime diff review | Existing Compose, firewall, container, PCAP and service configuration unchanged |
| Independent correctness review | Completed; one interrupted-import retry bug found, fixed and independently rechecked; 19 core tests PASS |
| Upstream report-version compatibility | NOT ESTABLISHED beyond synthetic fixtures |
| Cross-host inventory and target operation | NOT TESTED |
| Real TI providers and active scanners | NOT IMPLEMENTED / NOT RUN |
| Beta/release acceptance | BLOCKED; existing gates remain controlling |

The interrupted-import fix removes only a newly created uncommitted projection
if its manifest cannot be saved. Retained originals, pre-existing projections
and committed imports survive failures. Three regression cases cover recovery.

The source milestone is complete: the main import/export workflow works,
focused checks pass and current limits are documented. The subsequent dashboard
MVP has its own [guide and validation](../DASHBOARD.md). Real-export compatibility, larger forensic datasets and production
qualification are later work, rather than additional conditions on this
milestone. The broader earlier security audit remains partial.

Validation receipts are retained in the local audit workspace under
`agents/milestone/artifacts/phase1_source_baseline_v2.log` and
`agents/foundation_review/artifacts/foundation-retry-fix-1.log`. The first
baseline attempt found clone file permissions inconsistent with Git-declared
source modes; those permissions were restored before the passing run.

Rollback sets the optional policy to disabled and preserves all imported source
bytes, normalized outputs and manifests. Source rollback does not remove evidence
or alter existing sensor/container/firewall state.
