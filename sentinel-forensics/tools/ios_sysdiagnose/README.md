# Offline iPhone sysdiagnose ingestion prototype

A functional, stdlib-only Python 3.11+ command-line importer for a **documented
subset** of user-supplied diagnostic exports. It does not connect to an iPhone,
collect evidence remotely, invoke Base44, upload records, query threat intelligence,
or assess whether a device is compromised. No UI or HoneyTrace runtime changes.

## Run

From the repository root, using a user-authorized local archive:

```sh
python3 tools/ios_sysdiagnose/ingest.py /path/to/sysdiagnose.tar.gz --output /path/to/new-evidence-directory
```

On Windows, `py -3` can replace `python3`. Paths with spaces need shell quotes.
The output directory must not already exist; its parent must exist. Do not put
private diagnostic data or generated reports inside a repository. No installation,
API key, network, root privileges, or external dependencies are required.

By default, exports contain hashes, byte locations, normalized times and fixed
parser metadata, **not** source messages, arbitrary fields, local source paths,
or archive member names. To explicitly retain unredacted structured records and
member names **locally**, add `--include-sensitive`. This can expose account
identifiers, device details, tokens, network names and other personal data.
Minimized exports are not anonymized: hashes and timestamps can be linkable.
The original supplied archive is always needed to recover omitted evidence.

Exit 0 means ingestion completed, including possible partial coverage and record
errors. It never means the device is safe. Exit 2 means ingestion failed, with a
fixed error code and no traceback containing evidence. Read `counts`, `coverage`,
file discovery states and parse errors before using results.

## Supported scope

| Input | Behavior |
| --- | --- |
| ZIP, TAR, TAR.GZ / TGZ | Content detected, bounded reading; regular files and directories only |
| UTF-8 `.jsonl`, `.ndjson` | One JSON object per nonblank line; exact byte and line provenance |
| `.json` | One diagnostic object; nested fields retained only with sensitive opt-in; arrays not expanded |
| `.ips` | One or two JSON objects (header/body); each retained with exact byte range; no cross-object inference |
| XML/binary `.plist` | Top-level dictionary observation; no recursive event synthesis |
| `.log`, `.txt` | JSON-object lines or `YYYY-MM-DD[T or space]HH:MM:SS[.fraction][zone] message`; other nonblank lines become errors |
| Native `.tracev3`, `.logarchive` content | Hashed and inventoried as unsupported; **not decoded** |
| Other files / nested archives | Hashed and inventoried; no recursive extraction |

File extensions discover candidates, not trusted Apple provenance. An arbitrary
archive can be imported; no claim is made that it originated on an iPhone.
Crash records are typed `diagnostic.crash_report`, other parsed objects
`diagnostic.record`. A crash or daemon message does not imply malicious activity.

JSON numeric overflow and nonzero underflow are rejected as malformed records
(parser 0.2.1). Later JSONL records and other archive members continue with their
original byte locations and hashes. Zero exponent forms remain valid. Opt-in
private raw output retains typed nonfinite plist values; a nonfinite
timestamp has explicit unsupported status and no invented normalized time.

Time fields are selected in fixed order: `timestamp`, `time`, `date`,
`captureTime`. Explicit offsets normalize to UTC, including Apple's space-before-
offset notation. Missing, invalid, naive, and numeric timestamps remain null with
an explicit status. Numeric epochs/units, timezone, missing years, device clock
accuracy and IPS header-to-body timestamp inheritance are not guessed. Future
but syntactically valid times remain observations, not compromise findings.

## Extraction and integrity model

1. Open the source read-only; require a regular file. On POSIX, reject final-path
   symlinks and avoid blocking on special files. Copy into a private temporary
   snapshot while computing SHA-256; detect size/mtime/ctime changes during copy.
2. Rehash the snapshot. Parse only that snapshot, so later source changes cannot
   change the bytes analyzed. The tool never writes the original archive, though
   normal OS read-access metadata may change. This is not a hardware write blocker.
3. Reject absolute/traversal/backslash/drive/control-character paths, duplicate
   and case/Unicode-equivalent names, conflicting file/directory paths, links,
   sparse TAR entries, devices, FIFOs and encrypted ZIP entries. Never use member
   paths as filesystem destinations. ZIP CRC and gzip trailers are checked.
4. Inventory and hash every regular file. Candidate files are extracted under
   generated opaque IDs into private scratch, rehashed, parsed, then removed.
   Temporary snapshots are cleaned on normal completion and handled failure;
   cleanup is not secure erasure and an abrupt process kill can leave scratch.
