# Offline evidence program checkpoint

Overall: IN_PROGRESS. The owner's complete actual Packet Squirrel dataset has
been processed twice on the integrated implementation. Result:
**QUALIFIED_LIMITATIONS**. Independent counts, integrity, reproducibility and
fixed resource gates passed. The actual supported-field independent comparison
also passed with zero mismatches; decoding losses remain explicit. This is not a
full-decoding or 30 GB-scale claim.

## Current supplied-key ordinary qualification at 445abb1

- Primary checkout:
  `/home/jayforensics/Development/Jay-Forensics/Sentinel-Forensics`;
  personal remote `https://github.com/JayForensics/sentinel-forensics.git`, private.
- Clean qualified execution checkout: `/tmp/sentinel-qualification-key-20261023`,
  detached at `445abb1ce9df314469f559c862ff15ec81144d49`, parser 2.0.10
  /oracle 2.0.9. Preserve this checkout and all private outputs.
- Documentation delivery checkout: `/tmp/sentinel-qualification-key-delivery-20261023`,
  branch `fix/qualification-key-reproducibility`. Resolve documentation HEAD with
  `git rev-parse HEAD`; PR #19 and exact delivery/check/merge state belong in
  private HANDOFF.
- All 440 local tests pass (31 diagnostic +409 lab), with no skips and reproducible
  schema. Exact implementation CI `40036277664` passes on Python 3.11/3.14.

Fresh real14 analyses pass all 14 applicable ordinary gates on the complete
3-PCAP /297,151,107-byte /591,565-packet set. Each has 93,894 observations,
including 729 partial vendor headers. Sources, closed inventory and protected
key remain unchanged. The current read-only loader and qualification API pass
one operator-supplied 32-byte key to both workers; all three protected copies
match. Public CLI forwarding has synthetic validation; this actual workflow
used the loader and API. Generated-per-pair default behavior is unchanged.

Full private raw semantics, coverage, counts and protocols match real13. The new
pair's minimized exports match after normalizing only the documented case run
UUID; no cross-version/key export equality is claimed. Fixed 512 MiB /14,400-second
worker limits and the 15,271,301,824-byte ordinary reserve pass. Preflight also
retains a 17,418,785,472-byte combined reserve; future TLS work was not executed.
Qualification wall is 303.158012 seconds, excluding report finalization and the
wrapper's post-key/candidate-gate checks.

The COMPLETE metadata reuse gate also reports
`PASS_REUSED_UNCHANGED_SUPPORTED_DECODING`, with all eight checks true. All 22
other Python entries and the HoneyTrace schema match 7547e4f byte-for-byte;
full raw semantics, coverage, configuration, source inventory and closed case
profiles are bound. Thus the historical five supported-decoder profiles and
vendor numeric/storage proof are admitted without new supported-field/TShark
comparisons at 445abb1; packet counts were freshly checked with capinfos. Actual TLS chains remain pinned to historical a60feb9. The public
[qualification key validation](examples/qualification-key-validation.json)
keeps these scopes separate; all older example receipts remain unchanged.

Private evidence: real14/preflight14, `packet-squirrel-real-14/candidate-gate.json`
and `qualification-key-affected-validation-reuse-final-v2.json`. Require both
COMPLETE and the exact reuse decision; a failed/cancelled gate does not authorize
reuse. Exact commands, source/configuration references and controlled-key recipe
remain private. All **1,825 raw losses remain**, with QUALIFIED_LIMITATIONS and
full-decoding acceptance IN_PROGRESS. The supplied-key propagation gap is fixed;
vendor bodies, two LLC cases and oversized/indeterminate TLS work remain.

## Historical native-header and ordinary qualification at 7547e4f

- Primary checkout:
  `/home/jayforensics/Development/Jay-Forensics/Sentinel-Forensics`;
  personal remote `https://github.com/JayForensics/sentinel-forensics.git`, private.
- Exact clean execution checkout: `/tmp/sentinel-vendor-observations-20261023`,
  detached at `7547e4ff93fd499320e9f87134d8abe0a21a8d2e`, parser 2.0.10
  /oracle 2.0.9. Preserve this checkout and all private outputs.
- Documentation delivery checkout: `/tmp/sentinel-vendor-delivery-20261023`,
  branch `feat/vendor-event-observations`. Resolve its exact HEAD with
  `git rev-parse HEAD`; PR #18/main/check state is recorded in private HANDOFF.
- All 428 local tests pass (31 diagnostic +397 lab), with no skips and schema
  reproducibility. Exact implementation CI `40031236241` passes on Python
  3.11/3.14. These tests are separate from actual-data qualification.

Fresh real13 analyses pass all 14 applicable ordinary gates on the complete
3-PCAP /297,151,107-byte /591,565-packet dataset. Both contain 93,894 observations,
including 729 guarded `bcm.event_header` observations. Full source hashes,
closed inventory, private deterministic content and normalized minimized exports
match, with no filtering or framing errors. Five independent-decoder profiles
pass; the actual supported subset has 5,774,468 checks and zero mismatches.

A separate independent numeric-header comparison passes all 729 original
records /6,561 fields, with no missing/invalid fields or reference diagnostics.
Both new cases have all 1,458 stored header observations independently matched
to fresh native fields, provenance, context, original times and content hashes.
Full sources, code and closed indexes remain unchanged. Complete-process cost:
9.42 seconds, 7.31 user +2.21 system CPU seconds. Producer preterminal snapshots
record sampled tree RSS 215,072,768 bytes, conservative own +child peak
218,611,712 bytes and scratch 94,208 bytes. Final guards remain enforced through
cleanup under fixed 512 MiB /60-second /64-MiB budgets. These measured gates do
not enforce OS quotas.

This is numeric common-header support only. Event bodies, trailing bytes,
station address and interface name remain unexamined. All **1,825 raw losses**
remain: 1,094 TLS-reassembly, 729 `unsupported_ethertype` and two
`unsupported_llc_control` occurrences. Header observations do not clear the
vendor-body limitation, establish a conversation/device or create findings.
Result remains **QUALIFIED_LIMITATIONS**; zero-loss acceptance is IN_PROGRESS.

