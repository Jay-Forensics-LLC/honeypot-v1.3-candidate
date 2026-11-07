# Phase 9: Sentinel offline exchange bridge

This milestone connects HoneyTrace's optional offline report store and case/job
workspace to Sentinel-Forensics. The full tracked Sentinel source is now bundled
at the repository root under `sentinel-forensics/`, imported from its recorded
upstream revision. Dashboard jobs discover that engine automatically; a separate
trusted checkout remains an optional `--sentinel-root` override. The owner
identified Sentinel as the continuation of the original Phase 9 work.

The source contract inspected is
[Sentinel commit 187bec1](https://github.com/Jay-Forensics-LLC/sentinel-forensics/tree/187bec14835fc9497b05594ca467a49259553d64),
specifically `tools/evidence_lab/CONTRACT.md`, `contract.py`, `report.py`, and the
completion/checksum behavior in `analyze.py` and `qualify.py`. Sentinel's repository
has an AGPL-3.0 license, preserved in the bundled `sentinel-forensics/LICENSE`.
The HoneyTrace bridge remains an independent consumer of the documented exchange
format; the separately located analyzer implementation is now included with recorded publication patches
in the unified source. See [unified source](../UNIFIED_SOURCE.md) and
[third-party notices](../../THIRD_PARTY_NOTICES.md).

## Implemented handoff

An operator first creates a completed private case using Sentinel's existing
offline workflow, or creates it through **Forensic cases → Analyze a capture**
in the HoneyTrace Forensic Dashboard. The opt-in `sentinel` plugin accepts an
existing completed case through its dedicated command:

```sh
python3 honeypot/scripts/hp.py integrations sentinel --bundle /absolute/private-case
```

The Phase 10 policy must explicitly enable `sentinel`. The command does not start
Sentinel, contact a service, execute a scanner, or pass records to `incidentd`.
Policy and source-validation failures leave the existing sensor pipeline alone.

The library interface is:

```python
verified = verify_bundle(case_path)
# verified contains exchange: bytes and receipt: dict.
context['sentinel_bundle_receipt'] = verified['receipt']
findings = parse_sentinel(verified['exchange'], 'jsonl', context)
```

`verify_bundle` rejects incomplete state, missing checksum entries, unlisted files,
invalid paths, aliases, nonregular files, changed files, and checksum mismatches.
It hashes every regular file in the case, including a present private index/key,
without returning their contents. Required members are `index.sqlite`,
`manifest.json`, `state.json`, and `export/exchange.jsonl`. The returned receipt
records checksum-ledger and exchange digests, file/byte totals, parser version and
case run ID. It contains no host path or key. Hashes establish consistency against
the supplied ledger; they do not authenticate acquisition or the analyst.

The pure parser validates the closed `sentinel.honeytrace/1` envelopes for all
eight entities: case, source, observation, timeline, association, finding, coverage,
and error. Exactly one COMPLETE case must appear first. Source references,
observation/timeline linkage, supported time/provenance structures and duplicate
occurrence references are checked. An optional receipt binds exchange bytes,
parser version and case identity to the verified bundle; the command always
supplies it. Generic report import cannot bypass this bundle path.

Each retained entity becomes its own source occurrence in the private offline
store. Records are never silently merged by IP, name, shared infrastructure or
matching pseudonym. Identifiers retain their case namespace and remain `other`
or `relation` indicators. They are not submitted for threat-intelligence lookup.
Associations remain stated relationships, and Sentinel findings become `possible`
review leads. No input severity creates a HoneyTrace CRITICAL event or containment
request. Native confidence labels remain labels, not invented probabilities.

Coverage counts, decoding-loss counts and source/record references are preserved.
The original exchange bytes remain linked by SHA-256 in the restricted store.
Exact source nanoseconds and rational precision are represented as decimal strings
in `details.source_time`, without floating-point conversion. Null/unresolved time
stays null/unresolved; `collected_at` is not replaced with import time. Arbitrary
source explanation text and private index contents are not copied into normalized
exports. The original exchange remains the reference for omitted detail.

## Bounds and supported scope

This is a bounded small-case exchange bridge: at most 8 MiB of exchange data,
10,000 envelopes, and 1 MiB per canonical envelope. Policy can lower these bounds.
Default full-case verification is limited to 64 MiB total and 1,000 filesystem
entries, with directory depth at most 16. The library accepts explicitly selected
verification bounds up to 1 GiB and 10,000 entries; that does not increase parser
or policy limits. Exceeding a bound rejects the import, rather than truncating it
or claiming complete analysis.

Sentinel already supports documented PCAP/PCAPNG, network metadata, radio exchange
and diagnostic-archive subsets. Packet Squirrel data uses its PCAP ingestion path.
Its recorded approximately 297 MB / 591,565-packet case and remaining decoding
losses do not qualify this smaller HoneyTrace bridge for that complete dataset.
Streaming large-case summaries remain later work. The
[local dashboard](../DASHBOARD.md) now exposes this bounded case-import workflow.

Sentinel's iOS tooling parses a diagnostic archive subset, including JSONL, JSON,
IPS, plist and selected text. It is not a native iMazing backup decoder. The
separate HoneyTrace backup-metadata adapter must state its own supported subset;
neither feature claims backup decryption, complete device analysis, native
tracev3 decoding, compromise detection or unrestricted forensic readiness.

## Validation and later milestones

`honeypot/tests/test_phase9_sentinel.py` uses generated, non-sensitive exchanges
and small case bundles. It checks all entity envelopes, source references,
completion and checksum coverage, deterministic occurrence IDs, case isolation,
unknown/exact times, minimized identifiers, duplicate occurrences and finite
budgets. No genuine case, live sensor, network service or Sentinel process is
used by these bridge tests. Passing these checks is structural interoperability
evidence, not independent qualification of Sentinel or a release decision.

Bundled source identity is recorded in `docs/sentinel-source.json`; the validator
checks the pinned upstream tree and each recorded local replacement or addition.
This is source provenance, not inherited runtime qualification. Upstream's native
`qualify.py` expects its own Git root; inside this bundle its unchanged guard
reports `workspace_mismatch`. Normal offline analysis and the unified workflow
are checked separately in the [forensic receipt](../FORENSIC_ACCEPTANCE.md).

Later work includes representative authorized real-export validation, bounded
large-case streaming, operator review, independent acceptance and expanded
forensic capabilities beyond the dashboard MVP. Existing beta,
Stage 7/8, WAN, daemon-reload and deployment gates retain their own status.

Publication note: GitHub push protection rejected a credential-shaped value in
Sentinel's mocked code-audit input. That one demo literal is replaced by an
explicit placeholder, with a modification notice. The source manifest records
both effective and upstream tree identities and each changed file. A second
recorded patch closes test-owned descriptors on setup/diagnostic failure after PR
review; production reconstruction behavior is unchanged. Snapshot
validation verifies both trees; all 1,416 source files and the license remain.
