# Validation evidence and reproducibility

## Current supplied-key ordinary qualification at 445abb1

Clean runtime `445abb1ce9df314469f559c862ff15ec81144d49` retains parser 2.0.10
and oracle 2.0.9. The qualification runner now forwards an optional validated
32-byte key through its read-only loader, API and protected worker copies.
Without a supplied key, it still generates one shared key for the pair. No raw
observation, rule, HoneyTrace schema or HoneyTrace runtime behavior changes.

**Synthetic validation and exact implementation CI.** All 440 local tests pass
(31 diagnostic +409 lab), with no skips and reproducible schema. Exact
implementation CI `40036277664` passes on Python 3.11/3.14. Twelve new invented
regressions cover API/CLI forwarding, protected worker keys, unchanged default
behavior, bounded read-only loading, invalid/changed inputs, cancellation and
privacy. The affected 37-test run is distinct from actual validation. Public CLI
forwarding is synthetically validated; the actual workflow below used the current
loader and API, and does not claim a real-data CLI execution.

**Fresh owner-data and supplied-key validation.** Real14 and its candidate gate
pass on the complete three-PCAP /297,151,107-byte /591,565-packet set. Both analyses
pass all 14 applicable ordinary checks; fixture-count matching is not applicable
to this real profile. The original controlled key is held read-only across both
analyses and verification, remains unchanged, and matches all three protected
copies. No key bytes, direct key hash, external key name or path are published.

Source hashes and closed inventory remain unchanged. Each run has 93,894
observations, including 729 partial vendor headers, zero filtered packets and
zero framing errors. Complete private raw index semantics, full coverage, counts
and protocols match real13. The new pair's minimized exports match after
normalizing only the documented case run UUID. No cross-version or cross-key
export equality is claimed. All 1,825 raw losses remain: 1,094
`tls_reassembly_required`, 729 `unsupported_ethertype` and two
`unsupported_llc_control`; the result is **QUALIFIED_LIMITATIONS**.

| Ordinary measurement | Run 1 | Run 2 |
|---|---:|---:|
| Complete worker wall seconds | 125.453472 | 126.966643 |
| Worker CPU seconds | 55.311980 | 55.249185 |
| Reaped worker user CPU seconds | 50.985383 | 50.826139 |
| Reaped worker system CPU seconds | 4.364215 | 4.460823 |
| Sampled worker-tree RSS bytes | 46,587,904 | 46,456,832 |
| Sampled parent RSS bytes | 29,503,488 | 35,741,696 |
| Completed worker output bytes | 2,725,074,302 | 2,725,074,302 |

Ordinary qualification wall is 303.158012 seconds, including inventory, source
hashes, independent counts, workers, checksum verification and content digests,
excluding report finalization and wrapper post-key/candidate-gate checks. Parent
CPU is 51.928559 seconds; reaped children use 101.853409 user +8.849109 system
CPU seconds. Measured worker limits stay 512 MiB /14,400 seconds. RSS sampling
is a measured gate, not an OS quota.

The actual API explicitly reserves 12,000 bytes per packet per run plus the
existing reserve, requiring 15,271,301,824 free bytes for ordinary work. Preflight
retains a 17,418,785,472-byte combined reserve for future TLS work, which this
workflow did not execute. The prospective public CLI retains its default
6,000-byte per-packet-per-run estimate; its invocation is not the measured API
recipe. Exact actual commands, configuration, controlled-key handling and tool
versions remain private. The actual wrapper returns 0 for PASS_APPLICABLE_GATES;
the public CLI intentionally returns 2 for QUALIFIED_LIMITATIONS. Exit 2 can also
indicate failure/cancellation, so it must be interpreted with saved status/gates.

**Historical supported-decoding proof admitted by exact reuse gate.** The new
metadata-only gate finishes COMPLETE with
`PASS_REUSED_UNCHANGED_SUPPORTED_DECODING` and all eight checks true. Only
`qualify.py` differs from 7547e4f: the other 22 Python entries and HoneyTrace
schema are byte-identical. It also binds complete raw semantics, full coverage,
configuration, source inventory and four closed manifest/state/ledger profiles.
This admits the five historical supported-decoder profiles, 5,774,468 actual
supported-field comparisons, 6,561 vendor numeric comparisons and 1,458 stored
header audits below. Those decoders executed at **7547e4f**, with no fresh
supported-field/TShark or vendor numeric/storage comparison at 445abb1.
Independent packet counts were freshly checked with capinfos. The gate
uses saved full-bundle verification; it does not reopen evidence, keys, indexes,
exports or decoders. Both COMPLETE and the exact reuse decision are required.

Actual TLS continuation stays pinned to historical **a60feb9**; no chain was run
at 445abb1. All historical example receipts and failed attempts remain unchanged.
See [qualification key validation](examples/qualification-key-validation.json)
for the minimized current aggregate. Vendor bodies, two LLC cases, three
oversized/21 indeterminate historical TLS cases and genuine adapter/calibration
prerequisites remain. The zero-loss goal stays **IN_PROGRESS**.

## Historical native-header and ordinary qualification at 7547e4f

Clean runtime `7547e4ff93fd499320e9f87134d8abe0a21a8d2e` uses parser 2.0.10
and independent ordinary oracle 2.0.9. The new Python-only decoder emits guarded
version-2 `bcm.event_header` observations with numeric common-header fields and
captured-length accounting. It does not interpret bodies, trailing bytes,
station addresses or interface names, and every such packet retains its coarse
`unsupported_ethertype` loss. No association, finding, HoneyTrace runtime change,
Lua dependency or default external-decoder invocation is introduced.

**Synthetic validation and exact implementation CI.** All 428 local tests pass
(31 diagnostic +397 lab), with no skips and reproducible HoneyTrace schema.
Exact implementation CI `40031236241` passes on Python 3.11/3.14. Generated
fixtures cover envelope/version/length guards, truncation, declared versus
captured data, duplicates, storage/provenance/time, minimized exports and offline
behavior. The original failed full-suite boundary expectation and its correction
are preserved; the passing result belongs to this exact candidate. The private
numeric-comparison helper has 19 separate source-free methods and independent
source reviews; these are distinct from the actual execution below.

**Fresh ordinary owner-data qualification.** Real13 reconciles all three PCAPs:
297,151,107 bytes /591,565 independently counted packets. Both analyses pass all
14 applicable gates with unchanged source hashes, closed inventory, output
checksums, matching private deterministic content and normalized minimized
exports. Only the documented case run UUID is normalized; no byte-identical
ordinary export claim is made. Each case contains 93,894 observations, including
729 new partial common-header observations. No packets are filtered and no
framing errors occur. Result remains **QUALIFIED_LIMITATIONS** with 1,825 raw
losses: 1,094 `tls_reassembly_required`, 729 `unsupported_ethertype` and two
`unsupported_llc_control` occurrences.

| Ordinary measurement | Run 1 | Run 2 |
|---|---:|---:|
| Complete worker wall seconds | 107.196199 | 124.555942 |
| Worker CPU seconds | 55.229456 | 55.400254 |
| Sampled worker-tree RSS bytes | 46,477,312 | 46,325,760 |
| Completed worker output bytes | 2,725,074,302 | 2,725,074,302 |

Full ordinary qualification costs 282.093941 seconds, including inventory,
source hashes, counts, workers, output verification and content digests, excluding
report finalization. Parent CPU is 51.390523 seconds; reaped children use
102.010708 user +8.759722 system CPU seconds. Limits remain 512 MiB /14,400
seconds per worker and a 15,271,301,824-byte ordinary free-space reserve.
Preflight also retains a 17,418,785,472-byte combined reserve for ordinary output
plus two bounded TLS families; no new actual TLS chain is claimed here.

**Independent ordinary decoding.** All five current profiles pass with zero
mismatches and complete source verification. The actual profile checks 591,565
packets /5,774,468 supported fields in 17.233877 seconds, with 392,708,096 sampled
tree RSS bytes. Pinned upstream (8 files /109 packets /1,122 checks), generated
network (2 /12 /120), IGMP (2 /24 /440) and LLC PCAP/PCAPNG (2 /16 /292) also pass.
These profiles verify their supported subset; PCAPNG evidence remains generated
or fixture-based because the owner's actual sources are classic PCAP.

**Independent actual common-header comparison and storage audit.** One new
fixed-budget workflow freshly verifies all 729 selected original record hashes,
locators, framing, namespace/layout guards, native metadata, original times and
context. All **6,561 numeric comparisons** against the unchanged pinned external
development Lua reference match: nine fields on every packet, no missing/invalid
fields, no protocol omissions and no reference diagnostics. Decoder diagnostics
never suppress a field comparison. The reference is neither shipped nor globally
installed, and ordinary analysis needs no decoder or plugin.

All **1,458 stored header observations across both new cases** also match fresh
native fields, generic packet metadata, time, context, provenance and content
hashes. Header coverage/privacy shapes are independently checked on all 729
records. Full source/code/index before/after checks pass; no key is opened.
The independent helper preserves original evidence and does not write a real
derived PCAP or raw reference rows.

Complete-process time measurements include startup and final cleanup:
**9.42 seconds, 7.31 user +2.21 system CPU seconds**. Producer preterminal
snapshots record sampled combined-tree RSS 215,072,768 bytes, conservative
own +child lifetime peak 218,611,712 bytes and scratch 94,208 bytes including
the fixed trusted-Lua reserve. RSS/scratch snapshots precede terminal
serialization and cleanup; final guards remain enforced and can only downgrade.
Predeclared limits remain
512 MiB /60 seconds total /64 MiB scratch /1 MiB receipt /2,048 selected records.
No retry, cap increase or quota of successful matches occurs. Sampling and
conservative lifetime sums are measured gates, not hard OS quotas or necessarily
simultaneous peaks.