Private bindings: real13/preflight13, `vendor886c-numeric-validation-01`, and
`vendor-7547-final-scoped-gates-v1.json` (15 scoped gates). Exact machine/human
commands, versions, limits and source/case/helper references remain private.
The public aggregate is
[vendor header validation](examples/vendor-header-validation.json).
Historical TLS continuation receipts below remain pinned to a60feb9; they do not
certify a changed-code chain at 7547e4f. PCAPNG remains fixture-validated, and the
original Tetra database and genuine cross-source calibration remain missing.

At historical 7547e4f, `qualify.py run --pseudonym-key` accepted but ignored
the supplied key, while generating one shared protected key for its two workers.
That limitation is fixed and separately qualified at 445abb1 above; the historical
7547e4f receipt remains unchanged.

## Historical whole-cohort continuation qualification at a60feb9

- Actual primary checkout:
  `/home/jayforensics/Development/Jay-Forensics/Sentinel-Forensics`;
  personal remote `https://github.com/JayForensics/sentinel-forensics.git`, private.
- Exact clean qualified code-only checkout:
  `/tmp/sentinel-tls-continuation-20261023`, detached at
  `a60feb9a2a8defc3f85e92d6a85347e98f39da8e`. Its files and private outputs are
  held. Delivery uses `/tmp/sentinel-tls-continuation-delivery-20261023`, branch
  `feat/tls-cohort-continuation`. Resolve documentation HEAD with
  `git rev-parse HEAD`; exact PR #17/main/check state is in private HANDOFF.
- Parser 2.0.9, oracle 2.0.9, optional producer 1.1.0 /derived schema 2.
  All 407 local tests pass, including generated independent TLS 1.2/1.3 and
  repeated two-page/two-family tests. Exact implementation CI `39993333642`
  passes 407 tests with no skips and schema reproducibility on Python 3.11/3.14.

Fresh real12 ordinary qualification passes all 14 applicable gates. Both runs
reconcile the complete 297,151,107-byte /591,565-packet owner-confirmed set, with
unchanged source hashes and matching private/normalized-export content. Private
semantics also match real11. Five independent-decoder profiles pass; actual
supported-field comparisons total 5,774,468 with zero mismatches. Raw coverage
remains **QUALIFIED_LIMITATIONS**, with 1,094 TLS-reassembly /729 EtherType /two
LLC loss codes. No original USB after-check or 30 GB-scale claim is made.

Two separate continuation families finish in nine pages each, covering all
1,060 fitting whole cohorts /1,091 candidates /229,322 original records per
family. Both have **1,070 verified Hello observations, 21 indeterminate results
and three oversized candidates not evaluated**; no fitting candidates remain
deferred. Every page freshly reconciles the entire original capture/index and
replays the exact completed cohort set. Same-source/context/interface/VLAN/family
scope, both directions, capture order and duplicate occurrences are preserved.

All main/batch logical content, exact minimized JSONL/human exports and semantic
page proofs match between families. Prior-page rows carry reported status and
semantic references, with no fresh Hello data/support or authenticated execution
claim. The independent audit freshly verifies all selected original records,
2,215 supporting originals /2,295 links /5,350 emitted native fields per family,
time anchors and minimized exports. Complete-process audit cost is 39.36 seconds
and 195,571,712 peak RSS bytes; all scoped fixed-budget gates pass.

Per-page budgets stay 512 MiB /120 seconds total /60 seconds per decoder /64 MiB
scratch /32 batches. Qualification predeclares the stricter 32,768-frame page cap;
the default/maximum 131,072-frame cap and per-cohort caps are unchanged. Each
family is bounded to 16 pages, with 4,200 seconds for the whole two-family
workflow and 120 seconds per verification phase. The completed workflow costs
777.079128 seconds. No budget was raised, failed job retried or Hello quota used.

Private evidence: real12/preflight12; continuation-family-01/02;
`packet-squirrel-tls-continuation-validation-01/workflow.json`;
`tls-continuation-independent-chain-review-v4.json`; and
`tls-continuation-actual-final-gates-v1.json` (13 scoped checks, not GOAL_PASS).
Machine/human reproduction records retain exact commands, configuration, hashes,
tool/helper versions, source locations and failure history locally. Public
aggregates are `examples/actual-capture-validation.json` and
`examples/tls-continuation-validation.json`; the earlier
`examples/tls-derived-validation.json` remains an unchanged historical receipt.

At a60feb9, the smallest unblocked capture gaps were the three oversized cohorts,
21 indeterminate results and vendor/LLC coverage. Vendor research and invented
experiments at that revision were preparation; later 7547e4f header support
and its remaining body limitations are recorded above. Original Tetra and genuine
combined-source clock/network context remain external prerequisites. Keep all
1,825 raw loss codes visible.

## Earlier bounded TLS qualification at 4c8bacc

- Actual primary checkout:
  `/home/jayforensics/Development/Jay-Forensics/Sentinel-Forensics`.
- Qualified execution and current feature worktree:
  `/tmp/sentinel-tls-integration-20261023`, branch
  `feat/bounded-tls-reconstruction`, runtime commit
  `4c8bacc8b7e988693d1747707adb709eaedf8d93`. Parser 2.0.9, optional derived
  producer 1.0.1, independent oracle 2.0.9. Resolve later documentation HEAD with
  `git rev-parse HEAD`; documentation changes retain this runtime pin.
- Main includes PR #15's archive receipts at
  `b146a1fa3b492f4a5ac9f840b099ab99e714103a`. PR #16 carries the optional layer;
  exact current delivery/merge state is in private HANDOFF. Implementation CI
  run `39981273493` passes Python 3.11/3.14, all 362 tests in each job and schema
  reproducibility, including generated independent TLS tests on TShark 4.2.2.
  Final documentation-head checks and merge state belong in private HANDOFF.

Fresh real11 ordinary qualification passes all 14 applicable gates on the same
complete three-PCAP dataset: 297,151,107 bytes /591,565 independently counted
packets. Two runs have matching deterministic logical content and normalized
minimized-export digests (the documented case run UUID is excluded), with
unchanged full source hashes. Optional derived exports below are byte-exact.
All five independent-decoder profiles pass; the actual profile checks 5,774,468
supported fields with zero mismatches. The result is **QUALIFIED_LIMITATIONS**:
1,094 raw TLS-reassembly, 729 unsupported EtherType and two unsupported LLC cases
remain. Ordinary analysis does not automatically invoke reconstruction.

