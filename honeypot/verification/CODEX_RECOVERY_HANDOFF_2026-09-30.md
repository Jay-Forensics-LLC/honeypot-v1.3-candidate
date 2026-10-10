# Codex recovery handoff — 2026-09-30

**Historical handoff.** It describes the pre-v1.3 tree. `verification/PRODUCTION_READINESS.md` now exists. The "NOT DONE" row below is that session's finding, not the current tree.

## Scope

This handoff was built from the latest repository artifact available in the ChatGPT project:

- `honeypot-v1.2-wan-polish-2026-09-30.zip`
- SHA-256: `bd66da224e0aecb44a5acc9178d33cf03ef6799457a63fd7b0cc681f571d6bab`

No later Codex-produced repository ZIP, patch, or modified source tree was available to recover. Therefore this review can measure **prompt coverage in the available codebase**, but it cannot truthfully attribute any unexported edits to Codex. Do not assume missing Codex work was preserved.

No router/firewall/service/WAN changes were performed for this review. This handoff changes documentation/manifest only; functional source is unchanged from the polished v1.2 WAN candidate.

## Review results on a fresh extraction

The source ZIP was independently reopened, path traversal checked, CRC-tested, and extracted to a fresh directory. ZIP mode metadata was restored before validation.

- ZIP CRC: PASS
- Path traversal: PASS
- Original ZIP SHA-256: PASS
- Unit tests: **60/60 PASS**
- `python3 -B scripts/validate.py`: **14 PASS / 5 NOT TESTED / 0 FAIL**
- NOT TESTED in this sandbox: YARA syntax, native Docker Compose validation, Suricata config validation, Alloy validation, live Ubuntu integration.

## How far through the production-completion prompt the available tree already is

Estimated prompt coverage of the **available repository**: **~83/100**.

This is not a Codex-delta score. Most of this work was already present in the polished repository before the interrupted Codex session.

| Workstream from completion prompt | Status in available tree | Evidence / remaining gap |
| --- | --- | --- |
| Semantic `hp_guard` verification | COMPLETE source-side | `scripts/guard_policy.py`; health integration; tests for table/chain/drop/DNS/jump/hook/dormant drift. |
| Table-loss hardening | MOSTLY COMPLETE source-side | `scripts/guard_watch.py` plus preview-only systemd service/timer. Tests cover missing table and semantic drift triggering decoy-only stop. **Live table-delete drill remains NOT TESTED.** |
| Source-fidelity readiness | COMPLETE source-side / LIVE UNKNOWN | `scripts/wan_criteria.py` requires `WAN_SOURCE_MODE` plus fresh evidence with `scope=netns` or `observation`; detector-only scope cannot authorize WAN. Actual `wlp2s0` source fidelity remains NOT TESTED. |
| Boot safety | COMPLETE source-side | `boot_start()` uses existing containers only, semantic guard check, quarantine check, loopback-only binds, exact per-decoy DNS, PCAP startup gate, and fail-closed stop on startup/health failure. No build/pull/create/force-recreate. |
| Honeytokens/bait | COMPLETE source-side / runtime integration UNKNOWN | Deployment-unique tokens; not committed; bait IDs only in normalized/public outputs; rendered bait is explicitly not installed automatically. Running-image integration remains live-only. |
| Alert bus | MOSTLY COMPLETE source-side | Disabled by default, high/critical/bait filtering, bounded 10-minute rate limit, failed delivery health, password redaction. Real endpoint delivery remains NOT TESTED. A dedicated regression for arbitrary raw TTY/transcript fields is still worth adding. |
| Sanitized intel pack | COMPLETE source-side | Removes raw/password/secret values, replaces bait token strings, creates pack/brief/STIX + manifest. Tests cover secret/bait redaction and deterministic clusters. |
| Validation regression gates | COMPLETE for available sandbox | 60 tests PASS; validator 14 PASS/5 NOT TESTED. Native target validators remain live-only. |
| Production-readiness closeout document | **NOT DONE** | Required `verification/PRODUCTION_READINESS.md` does not exist. Current information is spread across WAN/hardening/open-blocker docs. |
| Final v1.3 release workflow | **NOT DONE** | No `honeypot-v1.3-production-candidate-YYYY-MM-DD.zip`, matching `.sha256`, final task-specific patch, fresh-extract release report, or separate source/live completion scores from the interrupted Codex pass. |