All 15 scoped root gates pass, separately from the unmet full-decoding goal.
Private real13/preflight13, numeric-validation-01 and the final scoped root gate
retain exact human/machine commands, tool/helper/code/configuration/source/case
bindings and preserved failure history. Public aggregates are in
[vendor header validation](examples/vendor-header-validation.json); older
`examples/actual-capture-validation.json`, `examples/tls-derived-validation.json`
and `examples/tls-continuation-validation.json` remain historical receipts.
No private wire values, identifiers, keys, source/content hashes or original
timestamps are published here. Source consistency is not acquisition authenticity;
no original-USB after-check, cold-cache or 30 GB-scale claim is made.

The actual TLS continuation result below remains pinned to historical a60feb9:
1,070 verified Hellos /21 indeterminate /three oversized candidates per family.
It does not certify a changed-code chain under parser 2.0.10. Vendor bodies, the
two LLC cases, oversized/indeterminate TLS handling, the original Tetra database
and genuine combined-source clock/network calibration remain acceptance gaps.
The supplied-key propagation fix was absent from this historical runtime; its
separate 445abb1 validation is recorded above. Overall zero-loss acceptance stays
**IN_PROGRESS**.

## Historical ordinary and whole-cohort continuation qualification at a60feb9

Clean runtime `a60feb9a2a8defc3f85e92d6a85347e98f39da8e` uses parser 2.0.9,
oracle 2.0.9 and optional producer 1.1.0 /`sentinel.tls-derived/2`. Default
analysis, raw observations/losses, findings and HoneyTrace remain unchanged.
Continuation is a separate explicit command; Linux with readable `/proc`,
`waitid`/`WNOWAIT` and local TShark are required for this optional layer.

**Synthetic and independent-decoder checks.** All 407 local tests pass
(31 diagnostic +376 lab), with no skips and reproducible HoneyTrace schema.
Exact implementation CI `39993333642` passes the same tests and schema on Python
3.11/3.14 /TShark 4.2.2; local independent decoding uses TShark 4.6.4.
Generated TLS 1.2/1.3 client/server and adversarial cases remain strict. A new
generated two-cohort/two-page/two-family test proves exact semantic/export
repetition, whole-cohort deferral and prior rows without fresh metadata/support.
Source-free tests cover noncontiguous first-fit backfill, bounded active-batch
materialization, resealed source/coverage/provenance/cursor forgeries, maximum
lineage, sibling path boundaries and failed/cancelled/late-close checkpoints.
Private qualification and independent-audit helpers have separate source-free
failure/cleanup tests and nonowner source reviews; those do not replace the
actual executions below.

**Fresh ordinary owner-data qualification.** Real12 reconciles the complete
owner-confirmed three-PCAP set: 297,151,107 bytes /591,565 independent packets.
Both analyses pass all 14 applicable gates, with unchanged full source hashes,
closed inventory, zero filtered/framing-error packets, identical private content
and normalized minimized-export digests. Private semantics also match real11.
Only the documented case run UUID is normalized; ordinary export files are not
claimed byte-identical. Result remains **QUALIFIED_LIMITATIONS** with 1,825 raw
losses: 1,094 TLS reassembly, 729 EtherType and two LLC cases.

| Ordinary measurement | Run 1 | Run 2 |
|---|---:|---:|
| Complete worker wall seconds | 124.536111 | 141.303957 |
| Worker CPU seconds | 55.027420 | 55.150057 |
| Sampled worker-tree RSS bytes | 46,346,240 | 46,338,048 |
| Completed worker output bytes | 2,722,190,469 | 2,722,190,469 |

Total ordinary qualification wall time is 316.137879 seconds. Budgets remain
512 MiB /14,400 seconds per worker; the caller reserves 15,271,301,824 SSD bytes,
using 12,000 bytes per packet per run plus reserve. The runner's internal default
estimate remains 6,000. Preflight12 measures 322,385,444,864 free bytes against
17,418,785,472 required for ordinary output plus two maximum-16-page families.
The sampled qualification-tree allocation is cumulative (run2 includes run1),
distinct from each completed worker output and later private recipe files.
No cache flushing, original USB after-check or 30 GB-scale claim is made.

**Independent ordinary decoding.** Five profiles pass with zero mismatches and
fresh complete source checks. Actual comparison covers 591,565 packets and
5,774,468 supported fields in 17.299539 seconds /392,179,712 sampled tree RSS
bytes, below 512 MiB /14,400 seconds. Cached upstream (8 files /109 packets /1,122
checks), generated network (2 /12 /120), rich IGMP (2 /24 /440), and separate
LLC PCAP/PCAPNG (2 /16 /292) also pass. Ordinary comparison keeps reassembly
disabled and verifies the supported subset, not all protocol content.

**Actual continuation.** Two separately executed families finish in nine pages
each. They cover all 1,060 fitting whole cohorts /1,091 candidates /229,322
original records per family, with identical page semantic content, all-table
logical content and exact minimized JSONL/human exports. Outcomes are **1,070
verified Hello observations, 21 indeterminate and three not evaluated** per
family. No fitting candidates remain deferred; exclusions are two whole-cohort
frame-and-byte caps and one frame cap. These counts describe source observations,
not complete flows, physical devices, people or compromise.

All per-job budgets stay 512 MiB /120 seconds /60 seconds per decoder /64 MiB
scratch /32 batches. Before any producer1.1 owner-data execution, qualification
declares a stricter 32,768-frame page cap; the default/maximum 131,072 and all
per-cohort caps are unchanged. Family bounds are 16 pages each /32 jobs total,
with a 4,200-second overall envelope and 120-second verification phases. No
failed retry, resource-budget increase or numerical Hello quota occurs.

| Continuation measurement | Family 1 | Family 2 |
|---|---:|---:|
| Sum of complete CLI wall seconds | 380.420053 | 380.218575 |
| Maximum complete CLI wall seconds | 45.566235 | 45.664403 |
| Sum of reaped CLI user + system CPU seconds | 381.302305 | 380.574450 |
| Maximum conservative producer own + child RSS bytes | 281,772,032 | 281,821,184 |
| Maximum sampled CLI tree + verifier HWM bytes | 320,954,368 | 320,819,200 |
| Maximum sampled producer scratch/output bytes | 39,649,280 | 39,649,280 |

Whole workflow cost is 777.079128 seconds. Producer metric snapshots precede
terminal serialization; complete CLI measurements include startup/finalization.
Harness reaped-child lifetime maxima can include previous jobs; conservative
sums do not imply simultaneous peaks. RSS/disk sampling can miss brief peaks and
is not an OS quota. Current/prior/permanent/deferred accounting is disjoint;
global observation totals count each fresh evaluation once. Prior rows carry
artifact-reported outcomes with no fresh Hello data/support or authenticated
execution/acquisition claim. Source/configuration/key/code/profile/limits remain
bound across a closed sibling chain. Files are not joined and cohorts are not
split into arbitrary windows.

**Independent actual chain audit.** A separate read-only audit passes for both
families. Per family it freshly verifies every 229,322 selected original record
hash, locator, framing/native metadata and capture time; 2,215 supporting original
records /2,295 exact source-slice links; full byte unions/reference intervals;
all 5,350 emitted native Hello fields; first/completion capture anchors; and exact
independently minimized exports/report. The parent metadata inventory contains
all 591,565 packet rows. The auditor independently replays selection, cursor sets,
prior references, fixed reasons, physical links and semantic proofs; it imports
no producer planner, classifier, field matcher or minimizer.

The audit compares saved local TShark references and reuses completed
qualification/CLI full-source hashes with unchanged held/named fingerprints,
while freshly hashing every selected record. It does not rerun a decoder or
whole-source hash pass. Preterminal audit measurements are 39.280896 wall seconds,
39.284966 CPU seconds and 195,571,712 peak own RSS bytes. Separate GNU Time
complete-process measurements include input/receipt cleanup: **39.36 seconds,
38.62 user +0.72 system CPU seconds /195,571,712 peak RSS bytes**, below unchanged
120-second /512-MiB limits. The installed GNU Time version reports UNKNOWN;
its binary hash, exact command and raw measurements remain private. Late input,
write, close, timeout and cancellation failures downgrade completion markers;
uncertain/reused descriptors are never retried.

Public aggregates: `examples/actual-capture-validation.json` and
`examples/tls-continuation-validation.json`. Private paths, keys, source/content
hashes, exact identifiers, original times and Hello fields are omitted. Private
real12/preflight12, family01/02, workflow01, audit-v4 and the 13-check root gate
retain exact commands, versions and bindings. The unchanged
`examples/tls-derived-validation.json` remains the earlier producer1.0.1 subset
receipt. Its failures and all earlier failed/incomplete experiments are preserved
without retrospective regrading. Each logical-digest algorithm agrees across
its own two families; literal equality between different algorithms is not
claimed. Original Tetra and genuine combined-source clock/network context remain
external prerequisites, while oversized, indeterminate and vendor/LLC coverage
remain independent work. All 1,825 raw losses stay visible; GOAL_PASS is unmet.

## Earlier ordinary and bounded TLS qualification at 4c8bacc

Clean runtime `4c8bacc8b7e988693d1747707adb709eaedf8d93` uses parser 2.0.9,
independent oracle 2.0.9 and optional derived producer 1.0.1. Ordinary analysis
and the existing HoneyTrace exchange remain unchanged in purpose; reconstruction
is a separate explicit command and `sentinel.tls-derived/1` bundle. No HoneyTrace
runtime, legacy application UI, enrichment, decryption or new finding rule was
added. The derived layer requires Linux with readable `/proc`,
`waitid`/`WNOWAIT` and a local TShark installation.

