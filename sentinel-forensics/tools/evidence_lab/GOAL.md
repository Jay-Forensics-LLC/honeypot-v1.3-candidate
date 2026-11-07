# Persistent goal: independent offline forensic evidence analysis

Overall: **IN_PROGRESS**. Owner-confirmed actual Packet Squirrel dataset:
**3 PCAP files /297,151,107 bytes /591,565 packets**. The owner corrected the
original approximately 30 GB estimate on 2026-10-21; this is the intended complete
set. No result here demonstrates 30 GB scale. Two real analyses returned
**QUALIFIED_LIMITATIONS**: all framing/count/integrity/reproducibility/resource
gates passed. Independent supported-field comparison also passed with zero
mismatches; decoding coverage remains limited. See CHECKPOINT and VALIDATION.

Current ordinary supplied-key qualification: `445abb1ce9df314469f559c862ff15ec81144d49`
(parser 2.0.10 /independent oracle 2.0.9). All 440 local tests and exact
implementation Python 3.11/3.14 CI pass, with no skips and reproducible schema.
Fresh real14 analyses pass all 14 applicable gates on the complete set. The
current read-only key loader and qualification API supply the same operator key
to both workers; the held original remains unchanged and all three protected
copies match. CLI forwarding has synthetic coverage; this actual workflow used
the loader and API. Default qualification still generates one shared key per pair.

Both new analyses have matching private raw semantics, counts, protocols and
full coverage with real13, and matching normalized minimized exports within the
new pair. Cross-version or cross-key export equality is not claimed. An explicit
metadata gate admits the historical 7547e4f supported-decoding proof: all 22 other
Python entries and the HoneyTrace schema are byte-identical, and complete raw
semantics, coverage, configuration and source inventory match. No supported-field/TShark
comparison was rerun at 445abb1; independent packet counts were freshly checked. Historical TLS chains remain pinned to a60feb9.
The result stays **QUALIFIED_LIMITATIONS**, with all **1,825 raw losses** and
the zero-loss goal IN_PROGRESS. See
[qualification key validation](examples/qualification-key-validation.json).

Historical native-header and ordinary qualification: `7547e4ff93fd499320e9f87134d8abe0a21a8d2e`
(parser 2.0.10 /independent oracle 2.0.9). All 428 local tests and exact
implementation Python 3.11/3.14 CI pass, with no skips and reproducible schema.
Fresh real13 ordinary analyses pass all 14 applicable gates on the complete
owner-confirmed set, with matching private content and normalized minimized
exports, unchanged sources and fixed resource budgets. Five independent-decoder
profiles pass, including 5,774,468 actual supported-field checks with zero
mismatches.

Guarded version-2 vendor common headers now produce 729 additional partial
observations per ordinary analysis. A separate independent comparison verifies
all 729 original records and all 6,561 numeric header fields with zero mismatches
or reference diagnostics. It also verifies all 1,458 stored observations across
both new cases, including full fields, provenance, time and context. Source,
code and index before/after checks pass within fixed 512 MiB /60-second /64-MiB
budgets. Header support does not decode event bodies or establish device identity.
All **1,825 raw losses remain: 1,094 TLS, 729 vendor-body and two LLC cases**.
The zero-loss goal remains IN_PROGRESS. See
[vendor header validation](examples/vendor-header-validation.json).

Historical continuation qualification: `a60feb9a2a8defc3f85e92d6a85347e98f39da8e`
(parser 2.0.9 /independent oracle 2.0.9 /optional derived producer 1.1.0,
`sentinel.tls-derived/2`). All 407 local tests, generated independent TLS checks
and exact implementation Python 3.11/3.14 CI pass. Fresh real12 ordinary analyses
pass all 14 applicable gates with matching private deterministic content and
normalized minimized-export digests within the new pair. Private content also
matches real11. Five independent-decoder profiles pass, including 5,774,468 actual
supported-field checks with zero mismatches.

Two independent nine-page continuation families evaluate every fitting whole
cohort: 1,091 candidates /1,060 cohorts /229,322 original records per family.
Each reports 1,070 source/reference-verified Hello observations, 21 indeterminate
results and three oversized candidates not evaluated. All formerly deferred
fitting cohorts are evaluated; exact semantic content and minimized exports
match. A separate independent audit verifies all selected records, support
intervals, 5,350 emitted native Hello fields per family, original capture-time
anchors and minimized exports within unchanged budgets. Prior-page rows are
reported artifact references with no fresh Hello metadata/support or authenticated
execution/acquisition claim. The 1,825 raw losses remain unchanged and the result
is QUALIFIED_LIMITATIONS. Oversized/indeterminate cases, vendor coverage, original
Tetra and genuine cross-source calibration remain acceptance gaps. No phase or
whole-protocol gate is completed by the bounded derived result.
These TLS outcomes remain pinned to a60feb9; no changed-code continuation
qualification at 7547e4f or 445abb1 is implied.

