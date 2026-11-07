# HoneyTrace — Phase 10: OSINT, Threat Intelligence & Security Tool Integration

> **PLANNED — PENDING — DO NOT IMPLEMENT**
>
> **Documentation-only feature proposal. No approval to build, install, run, merge or deploy any Phase 10 functionality.** Current HoneyTrace beta is BLOCKED, independent Stage 7 closeout is PENDING, and daemon reload is HOLD per the repository README. Existing safety and acceptance gates take precedence.

**Organization:** Jay Forensics LLC  
**Phase:** 10  
**Proposal date:** 2026-10-17  
**Approval state:** NOT APPROVED  
**Intended agent, if later approved:** Codex CLI  
**Immediate priority:** finish the current phase, not Phase 10.

## 1. Purpose and non-goals

Propose optional defensive plugins for importing OSINT and assessment reports, contextual threat-intelligence enrichment, relationship correlation, forensic analysis, and reporting through HoneyTrace's existing evidence/analytics system. All features are off by default. Initial implementation, **only after future approval**, must be offline/import-first.

Non-goals: no changes to containment/nftables, Docker networking, Cowrie, OpenCanary, PCAP, Loki/Grafana, deployment, production Cloudflare DNS, or prior Stage 7/8 qualifications; no automatic scanning of honeypot visitors; no phishing credential capture or session-interception framework.

## 2. Inventory and exact evidence classification

**Confirmed** means CLI output or generated scan evidence in this conversation. **Unverified** means installation was suggested but completion was not shown. **Discussed only** means no local installation demonstrated. Desktop and HoneyTrace laptop are separate hosts; re-inventory both.

### OSINT / reconnaissance

| Tool | Function | Evidence | Phase 10 |
|---|---|---|---|
| PhoneInfoga | Number OSINT/search | Confirmed CLI scan | Manual casework; optional import |
| Recon-ng | Modular OSINT/workspaces | Confirmed successful install and help | Workspace result import |
| SpiderFoot | Automated OSINT/correlation | Confirmed CSV/GEXF outputs | Priority offline import |
| Sherlock | Username search | Unverified | Optional import |
| Maigret | Username/profile search | Unverified | Optional import |
| Holehe | Email registration checks | Unverified | Casework only, not telemetry |
| BBOT | Recon/attack-surface discovery | Unverified | Authorized report import |
| Maltego | Graph analysis | Unverified | Graph export/interchange |
| Subfinder | Passive subdomains | Discussed only | Optional |
| Amass | Asset/DNS relationships | Discussed only | Optional |

### Vulnerability assessment / penetration testing

| Tool | Function | Evidence | Phase 10 |
|---|---|---|---|
| Nmap | Network/service discovery | Unverified | XML import; later approved target allowlist |
| Nuclei | Template-based findings | Unverified | JSONL import; later approved allowlist |
| Caido | HTTP/S manual assessment | Unverified | External operator workflow |
| BBOT | Asset reconnaissance | Unverified; also counted above | Import first |
| WhatWeb | Technology fingerprinting | Discussed only | Optional import |
| WAFW00F | WAF identification | Discussed only | Optional import |
| testssl.sh | TLS checks | Discussed only | Optional import |
| TruffleHog | Secret detection | Discussed only | Redacted, restricted results import |

### Digital forensics and processing

| Tool | Function | Evidence | Phase 10 |
|---|---|---|---|
| CyberChef | Decode/transform | Unverified | Local operator workflow |
| ExifTool | File metadata | Unverified | Restricted evidence-copy processing |
| jq | JSON processing | Unverified | Supporting utility |
| ripgrep | Text search | Unverified | Restricted evidence search |
| TShark | PCAP analysis | Previously reported on HoneyTrace laptop | Reuse existing path |
| Wireshark | Packet GUI | Not confirmed here | External workflow |

### Cloud and identity

| Tool | Function | Evidence | Phase 10 |
|---|---|---|---|
| CloudFox | Cloud posture/privilege assessment | Unverified | Authorized offline import |
| BloodHound | Identity/AD graph analysis | Discussed only | Isolated lab export |

### Phishing simulation / awareness / adversary emulation

| Tool | Function | Evidence | Phase 10 |
|---|---|---|---|
| Evilginx3 | Auth proxy/session interception | Discussed only | **EXCLUDED** |
| Muraena | Auth-interception proxy | Discussed only | **EXCLUDED** |
| Modlishka | Auth-interception proxy | Discussed only | **EXCLUDED** |
| Social-Engineer Toolkit | Social engineering test framework | Discussed only | **EXCLUDED** |
| King Phisher | Campaign simulation | Discussed only | Aggregate results only |
| GoPhish | Authorized security awareness | Discussed only | Aggregate results only |
| Microsoft Attack Simulation Training | M365 managed training | Cloud service, not installed | Authorized aggregate reports only |