**Synthetic validation.** All 362 local tests pass (31 diagnostic +331 lab),
including independent generated client/server TLS metadata, missing bytes,
contradictory overlap, malformed names, source/index tampering, exact time and
multi-record provenance, minimized exports, resource failures, cancellation and
late write/close cleanup. Controlled Python workers test owned-group cleanup,
concurrent waits, strict missing-RSS handling and sanitized worker failures without
contacting endpoints. Exact implementation CI `39981273493` passes all 362 tests
and schema reproducibility on Python 3.11/3.14 with TShark 4.2.2. Local independent
reference checks use TShark 4.6.4. Invented cases do not substitute for owner-data
qualification or genuine diagnostic archive/radio compatibility.

**Ordinary owner-data qualification.** Fresh real11 runs reconcile all three
owner-confirmed classic PCAPs /297,151,107 bytes /591,565 independent packets.
All 14 applicable closed-inventory, source/output integrity, deterministic
logical-content/normalized-export and fixed resource gates pass; no filtering or
framing errors occur. Both runs preserve full source hashes and have equal private semantics,
also equal to real10. Result remains **QUALIFIED_LIMITATIONS**, with the same
1,825 raw losses: 1,094 TLS reassembly, 729 unsupported EtherType and two LLC.
Ordinary export digests replace the documented case run UUID with `VOLATILE`;
this comparison does not claim byte-identical ordinary export files.

| Ordinary measurement | Run 1 | Run 2 |
|---|---:|---:|
| Wall seconds | 108.257359 | 106.945704 |
| CPU seconds | 55.115086 | 54.726294 |
| Sampled worker-tree RSS bytes | 46,411,776 | 46,309,376 |
| Completed worker output bytes | 2,722,189,908 | 2,722,189,908 |

The sampled allocation metric is the cumulative qualification-tree footprint:
run 2 includes run 1. It is distinct from each completed worker's output bytes;
the recorded measurements do not claim the final private recipe footprint.

Total qualification cost: 265.292827 seconds. The unchanged ordinary gate is
512 MiB /14,400 seconds per worker. Preflight has 327,905,517,568 free SSD bytes
against a declared 15,405,519,552-byte combined ordinary/two-derived requirement.
The additional ordinary SSD allowance is 12,000 bytes per packet per run plus
reserve; the runner's internal default estimate remains 6,000. Private real11 and
preflight11 preserve exact commands, configurations, versions and measurements.
Source copies are fully checked; the original USB media after-check remains
unavailable. No cold-cache or 30 GB-scale claim is made.

**Independent decoding.** All five current profiles pass. The actual comparator
checks 591,565 packets /5,774,468 supported fields /zero mismatches /three fresh
full source verifications in 17.193964 seconds, with 392,609,792 sampled tree RSS
bytes under the fixed 512 MiB /14,400-second gate. Cached upstream (8 files /109
packets /1,122 comparisons), generated network (2 /12 /120), rich IGMP
(2 /24 /440), and separate LLC PCAP/PCAPNG (2 /16 /292) also pass with zero
mismatches and complete source checks. This verifies the supported subset,
not every byte or protocol; ordinary comparison keeps reassembly disabled.

**Actual optional derived validation.** Two fresh CLI runs (derived03/04) complete
within unchanged 512 MiB /120-second budgets, 60 seconds per decoder and 64 MiB
producer output/scratch. Selection preserves original occurrences, both
directions and complete same-source/context/interface/VLAN/family cohorts.
The 32 batches contain 17,432 original records and 132 of 1,094 eligible
candidates: **128 verified Hello observations, four indeterminate and 962 not
evaluated**. The exclusions are 959 at the batch-selection cap and three oversized
cohort candidates. These are counts of observations/candidates, not whole flows,
devices or people. The current subset completes; deterministic continuation and
bounded oversized-cohort handling remain software work.

| Derived measurement | Run 1 | Run 2 |
|---|---:|---:|
| Outer CLI wall seconds | 34.722364 | 34.880362 |
| Producer combined CPU seconds | 34.753428 | 34.911868 |
| Conservative producer own + reaped-child RSS bytes | 260,214,784 | 259,936,256 |
| Independent observer tree + parent peak bytes | 286,535,680 | 296,185,856 |
| Producer output/scratch peak bytes | 23,076,864 | 23,076,864 |

All table/content, minimized export, human report and stable provenance results
match across the two runs; source/case hashes and raw observations/losses remain
unchanged. No numerical Hello-success quota is used. The producer's second run
uses one positively confirmed exact owned-child exit after three missing-RSS
reads: original child reaped, original identity terminal, group absent, immediate
and final conservative lifetime-memory gates satisfied. Persistent live missing
metrics, permissions and malformed metrics still fail. Observer terminal
confirmation is unused in both runs. RSS/disk samples and bounded confirmation
can miss brief peaks; they are measured gates, not OS quotas.
Workflow schema/column/row digests and audit table-tagged-row digests use
different algorithms; each agrees across its own two runs. No literal equality
between those different logical digest formats is claimed. Exact export/report
and stable-manifest hashes agree across both verifiers.

**Independent actual audit.** A separate read-only audit passes in 5.269974
seconds /5.273811 CPU seconds /96,579,584 peak RSS bytes, under predeclared
512 MiB /60-second limits. Per run it freshly checks all 17,432 original record
hashes/locators, 280 supporting original records /292 links, exact source byte
unions, unique independent record alignment, all **640 emitted native Hello
fields**, capture-time anchors and exact key-minimized exports/report. Whole-cohort
completeness is checked against all 591,565 parent packet rows /128 cohorts.
The audit compares saved local TShark references; it invokes no new decoder and
reuses completed full-source integrity gates plus unchanged fingerprints while
freshly hashing selected original records. First/completion times identify
supporting capture packets with original precision and reversible configured
offsets; no calibrated handshake clock or cross-source identity is inferred.

Public aggregates are `examples/actual-capture-validation.json` and
`examples/tls-derived-validation.json`. They omit private source hashes, keys,
identifiers, source times, paths and content digests. The private workflow02 and
audit-v3 receipts retain exact bindings and reproduction details. Shareable
exports are minimized; source hashes/times inside them remain linkable. The
existing public BLE receipt remains at its actually tested 13be2ac revision;
no fresh radio run or genuine combined-source calibration is claimed here.
The combined private real11 summary/recipe is version 2; an initial summary-only
digest-format comparison failure is preserved. Correcting that metadata assembly
reused completed passing receipts without regrading or rerunning actual gates.

**Failure preservation.** The earlier `1114fd7` production-derived attempt remains
FAILED with `tls_resource_sampling_failed`; its second run was never started.
The later source-reviewed termination proof and fresh 4c8bacc runs do not regrade
that attempt. Earlier full-capture memory failures, bounded diagnostic sampling
failure, incomplete outputs, initial source-free setup failures and corrected CI
failures remain separate historical evidence. The independent audit's pre-use
loss-composition correction was source-free tested against actual `Store.packet`
using invented truncated/missing-time records before the actual audit ran.

All 1,825 raw limitations remain explicit; `GOAL_PASS` and full decoding are
unmet. Original Tetra and genuine clock/network context are external blockers;
the 959 batch-cap exclusions, three oversized cases and four indeterminate
references remain independent software work.

## Earlier archive timestamp qualification (parser 2.0.9 / oracle 2.0.7)

Clean `13be2ac8bb82ce38521529879594ffd3a05b8c92` fixes a demonstrated archive
bridge inconsistency. Compact/spaced offsets now normalize through the same
bounded parser as equivalent plaintext; record and observation times retain exact
nanoseconds. Original spelling, diagnostic clock uncertainty, unsupported precision
and representations, nonfinite markers, duplicates and member provenance remain
explicit. The legacy iOS ingestion interface and HoneyTrace v1 contract are
unchanged. Seven new invented archive tests and all **273 local tests** pass
(31 diagnostic +242 lab), with independent runtime/privacy review and exact-head
Python 3.11/3.14 implementation CI.

PR #14 merged as `77771ad4fd2aa148b3059e53e7aa6631daafa9f5`; its tree matches
13be2ac exactly and both post-merge CI jobs pass. Independent publication review
recomputed the final public aggregates from bound metadata, checking the exact
Git-object/module hashes through a newly created clean review checkout after the
original temporary execution checkout disappeared. Historical command paths and
receipts were preserved. No decoder, analysis or benchmark was repeated for this
documentation reconciliation.

Two fresh analyses of the complete owner-confirmed actual PCAP dataset pass all
14 applicable integrity/count/inventory/reproducibility/resource gates at this
exact commit. Both reconcile 3 files /297,151,107 bytes /591,565 independently
counted packets, with matching content/export results and full unchanged source
hashes. No filtering or framing errors occurred. Existing LLC support remains
1,253 source packet occurrences; this archive correction adds **no capture
coverage**. The same 1,825 limited packets retain **QUALIFIED_LIMITATIONS**:
1,094 TLS reassembly, 729 unsupported EtherType and two unsupported LLC cases.

| Actual measurement | Run 1 | Run 2 |
|---|---:|---:|
| Analysis wall seconds | 149.943262 | 134.649414 |
| Analysis CPU seconds | 61.958341 | 61.276561 |
| Sampled worker-tree peak RSS bytes | 46,419,968 | 46,288,896 |
| Completed output bytes | 2,722,188,288 | 2,722,188,288 |

Full qualification cost: 338.479647 seconds. Unchanged budgets: 512 MiB /14,400
seconds; preflight required 15,271,301,824 bytes with 347,354,669,056 available.
The private reproduction recipe preserves the explicitly larger 12,000-byte
operator disk allowance through the qualification API, alongside same-key worker
commands. Samples can miss brief peaks; no hard quota, cold-cache or 30 GB-scale
claim. Results: `qualification-private/packet-squirrel-real-09/` and
`packet-squirrel-real-preflight-09/`. Source copies match previous hashes; the
original USB after-check remains unavailable. All prior receipts are preserved.