Earlier qualified runtime: `4c8bacc8b7e988693d1747707adb709eaedf8d93`
(parser 2.0.9 /independent oracle 2.0.9 /optional derived producer 1.0.1).
Fresh real11 ordinary analyses pass all 14 applicable gates with identical
deterministic results; five independent-decoder profiles pass. A separate optional
classic-PCAP layer also passes two actual runs and an independent source/support,
field, timestamp and minimized-export audit. It selects 132 of 1,094 eligible
candidates: 128 verified Hello observations and four indeterminate results;
962 remain not evaluated. All 1,825 raw decoding losses remain unchanged.
This bounded layer does not waive `GOAL_PASS` or complete any whole-protocol gate.
At that earlier revision, continuation for 959 batch-cap exclusions was still
software work; the historical a60feb9 result above covers the fitting cohorts. Bounded
handling of oversized/indeterminate cases remains software work. Original Tetra
and genuine cross-source clock/network context remain external prerequisites.

Earlier shared numeric-parser and generic radio-dispatch corrections were
requalified with two fresh analyses at clean
`1a027c9b00fe4eaf50a3090ddaf93e0eb94a9589` (parser 2.0.4);
the previous receipts remain preserved separately.
The native BLE-ARD CSV integration was independently qualified again at clean
`58217cf2852ba940dd9f7e3e99eaa1e5188f8b58` (parser 2.0.5): two actual analyses
passed the same applicable gates and retained QUALIFIED_LIMITATIONS. One genuine
public BLE export also has a separate, narrowly scoped compatibility receipt.
The earlier IGMP qualification is pinned to
`0ab0b7cd3818afbb8498aab914e0b7bbfd3df852` (parser 2.0.6 /oracle 2.0.5).
Bounded IGMP observations resolve 19,699 previously unsupported actual packets;
two fresh analyses pass all applicable gates, and 5,756,926 independent supported
field comparisons have zero mismatches. The remaining 3,078 limited packets
retain QUALIFIED_LIMITATIONS; the full-decoding gate has not been waived.
Earlier timeline/context qualification:
`066161f5c21872e0cebbc8c0afa4eff0747c7e69` (parser 2.0.7 /oracle 2.0.5).
It fixes explicit source-context configuration and preserves original generic-log
timestamp offsets/nanoseconds. All 240 tests pass; two new actual analyses pass
the applicable gates with unchanged inputs, configuration and resource budgets.
The configuration-only intermediate run is preserved separately and does not
certify the later timestamp fix. See current CHECKPOINT/VALIDATION receipts.
Earlier capture-processing qualification is clean
`db53b859b570f245ba7eba3a57c28f017e531c75` (parser 2.0.8). Bounded IEEE 802.3 LLC
basic-XID metadata resolves another 1,253 actual packets; two complete analyses
pass the same applicable integrity/count/reproducibility/resource gates. The
remaining 1,825 limited packets retain QUALIFIED_LIMITATIONS. Final independent
comparator `05959c09b691ef874411c8a70f0d7a8b7d13f918` (oracle 2.0.7) fixes older
Wireshark raw-field compatibility without changing analysis bytes. An explicit
runtime/schema hash proof supports reuse of the two completed analysis runs;
affected comparator checks run against actual evidence and fixtures. All 266
local tests and Python 3.11/3.14 implementation CI pass. Final receipt/delivery
state is recorded in CHECKPOINT, VALIDATION and private HANDOFF. The zero-loss
acceptance gate remains unmet; reassembly and vendor coverage are useful software
work, not automatically external blockers. A separate invented baseline identified
archive-member timestamp inconsistency;
the following qualification records its correction without claiming genuine
combined-source calibration.
Earlier qualified archive analysis and comparator:
`13be2ac8bb82ce38521529879594ffd3a05b8c92` (parser 2.0.9 /oracle 2.0.7).
Archive members now preserve exact timestamp offsets/nanoseconds and explicit
uncertainty consistently with plain logs and indexed records. Seven new invented
regressions and all 273 local tests pass, with independent reviews and Python
3.11/3.14 CI. Two fresh actual analyses, independent field comparisons and the
two-run genuine public BLE profile pass their applicable gates at this exact
commit. Capture coverage is unchanged: 1,825 limited packets retain
QUALIFIED_LIMITATIONS. The separate full-capture TLS investigations failed the
fixed memory gate; the later bounded layer above qualifies only its selected
subset. Neither those failures nor a successful header inventory waive the
zero-loss acceptance gate.
PR #14 merged as `77771ad4fd2aa148b3059e53e7aa6631daafa9f5` with the exact
qualified implementation tree and passing post-merge Python 3.11/3.14 checks.
The session goal was also registered through the available goal tool. Synthetic
qualification, upstream examples and a Tetra subset never complete this goal.

