# Passive radio adapters

Historical actual compatibility: the local Tetra/Pineapple recon.db schema subset
described below was inspected and processed with an earlier parser. Rechecking
the current parser against that genuine source requires its original path.
No owner-provided BLE scanner export has been supplied. A separate native
parallel-collector CSV profile below targets an inspected, public genuine BLE-ARD
export. The exchange schemas are explicitly defined formats, not general vendor
export compatibility. No Wi-Fi/BLE radio interaction occurs.

## Versioned exchange JSONL, JSON and CSV

JSONL has one object per line; name files `.tetra.jsonl` or `.ble.jsonl` for explicit
detection. Generic JSONL also detects a first-record `schema` field. Each row
retains byte offset/length and physical line number. `.json` is a bounded envelope
`{"schema":"evidence-lab.ble/1","observations":[...]}`; row provenance is JSON
pointer and canonical logical-record hash, not an invented byte offset. CSV has
unique header names including `schema`; each row repeats its version. Quoted
multiline rows retain byte range and physical first/last lines. Header/row field
counts are validated. Record limits are 1 MiB, JSON depth 32, ≤64 CSV columns.

Tetra example (entirely synthetic):

```json
{"schema":"evidence-lab.tetra/1","kind":"association","timestamp":"2026-01-01T00:00:00Z","client_mac":"02:00:00:00:00:01","bssid":"02:00:00:00:00:02","ssid":"fixture","channel":6,"rssi":-55,"security":"fixture-description","scanner":"fixture-scanner"}
```

Kinds: ap, client, probe, association, disassociation. Fields: ssid, bssid,
client_mac, channel, frequency, rssi, security, scanner, timestamp, clock_source.
At least BSSID or client MAC required; missing fields remain null. Only an explicit
association/disassociation kind establishes that export event. An AP/client row
is an observed record; it does not manufacture an association event or duration.

BLE example (entirely synthetic):

```json
{"schema":"evidence-lab.ble/1","timestamp":"2026-01-01T00:00:00Z","address":"02:00:00:00:00:03","address_type":"random_resolvable","name":"fixture","service_uuids":["180f"],"manufacturer_id":76,"manufacturer_data":"01ff","service_data":"1122","rssi":-55,"tx_power":-10,"scanner":"fixture-scanner"}
```

Address is required; explicit address_type is public, random, random_static,
random_resolvable, random_nonresolvable, or unknown (default). Optional fields:
name, ≤128 service_uuids (semicolon-separated in CSV), manufacturer_id,
manufacturer_data/service_data (hex strings, ≤4096 characters), rssi, tx_power,
scanner, first_seen, last_seen, timestamp, clock_source. First/last raw values and
normalized time objects are retained separately; no event timestamp is invented
from them. Names/services/manufacturer data/RSSI never establish physical identity.
MAC syntax is validated; source-declared address type is not independently proven.
Unknown schema versions and malformed rows have fixed parse error codes. Duplicates
remain occurrences; rotating addresses stay distinct identifiers.

Numeric policy (parser 2.0.4): channel, frequency and manufacturer_id accept native
integers or signed ASCII digit strings, with optional surrounding whitespace.
Floating-point values are rejected for these integral fields, including `6.0`;
no float-to-integer coercion occurs. RSSI and tx_power retain finite fractional
numbers, including decimal/exponent numeric strings in CSV. Native integers stay
integers. All these numeric fields retain the existing range
`-2147483648 <= value < 2147483648`; this parser budget is not a claim that every
value in that range is meaningful for the source's hardware or units.

Fractional values use Python's ordinary IEEE 754 floating-point precision; exact
decimal arithmetic is not claimed. Original record bytes or SQLite logical-record
hash/location remain available through source provenance. NaN, infinity, exponent
overflow and nonzero values that underflow to zero are rejected explicitly.
Zero-valued forms such as `0e-999` remain zero. Safely framed invalid JSONL/CSV
records retain fixed errors and source locations; later valid rows are processed.
Generic `.jsonl`/`.ndjson` dispatch uses only the explicit first-record schema
marker. A bounded structural probe cannot hide that marker because of numeric
overflow/underflow in another field; each actual row still receives strict numeric
validation. Structurally invalid or ambiguous first records do not establish a
radio format, and no vendor is guessed from later content.
An invalid JSON envelope (including an invalid numeric literal or unsupported
top-level array/object shape) becomes one fixed source error with the envelope's
exact byte range and hash. Other sources continue. Oversized envelopes are not
parsed; their complete bytes are streamed only for the source/error hash. Valid
envelopes retain logical per-row provenance as described above.

