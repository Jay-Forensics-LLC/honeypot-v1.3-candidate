# Jay Forensics LLC — Controlled Evidence-Driven Workflow (CEDW)
**SOP v1.1 | Proposed for owner adoption | 2026-11-03**

## 1. Why it exists
Make technical, forensic, and business work reproducible and auditable while avoiding unnecessary ceremony. Its rule is **one defined issue, one scoped change, one verified outcome**. Execution, verification, independent review, and authorization are distinct states. A command that prints COMPLETE may still have failed its acceptance gate.

## 2. Apply rigor according to risk
- **Light / routine:** Read-only checks, analysis, text edits, reversible low-impact operations. Record baseline, action, validation, disposition. Combine safe investigations to save operator time.
- **Controlled / engineering:** Source changes, bug fixes, dependency updates, integrations. Use issue-level acceptance criteria, isolated branch/worktree, tests, change record and explicit review gate.
- **Restricted / high impact:** Authentication/security controls, digital evidence, case records, data migration, production infrastructure, release/deployment, financial/legal/client-facing actions. Use all nine gates, immutable or tamper-evident evidence as applicable, independent review when required, and explicit owner authorization.

Higher-risk work may impose stricter project-specific requirements; this SOP never replaces frozen acceptance criteria or legal obligations.

## 3. Core work model
**Project** — Product or business outcome. **Issue** — Independently verifiable problem or deliverable. **Step** — One controlled operation with one objective and one gate. Each issue needs an ID, scope, priority, owner, baseline, evidence, acceptance criteria, and next step. Number corrective attempts as 24A, 24B, etc.; never edit an old FAIL into PASS.

### The nine gates
1. **Identify:** State observed versus expected behavior, severity, and definition of done. Gate: unambiguous problem.
2. **Baseline:** Record authoritative repo/branch/commit, worktree, environment, config, dependency versions, tests, or business procedure. Gate: reproducible starting point.
3. **Investigate/reproduce:** Inspect read-only first; distinguish verified evidence, reported facts, inference, unknowns. Gate: supportable cause or bounded hypothesis.
4. **Design:** Select smallest reversible correction, side effects, approval and rollback. Gate: authorized, scoped plan.
5. **Execute:** Make change on approved isolated target, preserve unrelated work and evidence. Gate: only approved modifications occurred.
6. **Verify:** Original regression, related tests, required full checks, static/integration/runtime/security checks as applicable. Gate: mandatory checks pass. Tests must fail fast; collect exit codes and logs. Synthetic PASS cannot qualify actual backend behavior.
7. **Review/record:** Diff, actual test evidence, provenance, assumptions, reviewer, rollback, remaining risk. Gate: independent, traceable review as required.
8. **Authorize/integrate:** Verify checklist, approval authority, frozen criteria, exact target. Gate: recorded merge/release/HOLD decision. Green CI is not permission.
9. **Monitor/close:** Validate in approved target, check regressions, preserve artifact links and close or reopen with explicit outstanding items. Gate: requirements satisfied in the claimed environment.

## 4. Status language
- **PASS:** Every mandatory check executed and passed at the stated evidence level.
- **FAIL:** A required executed check failed. Stop and retain outputs; do not advance.
- **BLOCKED:** Missing prerequisite or external dependency prevents execution.
- **HOLD:** Evidence may exist, but authorization or acceptance is withheld.
- **NOT RUN:** Named procedure not executed.
- **NOT TESTED:** Applicable behavior lacks proof.
- **SKIP:** Intentionally omitted, with reason and approving authority where needed.

**Keep acceptance levels explicit:** code review / synthetic test / integration / isolated-lab live test / production live test. Never transfer qualification between commits, images, hosts, configurations, or environments.

## 5. Standard step card
```text
STEP [ISSUE-ID]/[STEP-ID] — [TITLE]
Objective:
Owner/implementer:
Baseline: repository, branch, exact SHA, environment, starting state
Evidence: OBSERVED / REPORTED / INFERRED / UNKNOWN, supporting links
Action: single logical change, command or procedure
Expected: measurable acceptance; required tests
Actual: captured only AFTER execution, exit code, test counts, evidence URL
Status: PASS | FAIL | BLOCKED | HOLD | NOT RUN | NOT TESTED | SKIP
STOP/rollback: when to halt and how to reverse safely
Approval: person, decision, UTC timestamp (when required)
Next: next authorized step
```