Build a functional, independently testable offline suite that ingests large,
heterogeneous authorized evidence, preserves integrity and provenance, extracts
structured observations, correlates events and produces explainable reproducible
findings. HoneyTrace gathers evidence; this independently usable suite analyzes it.
Keep the repository personal and private. Do not change HoneyTrace runtime,
production deployment or incident classification. See CHECKPOINT.md for exact
implementation/validation states, starting commit, blockers and resume commands.

## Actual capture acceptance

Identify the intended closed original file or complete segment directory. Record
exact bytes, signatures and full SHA-256 per file. "30 GB" is approximate, not an
artificial minimum that excludes the intended dataset. The prior runner required
at least 30,000,000,000 bytes; version 2 replaces that assumption with explicit
dataset identification (`--dataset-id`) and complete inventory. The supplied
identity is an operator assertion, not proof of acquisition origin.

Run two separate workers with equivalent configuration and case pseudonym key.
Reconcile every file and the total against independent local `capinfos`. Verify
ordered logical index content and minimized exchange, all output checksums, and
unchanged source hashes/metadata. No filtering occurs; decoding losses and
unsupported blocks are accounted separately from framed packet counts.

Predeclared defaults: 512 MiB worker RSS, 4 hours per worker/decoder. These retain
the original thresholds and leave ample RAM on the measured 31 GiB / 16 logical
CPU machine. RSS is a measured gate, not an OS quota. Before analysis, reserve
max(4 × input bytes, 2 × independent packets × 6,000 bytes) + 1 GiB for both
runs. The actual run additionally used a predeclared 12,000-byte allowance per
packet per run, requiring 15,271,301,824 free bytes. These estimates cover duplicate
indexes, timeline, identifiers, flows, exports and journals; they do not guarantee
space for arbitrary metadata density.
Check free space during ingestion too. Copy or acquisition must be complete before the run; a growing segment directory
is not a closed dataset. The final inventory check rejects files added after
initial counting even when every original file hash remains unchanged.
Choose thresholds BEFORE the real run;
never loosen them retrospectively to relabel a failed run.

`qualification.json` and `qualification.md` record the result. `GOAL_PASS` requires
all integrity/count/reproducibility/resource gates and no packet decoding losses.
`QUALIFIED_LIMITATIONS` means framing gates passed but unsupported/limited decoding
requires review; the overall real-data goal remains unaccepted. `FAILED`,
`BLOCKED_EXTERNAL`, and `CANCELLED` never pass. Synthetic profile can only produce
`SYNTHETIC_PASS`, never `GOAL_PASS`. Preserve failed reports.

## Exact real run command

Use a NEW private SSD directory outside the executing Git checkout. Ignored private
outputs under the main workspace are suitable when running the pinned code-only
checkout documented in CHECKPOINT.md. /tmp on this host is a 16 GiB tmpfs;
it is unsuitable for the real qualification. Source files must have no active
writers. The directory form inventories every regular file recursively; unrelated
files are reported and block qualification rather than silently disappearing.

```sh
python3 tools/evidence_lab/run_tests.py
python3 tools/evidence_lab/qualify.py run '/ABSOLUTE/PACKET-SQUIRREL-SEGMENTS' \
  --dataset-id 'owner-confirmed Packet Squirrel capture dataset' \
  --max-rss-mib 512 --timeout-seconds 14400 \
  --output '/ABSOLUTE/SSD/private-cases/packet-squirrel-qualification-01'
```

Optional `--config /absolute/config.json` records explicit network contexts, clock
adjustments and rule thresholds. `reproduce-private.json` retains the exact local
paths and configuration. Use the same commit and parameters in a new directory.
Do not upload recipes, indexes, raw evidence or sensitive reports to GitHub.

## Measurement scope

Analysis timing includes streaming ingestion, hashes, decoding, SQLite indexing,
flow aggregation, correlation, rules, exports and output checksums. No isolated
parser-only speed is claimed. Full-cost wall/CPU measurements also cover inventory,
pre/post full-file hashing, independent validation, worker startup, checksum
verification and deterministic digests; report finalization is excluded.

Worker self peak RSS and 50 ms process-tree RSS samples are recorded; parent RSS
is sampled separately. CPU is measured for parent and reaped children. Logical
and allocated output bytes, 1 s sampled case allocation and filesystem free-space
deltas are available. Samples can miss brief peaks/temp files; unrelated disk
activity affects deltas. SQLite requests file-backed temporaries in case/scratch
space; no hard disk quota. Caches are not flushed. No extrapolation to 30 GB.

An interrupted analysis retains CANCELLED/INCOMPLETE state, without a valid
completion checksum manifest. Ordinary failure removes its partial case; worker
failure details retain the last source/offset/ordinal in qualification.json.
No resume into a partial index is supported; rerun into a new case directory.