Two separate optional runs (derived03/04) also complete with identical table
content, minimized exports, human reports and stable provenance. Whole-cohort
selection covers 132 eligible candidates /17,432 original records /32 batches:
128 independently verified Hello observations, four indeterminate and 962 not
evaluated. The independent audit verifies every selected original record, all
280 supporting originals /292 support links per run, all 640 native Hello fields
per run, original capture-time anchors and exact minimized exports. It checks
128 whole cohorts against all 591,565 parent packet rows. VALIDATION and the
two public aggregate receipts record measurements and their limits.

Budgets remain fixed: ordinary 512 MiB /14,400 seconds; optional producer and
independent observer 512 MiB /120 seconds per CLI, 60 seconds per decoder and
64 MiB producer scratch. The successful second derived run uses one positive
exact-owned-child termination proof after three missing-RSS reads, including
group absence and conservative reaped lifetime memory checks. Persistent live,
permission and malformed-metric failures still fail. The earlier `1114fd7`
actual attempt remains **FAILED**; its second run was never started. Earlier
memory-limited and incomplete experiments also remain preserved separately.

Private completed evidence: real11/preflight11; derived03/04 and
`packet-squirrel-tls-derived-validation-02`; independent
`tls-production-derived03-04-independent-review-v3.json`. Exact source mappings,
keys, original hashes and reproduction commands remain private. No original
evidence, private identifiers or sensitive derived outputs are committed.
The current combined private recipe/summary is real11's
`REPRODUCTION-PRIVATE-v2.md` /`INTEGRATED-QUALIFICATION-PRIVATE-v2.json`;
its initial failed assembly draft remains separate. Workflow and audit logical
digest algorithms differ; each matches its own two runs. Their exact minimized
export, human-report and stable-manifest hashes agree.

## Checkout and delivery

- Actual checkout: `/home/jayforensics/Development/Jay-Forensics/Sentinel-Forensics`.
- Personal remote: `https://github.com/JayForensics/sentinel-forensics.git`; private.
- Standard Git discovery now works: `.git` is a pointer to `.sentinel-git`.
  The prior empty sandbox guard disappeared after the permission profile changed;
  the pointer was created exclusively, preserving all existing metadata. No
  environment override is required. The previous clone remains untouched.
- PRs #4/#5 were already merged. Outstanding `ef97601` was retained and integrated
  through PR #6; completed commits were not recreated or blindly cherry-picked.
- Earlier integrated main / preserved actual-analysis revision:
  `fc0439f128afc679ea1d8cbe3c4bb34374a09170`, suite 2.0.3. PR #6 head
  `73f52c574e46d92af09043208f98bb2035df099c` passed all 163 tests on Python
  3.11/3.14; the merge has the identical reviewed tree.
- PR #7 merged as `ce98e033d4f3e80c6dc8abce63ec8223d8f8c54e`, after exact-head
  Python 3.11/3.14 CI and automatic review with no findings. Its independent
  comparator revision is `8b0c45d81f0033a0866c76765f565aa2045ec2bf`, oracle 2.0.4.
- Earlier delivered implementation on `main`:
  `f2319e4f3354304d264e5c1fb62e48ffc1496ebd`, the PR #8 merge of
  `fix/lossless-radio-numbers`. Its reviewed head was
  `fd25c5f1f8a1e2df446e130884607d20bebb5efe`; the merge has the identical tree.
  Runtime modules match the clean, actually qualified implementation
  `1a027c9b00fe4eaf50a3090ddaf93e0eb94a9589`, parser 2.0.4 /iOS parser 0.2.1.
  All 191 local tests passed (31 diagnostic +160 lab), with independent review.
  Exact reviewed-head CI run `39589276392` passed Python 3.11/3.14, and automatic
  review completed with no findings. Both post-merge CI checks also passed at
  `f2319e4` (check runs `119187583592` /`119187584075`).
  Later checkpoint-only commits do not supersede the recorded runtime
  qualification. Resolve the current documentation HEAD with `git rev-parse HEAD`.
- Immutable code-only execution checkout: `/tmp/sentinel-engine-qualified-07d2a53`,
  pinned to `fc0439f128afc679ea1d8cbe3c4bb34374a09170`. Do not change it while
  reconciling the completed run. Actual evidence and outputs are on SSD.
- The numeric implementation has a separate clean execution checkout:
  `/tmp/sentinel-engine-qualified-numbers`, pinned to 86e066d. Shared parser
  changes require new real-data qualification; previous receipts are preserved.
- The final routing correction is pinned at 1a027c9 in
  `/tmp/sentinel-engine-qualified-routing`, separately qualified again.
- Earlier qualified implementation: `58217cf2852ba940dd9f7e3e99eaa1e5188f8b58`,
  parser 2.0.5, from `feat/native-ble-ard-csv` /PR #10. Its separate clean
  execution checkout is `/tmp/sentinel-engine-qualified-ble-ard`; all earlier
  execution checkouts and qualification receipts are preserved.
- PR #10 was delivered as `ab41025be5d81ecd032f6c3b876ebc7bf720424d` on main;
  its reviewed tree and all qualified runtime bytes match the recorded 58217cf
  implementation. The earlier delivery branch was `feat/igmp-evidence-metadata`,
  PR #11. Its clean qualified implementation:
  `0ab0b7cd3818afbb8498aab914e0b7bbfd3df852`, parser 2.0.6 /oracle 2.0.5,
  execution checkout `/tmp/sentinel-engine-qualified-igmp`. All 227 local tests
  passed, with independent runtime/privacy/contract reviews. Implementation CI
  run `39691788195` passed both Python 3.11/3.14 jobs. Final delivery/check hashes
  are recorded in private HANDOFF; documentation-only commits retain this runtime
  qualification. Resolve the current checkout head with `git rev-parse HEAD`.
- PR #11 merged as `0b92abc34f52bb2c7cd558dcff31ab898239d005`, with the exact
  reviewed tree and passing final-head/post-merge Python 3.11/3.14 CI and automatic
  review with no findings. The later timeline delivery branch was `fix/context-source-ids-and-vlans`,
  PR #12. Its clean qualified implementation:
  `066161f5c21872e0cebbc8c0afa4eff0747c7e69`, parser 2.0.7 /oracle 2.0.5,
  execution checkout `/tmp/sentinel-engine-qualified-timeline`. All 240 local tests
  pass (31 diagnostic +209 lab), with independent runtime/contract reviews;
  implementation CI run `39694619359` passes Python 3.11/3.14. Current delivery
  commit/check state is in private HANDOFF; documentation changes retain this
  exact runtime qualification.
