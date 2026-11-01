# Evidence Lab: offline analysis CLI

<!-- HoneyTrace local modification, 2026-11-01: whole-page cohort limits and strict RSS sampling. -->

Python 3.11+ and SQLite (JSON1) are sufficient for analysis; no Python runtime
packages or services are installed. Run from the repository root. Local Wireshark
`capinfos` is required for real qualification; `tshark` is used for independent
test comparisons. They are already available on the development host. Development
package downloads are separate from evidence processing; analysis has no network
client, enrichment, DNS resolution, active scan or capture/replay code.

```sh
python3 tools/evidence_lab/run_tests.py
python3 tools/evidence_lab/analyze.py \
  /absolute/capture.pcap /absolute/segment.pcapng /absolute/recon.db \
  /absolute/scanner.ble.jsonl /absolute/phone.zip \
  --output /absolute/private-cases/new-case
python3 tools/evidence_lab/query.py timeline /absolute/private-cases/new-case \
  --since 2026-01-01T00:00:00Z --until 2026-01-02T00:00:00Z --limit 1000
python3 tools/evidence_lab/query.py flows /absolute/private-cases/new-case --limit 20
python3 tools/evidence_lab/query.py validate-export \
  /absolute/private-cases/new-case/export/exchange.jsonl
```

Output must be new, private, outside this checkout, and separate from originals.
Sources are opened read-only; source/parent symlinks and hard-linked files are
rejected. Source SHA-256 covers the entire artifact, not only retained records.
Before/after descriptor/path metadata checks detect ordinary changes; use closed
files or independently obtained read-only snapshots. Hashes establish consistency,
not acquisition authenticity. Files are 0600 and directories 0700 on POSIX.
Windows permissions/performance are unvalidated. No source archive code is run.

## Installation and disconnected use

Obtain the private repository through your existing authorized GitHub access, then
copy the code and local documentation to the analysis machine. The offline CLI
does not need the React/base44 application, npm, a server, an API key or an account.
Use a Python interpreter with SQLite JSON1 (the CI matrix checks supported Python
versions). Optional local isolation requires no downloads:

```sh
python3 -m venv .venv-evidence
.venv-evidence/bin/python tools/evidence_lab/run_tests.py
```

Install local `capinfos`/`tshark` from your OS's Wireshark packages before disconnecting
if qualification/independent comparisons are needed. No installation command is
run by the analysis CLI. An independent JSON Schema validator is optional development
tooling; `query.py validate-export` itself has no external dependencies and fetches
no schema URI. Capture processing stays entirely local after tools are provisioned.
Tests use temporary generated fixtures; optional external-corpus checking only
reads the corpus you explicitly pass to oracle.py. It never downloads samples.

## Supported inputs