The fresh actual independent comparator also passes at 13be2ac: **591,565 packets /
5,774,468 supported fields /zero mismatches /three full source verifications**,
in 19.151835 seconds with 392,597,504 sampled process-tree RSS bytes. Same fixed
reference configuration and budgets apply. Cached upstream (8 files /109 packets /
1,122 comparisons), generated network (2 /12 /120), rich IGMP (2 /24 /440), and
separate LLC PCAP/PCAPNG (2 /16 /292, all 14 LLC fields per packet) also pass with
zero mismatches and complete hashes. These are fresh exact-candidate results;
no earlier qualification or comparator measurement is substituted.

The genuine public BLE-ARD profile was analyzed twice again at 13be2ac: 71 rows,
all 11 checks pass with exact field/byte provenance, source integrity, checksums,
contract validity, determinism, offline guards and minimized exports. Numeric
clocks remain unresolved; this is neither independent radio decoding nor
owner-private scanner or cross-source calibration. Private receipt:
`qualification-private/public-ble-ard-validation-06/`. All returned bounded actual
finding-support references were separately checked against source-record bytes.
No finding content or compromise/identity truth is published.

Archive precision/uncertainty behavior is established by invented fixtures. The
actual owner files are PCAP, so this run does not establish genuine diagnostic
archive compatibility or calibrated combined-source clocks. The original Tetra
source and genuine clock/network context remain external prerequisites.

Two separate experimental full-capture TLS reassembly investigations exceeded
their unchanged 512 MiB memory budget and stopped. Their FAILED receipts, source
versions and incomplete reconciliation remain preserved; neither supplies a
whole-dataset recoverability conclusion or invalidates this separate engine
qualification. The later run disabled two unused reference-tool statistics after
source/fixture review, but still exceeded the budget. Bounded connection cohorts
are the next justified design; no further decoding support is claimed.

A separate bounded envelope inventory completed with all source hashes and counts
reconciled. It describes guarded literal prefixes for the 729 unknown EtherType
frames; payload/declared-length semantics remain unresolved. No namespace or
EtherType signature establishes a device identity, full protocol support or a
reduction in the loss count. Its detailed aggregate stays private.

## Earlier LLC basic-XID qualification (parser 2.0.8 / oracle 2.0.7)

Clean analysis `db53b859b570f245ba7eba3a57c28f017e531c75` adds bounded,
complete six-byte IEEE 802.3 LLC basic-XID wire observations. Exact declared
length excludes Ethernet padding; raw SAP/control/parameter octets and decoded
flags/window remain source-backed. Unsupported controls, formats, extra data,
reserved bits, group responses and unsupported capability codes retain explicit
losses. This does not establish negotiated capabilities, identity or compromise.

The final comparator at `05959c09b691ef874411c8a70f0d7a8b7d13f918` uses a fixed
local Lua postdissector to copy two one-byte Wireshark field ranges before masked
values hide reserved bits. Its hash is recorded; missing/ambiguous fields and
helper failures cannot pass. This replaces the unsupported `-e @field` syntax
that failed the first CI run on Wireshark 4.2.2. The failed CI result is preserved;
exact final-comparator CI passes Python 3.11/3.14. All **266 local tests** pass
(31 diagnostic +235 lab), with independent runtime/oracle/privacy reviews.
Positive, negative, boundary, malformed, duplicate, omission, raw-bit mutation,
helper-load failure and PCAP/PCAPNG/provenance regressions are synthetic evidence.
AA/AA SAP reference dispatch remains an explicit non-passing oracle limitation.

Two complete real analyses at db53b85 pass every applicable framing/count,
closed-inventory, full before/after source-hash, output-checksum, deterministic
content/export and fixed resource gate on the owner-confirmed complete three-PCAP
set: 297,151,107 bytes /591,565 independently counted packets. **1,253 previously
unsupported packets now yield basic-XID metadata.** Remaining losses: 1,094
`tls_reassembly_required`, 729 `unsupported_ethertype` and two
`unsupported_llc_control` packets. No filtering or framing parse errors occurred.
Result remains **QUALIFIED_LIMITATIONS**; the zero-loss GOAL_PASS gate is unmet.

| Actual measurement | Run 1 | Run 2 |
|---|---:|---:|
| Analysis wall seconds | 119.777475 | 139.016922 |
| Analysis CPU seconds | 60.954581 | 60.323167 |
| Sampled worker-tree peak RSS bytes | 46,346,240 | 46,297,088 |
| Completed output bytes | 2,722,188,288 | 2,722,188,288 |

Full qualification cost: 321.311278 seconds. Budgets remain 512 MiB /14,400 seconds;
preflight required 15,271,301,824 bytes with 352,834,084,864 available. RSS/disk
samples may miss brief peaks; measured gates are not OS quotas. No cold-cache or
30 GB-scale claim. Private results: `qualification-private/packet-squirrel-real-08/`
and `packet-squirrel-real-preflight-08/`, including machine and human reproduction
recipes. Source SSD copies match historical hashes; original USB after-check is
still unavailable. The original two runs and their exact commit were preserved.

The later comparator-only correction leaves all 15 non-oracle runtime/schema
files byte-identical. An explicit, recomputed private reuse proof binds both clean
commits, the original qualification/configuration/inventory hashes, complete
runtime inventory, parser versions and absence of analysis imports of the oracle.
Only the oracle, its tests and documentation differ. These existing analysis runs
and the genuine public BLE two-run receipt are reused on that evidence; the
changed comparator is independently revalidated against actual and fixture data.
No previous failure is relabeled and no unchanged benchmark is repeated.

The actual supported-field comparison at final comparator 05959c0 passes
**591,565 packets /5,774,468 field checks /0 mismatches /3 full source
verifications**, in 18.841946 seconds with 391,831,552 sampled process-tree RSS
bytes, within fixed budgets. Cached upstream, generated network and IGMP profiles
also pass. The original combined finalization failed when its private proof helper
changed during execution, despite all four individual PASS results. That failure
and original helper bytes are preserved. A separately pinned recovery passed after verifying
the saved code/source/configuration/measurement/comparison hashes and fresh full
source hashes. It repeated no decoding or analysis. The recovered aggregate
retains the failed original, exact archived helper bytes and both proof pins.
The separate generated LLC PCAP/PCAPNG profile also passes: two files /16 packets /
292 comparisons /zero mismatches /two full source verifications, with all 14 LLC
field counts equal to 16. It used 0.353400 seconds /188,837,888 sampled process-tree
RSS bytes within the same fixed budgets. Current aggregate receipts and private
HANDOFF bind these distinct outcomes.

All returned bounded actual finding-support references were verified against the
read-only original source-record bytes, preserving explanation/reproduction
mechanics without publishing finding content or establishing interpretation truth.
The genuine BLE-ARD public profile was separately analyzed twice at db53b85:
71 rows, all 11 checks pass, clocks remain unresolved and schema coverage stays
narrow. This establishes neither owner-private scanner compatibility nor genuine
cross-source calibration. The original Tetra source remains unavailable.

The scoped header-only investigation had two preserved unsuccessful attempts:
one failed its inherited lifetime-memory gate before opening evidence; another
ended incompletely without a terminal receipt. A subsequent supervised attempt
completed within its predeclared budgets with all three source hashes unchanged.
It established header scope, not release performance or complete payload support.
No SNAP/BPDU capability was inferred from unverified protocol guesses.

## Earlier timeline/context qualification (2.0.7)

Clean `066161f5c21872e0cebbc8c0afa4eff0747c7e69` fixes accepted-but-ignored source
context aliases, permits exact stacked-VLAN/radio scope matching, and rejects
non-object falsy configurations in both entry points. Generic text/JSONL now
preserves original time spelling/offsets and nanoseconds without the legacy
microsecond round trip. Unsupported precision/representations remain explicit,
bounded and unresolved without arbitrary payload retention. The HoneyTrace v1
contract/schema and finding/association semantics are unchanged.

All **240 local tests** pass (31 diagnostic +209 lab). Thirteen new regressions
exercise actual context/clock application and reversal, alias/default rejection,
QinQ source-backed matching with other VLANs isolated, supported time spellings,
invalid/missing/unsupported times, exact byte provenance/duplicates, contract
validity and offline/privacy behavior. These are invented fixtures; they do not
establish genuine cross-source clock calibration. Independent runtime/contract
reviews and Python 3.11/3.14 implementation CI pass.

Two fresh actual analyses at 066161f pass every applicable real-profile gate on
the same owner-confirmed 3 PCAPs /297,151,107 bytes /591,565 independently counted
packets: full before/after hashes, closed inventory, complete checksums,
deterministic logical/export content, clean pinned code and fixed resource gates.
No filtering or framing parse errors; 1,094 TLS-reassembly and 1,984 unsupported
Ethernet packets retain **QUALIFIED_LIMITATIONS**, not GOAL_PASS.

| Actual measurement | Run 1 | Run 2 |
|---|---:|---:|
| Analysis wall seconds | 126.321769 | 130.058277 |
| Analysis CPU seconds | 59.052119 | 58.934712 |
| Sampled worker-tree peak RSS bytes | 46,325,760 | 46,276,608 |
| Completed output bytes | 2,717,953,303 | 2,717,953,303 |

Full cost: 308.809856 seconds. Budgets remain 512 MiB /14,400 seconds; disk preflight
requires 15,271,301,824 bytes with 358,319,919,104 available. Samples can miss brief
peaks; no OS quota, cold-cache or 30 GB-scale performance claim. Private receipts
and exact reproduction: `qualification-private/packet-squirrel-real-preflight-07/`
and `qualification-private/packet-squirrel-real-07/`. Supplied copies match earlier
source hashes and are unchanged before/after; the original USB after-check remains
unavailable. The intermediate configuration-only 80218d9 case in real-06 is kept
separately and does not certify the later text-time change.

