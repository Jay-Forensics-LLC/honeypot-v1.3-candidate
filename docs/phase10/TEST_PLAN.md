# Phase 10 test plan

Run target-controlled tests in the designated offline test environment with a
read-only source/toolchain, private bounded scratch storage, an empty allowlisted
environment and finite CPU, memory, process, file-size and wall-clock limits.
Use synthetic reports and dummy authorization; never use captured credentials,
deployed services or external provider accounts.

From the repository root, the focused suite is:

```sh
python3 -B -m unittest discover -s honeypot/tests -p 'test_phase10_*.py' -v
```

After focused tests, run the repository-required checks in the same isolated
environment:

```sh
make -C honeypot test
make -C honeypot verify
python3 -B -m unittest discover -s tools/tests -v
python3 -B tools/validate_baseline.py
```

Record the exact source revision/worktree state, environment, command exit codes,
test counts, skips and missing native validators in
[Acceptance report](ACCEPTANCE_REPORT.md). Do not run `verify-full`, local live
integration, privileged firewall checks, installations or container starts as
part of this source-only validation.

| Area | Required ordinary fixture checks |
| --- | --- |
| Policy | Disabled defaults, unknown fields/types, opt-in allowlist, finite quotas, no credentials |
| File input | Missing/unsupported files, stable regular reads, oversized input, sanitized errors |
| Parsers | Malformed CSV/XML/JSON, duplicate keys, nesting/record limits, unsupported formats |
| OSINT | Source identity/time, deterministic findings, distinct entities, observed graph edges, shared-IP ownership limits |
| Assessment | Missing approval, exact domain/IP/CIDR scope, out-of-scope report rejection, no scanner invocation |
| Cloud/identity | Approved closed envelopes, count-only lab summaries, no raw directory identities |
| Awareness | Explicit approval/privacy policy, closed aggregate schema, count bounds, identifier/secret rejection |
| Mock TI | Six providers, public eligibility, canonical cache keys, TTL, quotas, rate limiting, backoff, timeout/unavailable fixtures |
| Store/export | Original hash, manifest/output links, repeat-import deduplication, private modes, tamper/error handling, normalized-only export |
| Worker/CLI | Round-trip, disabled operations, timeout/failure response, no sensor dependency |
| Forensics/inventory | Original bytes/hash preserved, explicit copy only, tools never started, unknown versions reported honestly |
| Existing system | Complete regression suite and diff inspection confirm protected runtime/configuration paths unchanged |

External-tool compatibility, real provider behavior, cross-host inventory,
Ubuntu target operation and independent release acceptance remain separate
checks. Explicit skips are not passes.
