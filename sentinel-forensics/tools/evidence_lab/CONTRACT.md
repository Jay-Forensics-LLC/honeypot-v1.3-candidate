# HoneyTrace exchange contract: sentinel.honeytrace/1

Version: **1.0.0**. This is a proposed, independently validated exchange contract,
not a claim that today's HoneyTrace consumes it. HoneyTrace remains the evidence
gatherer; this suite imports and analyzes offline. No events are sent to it and
no runtime, production deployment, confidence or incident classification changes.

The local HoneyTrace source inspected read-only was
`HoneyTrace-Qualification/source/honeytrace/honeypot/scripts/incidentd.py`,
SHA-256 `fe26b7d9cee857e38aad22c7908397777b63b7deac0bf92159692bba7fbff7c4`.
Its normalize() conventions include event_id, timestamp, source, source_ip,
source/destination ports, event_type, severity, numeric confidence and notes;
its evidence verifier uses offsets/lengths and pinned source/record hashes.
That source snapshot is not evidence of the deployed runtime version. The
suite does not reuse HoneyTrace's fallback for absent timestamps or numeric
incident confidence. Future adaptation must map semantics explicitly and must
never pass untrusted export text as a trusted `boundary` source or classification.

## Wire format

UTF-8 JSONL, one bounded object (≤1 MiB) per line in `export/exchange.jsonl`.
Canonical serialization sorts keys, uses ASCII escapes, rejects duplicate keys
and nonfinite numbers. Each object has exactly:

```json
{"contract":"sentinel.honeytrace/1","entity":"coverage","id":"coverage",
 "payload":{"name":"supported_subset","details":{}}}
```

`schemas/honeytrace-v1.schema.json` is JSON Schema 2020-12. `contract.py` validates
its explicit shape/types offline without dependencies; regression tests also use
an independent jsonschema implementation when installed. Unknown major versions,
entity names, missing fields, extra fields and incompatible types fail closed.
No validator fetches the schema URI. IDs are namespaced within a case; source IDs
are positional input occurrences, not device identity. A future adapter must
first validate, then verify status/checksums and evidence references, and preserve
unknown/unsupported coverage. It may never reinterpret review leads as incidents.

| Entity | Payload fields and meaning |
|---|---|
| case | status (COMPLETE/INCOMPLETE/FAILED/CANCELLED), volatile run_id, parser_version, tools (Python/SQLite), configuration, privacy, limitations |
| source | id, full sha256, exact size, kind, parser_version, metadata (compatibility, schema/time/sidecar details when applicable) |
| observation | id (`packet:N` or `observation:N`), source_id, ordinal, kind, protocol, context, time, data, provenance, duplicate_of |
| timeline | event_id, source_id, ordinal, kind, protocol, context, original_utc_ns, adjusted utc_ns, time, storage and row_id supporting the private index |
| association | id, relationship, context, typed left/right values, start_ns/end_ns, evidence_id (observation:N), rule/version, confidence, explanation, limitations, conflict IDs |
| finding | id, rule/version, context, start_ns/end_ns, severity, confidence, explanation, alternatives, limitations, evidence selector and metrics |
| coverage | name and details: counts, protocol distribution, decoding loss codes, unsupported block counts, rule evaluation statuses/configuration and unexamined data |
| error | fixed code, nullable source_id/ordinal, details; never raw decoder errors or filenames |

Time objects retain utc_ns (nullable), precision, timezone, status, clock. Private
index time_json also includes original text or {ticks,units_per_second,offset_seconds};
this original is deliberately removed from minimized exports. Exact UTC times,
precision and timezone remain; they are linkable. No missing time is replaced by
collection/ingestion time. No collection clock is inferred. Configuration records
explicit reversible source offsets; free-text justification stays private.

Provenance has source_id plus available byte_offset/byte_length, ordinal,
packet_number, section/interface/block, line/last_line, JSON pointer, archive
file/member identifiers or table/rowid/id/scan_id. `precision` is byte, logical,
or archive_member_logical. Record hashes cover source packet records/blocks or
lines; SQLite and envelope JSON hashes cover canonical decoded logical records
and are not claimed to be source byte hashes. Archive provenance retains the
existing member hash and location precision. No fabricated byte range is added.

Packet observation data contains parsed endpoints, ports, flags, captured/original
link bytes, IP lengths, link identifiers and loss codes. Application observations
have the documented bounded protocol subset. Radio schemas are described in
RADIO_SCHEMAS.md. Duplicate record references use `record:source:ordinal`;
normalized duplicate references use `observation:N`. Repeated timestamps or values
do not cause identity merges. Evidence selector tables (`rule_packets`, `rule_dns`)
and association/conflict rows remain in the private case index for reproduction.

## Privacy and completion

Identifiers, names, context labels and advertising data become deterministic
case-keyed HMAC pseudonyms. Exact private values remain only in index/child
bundles. Keys are outside export and excluded from it. Original arbitrary text
and payload bytes are absent. Source hashes and exact UTC times remain linkable;
this is minimization, never anonymization. Never upload whole case directories.
A future authorized private exchange would require a separately versioned privacy
policy; it must not quietly disable minimization.

Complete analysis has COMPLETE state, manifest and full verified SHA256SUMS written
last. Incomplete/cancelled cases have state but no valid complete bundle. Ordinary
failed workers remove partial output; qualification.json retains sanitized errors,
source progress and failure status. Such reports do not emit a COMPLETE exchange.
The schema supports explicit failure case/error records for future consumers;
current producer emits the complete exchange only after analysis succeeds.

Reproducibility excludes only case run_id in the exchange. SQLite content digest
includes all ordered logical tables, independent of page layout. Run timings,
worker metrics and generated key are outside that digest; the same key is used
for the two compared minimized exports. Source filesystem timestamps, source
hashes, original evidence times and all analytical content stay in comparison.


The accompanying human report streams the same findings and minimized selectors,
with confidence semantics, alternatives and limitations beside coverage. It is a
human presentation of the validated exchange, not a second classification engine.
Each finding additionally carries required coverage, effective thresholds, minimum
sample size and units in `metrics.evaluation`, and private reproduction instructions
in `evidence.reproduction`. These extend the existing nested objects without
changing the version 1 envelope. The command uses a placeholder case path; it
never exports a local evidence path or the case key. Private finding queries
return bounded support with exact counts only when complete, lower bounds
otherwise, and explicit truncation. Support samples are capped at 1,000 records
and 8 MiB of serialized support; exact private SQL and parameters reproduce the
full selection without counting or loading it during a bounded query.
Arbitrary radio security descriptions,
uninterpreted SQLite flags and source-defined IDs are also pseudonymized; exact
SQLite table/rowid locators remain available.
The independent oracle's comparison.json is separate validation evidence: its
sha256 is a complete initial-source hash; complete_source_verified also requires
a matching full second pass and unchanged source metadata. Count mismatches never
promote a partial read or incomplete comparison to a successful result.