## Specific prompt items already satisfied — do not redo blindly

### Guard/table-loss source design

Existing implementation already:

- uses semantic `inspect_guard()` rather than table-name-only checking;
- requests `docker compose stop cowrie opencanary` only;
- does not target Grafana, Loki, Alloy, incidentd, or unrelated services;
- does not recreate/delete nft rules;
- ships watcher systemd artifacts under `systemd/preview/`;
- keeps activation approval-required/default-off;
- unit-tests table loss, semantic drift, selective stop, stop failure, and preview installer behavior.

Potential small missing regression: explicitly test **valid guard policy -> `guard_watch.check()` performs no stop call**. Policy validity itself is tested, but this exact watcher no-action path is not directly asserted.

### Source fidelity

Existing implementation rejects configuration intent as proof. For non-loopback startup, fresh `wan_source_fidelity.json` must be PASS with `scope` `netns` or `observation`. `scope=detector` is insufficient.

### Boot safety

`ops.boot_start()`:

- runs `require_guard(cfg)`;
- requires PCAP active as a startup gate only;
- refuses non-loopback management/decoy bindings;
- validates existing `honeypot-cowrie` and `honeypot-opencanary` containers before starting;
- requires exact DNS blackholes (`172.29.40.254`, `172.29.41.254`);
- starts with `docker compose start cowrie opencanary` through the existing helper;
- stops both decoys on startup exception/health deadline.

Do not replace this with `compose up` or a build path.

## Remaining repository work for Grok

Priority order:

1. **Audit before editing.** Compare this exact handoff tree against the original production-completion prompt. Do not assume the interrupted Codex session changed anything that is not present here.
2. Add only genuinely missing regression tests. Highest-value candidates:
   - valid semantic guard -> watcher does not issue decoy stop;
   - alert payload cannot include arbitrary raw TTY/transcript fields or embedded secret values.
3. Create `verification/PRODUCTION_READINESS.md` containing:
   - repository-complete items;
   - target-tested items;
   - live-only remaining tests;
   - approval-required operations;
   - rollback requirements;
   - WAN exposure prerequisites;
   - residual risks;
   - OBSERVED / INFERRED / UNKNOWN / NOT TESTED separation.
4. Consolidate the exact live-only checklist rather than adding features:
   - native Compose validation on target;
   - Suricata validation on target;
   - Alloy validation on target;
   - YARA validation where available;
   - supervised semantic `hp_guard` table-loss drill;
   - actual `wlp2s0` source-fidelity test;
   - VLAN/DMZ isolation verification;
   - bait image rebuild/integration verification;
   - configured alert endpoint test;
   - controlled burn-in;
   - explicit WAN approval.
5. Re-run all repo tests/validators. Preserve NOT TESTED where the environment lacks dependencies.
6. Produce the requested final release artifacts only after the tree is clean:
   - `honeypot-v1.3-production-candidate-YYYY-MM-DD.zip`
   - `.zip.sha256`
   - git-style patch/diffstat
   - fresh-extract release verification.
7. Independently reopen the final ZIP, check CRC/path traversal/case collisions/modes/secrets/runtime evidence, extract fresh, and rerun tests against the ZIP contents.
8. Report separate completion scores:
   - `SOURCE / REPOSITORY COMPLETION: X/100`
   - `LIVE DEPLOYMENT VALIDATION: X/100`

## Live-only / approval boundaries

Do **not** perform from the source completion pass:

- router changes;
- WAN exposure;
- `DECOY_BIND` changes;
- management access changes;
- VLAN changes;
- service enablement;
- watcher/timer activation;
- destructive firewall drills on the live target;
- evidence deletion;
- security-control weakening.

## Current honest status

- Local/source functionality: strong.
- Repository production-completion prompt: approximately **83/100 covered** in the available tree.
- Exact Codex delta: **UNKNOWN — no Codex-modified artifact was exported into this project.**
- Live deployment validation of this exact polished tree: incomplete.
- WAN authorization: none.
