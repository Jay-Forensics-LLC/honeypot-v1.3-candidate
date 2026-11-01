# Explainable initial rules (1.0.1)

Modified for HoneyTrace on 2026-11-01: DNS support ranges include only matching
questions; unsupported mapping thresholds are rejected before ingestion.

Rules generate **review leads** with confidence `supported_pattern`. Confidence
means the rule's descriptive predicate is supported by the parsed subset; it is
not a probability of compromise. Severity `review` is analyst prioritization,
not incident classification. Direct observations, derived associations and
rule findings are stored separately. No overall score or health verdict exists.

Every finding retains rule/version, context, interval, metrics, evidence selector,
alternatives and limitations. Selectors refer to the private disk tables retained
in the case, with first/last anchors for convenience; they do not claim that only
those anchors are the support. Every association links a normalized observation,
which links source bytes, packet/block, JSON pointer, archive member or SQLite
row. No byte offset is invented for a decoder that only exposes logical rows.

Each finding's `metrics.evaluation` records its required coverage, minimum sample
size and unit, and the effective thresholds used for that rule. This includes
configured values rather than assuming defaults. `evidence.reproduction` contains
the private finding query command and rerun requirements. The human report prints
these beside each finding. Replace the placeholder with the original private case:

```sh
python3 tools/evidence_lab/query.py finding /ABSOLUTE/PRIVATE_CASE --id 1 --limit 100
```

The query returns the exact private selector and a bounded support sample with
explicit truncation. A complete sample has an exact count; a truncated sample
reports a lower bound and leaves its full count unknown. Increase the declared
limit (up to 1,000 rows, with an 8 MiB sample byte cap) to inspect more support.
The full private SQL selector and its parameters are returned independently of
sample truncation. It does not reinterpret a finding as an incident.
To reproduce analysis, verify the same source hashes and source occurrence order,
use the same parser version and configuration, and write to a new private case.
The original case key is required only to reproduce minimized identifiers; keep
that key and all query output private.

| Rule | Required coverage / threshold | Benign alternatives | Misses and limits |
|---|---|---|---|
| repeated_syn | At least 10 timestamped SYN-without-ACK packets to the same destination/port, source and context in one fixed 60 s window | Retransmission/loss, authorized monitors, reconnecting clients | Packet count is not distinct attempts; absent ACK visibility is not proof of failure. Partial captures and window boundaries hide bursts. |
| destination_ports | At least 10 distinct destination TCP ports from a source to one address/context in one fixed 60 s window; uses SYN-without-ACK headers | Authorized inventory/security tools, service discovery, many-service applications | UDP/ICMP/encrypted inner traffic unexamined; no intent or active scanning inferred. |
| dns_long_labels | At least 5 complete timestamped nonresponse DNS questions containing a label ≥50 wire bytes in one context/fixed 60 s window | CDN cache keys, anti-abuse tokens, legitimate telemetry/tracking | No claim of tunneling or exfiltration; no opaque lexical model. Encrypted DNS, fragmented/split messages and missing packets are unevaluated. Escaped display bytes do not inflate wire label length. |
| conflicting_mappings | At least 2 usable time-resolved IP/MAC associations; finding for each contradictory overlapping pair in one context | Proxy ARP, lease revocation/reassignment, virtual IP failover, clock error | Statements unauthenticated; unresolved times or different network/interface/VLAN contexts cannot establish conflict. Intervals do not imply observed continued use. |

Configuration keys in `--config`:

```json
{"rules":{"window_seconds":60,"syn_minimum":10,"port_minimum":10,
"dns_label_minimum":50,"dns_minimum_questions":5,"mapping_minimum_conflicts":1}}
```

Thresholds are positive integers; label threshold ≤63. Mapping findings remain
one per conflict; its supported threshold is 1. Fixed windows are UTC epoch based
and use floor division, including pre-epoch times. Known clock adjustments apply.
There is no learned baseline or persistence beyond stated intervals.

`rule_evaluations` distinguishes FINDINGS, NO_FINDING (enough eligible observations,
no local group meets threshold), INSUFFICIENT_EVIDENCE, NOT_EVALUATED (no relevant
capture input), and UNSUPPORTED (no supported observations). The report includes
eligible counts and parsing losses beside findings. Each rule has positive,
negative, threshold boundary, insufficient, deterministic and plausible benign
lookalike tests. The benign lookalikes deliberately also trigger review: the
alternative is part of the explanation, never silently treated as malicious.

Reproduce on a case:

```sh
python3 tools/evidence_lab/analyze.py /absolute/input.pcap \
  --config /absolute/config.json --output /absolute/new-case
sqlite3 -readonly /absolute/new-case/index.sqlite \
  'SELECT rule,status,eligible,findings,reason FROM rule_evaluations ORDER BY rule;'
```

Periodic connection inference, protocol/port mismatch rules, infrastructure or
Wi-Fi baseline comparisons, capture-gap heuristics, encoded-content/entropy
rules and malware classification are **not implemented**. VPNs, encryption,
identifier rotation, RSSI, crashes and unusual names are never compromise proof.
No supplied trustworthy baseline exists, so baseline-dependent checks are not
silently represented as evaluated.
