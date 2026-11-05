# Sentinel-Forensics

Sentinel-Forensics is an offline evidence analysis project for analysts working
with authorized network captures, radio observations and diagnostic artifacts.
Its Evidence Lab CLI provides structured observations, searchable timelines,
flow summaries and explainable findings with references back to supplied sources.
The goal is a practical, independently testable analysis product that can be used
alongside HoneyTrace or independently of it.

**Qualification status: `QUALIFIED_LIMITATIONS`; overall goal: `IN_PROGRESS`.**
The demonstrated scope below is tied to recorded implementations and datasets.
It is not full decoding, `GOAL_PASS`, or a qualification of every feature on
the current branch.

## Current offline workflow

The [Evidence Lab CLI](tools/evidence_lab/README.md) implements:

- Read-only ingestion of supported classic PCAP and PCAPNG layouts, selected
  network protocol metadata, bounded radio exchange formats and diagnostic
  archive subsets. Unsupported content and decoding losses remain explicit.
- SQLite-backed timeline queries, context-scoped flow aggregation and association
  records. Original timestamps, precision and unresolved clock information are
  retained; configured clock adjustments remain explicit and reproducible.
- Findings with recorded thresholds, coverage requirements, explanation metadata
  and supporting source references. These support analyst review rather than
  automatic conclusions about compromise, physical-device identity or a person.
- Private case bundles and minimized, case-keyed pseudonymous exports.
  Minimized exports retain linkable information and require review before sharing.

Ordinary analysis uses Python 3.11+ and SQLite JSON1, without a server, account,
API key or the React/Base44 application. The CLI has no network client, DNS
resolution, enrichment, active scanning or capture/replay code. Local
`capinfos` is required for real-data qualification; `tshark` is used for
independent comparisons and the separate optional TLS reconstruction workflow.

See the [CLI guide](tools/evidence_lab/README.md) for setup, commands, input
bounds and output handling, and the [rule contract](tools/evidence_lab/RULES.md)
for finding semantics and false-positive limitations.

## Recorded qualification evidence

The following summarizes the [goal](tools/evidence_lab/GOAL.md),
[checkpoint](tools/evidence_lab/CHECKPOINT.md) and
[validation records](tools/evidence_lab/VALIDATION.md) reviewed on October 26, 2026.
These are existing recorded results, not a new benchmark performed for this README.

| Measure | Recorded result |
|---|---|
| Complete owner-confirmed Packet Squirrel dataset | Three classic PCAP files; **297,151,107 bytes** (approximately **297 MB**, decimal); **591,565 packets** |
| Qualified ordinary implementation | `445abb1ce9df314469f559c862ff15ec81144d49` (parser 2.0.10 / independent oracle 2.0.9) |
| Fresh ordinary analyses | Two runs passed all **14 applicable integrity, count, reproducibility and resource gates** |
| Implementation tests | **440 local tests**, no skips; exact-implementation Python **3.11/3.14 CI** passed |
| Coverage | **1,825 raw decoding limitations** remain; result is **`QUALIFIED_LIMITATIONS`**, not `GOAL_PASS` |

The owner corrected the original approximately **30 GB** estimate on
**October 21, 2026** and confirmed that the three files form the intended complete
dataset. Processing this complete approximately 297 MB set **does not demonstrate
30 GB-scale performance**. Recorded timings and resource measurements must not
be extrapolated to that scale.

### Independent comparisons and reproducibility

At historical implementation
`7547e4ff93fd499320e9f87134d8abe0a21a8d2e`, five independent supported-decoder
profiles passed, including **5,774,468 actual supported-field comparisons with
zero mismatches**. Separate vendor-header validation checked **729 original
records / 6,561 numeric fields**, with zero mismatches, and audited **1,458
stored header observations** across two cases. These checks cover supported
fields, not all protocol content or unrestricted forensic interpretation.

At `445abb1`, independent packet counts were freshly checked with `capinfos`.
The historical supported-decoding and vendor-header results were admitted by a
completed, explicit unchanged-code/data reuse gate
(`PASS_REUSED_UNCHANGED_SUPPORTED_DECODING`); **supported-field/TShark and
vendor numeric/storage comparisons were not rerun at that revision**.

The two fresh analyses preserved source hashes and the closed inventory,
verified completed output checksums and matched private raw semantics.
Their minimized exports matched after normalizing only the documented case run
UUID, using the same supplied key. Cross-version or cross-key export equality
is not claimed. The actual supplied-key workflow used the read-only loader and
qualification API; public CLI key forwarding has synthetic coverage.

Details: [qualification-key receipt](tools/evidence_lab/examples/qualification-key-validation.json),
[vendor-header receipt](tools/evidence_lab/examples/vendor-header-validation.json)
and [validation scope and measurements](tools/evidence_lab/VALIDATION.md).

## Remaining limitations and development

All **1,825 raw decoding limitations** remain recorded:

| Category | Count | Scope |
|---|---:|---|
| TLS-related | 1,094 | Raw `tls_reassembly_required` cases |
| Vendor bodies | 729 | Partial common headers are available; bodies remain unexamined and retain `unsupported_ethertype` |
| LLC | 2 | `unsupported_llc_control` cases |

Separate bounded TLS continuation at historical
`a60feb9a2a8defc3f85e92d6a85347e98f39da8e` produced, per independent family,
**1,070 verified Hello observations, 21 indeterminate results and three oversized
candidates not evaluated**. This does not remove the raw losses, establish
general reassembly/decryption, or qualify a changed-code continuation run.
The newer solo large-cohort profile has source-free validation only, pending
separate independent-decoder and actual-data qualification. See the
[TLS continuation receipt](tools/evidence_lab/examples/tls-continuation-validation.json)
and [CLI scope](tools/evidence_lab/README.md).

Other qualification boundaries remain explicit:

- PCAPNG is implemented with generated/fixture-based validation; the owner's
  qualified dataset is classic PCAP.
- Tetra recon-subset and narrowly scoped genuine public BLE compatibility
  results do not qualify every vendor format. Original Tetra evidence and
  genuine cross-source clock/network calibration remain prerequisites for
  broader validation; additional owner BLE layouts remain unverified.
- Full decoding, broader vendor-body coverage, unresolved TLS/LLC handling and
  30 GB-scale performance remain unqualified.
- The HoneyTrace exchange is an offline contract; live runtime consumption is
  unimplemented. The legacy browser IOSDiagnostics page performs compatibility
  checks, and its example artifact arrays are not genuine evidence collection
  or an integration with the offline pipeline.
- Windows permissions and performance are unvalidated.

## Evidence integrity and intended use

Source hashes, byte/record locations, before/after consistency checks, recorded
implementation/configuration details and completed-bundle checksums support
provenance review and reproducible analysis. They do not authenticate acquisition
origin, the analyst, or an end-to-end chain of custody. The recorded original USB
post-run check was unavailable; checks of the supplied analysis copies must not
be represented as that missing original-media verification.

Sentinel-Forensics is intended to assist documented forensic workflows.
The available qualification records do not establish blanket federal or state
legal compliance or guarantee that any output is admissible in court.
Lawful collection, case-specific handling, chain-of-custody documentation,
independent validation and professional interpretation remain necessary.
The project makes no general guarantee of detecting or preventing APT activity,
zero-click exploits, malware or spyware.

Keep raw evidence, keys, private indexes and reproduction recipes out of this
repository. Consult the [evidence goal and acceptance criteria](tools/evidence_lab/GOAL.md)
and [current checkpoint](tools/evidence_lab/CHECKPOINT.md) before treating a
capability as qualified.
