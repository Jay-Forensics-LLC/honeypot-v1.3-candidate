# Phase 10 plugin specification

Plugins are fixed built-in data adapters, versioned `1.0.0`. There is no dynamic
module path, arbitrary executable or network scanner interface. Every integration
is opt-in and runs in offline mode.

Registry entries declare identifier, version, category, input formats, normalized
output format, permissions, executable path, secret requirements, timeout,
rate limit, concurrency, retention, opt-in and failure behavior. An executable
path is absent and secret requirements are empty for these adapters.

## Policy and bounds

The policy defaults to `enabled: false` with an empty plugin allowlist. It accepts
explicit scope, assessment and awareness approval, a privacy-policy reference,
data-sharing consent and finite byte/record/time/retention bounds. Unknown fields
and invalid types are rejected. Data-sharing consent does not enable a real
provider client.

Default report bounds are 8 MiB, 10,000 records and a five-second worker deadline;
the default retention interval is 30 days. Retention eligibility is metadata,
not automatic evidence deletion. The implementation validates supported ranges.

The current worker requires Linux and an unprivileged operator. Its process
limits are 256 MiB address space, ten CPU seconds, 32 open descriptors, 16 MiB
per file and no core dumps, in addition to the policy wall deadline. Report
workers expose only the fixed built-in parsers; these limits do not provide a
general-purpose external-tool sandbox.

Normalized findings include `finding_id`, `source_tool`, `source_record_id`,
`collected_at`, `imported_at`, `indicator_type`, `indicator_value`, `relationship`,
`scope_status`, `assessment`, `evidence_reference`, `confidence` and
`raw_source_hash`. Unknown historic collection time remains null. Import time
does not replace collection time. Original source and normalized output hashes
are linked by the import manifest.

The private store is bounded to 256 MiB and 1,000 imports. Directories must be
operator-owned with mode `0700`; stored files use `0600`. Re-importing the same
plugin/version/format/source hash verifies and reuses its existing manifest.
Exports verify retained object digests and include only currently allowed plugins.

## Supported reports

| Plugin | Format | Accepted input |
| --- | --- | --- |
| `spiderfoot` | `csv`, `gexf` | Exported entities and observed graph relationships |
| `recon-ng` | `json` | Version 1 normalized workspace envelope |
| `bbot` | `jsonl` | Event objects with supported `type` and `data` |
| `nmap` | `xml` | Native report host addresses and service observations |
| `nuclei` | `jsonl` | Scoped target, template, matcher and severity fields |
| `cloudfox` | `json` | Closed version 1 findings envelope |
| `bloodhound` | `json` | Closed version 1 authorized-lab aggregate summary |
| `awareness` | `json` | Closed version 1 campaign aggregate metrics |

`mock-ti` and `forensics` are separate enrichment/copy commands, not report-parser
routes. Unsupported formats and malformed records produce bounded, sanitized
errors. XML entity declarations are rejected. The Nmap adapter may accept only
the fixed native `<!DOCTYPE nmaprun>` declaration; external declarations are not
resolved.

SpiderFoot CSV requires an unambiguous type column (`type`, `eventtype` or
`eventname`) and value column (`data`, `value`, `indicator` or
`indicatorvalue`), with case and punctuation normalized. Optional columns retain
record ID, source, timestamp and false-positive status. Supported entities are
IP addresses, domains/DNS names, URLs, email addresses, files and explicit
`other` observations. Unknown types are rejected. GEXF accepts entity labels/type
attributes and observed edges; missing types use conservative entity inference.

Recon-ng uses a deliberately versioned interchange envelope, rather than an
arbitrary workspace database:

```json
{"schema_version":1,"workspace":"case-1","records":[{"id":"record-1","type":"domain","value":"example.com"}]}
```

Optional record fields are `source`, `collected_at` and `confidence` from zero
through one. BBOT accepts JSONL `type`/`data` entity events with optional
`id`, `source` and `timestamp`; structured HTTP-response bodies are unsupported.
Timezone-aware ISO timestamps or supported numeric epochs retain historic time;
naive or unparseable historic times remain null.

CloudFox uses:

```json
{"schema_version":1,"records":[{"id":"finding-1","resource":"asset-id","finding_type":"configuration","severity":"low"}]}
```

Each CloudFox resource must match explicit scope. Nmap and Nuclei targets also
require assessment approval and scope before storage. Imports never start the
tools that produced the reports. Nuclei request/response/extracted-value bodies
are excluded; target URL query and fragment data are dropped.

BloodHound uses:

```json
{"schema_version":1,"lab_authorized":true,"report_id":"lab-1","summary":{"nodes":20,"edges":25,"users":5}}
```

`nodes` and `edges` are counts, not raw graph arrays. Optional summary counts are
`domains`, `users`, `computers`, `groups`, `ous`, `containers`, `sessions` and
`privileged_paths`. Assessment approval is required. Raw identities and directory
credentials are not an accepted format.

Awareness uses:

```json
{"schema_version":1,"campaign_id":"training-1","provider":"gophish","totals":{"sent":100,"opened":50,"clicked":10,"reported":20,"completed":40}}
```

Providers are `gophish`, `king-phisher` and
`microsoft-attack-simulation-training`. `sent` is required; optional metrics are
unique-person aggregates bounded by `sent`. Counts are integers from 0 through
1,000,000,000. Unknown keys, employee records and secret-bearing submission
fields are rejected. Explicit awareness approval and a privacy-policy reference
are required.

For report-specific examples and malformed-input cases, consult the
`test_phase10_*.py` fixtures. They are synthetic and do not establish acceptance
of every upstream tool version.

## Operator entry points

From the repository root, inspect status or current-environment inventory:

```sh
python3 -B honeypot/scripts/hp.py integrations status
python3 -B honeypot/scripts/hp.py integrations inventory
```

An explicit private policy can enable only the intended adapter, for example
`{"enabled":true,"plugins":["spiderfoot"],"scope":["example.com"]}`. Place
global integration options before the action:

```sh
python3 -B honeypot/scripts/hp.py integrations --policy /private/case/policy.json --store /private/case/store import --plugin spiderfoot --format csv --input /private/case/report.csv
python3 -B honeypot/scripts/hp.py integrations --policy /private/case/policy.json --store /private/case/store export
```

`policy-check` validates configuration; `enrich` requires a local
`--mock-response`; `forensic-export` requires an explicit `--input`. Their
subcommand help lists the supported arguments. No command starts a provider,
scanner or external analysis program. Use a disposable private case directory
and synthetic reports until source acceptance is recorded.

The default store is `state/phase10` under the application root. On a deployed
root-owned runtime tree, use an explicit operator-owned `--store` path rather
than changing runtime ownership to make this optional command writable.