- PR #12 merged as `c64adc10e8f0a86864d2a625a99686420ada413d` after exact-head
  and post-merge Python 3.11/3.14 CI; its runtime bytes match 066161f. The LLC
  work used `feat/llc-xid-evidence`, PR #13. Analysis qualification is pinned to
  `db53b859b570f245ba7eba3a57c28f017e531c75` in
  `/tmp/sentinel-engine-qualified-llc-xid` (parser 2.0.8). Final comparator:
  `05959c09b691ef874411c8a70f0d7a8b7d13f918` in
  `/tmp/sentinel-engine-qualified-llc-oracle` (oracle 2.0.7). All 266 local tests
  pass (31 diagnostic +235 lab), with independent reviews. Exact comparator CI
  run `39701740489` passes Python 3.11/3.14; the initial older-Wireshark failure
  remains preserved. Only comparator/tests/docs changed after qualification;
  all 15 other runtime/schema files match under an explicit recomputed reuse
  proof. Final delivery commit/check state is in private HANDOFF. Resolve current
  HEAD with `git rev-parse HEAD`; later documentation commits retain these pins.
- PR #13 merged as `0d84f626b26c4c620a6c424d4d4733762c318432`; reviewed head
  `e2cab80501adae94f174926dffe229256ddf2439` and post-merge Python 3.11/3.14 CI
  passed. Merge tree and all 47 Python/schema files match the reviewed/qualified
  comparator. The archive correction from `fix/archive-timestamp-precision`,
  PR #14, merged as `77771ad4fd2aa148b3059e53e7aa6631daafa9f5` with the exact
  qualified tree. Clean implementation: `13be2ac8bb82ce38521529879594ffd3a05b8c92`,
  parser 2.0.9 /oracle 2.0.7. The original `/tmp/sentinel-engine-qualified-archive-time`
  execution checkout is no longer available; a new clean review checkout at
  `/tmp/sentinel-archive-review-20261023` matches the same Git objects and recorded
  implementation hashes. Original execution commands and receipts remain unchanged.
  All 273 local tests pass (31 diagnostic +242 lab), with independent review.
  Implementation CI run `39703102357` passes Python 3.11/3.14. Fresh real09,
  preflight09, BLE06, all independent reference profiles and actual finding
  support checks pass their applicable gates. Both post-merge Python 3.11/3.14
  checks also pass. The subsequent receipt-only branch was
  `docs/archive-qualification-reconciliation`, delivered through PR #15.
  Independent publication review recomputed the bound aggregates without repeating analysis
  or decoding. Exact delivery/check state is in private HANDOFF; later documentation
  changes retain this runtime pin.
- Ignored `.sentinel-local/HANDOFF.json` records exact delivery/check state and
  private receipts. Resolve a subsequent documentation head with `git rev-parse HEAD`.

The previous strAInless clone and its private outputs remain untouched. Its
historical inventory was 217 files /3,133,539,126 bytes plus 19 /tmp/sentinel* logs.
Reuse receipts verify source/configuration/module hashes; historical results
certify only their recorded implementation. No keys, genuine evidence or private
identifiers are repository artifacts. The unrelated ZIP/spreadsheet were not used.

## Acceptance matrix

| Phase | Implementation | Validation | Smallest remaining gate |
|---|---|---|---|
| 1 Actual Packet Squirrel | IMPLEMENTED, including supplied-key qualification | REAL_DATA_VALIDATED for fresh real14 counts/integrity/reproducibility/resources/key propagation at 445abb1; historical 7547e4f supported fields admitted by exact byte/raw-semantics gate | Full-decoding acceptance remains IN_PROGRESS: real14 is QUALIFIED_LIMITATIONS with 1,825 raw losses. The complete dataset is 297,151,107 bytes; no 30 GB-scale claim. |
| 2 PCAP/PCAPNG/network | IMPLEMENTED, including guarded vendor headers and bounded classic-PCAP TLS continuation | SYNTHETICALLY_VALIDATED; actual supported headers REAL_DATA_VALIDATED at historical 7547e4f with explicit unchanged-decoding reuse at 445abb1; TLS continuation REAL_DATA_VALIDATED at historical a60feb9 | Verify bounded handling of three oversized candidates and 21 indeterminates; keep all raw losses. Vendor bodies/two LLC cases remain unsupported. Actual sources are PCAP; PCAPNG has synthetic/independent fixtures only. |
| 3 Tetra/BLE | IMPLEMENTED for explicit schemas and BLE-ARD parallel CSV | IN_PROGRESS; public BLE profile REAL_DATA_VALIDATED at its recorded 13be2ac revision | Preserve the separate 71-row BLE receipt without claiming a new radio run. Original Tetra database (historical 40 observations/17 mappings) is missing; owner scanner schemas beyond validated exports remain unverified. |
| 4 Timeline/correlation | IMPLEMENTED, including multi-record derived capture anchors, reversible offsets, context/VLAN scopes | SYNTHETICALLY_VALIDATED; actual selected-packet time/provenance mechanics REAL_DATA_VALIDATED | Genuine combined-source evidence and clock/network calibration remain missing. Invented archive fixtures and capture anchors do not calibrate clocks or establish persistent device identity. |
| 5 Explainable findings | IMPLEMENTED | SYNTHETICALLY_VALIDATED; historical actual explanation/support mechanics verified | Genuine calibration of rule interpretations. The optional derived pass generates no findings; reproduction does not establish compromise or identity truth. |

The Tetra current-candidate recheck and genuine combined-source calibration are
**BLOCKED_EXTERNAL** on their source/context prerequisites. Implementation and
the scoped validation shown above remain distinct from those uncompleted gates.

## Earlier archive timestamp qualification at 13be2ac

Archive observations and indexed records now use the same bounded exact source
time, preserving original spelling, offsets/nanoseconds and diagnostic clock
uncertainty. Unsupported precision/representations and nonfinite values remain
explicit. Seven invented regressions cover provenance, duplicates, malformed
continuation, minimized exports, offline guards and reversible adjustments. The
legacy iOS ingestion interface is unchanged.