The final candidate also passes a fresh two-run reconciliation of the pinned
genuine public BLE export: 71 rows/columns/exact byte references, source integrity,
checksums/contract, determinism, unresolved clocks, offline guards and minimization.
Private receipt: `qualification-private/public-ble-ard-validation-04/`. Existing
profile/time/code/field limitations remain; this is not independent BLE decoding,
owner-private BLE or genuine cross-source calibration. Actual finding support and
explanation retrieval pass privately without publishing content/counts or claiming
calibrated compromise/identity truth. Current aggregate example receipts remain
separate from the preserved historical results below.

The final actual independent oracle at 066161f also passes: 591,565 packets /
5,756,926 supported fields /0 mismatches /3 complete source verifications,
16.119498 seconds and 289,415,168 sampled process-tree RSS bytes. Same fixed
budgets, offline reference configuration and partial-decoding scope apply.
Private receipt:
`qualification-private/packet-squirrel-oracle-timeline-final-20261021T234315Z/`.
Exact-hash cached upstream references (8 files /109 packets /1,122 comparisons),
generated network (2 files /12 packets /120 comparisons) and rich IGMP PCAP/PCAPNG
(2 files /24 packets /440 comparisons) also pass with zero mismatches/full hashes.
The current public aggregates bind to final 066161f, not the intermediate 80218d9.
The separate supplementary header-scope probe remains failed on its parent-memory
gate; the later tiny no-evidence diagnostic establishes only a possible inherited
high-water mechanism, not the unrecorded original cause or a retrospective PASS.
It is not substituted for these completed actual qualification/oracle gates.

## Earlier actual qualification after IGMP integration (2.0.6)

Clean `0ab0b7cd3818afbb8498aab914e0b7bbfd3df852` adds bounded IPv4 IGMP wire
observations, source-filter timeline lookup and independent metadata comparisons.
All **227 local tests** passed (31 diagnostic +196 lab), including 14 new parser/
integration tests and 14 oracle tests. These cover positive/negative/boundary
layouts, ordered duplicates, exact timers, truncation/family/checksum rejection,
global budgets, unsupported extensions, provenance, offline guards, minimized
identifiers and indexed source-only lookup. Independent runtime/privacy/contract
reviews passed. Python 3.11/3.14 implementation CI also passed.

Two complete analyses of the unchanged owner-confirmed three-PCAP set
(297,151,107 bytes /591,565 independent packets) passed every applicable real
gate: count/inventory, full before/after hashes, output checksums, deterministic
logical/minimized-export content, clean pinned code and fixed resource limits.
All 19,699 previously unsupported protocol-2 packets now decode as supported
IGMP with valid message checksums. Remaining losses: 1,094 messages requiring
TLS reassembly and 1,984 unsupported Ethernet packets. No filtering or framing
parse errors occurred. Result remains **QUALIFIED_LIMITATIONS**, never GOAL_PASS.

| Actual measurement | Run 1 | Run 2 |
|---|---:|---:|
| Analysis wall seconds | 129.157083 | 128.221533 |
| Analysis CPU seconds | 58.981012 | 58.545233 |
| Sampled worker-tree peak RSS bytes | 46,436,352 | 46,116,864 |
| Completed output bytes | 2,717,953,303 | 2,717,953,303 |

Full qualification wall: 309.158638 seconds. Budgets remained 512 MiB /14,400
seconds; SSD preflight required 15,271,301,824 bytes, with 369,220,726,784 free.
Resource samples are measured gates, not quotas; no cold-cache or 30 GB-scale
performance is claimed. Private preflight/results/exact reproduction:
`qualification-private/packet-squirrel-real-preflight-05/` and
`qualification-private/packet-squirrel-real-05/`. Earlier receipts remain intact.
Original USB post-verification remains unavailable; supplied copies match prior
source hashes and have full before/after verification at this revision.

Independent actual comparison passed all 591,565 packets /5,756,926 supported
fields with zero mismatches and three full source verifications: 15.968724
seconds /289,144,832 sampled process-tree RSS bytes. It compares checksum, wire
version/type, exact query codes/timers and ordered group/source boundaries;
quoted inner IGMP cannot establish eligibility. Unsupported content and messages
requiring reassembly remain outside coverage. Private oracle:
`qualification-private/packet-squirrel-oracle-igmp-final-20261021T231651Z/`.
Actual finding explanation/support retrieval also passed privately; no finding
contents or counts, calibrated compromise or identity conclusions are published.

The same candidate passed cached exact-hash independent references: 8 upstream
files /109 packets /1,122 comparisons; 2 generated network files /12 packets /
120 comparisons; and a new rich IGMP PCAP/PCAPNG corpus /24 packets /440
comparisons. Every profile has zero mismatches and complete source verification.
The rich corpus covers all six group-record types and exact 128-record/256-source
budgets. Generation and source hashes distinguish synthetic evidence from genuine
captures; no synthetic result substitutes for actual qualification.

The genuine public BLE CSV was also rechecked twice at this candidate: all 71
rows/columns/exact-byte references, source integrity, checksums/contract, unresolved
timestamps, determinism, offline guards and minimization passed. Private receipt:
`qualification-private/public-ble-ard-validation-02/`. Compatibility remains limited
to the already documented profile, without independent BLE decoding or owner-private
BLE/cross-source calibration claims. The original Tetra source remains needed.
Current allowlisted aggregates: `examples/actual-capture-validation.json` and
`examples/public-ble-validation.json`; earlier measurements below are historical.

## Earlier actual qualification after native BLE integration (2.0.5)

Clean `58217cf2852ba940dd9f7e3e99eaa1e5188f8b58` was qualified with two fresh
analyses of the unchanged owner-confirmed three-PCAP dataset: 297,151,107 bytes /
591,565 independently counted packets. All applicable real-profile gates passed,
including closed inventory, full before/after source hashes, complete case
checksums, logical/minimized-export determinism, exact clean code and unchanged
resource budgets. Result: QUALIFIED_LIMITATIONS, not GOAL_PASS. No packet filtering
or framing parse errors occurred; the existing decoding losses remain explicit.

Wall times: 107.445245 /107.367624 seconds; CPU: 55.800290 /55.440141 seconds.
Full cost: 264.512986 seconds. Maximum sampled worker-tree RSS: 46,333,952 bytes;
completed output: 2,552,455,115 bytes/run. Fixed limits remained 512 MiB /14,400
seconds; the conservative disk preflight required 15,271,301,824 bytes with
374,802,022,400 available. No cold-cache or original 30 GB-scale claim is made.

The final actual supported-field oracle at the same clean revision passed all
591,565 packets /5,486,258 fields with zero mismatches and three complete matching
source hashes. It took 14.862941 seconds and peaked at 289,026,048 sampled
process-tree RSS bytes, within the original budgets. All 22,777 limited packets
remain explicit. Actual finding support/explanation mechanics were rechecked
privately; no compromise/identity calibration or finding-content claim follows.

Private evidence: `qualification-private/packet-squirrel-real-04/`,
`qualification-private/packet-squirrel-real-preflight-04/` and
`qualification-private/packet-squirrel-oracle-ble-ard-final-20261021T223830Z/`.
Earlier cases are preserved. Original USB after-verification remains unavailable;
supplied SSD copies have full unchanged hashes and match the prior inputs.

Current pinned upstream recheck: 8 files /109 packets /1,122 comparisons, zero
mismatches and 8 full-source verifications. Temporary reference paths had become
unavailable; upstream inputs were recovered from preserved artifacts with exact
expected hashes. Historical synthetic files were missing, so a newly generated
committed-fixture PCAP/PCAPNG corpus was independently checked: 2 files /12 packets /
120 comparisons, zero mismatches and 2 full-source verifications. The private
generator/source hashes identify this as new synthetic evidence. The interrupted
lookup attempt remains recorded; its successful actual comparison was neither
repeated nor relabeled. Same fixed budgets and production helper were used.
Sanitized current aggregate: `examples/actual-capture-validation.json`.

## Native BLE-ARD public-export validation (2.0.5)

Clean implementation `58217cf2852ba940dd9f7e3e99eaa1e5188f8b58` adds only the
inspected `ble-ard.parallel-csv/1` native CSV layout. All 199 local tests passed
(31 diagnostic +168 lab), including eight new tests for exact-header dispatch,
row recovery/bounds, unresolved time, uninterpreted codes, preserved duplicates,
byte provenance and offline/minimized exports. Independent source-semantics and
publication reviews found no issues. Existing exchange CSV remains separate.

