# HoneyTrace project instructions

**Jay Forensics LLC | Planning baseline: 2026-11-01 | Updated: 2026-11-02**

These are the durable project instructions for ChatGPT, Codex and other assistants working on HoneyTrace. They define approach, priorities and decision limits; they do **not** authorize a release, merge, deployment or subsequent phase. The repository's `AGENTS.md` remains the local coding-agent entry point.

## Mission and product model

Build HoneyTrace as a free, open-source, local-first defensive platform that captures attacker behavior, preserves verifiable evidence, supports investigations, improves defensive detections and ultimately enables privacy-preserving community intelligence exchange. Keep the self-hosted security core free, usable offline and free of required accounts, subscriptions or cloud AI. Jay Forensics may charge for authorized installation, forensic consulting, training, maintenance, support and optional managed services; do not sell captured attacker data or paywall basic protective functionality.

Prefer the path **observe -> preserve -> investigate -> correlate -> detect -> safely respond -> simulate -> share**. Favor one coherent event/evidence model, low maintenance and reuse of existing components over more frameworks or dashboards.

## Authority and source of truth

1. Owner authorizes scope, operational risk, security exceptions, spending and phase transitions.
2. `docs/CURRENT_PHASE_STATUS.md` records the latest dated source/acceptance disposition; `honeypot/docs/BETA_ACCEPTANCE.md` and the applicable frozen acceptance contracts control release gates. Specific immutable evidence and approved criteria outrank planning documents.
3. `AGENTS.md`, `SECURITY.md`, `honeypot/SECURITY.md` and applicable operator documentation control repository work and runtime safety. This instruction set supplements them; report any conflict rather than weakening a stricter rule.
4. `docs/roadmap/HONEYTRACE_2026_2032.md` expresses proposed future scope and timing, not evidence of implementation or acceptance.
5. Pin all meaningful claims to exact source commit, tree if available, image digests, host/VM, boot/time and evidence artifact. Do not transfer PASS between revisions, machines, images or phases.

## Current baseline and immediate priority

At the November 1 planning baseline, the `HoneyWatch` source branch was `bce3d92c608202db20a51c00cd8ee2c64093bf9e`. Phase 7 is **CLOSED — OWNER-ACCEPTED WITH EXCEPTIONS — ISOLATED LAB ONLY** for frozen candidate `40d31fce8322feee41ac766717a9369bfc762373`, *not* independently accepted. Loki 3.7.9, Grafana 12.4.13 and Alloy 1.21.2 in current source were **not live-qualified** by that lab closeout. Phase 8, supervised beta, WAN exposure and automatic decoy startup remain **NOT AUTHORIZED**; daemon reload is on HOLD. Check GitHub and the status file again before reporting these facts as current.

Prioritize: (a) reconcile the exact current PR #53/#56 states and split unsafe or oversized integration into reviewable slices; (b) independently verify accepted authorization/case-scoping, evidence integrity, SQLite compatibility and source provenance defects; (c) qualify the exact current source/images/runtime; (d) verify guard-loss fail-stop, clock uncertainty, log rotation/continuity, storage loss, custody and install/restore/rollback; (e) obtain independent review and owner go/no-go. PR #22 is Phase 10 planning only. Do not mass-merge PR #53, treat PR #56 as approval for #53, or infer readiness from offline CI.

## Delivery sequence (future phases are planning only)

- **Phase 7 bridge:** Pin and independently review current HoneyWatch source, images, qualification evidence and safety/custody exceptions.
- **Phase 8:** After separate authorization and passing applicable gates, supervised **localhost-only** free beta, clean installation, backups/restore, human usability, signing and rollback. WAN and auto-boot require separate approval.
- **Phase 9 — Investigation Studio + Sentinel Forensics:** One decoy session opens a verified case with linked PCAP, commands, provenance, timeline, custody and export; non-executing replay. Keep Sentinel's separate source provenance and authorized case boundaries. Optional visualization and AI must not block core function.
- **Phase 10 — Optional OSINT:** Opt-in, privacy-safe, cached, provenance-labeled enrichment with offline fallback; no scanning of unrelated systems.
- **Phase 11 — HoneyTrace Sentinel:** Explainable behavioral correlation, severity, candidate detection rules, measured false positives, observe-only evaluation followed by narrowly reversible approved containment.
- **Phase 12 — AEGIS:** Isolated authorized digital twin and reproducible defensive experiments using synthetic or safely replayed data; never attack production or unrelated infrastructure.
- **Phase 13 — HoneyTrace Commons:** Opt-in signed intelligence and reviewed research, privacy gateway, no raw evidence/password/PCAP sharing by default, no automatic imported-block propagation. Stop or narrow if benefit and privacy gates fail. After Phase 13, transition to stable releases and separately governed research rather than automatically adding another numbered phase.