Two fresh actual analyses pass all 14 applicable gates with unchanged coverage:
591,565 packets, 1,253 existing basic-XID observations and 1,825 limited packets.
The final actual comparator checks 5,774,468 fields with zero mismatches; all
cached/generated reference profiles and the separate LLC profile pass. BLE06
rechecks 71 genuine public rows twice with all 11 checks true. Actual finding
explanation/support mechanics pass without publishing contents or interpretation
claims. VALIDATION records measurements; real09 contains exact machine/human
reproduction commands and the unchanged resource/disk budgets.

The supplementary full-capture TLS experiments failed the fixed memory limit;
they did not establish whole-dataset recoverability. The later bounded layer
above qualifies its selected subset only. The successful guarded EtherType-prefix
inventory does not establish payload support or clear its losses. Original Tetra and genuine
clock/network calibration remain external prerequisites.

## Earlier LLC basic-XID qualification

Two real analyses at db53b85 pass the same applicable gates on all 591,565
packets, with matching deterministic content and unchanged full source hashes.
Basic-XID metadata resolves 1,253 packets; 1,094 TLS-reassembly cases, 729
unsupported EtherType frames and two unsupported LLC frames remain limited.
The final actual comparator at 05959c0 checks 5,774,468 supported fields with zero
mismatches and all three complete source verifications. Synthetic coverage,
independent comparisons, actual analysis and the remaining zero-loss gate are
separate. VALIDATION records measurements and preserved failed/incomplete probes.
The private human recipe and explicit runtime reuse proof avoid repeating the
unchanged analysis after the comparator-only compatibility fix. Combined receipt
recovery passed without repeating decoding; the separately generated LLC oracle
profile passes two files /16 packets /292 comparisons with every required field
checked and zero mismatches. The original finalization failure remains preserved.
Private HANDOFF has final delivery/check state.

A separate five-record invented fixture confirmed the earlier archive-member
timestamp inconsistency at 05959c0: compact/space offsets and record timestamp
precision differ from equivalent plaintext. The private baseline preserves code
pins, unchanged source hashes and offline/contract checks. It is corrected at 13be2ac with
new synthetic regressions; genuine combined-source calibration remains unproven.

The TLS loss code alone cannot establish whether remaining bytes exist in
other packets or whether a record contains a handshake. The later bounded layer
qualifies 132 selected cases; its 962 exclusions remain concrete software work,
not an external-data blocker. Genuine source absence must be demonstrated before
labeling a portion externally blocked. Unknown vendor frames must retain
limitations unless meaningful decoding is verified.

## Earlier timeline/context qualification at 066161f

Explicit configuration now requires canonical ASCII positional source-ID strings;
aliases such as `"01"` cannot be accepted and silently ignored. Context labels
accept bounded commas so radio evidence can match an explicit ordered VLAN stack,
while other VLANs remain isolated. Falsy non-object configurations fail before
source/output work in both entry points; omitted/None/null retain defaults.

Generic text/JSONL now carries the existing bounded parser's original timestamp
instead of a microsecond-normalized intermediate. Original spelling/offset and
up to nine fractional digits survive; supported offset spellings remain usable.
Higher precision and unsupported representations have fixed unresolved reasons,
with no fabricated UTC key or hidden arbitrary payload. Contract/schema, rules
and HoneyTrace runtime remain unchanged. Thirteen new offline regressions cover
actual configuration application/reversal, byte provenance, duplicates, privacy,
unsupported cases and exact cross-source VLAN scope; these are synthetic fixtures.

Two fresh actual analyses at 066161f pass all applicable real gates on the same
3 files /297,151,107 bytes /591,565 packets. Full source hashes, independent counts,
closed inventory, checksums and logical/minimized-export determinism match.
Result remains **QUALIFIED_LIMITATIONS**: 1,094 TLS-reassembly and 1,984 unsupported
Ethernet packets remain explicit, with no framing parse errors or filtering.

Wall: 126.321769 /130.058277 seconds; CPU: 59.052119 /58.934712 seconds. Full wall:
308.809856 seconds. Maximum sampled worker-tree RSS: 46,325,760 bytes. Output:
2,717,953,303 bytes/run. Unchanged 512 MiB /14,400-second budgets and the conservative
15,271,301,824-byte disk requirement pass (358,319,919,104 bytes free). Private
preflight/results/exact commands: `qualification-private/packet-squirrel-real-preflight-07/`
and `qualification-private/packet-squirrel-real-07/`. No cold-cache, original-USB
post-check or 30 GB-scale claim. Source copies match the previous complete hashes.

The configuration-only intermediate at `80218d9aef41574b5245aa8ebdb06c98a32bb5c2`
also passed its applicable real gates in `qualification-private/packet-squirrel-real-06/`;
it is preserved as historical evidence, not certification of the later time fix.
Genuine public BLE's 71-row export was rechecked twice at final 066161f in
`qualification-private/public-ble-ard-validation-04/`. It retains the same narrow
schema, unresolved-clock and no-independent-BLE-decoder limitations. Actual finding
explanation/support mechanics also pass privately; no interpretation calibration
or private finding contents/counts are published.

Final independent comparison at the same 066161f passes all 591,565 packets /
5,756,926 supported fields, zero mismatches and three complete source hashes:
16.119498 seconds /289,415,168 sampled process-tree RSS bytes. Private oracle:
`qualification-private/packet-squirrel-oracle-timeline-final-20261021T234315Z/`.
Pinned upstream (8 files /109 packets /1,122 comparisons), generated network
(2 /12 /120) and rich IGMP PCAP/PCAPNG (2 /24 /440) profiles also pass with
zero mismatches and complete source verification. These comparisons validate
supported capture metadata, not every protocol or the synthetic plaintext behavior.
Current sanitized example receipts bind to this final candidate. All earlier
successful/failed receipts remain preserved, including the separate failed
supplementary scope probe; its later no-evidence diagnostic does not regrade it.

## Earlier actual capture requalification at 0ab0b7c

The measured actual gap was 19,699 IPv4 protocol-2 packets. Supported complete
IGMP control messages now retain checksum/type/wire-version/query timers and
ordered group/source occurrences with packet-byte provenance. Source-filter
mentions are indexed for timeline lookup and minimized on export; no membership,
session, identity association or finding inference was added. Global bounds are
128 group records and 256 source occurrences/message. Invalid checksums,
contradictory queries/families, truncation, unknown/auxiliary/trailing content and
budget failures retain explicit losses without partial group observations.