5. Preserve every record occurrence, including byte-identical duplicates.
   `duplicate_of` references the first exact-byte record; no semantic deduplication.
6. Write `events.jsonl`, then `manifest.json`, then `SHA256SUMS` as the completion
   marker. A handled failure removes this run's output directory. Existing output
   is never overwritten. Abrupt termination may leave an incomplete directory;
   do not consume it without the completion marker and checksum verification.

Default budgets: archive 256 MiB, expanded data 512 MiB, member 32 MiB, 10,000
entries, 100,000 records, structured/line record 1 MiB. TAR expanded budget also
counts headers and padding (including PAX metadata). ZIP counts declared expanded
member sizes and verifies actual sizes. A budget breach at archive level fails
closed; oversized diagnostic records become explicit parse errors. Library users
can supply a `Limits` instance; increasing limits increases resource exposure.
Python ZIP central-directory parsing occurs before entry-count checks, so this is
not a complete hostile-input sandbox. Use a current patched Python and OS resource
limits for untrusted large archives. No nested decompression is performed.

POSIX output permissions are 0700 directory / 0600 files. On Windows, Python modes
do not guarantee equivalent ACL isolation: choose a user-private, access-controlled
output and temporary directory. Same-user hostile filesystem races, hostile kernel,
disk exhaustion and hard power loss are outside this prototype's guarantees.

## Export v1 and HoneyTrace boundary

`EXPORT.md` defines the schema and integration mapping. Verify on Ubuntu with:

```sh
cd /path/to/new-evidence-directory
sha256sum -c SHA256SUMS
```

Keep `SHA256SUMS` separately in a trusted custody record if tamper evidence matters.
An attacker able to rewrite a bundle can also rewrite its checksums. SHA-256 proves
byte consistency, not acquisition authenticity, device identity or legal custody.
No signatures or claim of court admissibility are provided.

## Tests and validation status

```sh
cd tools/ios_sysdiagnose
python3 -m unittest discover -s tests -v
```

Tests generate synthetic ZIP/TAR/GZIP, JSON/IPS/plist/text fixtures in disposable
directories. There are no genuine user records or executable archive payloads.
They cover valid/malformed/missing fields, timestamp edge cases, duplicates, byte
provenance, deterministic exports, corruption, budget failures, hostile structures,
privacy defaults, opt-in raw fields, no network, cleanup and no-overwrite behavior.
Tests have been run on Linux with Python 3.12; Windows and other Python versions
remain unvalidated. This does not certify production-scale forensic readiness.

### Requires genuine, authorized device archives

- Inventory real archive layouts across supported iOS versions and collection methods.
- Compare parsed timestamps/fields/byte offsets against original records and
  independent manual review; measure unsupported and malformed record coverage.
- Validate native IPS/plist variations and distinguish metadata from event records.
- Test realistic archive sizes, performance, memory/disk usage and necessary budgets.
- Review privacy controls against actual identifiers; obtain separate authorization
  before including raw records in reports or sharing them.
- Specify and validate a native unified-log decoder separately, if needed.
- Validate Windows ACLs and operational custody procedures in the target environment.
- Propose a separately reviewed HoneyTrace adapter and non-security classification
  policy only after this evidence contract is validated. Do not feed this export to
  live `incidentd.py`, label it a trusted boundary signal, or fabricate network IOCs.

## Reuse assessment (source inspected 2026-10-10)

Sentinel `main` commit `ff09f641b475e0dd8daf6bfd985e3dd8b2d582f1`:

- `src/pages/IOSDiagnostics.jsx`, blob `57997701febc47ea9bfd15729309cd672c3405b0`:
  browser/app checks and UI primitives only; calls public fetch/Base44 and captures
  console logs. No importer code reused. Future report UI must be explicitly offline.
- `functions/collectForensicArtifacts.ts`, blob
  `9daad41835c96dec9248e47dfff6eb485bce6795`: fixed Windows samples, score and malware
  claims; unsuitable for real evidence. Not invoked, copied or relabeled by this tool.
  Existing application behavior remains unchanged and its sample limitation persists.
- Repository tree inspection found no `AGENTS.md` or existing `tools/` subtree.

HoneyTrace canonical repository is now
`Jay-Forensics-LLC/honeypot-v1.3-candidate`; reviewed branch
`source-baseline/polish2-2026-10-10`, `honeypot/scripts/incidentd.py` blob
`2f08623590abd57efb40e44c856d7f7b9f705ceb`. Reused conventions only: stable event IDs,
`event_id`/`normalized`/`raw` envelopes, source separation, evidence hashes and
OBSERVED/UNKNOWN distinctions. No HoneyTrace imports, runtime access or edits.
