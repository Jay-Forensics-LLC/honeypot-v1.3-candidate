# Grok continuation prompt — recover interrupted Codex production-completion pass

**Historical instruction, written before the v1.3 candidate existed.** Do not execute it as current work. This tree already has 63 unit tests and `verification/PRODUCTION_READINESS.md`. The "60 tests" and "create PRODUCTION_READINESS.md" lines below are the state of that interrupted pass, not the current repository. Current operator status is `verification/PRODUCTION_READINESS.md`.

Use the uploaded handoff ZIP as the only authoritative source tree. Read `verification/CODEX_RECOVERY_HANDOFF_2026-09-30.md` first.

The previous Codex session ran out of tokens before exporting a recoverable modified repository. Do not invent or assume Codex edits that are not in this tree. Continue from the files actually present.

## Goal

Finish the existing production-completion prompt without feature creep. The repository already contains most hardening features. Focus on auditing, missing regressions, production-readiness documentation, final validation, and packaging.

## Do not redo existing implementation unless a test proves a defect

Already present:

- semantic `hp_guard` verifier (`guard_policy.py`);
- preview-only guard-loss watcher (`guard_watch.py` + preview systemd service/timer);
- selective decoy-only stop behavior;
- source-fidelity WAN gating requiring `netns`/`observation` evidence;
- loopback-only `boot_start()` using existing containers only;
- per-decoy DNS blackholes;
- deployment-unique honeytokens;
- disabled-by-default/rate-limited alert bus;
- sanitized intel pack;
- 60 existing unit tests;
- WAN matrix with Redis ineligible.

## Work in this order

1. Inventory the entire repository and map every requirement from the original production-completion prompt to:
   - COMPLETE
   - PARTIAL
   - NOT STARTED
   - LIVE-ONLY

2. Run existing tests before editing:

   `python3 -B -m unittest discover -s tests -v`

   `python3 -B scripts/validate.py`

3. Close only genuine repo-testable gaps. At minimum inspect whether these explicit regressions are missing:
   - valid semantic guard -> `guard_watch.check()` makes no Docker stop call;
   - alert payload/output cannot leak arbitrary raw TTY/session transcript fields or secret values.

4. Create `verification/PRODUCTION_READINESS.md` with:
   - repository-complete items;
   - target-tested items;
   - live-only remaining tests;
   - approval-required operations;
   - rollback requirements;
   - WAN prerequisites;
   - known residual risks;
   - strict OBSERVED / INFERRED / UNKNOWN / NOT TESTED separation.

5. Keep these as live-only / NOT TESTED unless actual target evidence exists:
   - semantic table-delete drill while guard oneshot remains active;
   - real `wlp2s0` source fidelity;
   - VLAN/DMZ verification;
   - bait integration in rebuilt running image;
   - real alert endpoint delivery;
   - controlled WAN burn-in;
   - automatic decoy boot enablement;
   - actual WAN exposure.

6. Do not install/enable services, modify router/firewall/VLAN, change `DECOY_BIND`, expose WAN, or delete evidence.

7. Re-run all tests and validation. Preserve NOT TESTED honestly. Any regression is a release blocker.

8. Produce final artifacts only when source-side work is clean:
   - `honeypot-v1.3-production-candidate-YYYY-MM-DD.zip`
   - matching `.zip.sha256`
   - git-style patch + diffstat
   - concise completion report.

9. Final ZIP verification must include:
   - reopen ZIP independently;
   - SHA-256;
   - CRC;
   - no traversal;
   - no duplicate/case-colliding paths;
   - `.sh` mode 0755;
   - no `.env` runtime file;
   - no secrets/private keys;
   - no PCAPs/raw logs/evidence;
   - fresh extraction;
   - unit tests rerun against fresh extraction;
   - validator rerun against fresh extraction.

10. Final report must include separate values:

   `SOURCE / REPOSITORY COMPLETION: X/100`

   `LIVE DEPLOYMENT VALIDATION: X/100`

Do not call the project 100% complete while any live-only tests remain.