Two fresh complete analyses at clean 0ab0b7c pass every applicable real gate on
the same 3 files /297,151,107 bytes /591,565 packets. Original source copies are
unchanged before/after; independent counts, closed inventory, complete output
checksums and deterministic logical/minimized-export results match. All 19,699
IGMP packets now decode with valid message checksums. The remaining 1,094 TLS
reassembly and 1,984 unsupported-Ethernet packets keep **QUALIFIED_LIMITATIONS**.
Full-decoding acceptance remains IN_PROGRESS, with no filtering/framing errors.

Wall: 129.157083 /128.221533 seconds; CPU: 58.981012 /58.545233 seconds. Full wall:
309.158638 seconds. Maximum sampled worker-tree RSS: 46,436,352 bytes. Output:
2,717,953,303 bytes/run. Unchanged 512 MiB /14,400-second limits and predeclared
15,271,301,824-byte disk requirement passed (369,220,726,784 bytes free).
Private preflight/results: `qualification-private/packet-squirrel-real-preflight-05/`
and `qualification-private/packet-squirrel-real-05/`; human/machine reports and
exact commands/key/configuration references are retained there. Earlier cases
are preserved; no original-USB after-check, cold-cache or 30 GB-scale claim.

The same clean candidate's independent oracle passed 591,565 packets /5,756,926
supported fields, zero mismatches /3 full source verifications, in 15.968724
seconds with 289,144,832 sampled tree RSS bytes. Private receipt:
`qualification-private/packet-squirrel-oracle-igmp-final-20261021T231651Z/`.
Cached upstream (109 packets /1,122 comparisons), network synthetic (12 /120)
and new rich IGMP PCAP/PCAPNG (24 /440, including both exact budgets) also passed
with complete hashes and zero mismatches. Actual finding support/explanation
mechanics were rechecked privately. Genuine public BLE's 71 rows passed another
two-run field/provenance/integrity/privacy reconciliation at this candidate in
`qualification-private/public-ble-ard-validation-02/`, without broadening its
documented schema or calibration claims. See current sanitized example receipts.

## Earlier actual capture requalification at 58217cf

The new native CSV integration changes shared adapter/analysis modules, so the
actual owner-confirmed source set was qualified again against clean 58217cf.
Both runs returned QUALIFIED_LIMITATIONS with every applicable real-profile gate
true: independent capinfos counts, complete inventory, unchanged before/after
source hashes, output checksums, deterministic content and fixed resource limits.
The synthetic fixture-count flag is inapplicable; no filtering or framing parse
errors occurred. The existing 22,777 limited packets remain explicit.

Analysis wall times: 107.445245 /107.367624 seconds; CPU: 55.800290 /55.440141
seconds. Full qualification: 264.512986 seconds. Maximum sampled worker-tree RSS:
46,333,952 bytes; output: 2,552,455,115 bytes/run. Budgets remained 512 MiB /
14,400 seconds and the conservative 15,271,301,824-byte SSD requirement
(374,802,022,400 bytes available). Measurements do not establish cold-cache or
30 GB-scale performance.

Private qualification/preflight: `qualification-private/packet-squirrel-real-04/`
and `qualification-private/packet-squirrel-real-preflight-04/`. The former includes
machine/human reports, exact source/configuration/key reproduction commands and
their checksum. Supplied sources match earlier full hashes; the original USB
after-check remains unavailable. Actual explanation and bounded support-query
mechanics were rechecked without publishing finding counts or content.

Independent actual comparison at the same clean implementation passed all
591,565 packets /5,486,258 supported fields: zero mismatches, three complete
source-hash verifications, 14.862941 seconds and 289,026,048 sampled process-tree
RSS bytes. The result preserves unsupported/reassembly limitations and does not
satisfy the stronger full-decoding GOAL_PASS condition. Private receipt:
`qualification-private/packet-squirrel-oracle-ble-ard-final-20261021T223830Z/`.
The current pinned public fixtures also passed (8 files /109 packets /1,122
comparisons /0 mismatches), after exact-hash recovery from preserved local
artifacts. The earlier temporary synthetic source files were unavailable; a new
committed-fixture-generated PCAP/PCAPNG corpus passed (2 files /12 packets /120
comparisons /0 mismatches). New source/generator/hash receipts distinguish this
from historical reuse. The interrupted fixture-lookup attempt remains preserved;
the successful actual oracle was reused unchanged. Current public aggregate:
`examples/actual-capture-validation.json`.

## Native BLE public-export validation at 58217cf

Parser 2.0.5 implementation: `58217cf2852ba940dd9f7e3e99eaa1e5188f8b58`,
delivery branch `feat/native-ble-ard-csv` /PR #10. The exact-header native CSV
profile reuses bounded framing and BLE normalization, retaining exact original
row-byte references and hashes,
timestamps, names/addresses/signals and uninterpreted type/channel codes. Header
recognition explicitly leaves collector origin unverified. No HoneyTrace contract
or runtime change was needed.

All 199 local tests passed, including eight new native-format regressions.
Two complete analyses of one pinned genuine public raw BLE-ARD export passed:
3,194 bytes /71 records, full field and exact-byte provenance reconciliation,
unchanged sources, valid checksums/contract, deterministic logical/export results,
offline guards and minimized identifiers. The immutable source is at upstream
`49c92bb31241f726db020493679b1cbbe6740937`; source/code/key details and exact
reproduction stay private in `qualification-private/public-ble-ard-validation-01/`.
Public aggregate: `examples/public-ble-validation.json`.

This proves one real public-export layout, with unresolved time and unverified
type-code meanings. It does not establish absent services/manufacturer/scanner
fields, nonempty names, headerless controller layout, other versions, owner-private
BLE compatibility or genuine cross-source alignment. Name handling remains covered
by invented fixtures. The original Tetra database and clock/network context remain
required for the separate outstanding recheck/calibration gates.

## Earlier schema-dispatch qualification at 1a027c9