| Family | Implemented coverage | Explicit limits |
|---|---|---|
| Classic PCAP | Both byte orders, micro/nanoseconds, offsets/lengths/record hashes, link type and original length | Maximum packet/snaplen 1 MiB; no compressed captures; FCS metadata retained but not interpreted |
| PCAPNG | SHB, multiple sections/interfaces, endian, if_tsresol/if_tsoffset, EPB, SPB and obsolete Packet Blocks; unknown blocks inventoried | Version 1.0; 4096 interfaces/section; block ≤1 MiB+64 KiB; resolution exponent ≤63; 4096 options/block; optional comments/names/statistics/secrets uninterpreted |
| Network | Ethernet II, up to four VLAN tags, raw IP (101/228/229), IPv4/IPv6, TCP/UDP/ICMP, ARP, NDP, DNS, DHCPv4, complete TLS ClientHello/ServerHello metadata | No reassembly; ≤8 IPv6 extensions; DNS ≤32 questions/256 RRs/128 pointer steps; DHCP ≤128 options (no overload/concatenation); TLS ≤18,432 record bytes/256 extensions. Other LLC and vendor event bodies remain unexamined. IPv4/TCP/UDP checksums unvalidated. Declared IPv4/IPv6 raw link types must match the packet family. |
| Broadcom event common header | EtherType `0x886c`, exact long vendor envelope and complete version-2 common header; raw numeric fields and captured-length accounting | Partial header observations only. Body, trailing bytes, station address and interface name remain unexamined. Every packet retains `unsupported_ethertype`, including successful header observations. Other namespace/subtype/version layouts remain unsupported. |
| LLC basic XID | IEEE 802.3 declared-length frames, including supported VLAN stacks; one complete six-byte basic XID with raw SAP/control/parameter octets | Format `0x81` and controls `0xaf`/`0xbf` only; reserved bits, unsupported codes, group responses, extra declared bytes and truncation retain explicit losses. No SNAP, BPDU or other LLC decoding; no exchange/state reconstruction. |
| IGMP | Complete IPv4 v1/v2 queries/reports and v2 leave messages; v3 queries and reports with ordered group/source records; IGMP checksum validation | ≤128 group records/report and ≤256 source occurrences/message, including repeats. Unknown types/record types, auxiliary/trailing data, invalid checksums, truncation and fragments retain explicit decoding losses. No membership-state reconstruction. |
| Tetra SQLite | Inspected Pineapple recon schema: aps, clients, user_version=0 | Read-only private snapshot ≤512 MiB; ≤128 tables, table names ≤128 chars, record ≤1 MiB, ≤10M rows; other tables unexamined. WAL/SHM/journal require a consistent closed snapshot. No checkpoint or repair. |
| Tetra exchange | `evidence-lab.tetra/1` JSONL/JSON/CSV: AP, client, probe, association, disassociation | Declared exchange schema, not a claim about every vendor text/JSON/CSV export. Actual recon SQLite subset separately validated. |
| BLE exchange | `evidence-lab.ble/1` JSONL/JSON/CSV: advertised address/type, name, services, manufacturer/service data, signal, scanner and times | Declared exchange format; vendor-producer compatibility is separate from native-profile validation. No physical-device identity inference from rotating address/name/RSSI/manufacturer. |
| BLE-ARD parallel CSV | `ble-ard.parallel-csv/1`, exact seven-column raw parallel header documented in RADIO_SCHEMAS.md | Versioned native layout with byte provenance; unresolved numeric time and uninterpreted type/channel codes. Services/manufacturer payload and scanner identity absent; header recognition does not verify source origin. Headerless controller and other versions unsupported. |
| Text/JSONL | Bounded UTF-8 lines, exact byte/line provenance, supported timestamp extraction with original spelling and up to nine fractional digits | Generic observation only; original messages/payloads not retained; no multiline/vendor interpretation. Higher timestamp precision remains explicitly unresolved. |
| Diagnostic archives | Existing bounded ZIP/TAR/TAR.GZ subset, multiple archives, joined observations in timeline | 256 MiB archive /512 MiB expanded /32 MiB member /10,000 members /100,000 records; no nested recursion or native tracev3 |

Unknown formats are inventoried with explicit errors. Invalid capture framing or
unsafe archives fail closed. Truncated decoded packets remain indexed with loss
codes; malformed log/radio records remain explicit errors where framing is safe.
No records are filtered. Manifests include at most 1024 per-source/protocol summary groups, with total/completeness fields; all groups remain in SQLite. Duplicate byte records and repeated observations remain
separate occurrences with duplicate references. Equal values at different times
are repeated observations, not deduplicated events.

## Vendor event common-header observations

