# HoneyTrace forensic workflows

HoneyTrace connects offline analysis, verified cases, timelines, review leads and
operational diagnostics in the **HoneyTrace Forensic Dashboard**. The free
honeypot remains the suite's foundation. The full Sentinel-Forensics source is
bundled under `sentinel-forensics/`; dashboard jobs use its offline Evidence Lab
engine and import its minimized exchange through the HoneyTrace case interface.

## Open a honeypot interaction as a case

Follow the [local installation guide](INSTALL.md) to launch as your normal user.
Enable offline imports and **Sentinel Forensics** in **Settings**. In
**Honeypot**, choose **Try a synthetic interaction** for an explicitly synthetic
first run, or select an available saved Cowrie session or OpenCanary interaction. Choose
**Open case** to run the bundled analyzer and review its completed case.

Use `--telemetry-root /absolute/path/to/existing/honeypot` at launch when the saved
honeypot sources live outside this checkout. Source selection is read-only;
private analysis inputs and results remain in the dashboard workspace.

The case retains a bounded normalized log selection, its provenance, a derived
JSONL analysis input and any available command transcript. Structured passwords
are withheld, but free text may remain sensitive. Cowrie command input describes
an emulated interaction, not proven execution on a real host. OpenCanary
probe/authentication observations have no command transcript.

Packet support requires a verified preservation receipt and a unique connection
tuple/time match within a two-second tolerance. Missing candidates, ambiguous
matches or combined analysis inputs exceeding 64 MiB produce an explicit
log-only case. This bounded association does not establish completeness or actor
identity. Sensor time is unverified and saved data may be partial.

## Analyze a capture

Use Python 3.11 or newer on Linux. No dashboard dependencies, Node build or cloud
account are required. Download this unified repository onto the computer running
the dashboard. From its root:

```sh
bash tools/launch-dashboard.sh --port 8765
```

1. Open the private session URL printed in the terminal.
2. In **Settings**, enable offline imports and **Sentinel Forensics**.
3. Open **Forensic cases → Packet Squirrel / capture** and select or drop a
   finished local PCAP or PCAPNG, up to 64 MiB. Stop capture on the device before
   copying the file. You can associate an equipment entry when importing.
4. Follow the job's stage, then open its verified case. Filter the timeline,
   inspect provenance and coverage, and export the minimized case if needed.

The dashboard discovers the bundled analyzer automatically. If you deliberately
use another trusted Sentinel checkout, select it with
`--sentinel-root /absolute/path/to/sentinel-forensics` at launch.

The analyzer reads a retained private snapshot; the original capture stays
unchanged. A capture larger than 64 MiB remains rejected with a visible size
message and starts no job. Packet Squirrel input uses the same bounded analyzer;
this workflow does not acquire data from the device or start hardware capture.
Stages reflect actual starting, ingestion, analysis and verification work. Short
jobs may finish between dashboard refreshes. There is no estimated percentage.
Cancellation stops a running analyzer. Once final verification/import begins,
the job completes that commit so a saved case cannot be mislabeled cancelled.
Closing the dashboard cancels unfinished analysis. Safe job history survives
relaunch; interrupted jobs are labeled interrupted and are never auto-resumed.

**Import completed case** accepts an existing Sentinel case folder on the
dashboard's machine, even when its analyzer is unavailable. The entire checksum
ledger and completion metadata verify before its exchange is imported. Checksums
show integrity against that ledger, not independent authenticity.

## Review a case

Cases retain their own namespace, source hashes and verification receipt. Case
timelines are independent of the overview's 1,000-record preview and combined
export quota. Each page is fetched separately; filtering stays within the chosen
case. Nanoseconds remain exact decimal strings throughout the API and export.
Unknown times appear last and are excluded when a time range is selected.

**Provenance** opens the original observation supporting a timeline event. The
timeline and observation remain separate normalized records with unchanged IDs.
Coverage shows counts, protocol distribution, decoding losses and available rule
evaluations. A review lead is not proof of compromise. Identifiers are minimized
case-scoped pseudonyms; matching labels across cases do not establish identity.

**Overview** presents the saved interaction and command transcript where
available. **Leads** explains the rule, its thresholds, supporting observations
and possible benign explanations. Record your assessment independently of the
original analyzer finding, including a false positive assessment when supported.
Changing the review does not rewrite the underlying observation or rule result.

**Custody** shows recorded import/acquisition details, retained artifact hashes
and available importer, machine, analyzer and equipment information. Download
the human-readable custody report or a private retained artifact from that tab.
Unknown fields remain unknown, including details for older cases without a
custody record. An inventory association is operator supplied; its status is a
snapshot at case creation and does not prove device identity or earlier health.
Local account names do not verify a person's identity. Checksums establish
consistency with their reference values, not authorship or authenticity.

Exports contain minimized normalized records. Original captures, private indexes
and pseudonym keys are not included. Private retained-artifact downloads are
separate and may expose sensitive original content. Inputs, transcripts,
provenance attachments and completed companion bundles remain private
in a sibling of the import store: default `honeypot/state/phase10-cases`. This is
an ignored private runtime directory inside the outer HoneyTrace checkout and
outside the bundled Sentinel source tree. Preserve or move old bundles when that
workspace fills; moving a bundle does not remove its separately committed
HoneyTrace projection.

Private job inputs/context are recorded before analysis for recovery. A failed
custody finalization is reported separately from successful analysis and import;
the known case ID and retained job folder remain available for operator review.
It does not automatically retry or reconstruct an acquisition history.

## Current working bounds

The initial job engine accepts a 64 MiB capture, one active job and a two-minute
deadline. It retains twenty safe history summaries. The companion workspace is
bounded to 256 MiB, diagnostic output to 1 MiB, process memory to 512 MiB and each
output file to 64 MiB. Existing bridge limits remain 8 MiB/10,000 exchange records
and 64 MiB per verified bundle. A small capture can produce a larger exchange;
verification/import failures remain visible rather than appearing as success.

The bundled engine, or an explicitly selected checkout override, is trusted
analysis code. Its subprocess has a minimal environment, fixed arguments and
resource limits; these are not network or filesystem isolation. No live capture,
scan, tool installation or sensor service change is part of this workflow.

Large-case streaming, richer backup recovery and continuous sysdiagnose watching
with alerts are follow-up increments. Existing finished, unencrypted iMazing
backup support remains metadata-only. BLE, Wi-Fi and RF acquisition remain later
hardware adapters. The case/job API is the common integration boundary for those
future workflows.

## Source validation — 2026-11-01

The separate checkout at commit `187bec14835fc9497b05594ca467a49259553d64`
analyzed its own synthetic 27-packet fixture through the new job engine. The case
verified and produced 34 timeline events and four review leads. Source hashes,
exact timestamps, protocol/search filters, pagination and minimized exports were
checked through the authenticated HTTP API. No live evidence was used.

That earlier result is not a new qualification of the bundled source layout.
The import is pinned by [source metadata](sentinel-source.json); current unified
workflow results belong in the [forensic acceptance receipt](FORENSIC_ACCEPTANCE.md).
Upstream's native qualification command expects its own Git workspace and reports
`workspace_mismatch` inside the bundle. Its source-identity guard is unchanged.

See [unified source](UNIFIED_SOURCE.md), [dashboard use](DASHBOARD.md),
[suite logging](SUITE_LOGGING.md), and the [roadmap](SECURITY_SUITE_ROADMAP.md)
for the wider workflow.