Generic JSONL/NDJSON schema detection now survives unsupported numeric field
values in the first row. A bounded structural probe returns only marker presence;
every actual record still receives strict parsing. Later valid BLE observations
retain addresses, signals, services and byte/hash provenance. Duplicate keys,
invalid UTF-8, depth/size budgets and malformed structure remain rejected.

Two fresh analyses of the same owner-confirmed dataset at clean 1a027c9 returned
QUALIFIED_LIMITATIONS with every applicable real gate true. Wall times:
106.468044 /134.032863 seconds; CPU: 54.536336 /55.122355 seconds. Full qualification:
293.434428 seconds. Maximum sampled worker-tree RSS: 46,534,656 bytes; output:
2,552,454,611 bytes/run. Fixed 512 MiB/14,400-second limits and the additional
15,271,301,824-byte SSD requirement passed (381,180,608,512 bytes available).
All source hashes, inventories, counts, bundle checksums and deterministic results
matched. No filtering or framing parse errors; decoding limitations remain.

Current private qualification/preflight: `qualification-private/packet-squirrel-real-03/`
and `qualification-private/packet-squirrel-real-preflight-03/`. Earlier 86e066d
and fc0439f receipts and their execution checkouts remain preserved. The original
USB post-check remains unavailable; supplied source copies have full before/after
verification and match the earlier qualified inputs.
The final independent comparison at the same clean 1a027c9 matched 591,565 packets /
5,486,258 fields, with zero mismatches and three full-source verifications. It took
14.202889 seconds and peaked at 289,751,040 sampled process-tree RSS bytes, within
the original budgets. All 22,777 limited packets remain explicit. Pinned upstream
and generated rechecks passed (109/1,122 and 12/120 packets/comparisons).
Private reference receipts:
`qualification-private/packet-squirrel-oracle-routing-final-20261021T110231Z/`.
The sanitized current summary is `examples/actual-capture-validation.json`.

## Earlier numeric integrity requalification at 86e066d (preserved)

The completion audit found independent parser defects: fractional radio values
could be truncated, exponent overflow/underflow could invent infinity/zero or
abort ingestion, and diagnostic parse errors used the wrong error-code field.
The correction preserves finite fractional signals, rejects nonintegral identifier
types, contains malformed envelopes/unsupported SQLite values to their source,
and retains diagnostic errors and unsupported timestamp uncertainty. The HoneyTrace
v1 envelope/schema and HoneyTrace runtime remain unchanged.

Shared parser code changed, so historical results were not used to certify this
candidate. Two fresh real analyses at clean 86e066d returned QUALIFIED_LIMITATIONS:
all applicable count/inventory/hash/checksum/reproducibility/resource checks passed.
Source size/count remain 297,151,107 bytes /591,565 packets across three PCAPs.
Analysis wall times: 106.380543 /185.936465 seconds; CPU: 54.333114 /56.309801 seconds.
Full qualification wall: 342.278748 seconds. Maximum sampled worker-tree RSS:
46,530,560 bytes; completed output: 2,552,454,611 bytes/run. The timing spread is
retained without a cold-cache or scale claim.

Fixed limits remained 512 MiB and 14,400 seconds. Additional SSD preflight required
15,271,301,824 bytes, with 388,502,212,608 bytes free. Source hashes match the
previous qualified inputs and remain unchanged before/after; the original USB
post-check remains unavailable. No filtering or framing parse errors occurred.
The same explicit decoding losses remain; the result is not GOAL_PASS.

Private current receipts: `qualification-private/packet-squirrel-real-preflight-02/`
and `qualification-private/packet-squirrel-real-02/`. The latter retains machine/
human results, exact local reproduction parameters and its separate case key.
The final independent recheck uses the same clean 86e066d implementation.
It passed all 591,565 packets /5,486,258 supported fields with zero mismatches
and three complete source verifications matching both qualifications. It took
14.457170 seconds and peaked at 289,447,936 sampled process-tree RSS bytes,
within the unchanged budgets. All 22,777 limited packets remain explicit.
Pinned upstream/generated rechecks also passed (109/1,122 and 12/120 packets/
comparisons). Private reference results:
`qualification-private/packet-squirrel-oracle-numeric-final-20261021T104711Z/`.
The aggregate summary recorded that qualification before the final routing fix;
its current contents point to the later separately qualified implementation.

## Actual dataset evidence at fc0439f (preserved)

The owner corrected the original approximately 30 GB estimate and confirmed the
complete `loot` set: **3 PCAP files, 297,151,107 bytes, 591,565 packets**. These
actual files were qualified. This run does
not establish performance at the earlier estimated 30 GB size.

Private evidence under this checkout:

- Owner-confirmed sources: `loot/` (ignored); the earlier prepared
  `qualification-private/packet-squirrel-source/` staging directory remains empty.
- Independent count/SSD preflight:
  `qualification-private/packet-squirrel-real-preflight-01/preflight.json`.
- Completed machine/human results:
  `qualification-private/packet-squirrel-real-01/qualification.json` and
  `qualification-private/packet-squirrel-real-01/qualification.md`.
- Exact local paths/configuration/reproduction parameters:
  `qualification-private/packet-squirrel-real-01/reproduce-private.json` and
  `REPRODUCTION-PRIVATE.md`.
- Final independent comparison:
  `qualification-private/packet-squirrel-oracle-final-20261021T102538Z/`.

Predeclared limits remained 512 MiB worker RSS and 14,400 seconds per worker/decoder.
The additional conservative SSD preflight required 15,271,301,824 bytes with
394,007,875,584 bytes free. No budget was loosened after execution. The pinned
/tmp checkout contains code only; actual evidence/output stayed on SSD.

Both analyses ran with clean, matching `fc0439f` provenance. Analysis times were
122.893611 /126.308628 seconds; CPU 54.239615 /55.618703 seconds. Full qualification
wall time was 299.096214 seconds. Each completed output was 2,552,454,611 bytes;
maximum sampled worker-tree RSS was 46,411,776 bytes. Measurements and sampling
limits are retained in the private report; they are not extrapolations.

All applicable real-profile checks passed: capinfos per-file/total counts,
complete unchanged segment inventory, full staging-source hashes before/after,
complete bundle checksums, deterministic logical/export results, unchanged code
and resource limits. No packet filtering or framing parse errors occurred.
The fixture-count check is inapplicable to the real profile. Recorded decoding
loss occurrences were 1,094 `tls_reassembly_required`, 1,984
`unsupported_ethertype`, and 19,699 `unsupported_transport`; this accounts for
the QUALIFIED_LIMITATIONS result rather than GOAL_PASS.