## 6. Safe execution wrapper
For Bash-based controlled commands, start with `set -euo pipefail` where appropriate, verify repo and branch before touching files, run named tests, record their exit codes, and print PASS only in the branch reached after every required check. Avoid hiding failed tests behind `|| true`, pipes without `pipefail`, or a final echo. Never treat a log's last line as a substitute for the process exit status. Check dirty working trees, never silently reset or overwrite, and avoid pasting tokens/client data to chat.

## 7. Evidence packet (minimal and high-risk additions)
Minimal: issue ID, UTC date, operator/agent, source/version, baseline, action/diff, required tests and actual results, failed-attempt links, reviewer, residual risk, approval, disposition. For high-risk forensics/security: hardware/host identity; tool version; acquisition and chain-of-custody metadata; original hashes; immutable or controlled artifact storage; provenance limits; runtime configuration; evidence exclusions. A cryptographic hash establishes an integrity comparator, not origin or authorship.

## 8. Authority matrix
| Action | Agent delegated latitude | Owner approval |
| --- | --- | --- |
| Read-only inspection and analysis | Allowed within provided access and privacy boundaries | Not ordinarily required |
| Draft test, report, issue, or plan | Allowed | Adoption/implementation as needed |
| Scoped edits on isolated branch | Only when authorized for that issue | Define scope first |
| PR review, CI inspection, evidence inventory | Allowed, with actual evidence | Required only if project gate says so |
| Merge, release, deploy, DNS/security controls, access grants, spend, third-party contact, evidence deletion | No implicit authority | Explicit approval and target required |
| Freeze/alter checklist, accept exceptions, advance phase | No implicit authority | Written authorized decision; independent acceptance as specified |

Implementer and reviewer should be distinguishable. AI consensus alone is not a substitute for independent human acceptance if required.

## 9. Hand-off and weekly cadence
**On interruption:** store a resume capsule (project, issue ID, commit/config, last passing gate, status, exact failed/remaining step, evidence links, owner). **Weekly (15–20 minutes):** refresh project status, milestone dates, active WIP (target <=2 development streams), dependencies, risk exposure, and next owner actions. **At closure:** record what could be automated or simplified without weakening controls. Keep one authoritative issue tracker rather than parallel conflicting boards.

## 10. Case example: HoneyTrace PR #53 / Step 24
The supplied report records a test failure at Step 24: expected 2 reads, observed 3. A retrying atomic-update simulation may legitimately perform a third read, but the response assertions were not evaluated after the failed read-count assertion. Therefore the old result was **FAIL**, not proof that rate limiting was fixed. Step 24A proposes changing only the expected assertion and rerunning authorization tests with fail-fast semantics. The report expected 15 PASS / 0 FAIL, but that is a **planned acceptance target, not a measured outcome**. Even if achieved, it establishes only synthetic behavior; real Base44 atomicity remains unverified. Confirm current branch/commit/worktree before reusing any historical command. Do not assume Step 24A is still pending without checking the authoritative current record.

## 11. Owner adoption checklist
1. Paste `Jay_Forensics_Workspace_Instructions_CEDW_v1.1.md` into this ChatGPT Project's instructions, replacing overlapping guidance while keeping unrelated required rules.
2. Store this SOP in a durable shared location accessible to the relevant agents (prefer a versioned repository `docs/operations/` path). Link to it from repository `AGENTS.md` files or agent instructions without overwriting project-specific frozen gates.
3. Pick a single authoritative issue/approval/evidence tracker (recommended: GitHub Issues and PRs for software). Use the step card for only material or high-risk changes.
4. Confirm the owner-only approval list. Enable the repository's required CI/branch rules as appropriate; do not let an AI reviewer approve its own changes.
5. Pilot one issue (such as PR #53 Step 24A if still relevant), capture a real PASS/FAIL and resume capsule, then tune verbosity and cadence based on the actual friction.
6. Review the process in one week. Approve updates by version, not by silent edits.

## Source and change notes
Adapted from the attached Jay Forensics CEDW v1.0 proposal (the nine-gate procedure and Step 24 regression analysis). v1.1 adds explicit risk-tiering, founder action prompts, primary-evidence hierarchy, portfolio WIP limits, portable step cards, a practical approval matrix, and a specific rollout plan. This document does not claim that any ChatGPT Project instruction or GitHub repository was modified.