### Supporting system utilities

**Confirmed from desktop terminal evidence:** Go 1.26.8, Python 3.14, pip/venv, Git, curl, dig, build-essential, python3-dev, libxml2-dev, libxslt1-dev, libffi-dev, libssl-dev and pkg-config. Recon-ng dependencies installed. SpiderFoot's pinned lxml 4.9.4 failed to compile against Python 3.14, but subsequent scan exports demonstrate that some SpiderFoot instance operated; exact environment not proven. Docker availability on each host must be verified. Python dependencies are not separate OSINT applications.

**Confirmed newly working investigation applications: 3 (PhoneInfoga, Recon-ng, SpiderFoot).** This is not a claim that other software is absent from either host.

## 3. Proposed architecture — not implemented

```text
Existing Cowrie / OpenCanary / PCAP
                |
      Existing event/evidence path
                |
    Optional async policy-controlled interface
                |
   +------------+-------------+
   |            |             |
Threat intel   Offline OSINT  Authorized assessment
API adapters   CSV/GEXF data  offline XML/JSONL
   |            |             |
   +------------+-------------+
                |
   Normalization, provenance, correlation
                |
   Findings store / Loki / Grafana / export
```

Plugin contract fields: identifier, semantic version, category, supported inputs/outputs, executable path, permissions, offline/passive/active mode, authorized target scope, secrets requirements, timeouts, rate limits, concurrency, retention, audit logs, opt-in flag, and failure behavior. Plugins must be isolated from firewall/Docker administrator privileges and cannot block the sensor pipeline.

Conceptual finding schema:

```json
{
  "finding_id": "stable-derived-id",
  "source_tool": "spiderfoot",
  "source_record_id": "scan-record-id",
  "collected_at": "ISO-8601",
  "imported_at": "ISO-8601",
  "indicator_type": "domain|ip|url|email|file|relation|other",
  "indicator_value": "example.com",
  "relationship": null,
  "scope_status": "owned|third_party|shared_infrastructure|unknown",
  "assessment": "confirmed|possible|false_positive|informational|scan_error",
  "evidence_reference": "immutable-artifact-id",
  "confidence": null,
  "raw_source_hash": "sha256:..."
}
```

## 4. Staged implementation plan — future only

### 10.1 — Cross-host software inventory (2–4 hours)

1. Identify exact HoneyTrace checkout/host, branch, commit, runtime, gates.
2. Inspect binaries, versions, virtual environments, pipx, GUI programs and containers **without installing or modifying**.
3. Classify as confirmed/missing/incompatible/excluded; record host-specific paths, licensing, dependencies and API needs.
4. Proposed future outputs: `TOOL_INVENTORY.json`, `TOOL_COMPATIBILITY.md`.

**Gate:** every candidate inventoried accurately; no unapproved installation.

### 10.2 — Plugin framework (1–3 days)

1. Inspect existing adapters, logging, event schemas and protected files.
2. Design opt-in registry, typed I/O, policy/credential isolation, worker timeouts and quotas.
3. Test with a mock offline plugin before integrating real tools.
4. Ensure disabled/missing integrations do not affect existing sensors.

**Gate:** mock round-trip and disable/timeout tests pass, current behavior unchanged.

### 10.3 — Threat intelligence enrichment (2–4 days)

1. Define eligible indicators, internal/private indicator exclusions, data-sharing consent.
2. Build caching, TTL, rate limits, provider timeouts, exponential backoff and audit logs.
3. Mock AlienVault OTX, AbuseIPDB, GreyNoise, VirusTotal, ThreatFox and certificate transparency provider responses.
4. Later, only with approved credentials/policies, add real read-only adapters.
5. Preserve source, timestamp and confidence; do not equate reputation with proof.

**Gate:** no blocking of sensors; no secret leaks or unauthorized third-party disclosure.

### 10.4 — SpiderFoot import and graph correlation (1–3 days)

1. Accept offline CSV/GEXF exports; reject invalid, oversized and malformed files.
2. Store original files by hash with scan IDs, timestamps and immutable provenance.
3. Normalize entities and edges without treating shared infrastructure as shared ownership.
4. Deduplicate without conflating distinct people, organizations or unrelated websites.
5. Test against sanitized Jay Forensics scan data including the Cloudflare co-host false-positive case.
6. Defer scanner invocation/API orchestration until separately approved.

**Gate:** evidence faithfully reproduced, counts verified, no Cloudflare false-ownership cascade.

### 10.5 — Recon-ng and BBOT import (2–4 days)

1. Support versioned approved workspace/scan report formats.
2. Normalize entities with authorization, provenance, time, confidence.
3. Keep adapters optional; missing programs must not fail startup.
4. No automatic reconnaissance execution at this stage.