USB originals matched the staged copies before analysis. The USB mount was
unavailable afterward, so no post-run original-media verification is claimed.
The supplied SSD copies have matching full hashes before and after both runs.
All actual finding support queries retained source locations and explanation
metadata with nonempty bounded support. This validates reproduction mechanics,
not calibrated compromise/identity conclusions.

The final independent oracle checked all 591,565 packets and 5,486,258 supported
fields: zero mismatches, three complete matching source hashes. Its 14.206669-second
run peaked at 289,054,720 sampled process-tree RSS bytes, within the original
512 MiB/14,400-second limits. It explicitly records 22,777 limited packets.
Reference configuration disables TCP sequence suppression and TCP/IP reassembly;
duplicates remain occurrences and quoted headers are outside the outer-header
comparison. Bounded local pipes preserve source/output access restrictions.
Sanitized aggregate evidence: `examples/actual-capture-validation.json`.

These comparator-only changes leave all 14 other analysis/helper module bytes
unchanged from fc0439f; the private reuse receipt verifies this. Actual analyses
remain certified at fc0439f, while the independent comparison is pinned separately
at 8b0c45d. Whole-case code inventories include oracle.py, so a new inventory
would differ; no claim is made that every module hash is unchanged.

## Other supporting evidence and limits

- Restored ef97601 baseline: 131 tests passed locally and in both CI jobs.
- Integrated suite: all 163 tests passed exact-head CI. Bounded lookup regressions
  cover 16k chronological/common identifiers, rare late identifiers, content-aware
  duplicate references and indexed support selection. Invalid time offsets and
  distinct DNS answers retain accurate semantics.
- Final pinned public corpus recheck: 8 files /109 packets /1,122 independent
  comparisons, zero mismatches, 8 complete source verifications. Rich generated
  PCAP/PCAPNG: 12 packets /120 comparisons, zero mismatches, 2 source verifications.
  Prior results with fewer checked fields remain historical.
- Clean 07d2a53 synthetic repeated-mapping qualification: two independently counted
  10k-packet runs, 1.721/1.715 seconds analysis, 5.361 seconds full cost,
  47,976,448-byte maximum sampled worker RSS, 102,793,421 output bytes/run.
  Historical measurements remain explicitly synthetic.

No HoneyTrace runtime or legacy Base44 application code changed. The HoneyTrace
v1 contract remains a validated offline exchange; live runtime consumption is
unimplemented. Optional classic-PCAP TLS continuation has the scoped qualification
above; general reassembly/decryption and unsupported protocol/vendor coverage
remain unclaimed. The native BLE-ARD public layout now has its own genuine-source
receipt. The original Tetra source path and genuine combined-source calibration
remain external prerequisites; additional owner BLE formats are unverified.

## Exact next commands

Verify the primary checkout, held qualified code and documentation delivery state.
The PR check command requires a GitHub connection:

```sh
cd /home/jayforensics/Development/Jay-Forensics/Sentinel-Forensics
pwd -P
git rev-parse --show-toplevel
git status --short --branch
git remote get-url origin
git -C /tmp/sentinel-qualification-key-20261023 status --short --branch
git -C /tmp/sentinel-qualification-key-20261023 rev-parse HEAD
git -C /tmp/sentinel-qualification-key-delivery-20261023 status --short --branch
gh pr checks 19 --repo JayForensics/sentinel-forensics
```

From the primary checkout, inspect only safe fields of the completed saved
metadata. Exact actual API invocation and controlled-key reproduction remain in
private recipes. This block does not open evidence, indexes or keys:

```sh
python3 - <<'REVIEW'
import json
from pathlib import Path
def saved(path):
    with Path(path).open('rb') as stream:
        raw = stream.read(1048577)
    if len(raw) > 1048576:
        raise ValueError('saved metadata exceeds review bound')
    return json.loads(raw)
q = saved('qualification-private/packet-squirrel-real-14/qualification.json')
k = saved('qualification-private/packet-squirrel-real-14/candidate-gate.json')
r = saved('.sentinel-local/qualification-key-affected-validation-reuse-final-v2.json')
print({name: q[name] for name in ('status', 'code_commit', 'source_bytes', 'independent_packets')})
print(q['checks'])
print({'key_gate': k['status'],
       'held_key_readonly': k['external_controlled_key_stable_readonly'],
       'three_protected_copies_match': k['all_three_protected_key_copies_match']})
print({'reuse_status': r['status'], 'reuse_decision': r['reuse_decision'], 'checks': r['checks']})
REVIEW
```

Before delivery, review the four documentation files and new aggregate, require
applicable checks on their exact current head, and record PR #19 merge/tree
identity and post-merge checks in private HANDOFF. A docs-only identity proof
must bind all 23 Python runtime entries and the HoneyTrace schema to qualified
445abb1, completed real14/key gates and the COMPLETE reuse-v2 decision. Historical
7547e4f independent decoding and a60feb9 TLS execution remain separately pinned.
Metadata/documentation changes do not require another benchmark. Changed
processing must qualify the integrated candidate under budgets chosen before
execution. Preserve all held execution checkouts and completed evidence.

Next independent engineering is bounded handling of three oversized candidates
and examination of 21 indeterminate historical TLS references. All fitting cohorts
finished within nine pages per family at a60feb9; the earlier 959 batch-cap
deferrals are completed work. The supplied qualification-key propagation gap is
also fixed. Vendor common-header numeric support has explicit unchanged-decoding
reuse at 445abb1, while bodies and two LLC cases remain unexamined. Those coverage
gaps are software work, not BLOCKED_EXTERNAL prerequisites. No fresh actual TLS
chain at 445abb1 is claimed.

Genuine adapter/calibration work requires the original Tetra database and actual
source clock/network context. Additional owner BLE exports can establish layouts
beyond the separately validated public sample. The original USB after-check also
requires that media to be available. Preserve the old clone, private outputs,
failed receipts and exact recipes; no background execution is implied.

The full-decoding condition in GOAL.md remains unmet by QUALIFIED_LIMITATIONS.
Neither supported-field agreement, supplied-key reproducibility nor dataset
completeness waives the remaining 1,825 raw losses.
