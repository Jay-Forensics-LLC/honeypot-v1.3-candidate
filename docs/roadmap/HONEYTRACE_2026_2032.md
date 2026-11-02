# HoneyTrace solo-first execution roadmap, 2026-2032

**Jay Forensics LLC | Planning baseline 2026-11-01 | Source roadmap: HoneyTrace_As_Is_Development_Roadmap_2026-2032(1).docx**

**Status: PROPOSED PLAN — NOT RELEASE OR PHASE AUTHORIZATION.** The latest `docs/CURRENT_PHASE_STATUS.md`, `honeypot/docs/BETA_ACCEPTANCE.md`, authorized frozen checklists and evidence govern actual status and release readiness. Timing and cash figures are planning assumptions, not commitments.

## Mission and boundaries

A free, open-source, local-first platform to observe adversaries, preserve verifiable evidence, investigate, improve defensive detections and eventually share privacy-preserving defensive intelligence. No paid/cloud dependency for safe offline core operations. Monetize optional professional installation, forensic services, training, consulting, support and managed hosting; never sell attacker data. One founder owns security and release decisions; Codex builds scoped changes, Grok critiques, CI checks deterministically and outside specialists independently assess critical paths. Neither AI nor volunteers grant security certification.

## As-is baseline (2026-11-01)

- Repository: `Jay-Forensics-LLC/honeypot-v1.3-candidate`, protected default branch `HoneyWatch`, planning baseline `bce3d92c608202db20a51c00cd8ee2c64093bf9e`.
- Phase 7: `CLOSED — OWNER-ACCEPTED WITH EXCEPTIONS — ISOLATED LAB ONLY` on `40d31fce8322feee41ac766717a9369bfc762373`. No independent acceptance.
- Current HoneyWatch source image pins: Loki 3.7.9; Grafana 12.4.13; Alloy 1.21.2. Not equivalent to the accepted lab pins; no current-build live qualification established.
- Phase 8: **NOT AUTHORIZED**. Supervised beta, WAN exposure, automatic decoy startup and any public service remain blocked. Daemon reload remains HOLD under current status.
- At planning baseline: PR #53 forensic/Sentinel integration open/unmerged, PR #56 dependent SQLite fix open, PR #22 Phase 10 planning only. Refresh actual PR state before editing or claims.
- Open qualification issues: guard-loss fail-stop; clock uncertainty; continuity and log rotation; storage loss; custody independent preservation; fresh human usability; candidate-matched package installation, restoration and rollback.

**Immediate decision:** no bulk merge of #53, public beta, WAN exposure, phase advancement or acceptance based on offline CI alone.

## Phase architecture and release gates

| Phase | Scope | Evidence before acceptance |
| --- | --- | --- |
| 7 bridge | Exact current source/image/runtime and evidence qualification | Independent review; guard, clock, storage, custody and continuity blockers resolved or dispositioned against authoritative criteria |
| 8 | Free supervised localhost beta | Accepted install, restoration, recovery, custody, human usability and release checklist; separate owner authorization |
| 9 | Investigation Studio + Sentinel | One decoy session to authorized case, linked original PCAP/transcript, verified timeline and defensible export; separate Sentinel source provenance |
| 10 | Optional OSINT enrichment | Opt-in, rate-/privacy-limited, cached provenance with offline fallback |
| 11 | HoneyTrace Sentinel | Explainable correlation, verified detection rules, measured false positives and reversible authorized containment |
| 12 | AEGIS | Isolated digital twin and reproducible defensive experiment results, no live attack simulation |
| 13 | HoneyTrace Commons | Opt-in signed research/intelligence exchange with privacy controls, no raw evidence transmission, demonstrated measurable benefit |

Do not make later capabilities prerequisites for the free offline core. One shared event/evidence model; no automatic hostile-payload execution; no forced Sentinel source-history fusion. Phase 13 is the endpoint of numbered expansion; later work uses stable releases and separately governed research.

## Quarterly execution plan