**Gate:** offline imports work, no outbound reconnaissance initiated.

### 10.6 — Authorized vulnerability assessment (2–4 days)

1. Import Nmap XML and Nuclei JSONL results.
2. Specify a separate active-assessment authorization framework with explicit asset scope/allowlists and operator approval.
3. Deny any execution not explicitly approved.
4. Absolutely no scanning of remote IPs just because they accessed a honeypot.
5. Consider tightly bounded execution adapters only under a future separate authorization.

**Gate:** invalid/out-of-scope targets denied before network activity; imports never launch scans.

### 10.7 — Forensic utilities (1–3 days)

1. Preserve source hashes/evidence copies.
2. Design ExifTool processing in a sandboxed, bounded worker.
3. Provide safe local CyberChef analysis/export workflow; don't upload sensitive artifacts to public web instances.
4. Reuse TShark/PCAP and current evidence storage.

**Gate:** original artifact hashes unchanged and chain-of-custody metadata preserved.

### 10.8 — Cloud and identity reports (2–4 days)

1. Offline import of approved CloudFox findings.
2. BloodHound summary export only from an isolated authorized lab.
3. Separate privileged cloud/directory credentials from HoneyTrace runtime entirely.

**Gate:** normal sensor operation needs no privileged cloud or directory access.

### 10.9 — Security-awareness reports (1–3 days)

1. Import aggregated training metrics from GoPhish, King Phisher or Microsoft Attack Simulation Training, with authorization and privacy policy.
2. Avoid unnecessary employee identifiers and redact secrets.
3. Exclude Evilginx3, Muraena, Modlishka and SET from runtime integrations.

**Gate:** zero passwords, session tokens or raw authentication submissions processed.

### 10.10 — Independent qualification and release gate (3–5 days)

1. Unit, schema, malformed-input and offline integration tests.
2. Mock API unavailability/rate limiting, resource exhaustion, and timeouts.
3. Verify authorization and forbidden-target rejection without any actual probing.
4. Confirm no changes to containment/nftables, PCAP, Docker networking, Cowrie/OpenCanary, Loki/Grafana, protected files.
5. Provide independent audit, operator sign-off, rollback plan and explicit release decision.

**Gate:** no regression, no unapproved network traffic, prior beta/Stage 7/8 gates remain controlling.

## 5. Acceptance matrix

| Scenario | Expected |
|---|---|
| Plugin disabled / executable missing | Graceful, sensors unaffected |
| Invalid CSV / GEXF / oversized input | Reject safely, bounded resources |
| Offline TI mock | Deterministic normalized result |
| API failure / quota | Cache, backoff, bounded failure |
| Internal/private indicator | Never submitted externally by default |
| Cloudflare shared IP | No inference of common asset ownership |
| Unauthorized assessment target | Denied without probing |
| Secret-bearing report | No secret in logs, reports or UI |
| Plugin timeout | Worker terminates without sensor impact |
| Original evidence | Immutable, hashed, provenance kept |
| Existing safeguards | nftables, daemon reload HOLD, Docker, PCAP and beta gates unchanged |

## 6. Proposed deliverables, not yet authorized

```text
docs/phase10/ARCHITECTURE.md
docs/phase10/TOOL_INVENTORY.md
docs/phase10/PLUGIN_SPECIFICATION.md
docs/phase10/SECURITY_MODEL.md
docs/phase10/IMPLEMENTATION_PLAN.md
docs/phase10/TEST_PLAN.md
docs/phase10/ACCEPTANCE_REPORT.md
```

Additional future artifacts: mock providers, offline import fixtures, normalization schema, test evidence. Their appearance here is **not** authorization to create them now.

## 7. Timeline and priority

Planning estimate: **15–30 focused development days**, not a commitment. Recommended first future scope: plugin contract + offline SpiderFoot CSV/GEXF imports + mock threat-intelligence adapter, with no active scanners. All estimates depend on verified host/repository state and explicit approval.

## 8. Governance and immediate next action

- **PLANNED — PENDING — DO NOT IMPLEMENT.**
- Keep this document on a documentation-only branch in an **unmerged draft pull request**.
- Do not ask Codex to begin Phase 10 implementation.
- Do not change production DNS as part of this proposed phase; DNS review has a separate approval gate.
- Do not bypass blocked Stage 7/8 or beta qualification.
- **Finish the existing HoneyTrace phase first.** When Codex completes its currently running prompt, review exact commit/branch, changed files, command exit codes, testing and evidence, Docker socket/runtime reconciliation, Stage 7 closeout, daemon reload HOLD, and beta acceptance state.

**FINAL STATUS: PLANNED — PENDING — DO NOT IMPLEMENT.**
