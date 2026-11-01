# Phase 10 source implementation and backlog

The current user request authorizes source implementation of the earlier Phase 10
proposal. The implementation is offline/import-first. Existing operational
authorization and qualification are separate.

These capabilities form the first suite milestone. Its completion criteria are
the main workflow, focused passing checks and documented limitations. The last
column is later work, rather than extra conditions on source completion.

| Stage | Source scope | Later work |
| --- | --- | --- |
| 10.1 Inventory | Read-only current-environment tool discovery | Independently inventory each intended host, verify versions/licenses/dependencies |
| 10.2 Framework | Fixed registry, closed opt-in policy, bounded worker and private store | Packaging and target validation when deploying |
| 10.3 Threat intelligence | Six injected mock providers, eligibility, cache/quota/backoff | Real clients and any external disclosure require separate implementation and review |
| 10.4 SpiderFoot | CSV/GEXF entities and observed relationships | Validate intended upstream export versions with sanitized owner fixtures |
| 10.5 Recon-ng/BBOT | Versioned workspace envelope and supported JSONL events | Validate the actual owner report formats |
| 10.6 Assessment | Scoped Nmap/Nuclei report imports | Active execution remains unavailable |
| 10.7 Forensics | Explicit evidence-copy export with original hash/provenance | External parser sandbox and independent tool validation |
| 10.8 Cloud/identity | Approved CloudFox envelope and aggregate lab BloodHound summary | No privileged cloud or directory access is part of this feature |
| 10.9 Awareness | Approved aggregate campaign metrics | Owner privacy review and intended export verification |
| 10.10 Qualification | Synthetic unit/integration tests and source checks | Production release qualification is a separate milestone |

Use [Test plan](TEST_PLAN.md) to validate the source and
[Acceptance report](ACCEPTANCE_REPORT.md) to record actual results. A passing
offline fixture does not qualify an upstream tool, running VM or release.

The source package has no automatic startup, scheduled import or live provider
configuration. Operators create an explicit policy and invoke commands on local
files. Start with a private disposable store and sanitized fixtures before
processing real case material.

Rollback disables the policy or removes the optional source integration. Preserve
all private imported originals, derived findings and manifests. No sensor or
firewall rollback is required by this source-only package, because it does not
modify those components.