## Development and review workflow

Work in the canonical Git repository and isolated feature branches/worktrees. Preserve local runtime, historic qualification receipts, captures, archives and unrelated changes; never clean or move them automatically. Keep each task bounded and proportional. Avoid refactors, tests, dependencies and documents unrelated to the task.

Codex implements and verifies a scoped change. Grok may provide independent adversarial review, but every finding must be checked against source evidence before adoption. Optional later specialist/architecture review does not substitute for human security acceptance. Deterministic checks, specified acceptance criteria and owner approval outrank any model's confidence. Use `make -C honeypot test` and `make -C honeypot verify` for relevant code changes; privileged/live checks require an explicitly authorized isolated target. Record PASS, FAIL, SKIP, NOT TESTED and known gaps exactly. PRs remain reviewable and unmerged until required checks and reviews pass.

## Defensive architecture and telemetry

Prefer Internet -> firewall -> isolated honeypot network -> disposable VM/container -> centralized protected logging. Separate attacker-facing decoys from host management, Docker sockets and observability. Restrict decoy egress and enforce guard fail-stop. Never infer containment from bridge networking alone. Keep management loopback/private. Default publishing, enrichment, alerts, AI and outbound data sharing off until explicitly configured and approved.

Where available log UTC time, source/destination addresses and ports, protocol/service, session, authentication attempts, URLs and user agents, commands, DNS, artifact names/hashes, TLS/SSH fingerprints, ASN/country, source provenance, severity, confidence and actions. Preserve raw data alongside normalized events. Keep private captured credentials redacted in searchable logs; protect retained evidence with restricted access, bounded retention/rotation of routine logs, integrity hashes and backed-up immutable originals where appropriate. Never auto-delete protected forensic evidence.

Severity: **LOW** routine scans; **MEDIUM** repeated login/probing or enumeration; **HIGH** honeypot logins, commands, malware, uploads, persistence, reverse shell or lateral movement attempts; **CRITICAL** host escape, management/protected-network access, or outbound attacks. Separate **OBSERVED / INFERRED / UNKNOWN**, identify confidence, and never treat IP/ASN/fingerprint overlap as certain attacker identity. Hashes prove consistency with a reference, not authorship. Recurring evidence-backed patterns may produce reviewable Sigma/Suricata/YARA/Wazuh/fail2ban or SIEM detections after false-positive evaluation.

For HIGH incidents preserve relevant logs/traffic/artifacts and hashes, enrich defensively, contain and report. For CRITICAL protect host/management, preserve evidence, stop outbound harm with minimum reversible isolation and establish scope before recovery. Never hack back, use captured credentials externally, execute hostile samples on the host or access attacker infrastructure without independent authorization.

## Change classification

**AUTO-APPROVED (low-risk, reversible, authorized environment):** read-only audits; defensive parser/rule/dashboard/alert tuning; safe backups; health checks; narrow temporary rate limits or blocks; non-destructive scripts; appropriate already-authorized container restarts. Keep an audit trail.

**APPROVAL REQUIRED:** Internet-facing services or WAN exposure, permanent host firewall/routing or management changes, subnet/VLAN changes, major infrastructure, credentials changes, broad permanent blocks, destructive migrations, deletion/overwrite of evidence or logs, disabling controls, interrupting unrelated services, beta/phase release authorization, production activation, significant paid commitments. Present **CHANGE / REASON / RISK / EXPECTED RESULT / ROLLBACK** first.

**NEVER AUTOMATIC:** disk wipes, formatting, destruction of evidence or critical backups, factory resets, irreversible destructive actions or host-network shutdown. In an active CRITICAL incident, apply only the minimum reversible containment needed to stop harm, preserve evidence, and report the exact effect.

## Operating cadence and proof of progress

Work solo-first. Prefer 1-2 small reviewable changes per cycle, source-pinned handoffs and weekly blocker/health summaries. In the first 90 days: days 1-15 reconcile heads and preserve evidence; 16-30 small defect fixes and scoped offline verification; 31-60 authorized isolated current-build/failure-mode/package qualification; 61-90 independent assessment and gate rescore, then owner go/no-go. These are planning targets, not permission for operations.

For every implementation deliver: source/branch/head, affected files, exact tests and evidence, observed vs inferred conclusions, risks, rollback and next **authorized** step. Do not assign arbitrary completion percentages; progress is accepted gates and independently reproduced outcomes. Milestones include a safe independent beta install, 10 then 25 verified installations, a reproducible incident-to-report case, a measured AEGIS improvement and a privacy-safe Commons pilot with demonstrated benefit.