Unlike the invented exchange fixtures, this reference is one genuine public raw
collector file from [BLE-ARD at 49c92bb](https://github.com/hujon/BLE-ARD/tree/49c92bb31241f726db020493679b1cbbe6740937).
The publisher documents physical-device collection and separates raw occurrences
from deduplicated/filtered data; the selected input is in the raw stage. Matching
headers alone do not authenticate any future input's origin.

The 3,194-byte file contains 71 records. Two complete offline analyses reconciled
every source column and exact row-byte location/hash, with unchanged SHA-256 and
pinned Git blob identity, valid output checksums/contract and matching logical/
minimized-export results. The 512 MiB /60-second worker limits and predeclared
small-output disk allowance passed. Wall times were 0.453522 /0.302541 seconds.
Private machine/human/reproduction receipts:
`qualification-private/public-ble-ard-validation-01/`. The inspected source and
origin/hash receipts remain in `qualification-private/public-ble-ard-reference/`.
Sanitized aggregate evidence: `examples/public-ble-validation.json`.

All numeric timestamps remain unresolved: the older export establishes neither
epoch nor units. Address/advertising/channel codes remain uninterpreted, address
type is unknown, and no associations or physical identities are invented. This
sample has no names; nonempty-name privacy handling is validated synthetically.
Services/manufacturer payload, transmit power and individual scanner context are
absent from the format. Headerless controller and other layouts are unsupported.
CSV column reconciliation is not independent BLE/HCI decoding, owner-private BLE
validation or combined-source clock calibration. The original Tetra database is
still needed to recheck the earlier genuine subset against the current parser.

## Earlier schema-dispatch correction and qualification (2.0.4)

Final clean implementation `1a027c9b00fe4eaf50a3090ddaf93e0eb94a9589` passed all
**191 local tests** (31 diagnostic +160 lab) and independent code review. Four
additional regressions cover generic JSONL/NDJSON first-row numeric errors,
preserved subsequent radio fields/provenance, strict structural/resource checks,
and unchanged nonradio fallback. Schema detection now uses bounded structural
validation with inert numeric placeholders and returns only a Boolean; no
placeholder can become an observation. Actual rows always use strict numeric
parsing. Numeric overflow/underflow can no longer hide an explicit radio schema
and silently route valid later observations to empty generic telemetry records.

Two fresh actual analyses at 1a027c9 returned **QUALIFIED_LIMITATIONS**. All
applicable real-profile gates passed on the unchanged owner-confirmed three-PCAP
dataset: 297,151,107 bytes /591,565 independently counted packets. Source integrity,
closed inventory, complete output checksums, matching logical/export digests,
clean implementation provenance and original budgets passed. The synthetic-only
fixture-count flag remains inapplicable.

| Actual measurement | Run 1 | Run 2 |
|---|---:|---:|
| Analysis seconds | 106.468044 | 134.032863 |
| Analysis CPU seconds | 54.536336 | 55.122355 |
| Completed output bytes | 2,552,454,611 | 2,552,454,611 |
| Sampled worker-tree peak RSS bytes | 46,534,656 | 46,497,792 |

Full qualification wall: 293.434428 seconds. Fixed budgets remained 512 MiB /
14,400 seconds; additional SSD preflight required 15,271,301,824 bytes with
381,180,608,512 available. No filtering or framing parse errors occurred. The same
explicit decoding losses remain, so this is not GOAL_PASS or a compromise verdict.
No 30 GB-scale or cold-cache result is claimed. Supplied copies retain complete
before/after hashes and match earlier qualified inputs; original USB after-check
remains unavailable.

Current private results: `qualification-private/packet-squirrel-real-preflight-03/`
and `qualification-private/packet-squirrel-real-03/`. The immutable execution
checkout is `/tmp/sentinel-engine-qualified-routing`. Prior receipts are preserved,
rather than relabeled as validation of this additional shared-parser change.

Final independent comparison at the same 1a027c9: **591,565 packets /5,486,258
supported-field comparisons /zero mismatches /3 complete source verifications**.
It completed in 14.202889 seconds with 289,751,040-byte sampled process-tree peak,
within the original 512 MiB/14,400-second limits. The 22,777 limited packets remain
explicit; reference agreement does not remove their coverage limitations. Fresh
pinned upstream comparison passed 109 packets /1,122 fields /8 source verifications;
generated PCAP/PCAPNG passed 12 packets /120 fields /2 source verifications.
Both had zero mismatches. Reference configuration is unchanged: offline name
resolution disabled, TCP sequence suppression/reassembly disabled, bounded pipes.

Private exact commands, configuration, hashes and measurements:
`qualification-private/packet-squirrel-oracle-routing-final-20261021T110231Z/`.
The current sanitized receipt is `examples/actual-capture-validation.json`.

## Earlier numeric integrity correction and qualification at 86e066d

Clean implementation `86e066d1f791a895215629cbf6de484247fe0158` (suite 2.0.4,
iOS parser 0.2.1, oracle 2.0.4) passed all **187 local tests**: 31 diagnostic and
156 lab. Independent code review found no remaining blocker in this increment.
The 14 added tests cover actual ingestion behavior and provenance for fractional
signals, rejected identifier floats, numeric overflow/underflow, subsequent valid
rows/sources, unsupported SQLite values and malformed diagnostic archives.

Identifiers/channel/frequency never truncate floating-point values into integers.
Finite fractional RSSI/tx_power remain fractional; ordinary IEEE 754 precision
is explicit, with original source bytes/logical locations retained. JSON numeric
overflow and nonzero underflow produce fixed errors. Invalid envelopes have an
exact source-byte error hash; oversized envelopes are streamed for hashing without
whole-file buffering. Unsupported SQLite logical values stop that source with a
fixed partial-state error and stopping table/rowid; no row hash is fabricated.
Valid later input sources continue. Genuine vendor compatibility remains unverified.

Diagnostic JSON/IPS numeric failures now remain malformed records while subsequent
valid records/members survive. The combined analysis correctly reads `error_code`
from child events instead of emitting a null error code that invalidated the
exchange. Nonfinite plist timestamps have no invented UTC value; the combined
timeline uses existing `unresolved` status and a controlled unsupported reason.
The unchanged v1 contract validates the resulting complete export.

Because shared parsing/integration code changed, **two fresh actual-data analyses**
were run against clean 86e066d. Historical fc0439f measurements were preserved,
rather than treated as validation of the new modules. Current result:
**QUALIFIED_LIMITATIONS**, with all applicable real-profile checks true and the
synthetic-only fixture-count check inapplicable. Three unchanged owner-confirmed
PCAPs total 297,151,107 bytes /591,565 independently counted packets. Both full
source hash passes, complete inventory, output checksums, matching logical/export
digests, clean code provenance and fixed resource gates passed.

| Actual measurement | Run 1 | Run 2 |
|---|---:|---:|
| Analysis seconds | 106.380543 | 185.936465 |
| Analysis CPU seconds | 54.333114 | 56.309801 |
| Completed output bytes | 2,552,454,611 | 2,552,454,611 |
| Sampled worker-tree peak RSS bytes | 46,530,560 | 46,411,776 |

Full qualification wall time: 342.278748 seconds. Budgets remained 512 MiB and
14,400 seconds per worker/decoder, fixed before execution. The additional SSD gate
was 15,271,301,824 required bytes /388,502,212,608 available bytes. The wall-time
spread is retained; caches were not flushed, and sampling/disk measurement limits
remain as previously documented. No 30 GB performance claim is made.

There were no filtered packets or framing parse errors. The unchanged loss counts
are 1,094 `tls_reassembly_required`, 1,984 `unsupported_ethertype`, and 19,699
`unsupported_transport`. These limitations remain unexamined content rather than
compromise findings, and prevent GOAL_PASS. The supplied sources match the earlier
qualified inputs and retain full before/after hashes. Original USB post-verification
remains unavailable; only its historical pre-run comparison is established.

Current private receipts: `qualification-private/packet-squirrel-real-preflight-02/`
and `qualification-private/packet-squirrel-real-02/`, including exact commands,
versions/configuration, machine/human results, case key and both private indexes.
The immutable code-only checkout is `/tmp/sentinel-engine-qualified-numbers`.
The final independent decoder recheck is pinned to this same implementation.
It matched all 591,565 actual packets /5,486,258 supported-field comparisons,
with zero mismatches and three complete source-hash verifications matching both
actual qualifications. The 14.457170-second run peaked at 289,447,936 sampled
process-tree RSS bytes; the original 512 MiB/14,400-second limits passed.
The 22,777 limited packets remain explicit. Rechecked pinned upstream corpus:
8 files /109 packets /1,122 comparisons /zero mismatches /8 source verifications.
Generated PCAP/PCAPNG: 2 files /12 packets /120 comparisons /zero mismatches /
2 source verifications. Configuration remains offline, with sequence suppression
and TCP/IP reassembly disabled and bounded local pipes.

Private reference evidence:
`qualification-private/packet-squirrel-oracle-numeric-final-20261021T104711Z/`.
Updated sanitized aggregate evidence: `examples/actual-capture-validation.json`.

## Historical actual Packet Squirrel qualification at fc0439f

The owner corrected the initial approximately 30 GB estimate and confirmed the
complete actual `loot` dataset: **3 PCAP files /297,151,107 bytes /591,565 packets**.
Two complete analyses ran on clean integrated revision
`fc0439f128afc679ea1d8cbe3c4bb34374a09170` (suite 2.0.3). Its tree matches
PR #6 head `73f52c574e46d92af09043208f98bb2035df099c`, which passed all 163
tests on Python 3.11 and 3.14. This validates the
owner's supplied actual dataset; it does not establish performance at 30 GB.

Result: **QUALIFIED_LIMITATIONS**. All applicable real-profile gates passed:
independent capinfos counts per file and in total, complete unchanged inventory,
full staging-source hashes before and after processing, output checksum coverage,
matching deterministic logical content and minimized exports, matching clean
implementation bytes, and fixed time/memory budgets. The synthetic fixture-count
flag is inapplicable to this real profile. There were no filtered packets or
framing parse errors. The subsequent supported-field comparison against the
independent decoder also passed; its separate revision and scope follow below.

| Actual measurement | Run 1 | Run 2 |
|---|---:|---:|
| Analysis seconds | 122.893611 | 126.308628 |
| Analysis CPU seconds | 54.239615 | 55.618703 |
| Completed output bytes | 2,552,454,611 | 2,552,454,611 |
| Sampled worker-tree peak RSS bytes | 46,411,776 | 46,407,680 |

Full qualification wall time was 299.096214 seconds. Resource budgets were
declared before execution and remained 512 MiB RSS and 14,400 seconds per
worker/decoder. The additional conservative SSD preflight required 15,271,301,824
bytes, with 394,007,875,584 bytes free. The runner's internal estimate was lower;
the additional preflight was also passed and was not relaxed retrospectively.
Sampling can miss brief peaks; the private report records measurement scope,
versions, wall/CPU accounting and disk allocation limits. No cold-cache or
30 GB-scale inference is made.

Decoding loss occurrences were 1,094 `tls_reassembly_required`, 1,984
`unsupported_ethertype` and 19,699 `unsupported_transport`. They remain visible;
no reassembly, decryption or unsupported-content coverage is inferred. These
limitations prevent GOAL_PASS even though framing/integrity/resource checks pass.
This result is not a calibrated compromise, device-identity or clean-health verdict.
All actual finding support queries retained source locations and explanation
metadata with nonempty bounded samples; this verifies retrieval mechanics only.

The USB originals matched the staged sources before analysis. The original USB
mount was unavailable after processing, so post-run integrity is established for
the supplied SSD copies only; no post-run original-media verification is claimed.

Private reproduction evidence remains under the actual checkout:

- `qualification-private/packet-squirrel-real-preflight-01/preflight.json`:
  independent counts and conservative SSD preflight.
- `qualification-private/packet-squirrel-real-01/qualification.json` and
  `qualification.md`: full machine/human gate and measurement results.
- `qualification-private/packet-squirrel-real-01/reproduce-private.json`:
  exact local source order, paths, configuration, identity assertion and budgets.

The code-only execution checkout `/tmp/sentinel-engine-qualified-07d2a53` remains
immutable at fc0439f. Actual source/output stayed on SSD. Changing capture
processing would require final qualification against that new implementation.

## Historical independent comparison at 8b0c45d (oracle 2.0.4)

Clean comparator commit `8b0c45d81f0033a0866c76765f565aa2045ec2bf` passed all
173 local tests (27 diagnostic +146 lab), including 31 focused oracle tests and
an independent code review. Runtime parser remains 2.0.3. The 14 other analysis/
helper modules match fc0439f byte for byte; private reuse evidence preserves their
hashes. The actual analysis measurements remain pinned to fc0439f, separately
from the new comparator. A new whole-case code inventory would differ because
it inventories oracle.py too; no repeated full benchmark was needed for this
validation-only change.

Local TShark 4.6.4 compared all **591,565 actual packets /5,486,258 supported
fields**, with **zero mismatches** and **3 complete before/after source
verifications** matching the qualified inputs. It completed in 14.206669 seconds
with 289,054,720-byte peak sampled process-tree RSS, including relevant workers.
The predeclared 512 MiB/14,400-second limits passed. Its existing per-source
decoder timeout remains 60 seconds. The oracle explicitly records 22,777 limited
packets; PASS covers its documented subset and does not replace QUALIFIED_LIMITATIONS
with GOAL_PASS.

Pinned upstream recheck: 8 files /109 packets /1,122 comparisons /zero mismatches /
8 source verifications. Rich generated PCAP+PCAPNG recheck: 2 files /12 packets /
120 comparisons /zero mismatches /2 source verifications. Increased counts reflect
new independent outer-transport checks rather than new source evidence.

The reference disables TCP sequence analysis as well as TCP/IP reassembly, so
retransmitted complete handshakes are decoded as separate occurrences. Independent
`frame.protocols` establishes the outer network/transport; quoted inner addresses,
flags, DNS, NDP and TLS are excluded from that scope. Symmetric checks detect
missing supported endpoints, ports, flags and SNI. Synthetic mutations verify
omission and wrong-family detection. Flattened fields can make compound hellos
ambiguous; mismatches remain reviewable rather than waived.

The production helper streams both decoder descriptors through bounded local
pipes (1 MiB chunks); Python retains the original read-only input and private
output descriptors. No host security setting changed. Timeout/cancellation tests
verify thread cleanup; failure reasons contain no raw decoder/private error text.
Earlier descriptor failures and 49 provisional comparison mismatches remain
private failed receipts, superseded by corrected comparisons rather than relabeled.

Full comparison, version/configuration, metrics and exact reproduction commands:
`qualification-private/packet-squirrel-oracle-final-20261021T102538Z/`.
The code-only checkout is `/tmp/sentinel-oracle-qualified-8b0c45d`. Aggregate
shareable machine evidence is `examples/actual-capture-validation.json`; original
source hashes/names, keys, clocks, findings and content/export digests stay private.

Genuine Tetra validation remains historical: 40 observations/17 mapping statements,
not a current candidate recheck. The original database path remains missing, and
representative genuine BLE exports are unavailable. Synthetic adapters and
deterministic execution on one network capture do not validate genuine vendor
schemas, combined-source clock calibration or the accuracy of rule interpretations.

## Historical baseline and initial implementation

Baseline commit: `7e71cdf5b82e4243def675a343876c46a030d9ae`. Fresh private personal
clone on 2026-10-21; clean main, PRs 1–3 confirmed merged. Baseline command
`python3 tools/evidence_lab/run_tests.py`: 27 diagnostic +21 lab =48 passing tests.
No pre-existing offline failures. UI/base44 runtime tests were not run or changed.

Historical candidate suite: 27 diagnostic +85 lab =112 passing tests on Linux x86_64,
Python 3.14.4, SQLite as recorded in machine qualification reports. Tests cover
framing, malformed/hostile input, original times, duplicates, provenance,
read-only SQLite/WAL rejection, correlations/lease boundaries/conflicts/context
isolation, all four rule positive/negative/benign/boundary/insufficient cases,
privacy/offline defaults, contract schema/determinism, resource/count/timeout/
integrity/cancellation/space/checksum failures. Independent local tshark and
capinfos 4.6.4 were present; relevant independent tests ran (not skipped).
An independent JSON Schema validator (local jsonschema 4.19.2) accepted produced
exchanges. CI additionally checks Python 3.11 and 3.14, installs tshark and pinned
jsonschema 4.26.0 for development validation. No runtime pip packages are needed.

## Historical external upstream corpus

Source: `wireshark/wireshark` commit
`e099bf71c44046ef1ba39c6d0d827928a840664b`, `test/captures/`:
dhcp.pcap, dhcp.pcapng, dhcp-nanosecond.pcapng, dhcp_big_endian.pcapng,
many_interfaces.pcapng.1, .2, .3 and comments.pcapng. Eight files /34,964 bytes /
109 packets /790 compared framing, time and supported header/application fields:
**zero mismatches**. Two packets had explicitly recorded decoding limitations.
The corpus was acquired for development oracle checking, kept outside Git, and
was never treated as the owner's Packet Squirrel evidence. Do not use upstream
fixtures to imply real-device coverage.

`oracle.py` uses tshark offline with `-n`, TCP/IP reassembly disabled and explicit
field output. stdin passes a read-only input descriptor: this host's tshark
AppArmor profile disallows home paths. No host security settings were changed.
An initial direct-path oracle attempt failed on that restriction; the independent
comparison completed using stdin, with no bypass of the profile. The first
failed output directories remain private. Corpus field values and raw packets
are not committed; the sanitized comparison includes hashes, counts and mismatch
indices only. Reproduce using your locally obtained pinned upstream corpus:

```sh
python3 tools/evidence_lab/oracle.py /absolute/corpus/dhcp.pcap \
 /absolute/corpus/dhcp.pcapng /absolute/corpus/dhcp-nanosecond.pcapng \
 /absolute/corpus/dhcp_big_endian.pcapng /absolute/corpus/many_interfaces.pcapng.1 \
 /absolute/corpus/many_interfaces.pcapng.2 /absolute/corpus/many_interfaces.pcapng.3 \
 /absolute/corpus/comments.pcapng --output /absolute/new-oracle-output
```

## Historical actual Tetra subset

The nearby user workspace recon database was previously inspected read-only and processed
locally: 40 observations, 17 recon client mapping statements, zero parse errors;
full source hash unchanged. aps/clients supported subset only; timestamps lack
zones and remain unresolved. No association-frame events or timezone were
invented. No WAL/SHM/journal present. No row values, source hashes, identifiers,
private filenames or derived exchange were copied into Git. Additional vendor
schemas and representative BLE exports remain unverified. Synthetic exchange
schemas are documented separately and never called verified vendor exports.

## Historical bounded performance demonstration (not real-data qualification)

Development measurements for deterministic high-cardinality fixtures:

| Packets / distinct conversations | Exact input bytes | Analysis seconds (two runs) | Max sampled worker RSS | Output bytes per run | Full qualification wall |
|---|---:|---|---:|---:|---:|
| 10,000 | 700,024 | 0.977 /0.909 | 43,446,272 | 33,634,826 | 2.778 s |
| 100,000 | 7,000,024 | 24.836 /8.335 | 46,002,176 | 339,855,087 | 40.379 s |

Both used independent capinfos counts, two clean subprocesses, matching semantic
and minimized export digests, unchanged hashes, predeclared 512 MiB /4 h limits.
No cache flushing; the time spread is retained. Input/output amplification is
large for tiny packets; the actual free-space preflight uses independent counts.
The measurements are not a projected benchmark and do not qualify 30 GB. These
initial development reports record dirty-tree state and exact module hashes;
the committed implementation is qualified again before merge.

Streaming framing tracemalloc checks at 1,000 vs20,000 packets measured 136,050
vs134,210 peak Python allocation bytes. This measures parser Python allocation,
not total RSS, SQLite memory or arbitrary protocol distributions. The complete
100,000-conversation RSS test covers the disk-backed analysis pipeline separately.

```sh
python3 tools/evidence_lab/qualify.py generate /absolute/cardinality.pcap \
 --packets 100000 --pattern high-cardinality
python3 tools/evidence_lab/qualify.py run /absolute/cardinality.pcap \
 --profile synthetic --expected-packets 100000 \
 --max-rss-mib 512 --timeout-seconds 14400 --output /absolute/new-qualification
```

The generator prechecks storage for input and estimated two-run expansion. It
creates real bytes, no sparse padding. Test data stay outside Git. Resource
metric scope/limitations and the exact real dataset command are in GOAL.md.

## Historical external gates before actual-data delivery

At this historical checkpoint, the actual Packet Squirrel dataset was
BLOCKED_EXTERNAL (location). The owner's later correction and actual run are
documented above; the following requirements retain their original scope.
Representative BLE exports: BLOCKED_EXTERNAL (format compatibility). Other Tetra
schemas and real multiple iPhone archives: unverified. No synthetic result,
upstream sample, successful import or passing test count closes these gates.
HoneyTrace source conventions were inspected; live contract consumption remains
unimplemented and unclaimed. No HoneyTrace runtime/deployment was touched.

## Historical committed implementation qualification

Clean commit `f6debe284f45f8e9210cd343adfdbdda2c37c27f` passed all 111
local tests and a fresh 100,000-conversation two-run qualification:
8.850 /8.576 s analysis, 24.606 s full cost, 46,100,480 bytes maximum sampled
worker RSS, 339,858,558 output bytes per run. Both capinfos counts, all source
hashes, per-file accounting, semantic/export digests and fixed resource gates
passed. At that time the actual dataset goal remained BLOCKED_EXTERNAL.

`examples/validation-summary.json` contains the sanitized synthetic measurements,
module hashes, tool/host information and upstream comparisons. Private recipes,
raw evidence and real Tetra derived outputs are excluded. Subsequent documentation
commits do not change these measured implementation bytes; CI and local regressions
still run against the exact proposed head. The recon subset was also reprocessed
with the committed implementation and verified unchanged (same 40 observations,
17 statements, zero parse errors); no private identifiers/hashes were committed.

## Historical resource-bound refinement

Clean commit `51e7ca609a0d20a35f66787a22274655448f894d` adds a regression
covering 1,200 distinct link types and keeps report summary groups bounded at
1,024 while retaining complete counts in SQLite. All 112 tests pass. Its fresh
100,000-conversation qualification passed both workers and independent counts:
24.534 /8.507 s analysis, 40.183 s full cost, maximum sampled worker RSS
46,202,880 bytes, 339,858,972 output bytes/run. The higher first-run wall time
is preserved; CPU times were 7.345 /7.145 s. All fixed gates/digests/hashes pass.
The sanitized summary now records this final code revision, not the earlier
measurement. Later commits change documentation/measurement receipts only.

## Historical repeated-observation audit after PR #4

The e152283 baseline passes 112 tests but performs pairwise conflict work even
when all ARP statements agree. A synthetic SQL probe at 1,000 statements measured
12,009,000 VM steps; 4,000 hit its predeclared 20-million-step interruption cap.
Duplicate-provenance exports also performed an unindexed lookup per packet.
These findings invalidate any inference that the earlier high-cardinality TCP
fixture proves acceptable scaling for repeated address statements.

The 2.0.1 correction uses a disk-backed active-interval sweep with indexed MAC
ranges, point/exclusive-end expiry, and the existing output-pair cap. Every
association occurrence remains intact. Candidate pairs are sorted by evidence IDs
before publishing; traceability and overlap semantics are unchanged. Duplicate
and reverse-conflict provenance queries are indexed. No source evidence or
HoneyTrace runtime is modified.

The corrected synthetic SQL probes measured 113,000 /458,000 /1,838,000 approximate
VM steps at 1k/4k/16k statements, taking 0.004 /0.016 /0.064 seconds locally. These
measure the conflict query on generated rows, not end-to-end packet performance.
The suite then passed 119 tests, including a small independent mathematical overlap
oracle, point/lease boundaries, distinct network scopes, unknown times, repeated
leases, duplicate provenance, reverse references and conflict-cap failure.

At that checkpoint real Packet Squirrel qualification remained BLOCKED_EXTERNAL: no actual capture
location or mounted capture media was available on this continuation. Existing
synthetic fixtures and upstream examples remain separate from that gate.


Clean 2.0.1 implementation 3e38141 passed an end-to-end synthetic fixture with
10,000 packets and associations, including 1,999 duplicate records and 8,000
same-MAC overlapping leases across explicitly shared fixture network context.
Two workers took 1.983 /1.896 s (1.538 /1.529 s CPU); full qualification 5.497 s;
maximum sampled worker RSS 47,824,896 bytes; 83,946,433 output bytes/run. Both
independent per-file counts, pre/post source hashes, content/export digests and
predeclared gates passed. No conflicts or parse errors. These rich observations
have higher output amplification than the earlier TCP fixture; the free-space
estimate is not a disk quota or a guarantee for every metadata distribution.
Scoped machine evidence is in examples/repeated-mapping-validation.json. The
actual Packet Squirrel dataset and representative BLE export were then absent.

## Historical human explanations and whole-file oracle integrity (2.0.2)

The human Markdown report now streams each finding's rule/version, explanation,
confidence/severity semantics, UTC support range, minimized metrics, evidence
selectors, benign alternatives and limitations alongside rule coverage/reasons/
configuration. It does not equate a lack of findings with a clean device. Tests
cover all four rules, preserved pseudonyms, deterministic output and insufficient
coverage. Full findings are no longer available only in the machine exchange.

Oracle count mismatches formerly broke comparison early, potentially publishing
a partial parser digest under a full-file SHA field. The corrected oracle hashes
the entire source first, accounts for all frames/reference lines, verifies a full
second read and source metadata, and saves failed/cancelled reports without raw
decoded fields. A capped mismatch-detail list now has an uncapped total count;
oversized rows and extra columns fail explicitly. Outputs inside Git are rejected.

All 131 local tests passed (27 diagnostic +104 lab). Actual local tshark rechecking
the same 8 pinned upstream files still agrees on 109 frames /790 compared fields,
with zero mismatches and 8 complete matching before/after source verifications.
Failure-path tests use explicit synthetic decoder stubs; they are not presented
as independent real-decoder coverage. Actual Packet Squirrel/BLE gates were then open.

## Historical continued integrity and bounded reproduction (2.0.3)

The intended Sentinel-Forensics workspace was established without altering the
previous clone or its 217 private artifacts. ef97601 remained necessary against
main a37100e and was retained in PR #6. Its 131-test baseline passed locally and
on both CI interpreters. New implementation and regressions are in clean commit
`07d2a53401cba7c20ebf1e6e529333431f58a7c1` (parent 98b877a).

The integrated local full suite passed 162 tests (27 diagnostic +135 lab), with no
skips. The subsequent segment-inventory regression also passed; affected
qualification/revision suites passed 25+7 tests. Final exact-head CI executes
all 163 tests. Documentation-only measurement commits do not rerun expensive
benchmarks; private HANDOFF records the final delivered check state.

New fixed-step regressions verify 16k chronological/common-identifier timeline
lookups, rare late identifiers, support selection across mixed destination ports,
and content-aware duplicate lookups. Small results stop through ordered indexes.
A common-identifier LIMIT 10 probe uses about 300 SQLite VM steps. Resource tests
fail at their declared caps rather than relaxing them. Added index tables occupy
disk and require new analyses for those bounds; old cases remain readable.

Independent comparisons now include source packet sequence, low eight TCP flag
bits, VLAN IDs, ARP sender IP/MAC, valid NDP mappings, DHCP op/message type/fixed
BOOTP chaddr/lease, DNS A/AAAA address TTLs and existing endpoint/name/SNI fields.
The same 8 pinned upstream sources pass 109 frames /1,017 comparisons with zero
mismatches and 8 complete source verifications. Rich wholly synthetic PCAP+PCAPNG
fixtures pass 12 frames /110 checks, supplying the NDP/VLAN/AAAA coverage absent
from the upstream set. Mixed 802.1Q/802.1ad IDs are compared as an unordered
multiset; tag order is not independently validated. Omission/corruption tests
confirm that silently missing supported observations do not become PASS.

The independent decoder could not read a source descriptor from the previous
home directory in this session. That explicit failed attempt was preserved;
already-pinned public fixtures were copied into private /tmp with matching hashes,
then compared without host security changes or downloading new material. Decoder
output exposed duplicate dhcp.hw.mac_addr occurrences from option 61; comparison
now selects fixed BOOTP chaddr explicitly and tests a distinct option 61 value.

Clean final implementation 07d2a53 passed the existing verified synthetic segment
fixture twice (10,000 packets, 2,580,048 source bytes). Analysis took 1.721/1.715 s
(1.719/1.715 s CPU), full cost 5.361 s; maximum sampled worker RSS 47,976,448 bytes;
102,793,421 output bytes/run. Independent counts, pre/post hashes, complete
inventory, deterministic index/export digests, unchanged code and all predeclared
512 MiB/4 h gates passed. New indexes increase measured expansion over the old
83.9 MB result. Neither timings nor expansion are a 30 GB projection. The previous
98b877a synthetic run was retained; it does not certify the added inventory gate.

Qualification now rejects output beneath the source directory, verifies Git's
actual worktree and implementation bytes (including assume-unchanged cases),
records unavailable Git explicitly in copied packages, and refuses real-code
pinning without matching clean provenance. A final inventory detects segments
added between workers even if all original hashes and both analyses agree.

Each finding retains effective coverage, threshold/minimum sample metadata and
reproduction instructions. Private finding queries return exact source references
with 1k-row/8 MiB sample caps and explicit lower-bound/truncation semantics.
Tetra security text, uninterpreted SQLite flags and source-defined IDs now receive
case pseudonyms; original values and SQLite table/rowid locators stay private.

At that pre-capture checkpoint, no actual Packet Squirrel run had occurred; the
owner was connecting USB and planning a complete staging copy. The completed
actual run and final comparator validation are now documented at the beginning.
Genuine Tetra validation remains historical at
ef97601 (40 observations/17 mappings); the prior receipts do not retain its
original database path, so candidate recheck awaits that path. Genuine BLE scanner
compatibility remains unverified. See CHECKPOINT for fixed resource budgets,
private staging and exact next commands. Sanitized machine evidence is in
`examples/integrity-validation.json`; no keys, original evidence or private source
paths are included there.