Parser 2.0.10 recognizes only EtherType `0x886c` with long subtype `0x8001`,
outer version 0, namespace `00:10:18`, user subtype 1 and a complete 48-byte
version-2 event header. The wire layout follows the pinned
[Linux Broadcom event definitions](https://github.com/torvalds/linux/blob/7a78f7ba9f24962c8033e0152bf34a7903ff61ba/drivers/net/wireless/broadcom/brcm80211/brcmfmac/fweh.h).
Other layouts, including the distinct version-1 header, remain unsupported.

One `bcm.event_header` observation records profile
`broadcom_event_v2_common/1`, numeric version, flags, event type, status, reason,
authentication-type code, declared data length and two interface indices. Codes
remain uninterpreted statements in the captured bytes. A recognized header uses
protocol `broadcom_event`; its packet location, record hash, original capture
time, uncertainty, context and duplicate occurrence follow the existing packet
provenance path. No station address, interface name or body bytes are retained
in this observation, and it creates no association or finding.

Length accounting distinguishes bytes captured after the header, captured bytes
within the declared data length, unavailable declared data and opaque bytes after
that length. A zero declared length describes the header's claim; any captured
trailing region stays visible. The outer length is retained with its arithmetic
relation to captured bytes minus four. That relation does not identify padding,
FCS, the complete wire body or capture truncation. Original/captured packet sizes
and existing capture-truncation loss codes remain separate evidence.

Every such packet retains the coarse `unsupported_ethertype` loss, even when a
common-header observation is emitted. Event bodies and trailing bytes are not
decoded, and a complete header does not establish the sender, device identity,
successful operation or compromise. Missing/unsupported headers emit fixed guard
reasons alongside that coarse loss, without a partial observation. Ordinary
analysis uses Python only; no Lua plugin, decoder or network access is required.
Independent header comparison and commit-specific actual-data qualification are
separate validation gates; see VALIDATION.md for the last qualified revision.

These records have no decoded IP endpoints or ports. Flow aggregation requires
both IP endpoints, so these records remain in packet/observation timelines and
do not contribute to IP conversation or directional flow totals.

At historically qualified `7547e4ff93fd499320e9f87134d8abe0a21a8d2e`, two actual analyses
pass all 14 applicable ordinary gates. An independent comparison verifies all
729 original common headers /6,561 numeric fields with zero mismatches or
reference diagnostics, and all 1,458 stored header observations across both
cases. All 428 local tests and exact implementation Python 3.11/3.14 CI pass.
This supports the guarded common-header subset only: all 1,825 raw packet losses
remain and the overall result is QUALIFIED_LIMITATIONS. See
[vendor header validation](examples/vendor-header-validation.json) and
[validation scope](VALIDATION.md). Actual TLS continuation evidence remains
pinned to historical a60feb9; it is not a new chain qualification at this revision.

## IGMP observation semantics

`igmp.message` and `igmp.group_record` retain captured control-message fields and
the packet's source location. Group records retain their zero-based wire index;
repeated groups and ordered source-address occurrences remain in the private
index. The supported layouts follow [RFC 9776, section 4](https://www.rfc-editor.org/rfc/rfc9776.html#section-4)
and [RFC 2236, section 2](https://www.rfc-editor.org/rfc/rfc2236.html#section-2).
Wire-format versions describe the observed message, not the sender's operating
mode, sustained group membership, delivery of multicast traffic or device identity.
No association or finding rule is added for these observations.

Query response codes are retained alongside exact decoded tenths of a second;
v3 query-interval codes retain exact decoded seconds. A v1-compatible query has
no explicit response timer: `max_response_tenths` is null, without substituting a
protocol default. The v2 timer is linear; v3 floating codes are decoded with
integer arithmetic. Source-address mentions support the existing indexed
`timeline --identifier` query. A mention in a filter list is not evidence that
the address sent a packet or identifies the querying host. A general query has
group address zero and no sources; a nonempty query source list requires a
multicast group address.

Only complete supported messages produce IGMP observations after a valid IGMP
checksum. Packet metadata and fixed loss codes remain available for unsupported
or invalid messages; partially decoded reports do not produce a partial group
set. Auxiliary or trailing bytes are unexamined data, even where a receiver may
ignore them. Fragments are not reassembled, and a truncated v3 query prefix is
not reclassified as a complete legacy query. The fixed record/source budgets
fail explicitly; they do not silently trim lists. A valid checksum establishes
message consistency, not authenticity, and does not validate IPv4/TCP/UDP
checksums, router behavior or source-address ownership.

IGMP groups and source-address lists remain private identifiers. Minimized
exports apply case-keyed HMAC pseudonyms to those fields; exact ordered lists
remain only in the private index. Implementation coverage here is separate from
the commit-specific qualification evidence in VALIDATION.md and CHECKPOINT.md.

## LLC basic XID observation semantics

For Ethernet length fields through 1,500, decoding uses only the declared
MAC-client payload after the supported VLAN stack. External padding is excluded
from XID parsing and is not retained; captured link-byte counts and source-record
hashes still cover the captured frame. Missing declared bytes produce
`truncated_8023_payload`; values 1,501–1,535 produce
`reserved_ethernet_length_type`. A complete declared XID can remain observable
when omitted external padding makes the capture shorter than its original wire
length; that capture uncertainty remains recorded.

`llc.xid` retains raw DSAP, SSAP, control, types/classes and receive-window octets,
plus command/response, P/F, SAP-group flags and the seven-bit window value.
Basic format requires six declared bytes, format `0x81`, control `0xaf` or `0xbf`,
zero types-octet high reserved bits and a zero window-octet low reserved bit.
When both masked SAPs are null, accepted codes are 1, 3, 5 and 7; otherwise the
supported code range is 1–7. Codes stay numeric, including mixed null/non-null
SAP cases. Group-addressed responses, unsupported controls/formats/codes and
extra declared data remain explicit losses, without a partial XID observation.
These are observed wire statements; no command/response pairing, negotiated
window, verified capability, live session, device identity or finding is inferred.

The basic parameter layout follows IEEE 802.2 (1998), section 5.4.1.1.2 /Figure 11.
Control encodings are described in [RFC 1390's IEEE 802.2 details](https://www.rfc-editor.org/rfc/rfc1390.html#page-7);
basic parameter fields are independently exposed by
[Wireshark's basic-XID reference](https://www.wireshark.org/docs/dfref/b/basicxid.html).
The oracle checks raw parameter octets alongside masked values, preserving
reserved-bit failures. It requires TShark's Lua support: a fixed local
postdissector copies two one-byte ranges selected by Wireshark, without parsing
headers or executing evidence content. The temporary helper's SHA-256 is
recorded. Missing, repeated or unavailable raw fields fail comparison; no masked
value fallback is used. This also supports versions before the newer `-e @field`
syntax. Wireshark 4.6.4 can dispatch AA/AA XID as SNAP; the oracle
reports `oracle_llc_snap_sap_reference_unsupported` when reference fields are
unavailable, including when Sentinel omits the observation. That result fails
comparison rather than certifying the frame. Other LLC, vendor SNAP and BPDU
content remain unexamined. Header-only inventories establish candidate shapes;
complete-payload compatibility requires separate qualification evidence.

## Private index and minimized export

`index.sqlite` stores exact parsed identifiers, timestamps, packet/source location,
observations, flows, associations, conflicts, rules and query indexes. No packet
payload is retained. Selected protocol fields (DNS/SNI, BLE advertising data) are
metadata and may be sensitive. Archive child bundles retain original time scalars
locally; they are private. Do not share the case directory.

Only `export/` is intended as a minimized review artifact: `exchange.jsonl`,
`report.json`, `report.md`. The Markdown report includes each finding, its supporting selectors, thresholds, benign alternatives and limitations alongside coverage. Findings are streamed, preserving bounded memory. Review even these before sharing. Stable pseudonyms use
HMAC-SHA256 with a random case key in `pseudonym.key` outside export. Plain hashes
are not claimed to anonymize IP/MAC addresses. Hashes, exact timestamps, counts
and pseudonym relationships remain linkable. With `analyze.py` or
`qualify.py run`, use `--pseudonym-key /private/key` with an existing, exactly
32-byte regular file to reproduce the same case pseudonyms. The input is read
only and copied into protected case/qualification worker keyfiles. Without an
explicit qualification key, one generated key is shared between the two runs.
Keys and private indexes must never enter Git.

At qualified `445abb1`, two complete actual analyses verify the current read-only
loader and qualification API, the unchanged original key and all three protected
copies. Public CLI forwarding is covered by invented regressions; this actual
workflow used the loader and API. All 440 local tests and exact implementation
Python 3.11/3.14 CI pass, with no skips and reproducible schema. The historical
7547e4f decoder proof is admitted by unchanged decoding bytes and equal complete
raw semantics/coverage/configuration/source inventory; no supported-field/TShark
comparison was rerun at 445abb1. Independent packet counts were freshly checked
with capinfos. Actual TLS chains remain historical a60feb9 results. See
[qualification key validation](examples/qualification-key-validation.json).

For a future CLI qualification, use fresh private output and reviewed configuration:

```sh
python3 tools/evidence_lab/qualify.py run /absolute/capture-set \
  --output /absolute/fresh-private-qualification \
  --profile real --dataset-id operator-reviewed-complete-set \
  --config /absolute/private/configuration.json \
  --pseudonym-key /absolute/private/32-byte-key \
  --max-rss-mib 512 --timeout-seconds 14400
```

This is a prospective CLI example, not the exact actual API reproduction recipe.
The CLI estimates 6,000 bytes per packet per run by default; actual real14 used
an explicit 12,000-byte per-packet-per-run API reserve and required
15,271,301,824 free bytes for ordinary work. Review disk needs before execution.
The public CLI returns **2 for QUALIFIED_LIMITATIONS**; inspect saved status and
all applicable gates. Failure/cancellation can also return 2. The reviewed actual
wrapper returns 0 for PASS_APPLICABLE_GATES, without waiving the 1,825 raw losses.
Do not overwrite completed output or silently accept a nonzero exit.

Qualification report schema `capture-qualification/3` samples the fixed worker
process and the parent separately; descendants are not sampled. The analysis
worker reports its own lifetime peak RSS and launches no external decoders. Missing live
RSS metadata fails qualification; bounded rereads allow transient metadata to
recover, and only positively observed process termination contributes zero.
The 50 ms samples can still miss short peaks; they are not an OS memory quota.

`state.json` and `manifest.json` describe status. `SHA256SUMS` is written last and
covers all completed files, including child bundles and export. Verify locally:

```sh
(cd /absolute/private-cases/new-case && sha256sum -c SHA256SUMS)
```

A bare SQLite database or COMPLETE state without valid full checksum coverage is
not a completed bundle. Checksums do not authenticate the analyst. Cancellation
leaves clear status; ordinary errors remove partial output. A killed process may
leave INCOMPLETE output. Never retry into the same directory.

## Time, flow and association semantics

Original timestamp text/ticks, precision/resolution, timezone and clock category
are retained. UTC integer nanoseconds are indexed only when justified; timestamps
outside SQLite's signed-nanosecond range remain unresolved with original values.
PCAPNG binary fractions retain exact ticks/denominator; UTC query keys floor to
nanoseconds. SPB has no timestamp. No ingestion-time substitution occurs.

In generic text/JSONL inputs, recognized timestamps retain their original
spelling, fractional precision and declared offset in the private observation. UTC normalization
supports at most nine fractional digits without rounding. Recognized legacy
offset spellings such as `-0400` or a space before `-04:00` keep their raw
representation; only the normalization input uses a canonical offset spelling.
Within the representation bound, higher precision keeps `time.status` unresolved
and records `data.timestamp_status=unsupported_precision`, with no UTC query key.
Timestamp values are limited to strings of at most 128 characters, integers of
at most 128 bits or finite floats; numeric epochs/units remain unresolved.
Complex, Boolean or oversized values retain an `unsupported_representation`
marker and source reference without copying their content into time metadata.
Arbitrary log messages and payloads remain unretained; timestamp extraction uses
the existing bounded record parser and exact source-byte references.

Timeline queries use `[since, until)`, deterministic source/ordinal/event-ID ties,
and an indexed disk table. `--include-unresolved` exposes unknown times. Identifier,
source and protocol filters are available. `event_identifiers` supports indexed
exact-value queries. A distinct identifier/event timeline relation and chronological,
source and protocol indexes let limited queries stop early for common or sparse
identifiers. These indexes add disk usage measured in qualification outputs;
previous case indexes remain readable but require a new analysis from verified
originals to gain these query indexes. Query output is private. Collection/event/ingestion clocks
are not conflated; no collection time is invented when unavailable. Run IDs are
volatile identity, not evidence timestamps.

Flows aggregate canonical endpoint pairs per explicit network context and fixed
300-second window (configurable), with directional packet counts and **captured
link-layer bytes**. Reported original link/IP byte counts are separate and may
exceed captured bytes. TCP SYN/RST are counts of observed flags, not complete
connections or failed attempts. All supporting packets are recoverable by context,
protocol, endpoints and time bucket; first/last packet IDs are convenient anchors.

Network context defaults to source + section + interface + VLAN. This prevents
accidental merging of overlapping private networks and capture segments. Set
explicit source contexts to combine known segments of the same network. Radio
contexts must explicitly match the complete capture context to cross-correlate.
Context values contain 1–128 ASCII letters, digits or `: _ . / - ,` punctuation;
spaces are not allowed. Commas permit exact matching of ordered stacked VLANs,
for example `lab/section:0/interface:0/vlan:10,20`. The radio's complete matching
context must also fit the 128-character bound; choose capture base labels
accordingly. Different section, interface or VLAN scopes remain distinct.
Configuration alone does not establish a shared network, calibrated clock or
device identity:

```json
{"contexts":{"1":"lab","2":"lab","3":"lab/section:0/interface:0/vlan:"},
 "clock_adjustments":{"3":{"offset_ns":1000000000,"justification":"Measured scanner clock offset, calibration record retained locally"}},
 "flow_bucket_seconds":300,"rules":{"syn_minimum":10}}
```

Omitting configuration, Python `None` or JSON `null` selects defaults. Otherwise
configuration must be an object; `false`, `0`, `[]` and `""` are rejected.

Source IDs are positional input occurrences, not device identities. Keys in
`contexts` and `clock_adjustments` must be canonical ASCII positive strings
`"1"` through `"4096"`, bounded by the supplied source inventory. Integer keys in
the Python API, leading zeros, whitespace, signs and Unicode digit aliases are
rejected.
The source budget is 4,096 input occurrences. Adjustments are bounded to ±30 days,
retain original timestamps, and apply to timeline/flow/rule/association time.
Remove an adjustment and rerun into a new case to reverse it reproducibly. No
hidden skew estimate is applied. Clock uncertainty is a limitation, not a numeric
probability. Do not infer persistent relationships from point observations.

ARP/NDP mappings are points; DHCP ACKs have advertised finite `[start,end)` lease
intervals; absent/infinite leases remain points. DNS answer associations retain
TTL and query/server context. Explicit Wi-Fi events and recon client statements
have distinct semantics. Contradictory mappings coexist with evidence refs and
conflict rows. Maximum 100,000 conflict pairs; exceeding this fails explicitly.
No person/device identity merging, NAT attribution, or randomized identifier joins.

## Private finding reproduction

Retrieve a finding and bounded supporting source references from its local index:

```sh
python3 tools/evidence_lab/query.py finding /absolute/private-cases/new-case --id 1 --limit 100
```

The command reports truncation and a lower bound when the sample is incomplete;
only a complete selection has an exact match count. The private SQL selector and
parameters reproduce the full selection. Limits are 1,000 rows and 8 MiB of
serialized support. Query output contains exact private values and stays local.
Each finding also retains required coverage, effective thresholds and sample
minimums in both its exchange record and human report.

## Analysis and qualification

Qualification can run from a copied offline package with unavailable Git revision
recorded explicitly alongside exact implementation SHA-256 hashes. A real-data
PASS still requires a known clean Git revision; unavailable revision information
cannot satisfy that gate. Use a separate output directory outside both the
checkout and original segment directory.

See RULES.md for rule coverage, thresholds, false positives, insufficient evidence
and reproduction. See CONTRACT.md for HoneyTrace exchange and schemas. See GOAL.md
for the actual capture gate and full-cost resource metrics. See VALIDATION.md and
CHECKPOINT.md for measured scope and outstanding real datasets.

The custom framing/metadata subset was selected over making tshark a production
backend: byte provenance remains exact, buffers/cache are bounded, and no hidden
reassembly/conversation/name-resolution state is enabled. Wireshark wiretap/tshark
is more mature and supports far more formats; it remains the independent oracle
and future backend option with explicit memory/state controls. This is a narrow
implementation, not equivalent protocol coverage. Comparisons use the
[PCAPNG work-in-progress specification](https://www.ietf.org/archive/id/draft-ietf-opsawg-pcapng-04.html),
[Wireshark tshark manual](https://www.wireshark.org/docs/man-pages/tshark.html),
[capinfos manual](https://www.wireshark.org/docs/man-pages/capinfos.html), and
pinned upstream Wireshark test captures (kept outside Git). Optional metadata is
counted, never used to resolve names, load secrets or contact endpoints.

The existing browser IOSDiagnostics page tests application compatibility;
collectForensicArtifacts.ts contains fixed example arrays. Neither is genuine
evidence collection and neither feeds this offline pipeline. No UI/branding or
HoneyTrace runtime was changed. The unrelated inventory spreadsheet was not read.

## Optional bounded TLS reconstruction

`reconstruct.py` reads a completed private case and explicitly mapped original
classic-PCAP sources, then writes a separate private derived bundle. Every
original packet is freshly framed and decoded to verify the case index before
selection. Sources, the original index, raw observations and their decoding-loss
codes remain unchanged. The optional command requires Linux with readable `/proc`,
`waitid`/`WNOWAIT` support and a local TShark installation. Ordinary analysis
continues to use Python and SQLite alone.

```sh
python3 tools/evidence_lab/reconstruct.py \
  --case /absolute/complete-private-case \
  --source 1=/absolute/original-segment-one.pcap \
  --source 2=/absolute/original-segment-two.pcap \
  --output /absolute/new-private-derived-case
```

Map every source occurrence once using the case's positional source IDs. This
command accepts cases containing classic PCAP only. It keeps whole TCP
endpoint cohorts in original capture order, including duplicate occurrences and
both directions, within one source/context/interface/VLAN/address-family scope.
It does not join capture files or arbitrary time windows. Oversized or unselected
cohorts have explicit exclusions; unsupported headers and incomplete references
remain unevaluated or indeterminate.

Defaults are 512 MiB measured process-tree RSS, 120 seconds total, 60 seconds per
decoder and 64 MiB output/temporary usage, with at most 32 batches, four cohorts /
16,384 frames /16 MiB per batch and 131,072 selected frames overall. Full budgets,
code hashes, optional Git provenance and tool versions are recorded. Check free
space and choose limits before execution. A failed budget never becomes a pass
by silently increasing it. Fresh CLI processes provide independent task resource
measurements; embedding-process memory and previously reaped child peaks can
conservatively affect an in-process call.

Derived Hellos require source-byte support without contradictory overlap, exact
independent record alignment and matching typed Hello fields. Missing ranges,
overlapping conflicts, compound references and uncertain TCP assignments stay
visible. The pass performs no decryption, name resolution, endpoint contact,
identity inference or compromise classification. First/completion time anchors
identify supporting capture packets and retain precision, original time,
configured reversible offsets and unverified capture-clock uncertainty.

`index.sqlite`, `manifest.json`, `state.json`, original-record support and the
reproduction recipe are private. A complete bundle has verified checksums;
failed or cancelled outputs are explicit. Share only the minimized `export/`
after verifying the parent bundle. Names and endpoints use the existing case-keyed
pseudonyms; source hashes and times remain linkable. No captured payload files
are written. Producer 1.2.0 uses `sentinel.tls-derived/3`; HoneyTrace's existing
exchange schema and runtime are unchanged. Consult VALIDATION for the exact
tested revision and distinction between synthetic, independent-decoder and actual
data results. Completion of a bounded derived pass does not remove raw losses
or satisfy the full-decoding qualification gate.

## Explicit solo large-cohort profile

The default `standard-v1` profile retains the limits above. The optional
`solo-large-cohort-v1` profile evaluates one explicit private cohort ID per job,
with at most 32,768 frames and 32 MiB of derivative input, including the original
24-byte PCAP header. It keeps the same 512-MiB memory, 120-second total,
60-second decoder and 64-MiB scratch budgets, record/TLS/support limits and exact
source/reference checks. A larger input envelope does not establish resource
fit or successful recovery; a failed job remains failed.

```sh
python3 tools/evidence_lab/reconstruct.py \
  --case /absolute/complete-private-case \
  --source 1=/absolute/original-segment-one.pcap \
  --source 2=/absolute/original-segment-two.pcap \
  --profile solo-large-cohort-v1 --cohort-id 1 \
  --output /absolute/new-private-solo-derived-case
```

The illustrative ID `1` must be replaced with the intended cohort's private
first-appearance ID from the same reconciled parent inventory. New producer 1.2
bundles retain this locator as `provenance_json.cohort_id` in their private
`derivations` table. For example, a read-only query against a verified new
standard bundle can locate its cap-excluded cohorts:

```sql
SELECT DISTINCT json_extract(provenance_json,'$.cohort_id') AS cohort_id
FROM derivations
WHERE status='not_evaluated' AND reason IN
  ('whole_cohort_frame_cap','whole_cohort_byte_cap','whole_cohort_frame_and_byte_caps',
   'whole_cohort_total_frame_cap')
ORDER BY cohort_id;
```

Planner `whole-cohort-first-fit/2` also treats a cohort larger than the entire
page's `total_frames` allowance as permanently excluded. A cohort that fits a
page alone but exceeds its remaining allowance stays deferred to another page.
Continuation retains the existing exact code and limits binding; a page from
different code is not silently reinterpreted under the new planner.

The locator identifies
an indexed scoped tuple, not a physical device. Selection verifies the full
parent again, preserves every packet occurrence and both directions, and never
splits a cohort. Other candidates stay `not_evaluated` with
`not_selected_by_profile` and their own coverage count. The profile/selector,
inventory, limits and exact code/decoder bindings are retained in the semantic
proof and minimized coverage. The profile contains no raw endpoints or captured names.
Integer cohort IDs/selectors remain exact, linkable locators for the same
reconciled source inventory, alongside existing source IDs and ordinals. They
are not anonymized device identifiers. Verify this residual linkability before
sharing a minimized bundle.

The solo profile rejects `--continue-from`; use a new output for every explicit
job. It cannot alter a standard chain's exclusions or certify historical results.
Its new input envelope has source-free validation only until a separately
recorded independent-decoder and actual-data qualification is completed.

## Whole-cohort continuation

Producer 1.2.0 can continue from a COMPLETE 1.2.0 standard-profile bundle using `--continue-from`.
Use a dedicated private family directory and place every new page beside the
previous page. The explicit prior path authorizes only that canonical sibling
family. Inherited links are safe single directory names; no absolute paths,
symlinks, unrelated directories or unreferenced sibling branches are followed.
The chain is limited to sixteen pages, including the current page. Producer
1.0.1/schema-1 and 1.1.0/schema-2 results remain valid historical artifacts and
cannot seed this new continuation contract. They are never upgraded implicitly.

```sh
mkdir -m 700 /absolute/private-tls-family
python3 tools/evidence_lab/reconstruct.py \
  --case /absolute/complete-private-case \
  --source 1=/absolute/original-segment-one.pcap \
  --source 2=/absolute/original-segment-two.pcap \
  --max-selected-frames 32768 \
  --output /absolute/private-tls-family/page-01

python3 tools/evidence_lab/reconstruct.py \
  --case /absolute/complete-private-case \
  --source 1=/absolute/original-segment-one.pcap \
  --source 2=/absolute/original-segment-two.pcap \
  --max-selected-frames 32768 \
  --continue-from /absolute/private-tls-family/page-01 \
  --output /absolute/private-tls-family/page-02
```

The selection cap defaults to 131,072 frames and may be lowered before starting
the chain. It defers whole cohorts to later pages; it never splits a cohort.
Keep all declared limits identical across a chain. Each job retains the same
resource, batch, record and candidate caps. Plan free space, page count and total
operator time before execution; per-job completion does not promise that all
fitting work will finish within sixteen pages. No automatic retry or budget
increase occurs after a failure.

The private `continuation.json` stores the exact completed cohort set. First-fit
packing can select later small cohorts after an earlier cohort does not fit, so
a highest packet/cohort ordinal would skip evidence. Each new job freshly
reconciles the full original capture/index, replays every prior selection and
verifies the sealed referenced chain before decoding. Permanent per-cohort
exclusions, prior reported outcomes, this-page outcomes and deferred candidates
have separate counts. `can_continue` and the remaining fitting-cohort count are
explicit. Failed/cancelled/incomplete outputs never advance the cursor; choose a
new output directory and explicitly resume the last COMPLETE page.

Prior Hello results appear as `prior_evaluation_reference`, with the reported
status and a stable semantic proof reference. They have no newly emitted Hello
metadata or fresh support rows. Artifact checks establish consistency against
the supplied parent/source/configuration/key/code/decoder/profile/limits; they
do not authenticate acquisition or prove that the reported prior execution
occurred. Concurrent sibling pages from one cursor are alternative branches,
not additive coverage.

Semantic page fingerprints retain stable parent/source/configuration/code,
ordered outcomes, original-record/support/field proofs and exact minimized
exports. Resource measurements, Git execution provenance, batch wall time and
private physical reproduction/ledger links are recorded separately. The current
page's own semantic digest is written only after hashing the exports, avoiding a
checksum cycle. Physical prior paths/ledger hashes never enter shareable prior
references. Runtime-content changes, changed keys/configuration or changed
limits require a new chain; documentation-only Git revisions can retain the
same runtime content identity.

Continuation is qualified on the owner-confirmed three-PCAP dataset at runtime
`a60feb9a2a8defc3f85e92d6a85347e98f39da8e`. Two independent nine-page families
match exact semantic content and minimized exports. Each evaluates 1,091 fitting
candidates: 1,070 source/reference-verified Hello observations and 21 indeterminate
results. Three oversized candidates remain unevaluated. An independent audit
checks every selected original record, support interval, emitted Hello field,
capture-time anchor and minimized export. All 407 tests and Python 3.11/3.14 CI
pass; see VALIDATION and `examples/tls-continuation-validation.json` for the
fixed budgets, measurements and scope. The 1,825 raw decoding-loss codes remain
unchanged; this result is QUALIFIED_LIMITATIONS, not full decoding or GOAL_PASS.
