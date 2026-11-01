# Evidence export contract: ios-sysdiagnose-evidence/1

Modified for HoneyTrace on 2026-11-01: clarify producer version and timestamp statuses.

UTF-8 JSON; deterministic sorted-key serialization, ASCII escapes, no NaN/Infinity.
IDs/hashes are lowercase 64-character SHA-256 hex. No wall-clock import timestamp
is inserted: identical archive + options + parser version yields identical output.
Custody/acquisition times must be recorded independently by the operator.

## Bundle

| File | Contract |
| --- | --- |
| `events.jsonl` | One observation or parse-error object per line, in archive/file order |
| `manifest.json` | Version, options/budgets, archive hash/size, file inventory, counts, coverage, events hash, limitations |
| `SHA256SUMS` | Exact-byte SHA-256 of events and manifest; written last |

Manifest `schema_version` is `ios-sysdiagnose-evidence/1`; `parser_version` records
the producing implementation version (currently `0.2.2`), independently of the
envelope version. `archive` contains SHA-256 and byte size, without local path/name.
`privacy` is `minimized` or `sensitive`. `limits` records every applied budget.
`files` includes all regular members, even unsupported ones. Each entry contains:

- `file_id`: hash of canonical JSON `[archive_sha256, member_index, archive_path]`.
- `member_index`: zero-based archive enumeration position, including directory entries.
- `path_sha256`: hash of exact UTF-8 member name; `archive_path` only in sensitive mode.
- `sha256`, `size`: original uncompressed bytes, before text decoding.
- `discovery`: `supported_candidate`, `unsupported_unified_log`, or `unsupported`.
- `observations`, `errors`: emitted counts for that member.

`counts` aggregates files, observations and parse errors. `coverage` is `partial`
if errors or unsupported files exist, otherwise `supported_subset_only`. Neither
value claims complete sysdiagnose coverage. Empty/blank candidate files produce
zero observations. `interpretations`, `suspected_anomalies`, and
`unverified_conclusions` are separate empty arrays in v1; no inference engine runs.
`compromise_assessment` is always `not_performed`.

## Observation

```json
{
  "event_id": "<SHA256>",
  "record_type": "observation",
  "normalized": {
    "source": "ios_sysdiagnose",
    "timestamp": "2026-10-10T14:00:00Z",
    "timestamp_status": "normalized",
    "event_type": "diagnostic.record",
    "sha256": "<member SHA256>",
    "notes": ["OBSERVED: diagnostic record in supplied archive; device origin unverified."]
  },
  "raw": null,
  "duplicate_of": null,
  "provenance": {
    "archive_sha256": "<SHA256>",
    "file_id": "<SHA256>",
    "file_sha256": "<SHA256>",
    "record_sha256": "<SHA256>",
    "byte_offset": 0,
    "byte_length": 70,
    "line": 1
  }
}
```

Placeholder hash strings above illustrate the contract, not genuine evidence.
`timestamp` may be null; statuses are `normalized`, `missing`, `unsupported`,
`unsupported_nonfinite`, `timezone_missing`, `invalid`. Nonfinite numeric input
remains null with `unsupported_nonfinite`; no timestamp is guessed.
`diagnostic.crash_report` identifies `.ips` objects.
Source is assigned by the importer, never accepted from a source record.
No severity, confidence of compromise, actor attribution or malware flag is added.

`raw` is null by default. Sensitive mode holds the parsed object, with plist bytes
represented as `{"type":"bytes","hex":"..."}`, plist datetimes as explicit typed
values, plist UIDs as `{"type":"plist_uid","value":42}`, and nonfinite plist numbers as `{"type":"nonfinite_number"}`. It is a
parsed representation, not original bytes. Recover exact bytes from the archive
using `provenance`; validate member and byte-range hashes before use.

`event_id` hashes canonical JSON `[file_id, locator, record_sha256]`; locator is
`byte_offset`, `byte_length`, and `line` when line-based. Byte offsets are zero-based
in the uncompressed member, lengths include line terminators for line records,
and lines are one-based. IPS ranges cover the individual JSON object, excluding
inter-object whitespace. JSON/plist ranges cover the whole file. Whitespace-only
lines produce no record. `duplicate_of` links identical raw bytes to the first
observed occurrence; all occurrences have distinct IDs and provenance.

## Parse error

A separate object with `record_type: "parse_error"`, `event_id`, `provenance`, and
fixed `error_code`. It has no normalized event or raw content. Codes include
`record_budget_exceeded`, `unrecognized_text_record`, `malformed_record`.
Errors remain evidence of parser/format limitations, not suspected device attacks.
Archive-level failures abort the bundle and return a sanitized CLI error code.

## HoneyTrace mapping and deliberately unmet runtime contract

| Export field | Reviewed HoneyTrace convention | Boundary |
| --- | --- | --- |
| `event_id` | Stable deduplication key in `events.jsonl` | Our IDs are archive occurrence identities |
| `normalized` / `raw` | Durable event envelope | Raw can be omitted for privacy |
| `normalized.timestamp` | UTC timestamp | Null allowed here; never replace missing time with now |
| `normalized.source` | Explicit trusted parser source | New `ios_sysdiagnose` source is unsupported by current daemon |
| `normalized.sha256` | Artifact/evidence hash | Member content hash, not automatically a malicious-file IOC |
| `provenance` | Evidence path/hash/custody conventions | Archive hash, member identity and exact byte locator; no live host paths |
| `notes` | OBSERVED/UNKNOWN distinctions | A supplied record is observable; its device origin remains unverified |

This is **structural compatibility for a future adapter**, not drop-in ingestion.
Do not call HoneyTrace's normalizer/classifier with these records: current supported
sources and timestamp/classification assumptions differ. Do not use `artifact` or
`boundary` as substitute sources: that could assign unwarranted severity. A future
adapter must validate schema/hash links, preserve unknown times and privacy state,
require explicit operator approval, and test source-specific non-compromise semantics
before any runtime or classification change. This PR enables no such adapter.