| Period | Planned work | Target milestone |
| --- | --- | --- |
| 2026 Q4-2027 Q1 | Reconcile and split PR #53/#56, freeze candidate, repair safety/evidence defects, verify current images | Independently reviewable, version-pinned beta candidate |
| 2027 Q2 | Only after owner authorization: Phase 8 clean install, restore, walkthrough and release verification | First qualified free localhost-only beta, a target not a promise |
| 2027 Q3 | Early adopters, security/support process, installation friction | 10 independent verified installs, stretch 25 |
| 2027 Q4 | Unified schema and one-click Cowrie-to-case PCAP/command linkage | Reproducible incident-to-report |
| 2028 Q1 | Timelines, custody completeness, non-executing replay and authorization review | Independent forensic walkthrough |
| 2028 Q2 | Phase 9 packaging, usability and synthetic offline demonstration | Accept or explicitly defer remaining Phase 9 features |
| 2028 Q3 | Approved Phase 10 enrichment, provenance and offline fallback | Privacy/offline gates |
| 2028 Q4 | Phase 11 explainable correlation and detection benchmarking | False-positive baseline |
| 2029 H1-H2 | Rule factory, severity, observe-only and bounded reversible controls | Independent Phase 11 assessment |
| 2030 H1-H2 | Isolated AEGIS digital twin and held-out experiments | Measurable defensive improvement |
| 2031 H1-H2 | Phase 12 assurance; small Phase 13 consent-based pilot | Verified opt-in, no raw evidence sharing |
| 2032+ | Signed research packages, collaborative validation, shared maintainership | Demonstrated Commons value and stable governance |

## First 90 days

**Days 1-15:** Reconcile branch/PR heads; preserve immutable Phase 7 evidence; record candidate source, image and target identities. **Days 16-30:** Address accepted security/case-scope/custody/SQLite defects through small PRs and scoped offline checks. **Days 31-60:** Only with existing target authorization, qualify current build, fail-stop, clock, storage, log rotation, continuity, package install/restore/rollback. **Days 61-90:** Independent review, rescore authoritative beta criteria and prepare owner go/no-go. No unapproved phase progression, public exposure or destructive work.

## Staffing and operating cadence

Solo full-time model assumes ~35-40 focused hours per week (18 implementation, 10 testing/security, 6 maintenance/release, 4 community/docs, 2 planning). Scale schedule down if part-time. In 2027 H1: solo founder with targeted paid Linux/container/network security review and beta testers. H2: seek 2-5 occasional volunteer contributors and 10-25 users. In 2028 seek recurring frontend/forensic collaborators and specialist audits; in 2029-30 recruit detection/research partners only after validated demand; before Commons federation seek multiple independent maintainers.

## Cash planning (USD; excludes founder pay and major audits)

| Year | Lean | Practical | Higher-spend |
| --- | ---: | ---: | ---: |
| 2027 | 1,500 | 5,000 | 12,000 |
| 2028 | 2,000 | 7,000 | 16,000 |
| 2029 | 3,000 | 10,000 | 25,000 |
| 2030 | 4,000 | 12,000 | 35,000 |
| 2031 | 4,000 | 15,000 | 45,000 |
| 2032 | 5,000 | 18,000 | 50,000 |
| **Total** | **19,500** | **67,000** | **183,000** |

Practical 2027 budget: tools $900; hosting/backups $600; targeted independent review $2,000; hardware $600; community/release $400; contingency $500. Quarterly spend approval. Entire Phase 13 program planning ranges: solo full-time ~4-7 years; complementary 2-4 person team ~2-3.5 years; established team 5-8 ~1.5-3 years. These are not velocity-derived guarantees.

## Adoption and measurable decision gates

First independently installed qualified beta; 10 independently verified installs and target 25; first independently reproducible incident-to-report; first reproducible defensive research; measurable held-out AEGIS improvement without harmful false positives; first 10 useful Commons participants. Stop or reduce research/federation scope if safety, privacy or measurable benefits fail. Earn through optional services, not gated core features; do not hire ahead of demonstrated demand.

## Security and release invariants

Keep original raw custody/provenance; differentiate OBSERVED, INFERRED, UNKNOWN; no host execution of attacker malware; no hack-back or external unauthorized interaction. Default sharing off; treat all community intelligence as untrusted; never auto-propagate broad firewall blocks. Releases require reviewed source/images/dependency licensing, signatures/hashes, disclosure path, explicit rollback, and independent critical-path assessment. Approval required before WAN exposure, management/firewall/VLAN changes, privileged installs, destructive migrations, service disruption, premature phase execution or evidence deletion.

**Near-term success:** One source-identified, independently assessed, safely installed HoneyTrace localhost beta used by an independent person. **Long-term success:** Independent users can observe, investigate, simulate, improve and share responsible defenses without dependence on the founder.
