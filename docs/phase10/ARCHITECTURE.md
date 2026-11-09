# Phase 10 architecture

Phase 10 adds an optional operator-side package in
`honeypot/scripts/phase10`. The current user request authorizes source
implementation. The earlier [proposal in PR #22](https://github.com/Jay-Forensics-LLC/honeypot-v1.3-candidate/pull/22)
is historical planning, not evidence of deployed functionality.

The implementation starts with local report files and injected threat-intelligence
fixtures. Existing sensors do not import this package. Operators invoke it through
`hp integrations`; disabled or absent integrations cannot interrupt incidentd.

```text
Explicit local input + opt-in policy
                 |
     Bounded stable file read
                 |
     Fixed parser worker + limits
                 |
  Normalized findings and observed relationships
                 |
 Private source-by-hash store + import manifest
                 |
       Explicit normalized export
```

`registry.py` declares the fixed built-in adapters. `policy.py` validates opt-in,
scope and quotas; `io.py` supplies bounded readers and parsers; `model.py` derives
stable findings; `store.py` preserves original bytes and links their hash to the
normalized result. `service.py` and `worker.py` isolate parser work from the
operator process. Inventory, mock enrichment and forensic-copy exports are
separate commands.

Supported report families are SpiderFoot CSV/GEXF, a versioned Recon-ng workspace
envelope, BBOT JSONL, Nmap XML, Nuclei JSONL, a versioned CloudFox envelope,
authorized BloodHound aggregate summaries and authorized awareness aggregates.
Their contracts are in [Plugin specification](PLUGIN_SPECIFICATION.md).

Findings retain source tool, record identity, collected time when known, import
time, original SHA-256 and normalized indicator. A relationship records an
observation. It does not establish common ownership, identity or compromise.
Shared hosting and a shared Cloudflare address do not merge organizations.

The dedicated private store is separate from incident evidence. Imports do not
change raw sensor logs, correlate visitors into active target lists, or publish
to Loki/Grafana. No scanner, executable plugin, real provider client, package
installation, cloud login or directory credential is required.

Containment, Docker networking, management binding, PCAP, existing service
lifecycle and deployment gates remain governed by the existing
[operator model](../../honeypot/docs/OPERATOR_MODEL.md). Source tests do not
qualify the Ubuntu target or authorize a release. See
[Security model](SECURITY_MODEL.md) and [Acceptance report](ACCEPTANCE_REPORT.md).