## Inspected Pineapple recon SQLite subset

Supported user_version=0, ordinary tables (not source-defined views/virtual tables):

- aps: id, scan_id, ssid, bssid, encryption, hidden, channel, signal, wps, last_seen.
- clients: id, scan_id, mac, bssid, last_seen.

`signal` maps to recorded rssi without claiming calibrated units. Encryption codes
remain `encryption_code_uninterpreted`, not guessed security labels. scan_id is
scanner grouping context, not device identity. Recon client rows become
`wifi.client` point statements with explicit limitations; SQL rows are not proof
of an association frame. Timezone-free SQLite timestamps remain unresolved.

Other tables (including scan_ids and device_fingerprints) are listed as unexamined;
no identity inference is made from fingerprints. Table schema SHA-256 and user
version are recorded. Provenance includes table, rowid, id, scan_id and logical
record SHA-256. Exact source database SHA-256 is separate.

The adapter reads the original file through a read-only descriptor, hashes it,
and copies a stable base into a private temporary snapshot. SQLite uses query_only,
read-only immutable mode on that copy; source checkpoints/repairs are never run.
Existing WAL, SHM or journal sidecars are hashed/inventoried and block parsing:
a base-only snapshot could omit committed data. Provide an independently prepared
consistent closed snapshot, keeping originals and sidecars; this suite does not
repair acquisition. Sidecars appearing during processing cause failure.

SQLite rows containing a BLOB, nonfinite REAL, or another unsupported logical
value stop that source with `unsupported_sqlite_record_value`. Earlier interpreted
rows remain; the unsupported row and subsequent rows in adapter order remain
unexamined. Source metadata records this partial state and its stopping table/rowid.
Other input sources continue. No canonical row hash is fabricated for unsupported
values; the complete original database hash remains available separately. This
source-level behavior differs from safely framed JSONL/CSV row continuation.

## BLE-ARD parallel CSV profile 1

Parser 2.0.5 recognizes `ble-ard.parallel-csv/1` by this exact ordered header:

```csv
Timestamp,DeviceName,AdvertisingType,AddressType,Address,RSSI,Channel
```

The source reference is the raw parallel-collector layout in
[BLE-ARD at 49c92bb](https://github.com/hujon/BLE-ARD/tree/49c92bb31241f726db020493679b1cbbe6740937).
The publisher documents physical-device recordings and distinguishes raw
`00_capture` occurrences from subsequently deduplicated/filtered versions. Its
[repository license is MIT](https://github.com/hujon/BLE-ARD/blob/49c92bb31241f726db020493679b1cbbe6740937/LICENSE).
Header recognition records an internal profile/version and unverified source
origin; it does not authenticate a collector or recording.

Each row becomes one `ble.advertisement`, with exact byte-range/physical-line
provenance and original row SHA-256. Duplicates remain occurrences. `Address`
uses the existing MAC-syntax check; `DeviceName` uses the private name field and
case-scoped export pseudonym. Blank names remain missing. RSSI is a signed integer
within the existing 32-bit parser budget, without a calibrated-unit claim.

Timestamp is a nonempty unsigned ASCII integer string of at most 128 characters.
The older export does not establish its unit or epoch, so the exact string stays
in private `time.original` with unresolved UTC/precision/timezone. Configured clock
offsets do not supply an epoch. Numeric AddressType, AdvertisingType and Channel
tokens are retained as unsigned integer `*_code_uninterpreted` fields within the
same signed-32-bit upper bound; this is a parser budget, not a hardware validity
range. Address type remains `unknown`. Later collector implementations with
different timestamps/column ordering do not establish this older layout's meaning.

Service UUIDs/data, manufacturer identifiers/data, transmit power and individual
scanner identity are unavailable in this layout. Their unavailable coverage is
explicit in source metadata and observations; empty/null output fields are not
proof that the advertised packet lacked them. Names, codes and signal measurements
do not establish physical-device identity. Sources keep separate contexts unless
configured explicitly, and unresolved clocks cannot establish cross-source timing.

Existing 1 MiB CSV-record, UTF-8, 64-column and framing limits apply. Safely framed
bad values/column counts become fixed row errors and later rows continue. Reordered
or extended native headers, headerless controller files and other collector
versions are unsupported. Declared exchange CSV with its `schema` field continues
to use the separate exchange adapter. VALIDATION.md distinguishes invented hostile
fixtures from genuine public-export compatibility and owner-private evidence.
