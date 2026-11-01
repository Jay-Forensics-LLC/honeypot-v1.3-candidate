# HoneyTrace Forensic Dashboard

The local dashboard brings the free honeypot core, saved telemetry, offline
analysis, verified cases and diagnostics into one workspace. Its forensic engine
is included in the same checkout. Start with a saved honeypot interaction or
finished capture, review its findings and provenance, then export what you need.
The [installation guide](INSTALL.md) covers a clean local start, first example,
updates and private workspace recovery.

## Open the dashboard

The dashboard must be downloaded to the computer where you run it. A path under
`/workspace/work/` shown in a cloud development session is not a path on your
desktop. Cloning the upstream default branch does not include unpublished changes;
use the supplied dashboard review branch or source bundle.

Use Linux with Python 3.11+ and its standard-library SQLite module. From that
downloaded repository's root, run as your normal user:

```sh
bash tools/launch-dashboard.sh --port 8765
```

Open the complete local URL printed in the terminal. It includes a temporary
access token for this dashboard session. Keep that URL private. The dashboard
removes the token from the address bar after connecting; if a reload asks you to
connect again, reopen the original terminal URL. Stop the dashboard with
`Ctrl+C` in the same terminal.

The dashboard listens on `127.0.0.1`. Its default policy and private import store
belong to the selected HoneyTrace checkout. To use a separate operator-owned
workspace, supply paths when starting it:

```sh
bash tools/launch-dashboard.sh --port 8765 --policy /private/workspace/policy.json --store /private/workspace/imports
```

## Your first honeypot case

In **Settings**, turn on **Enable offline imports** and **Sentinel Forensics**
and choose **Save settings**. Open **Honeypot → Try a synthetic interaction**,
then choose the synthetic interaction's **Open case**. Follow local analysis and open the saved
case's **Overview**, **Timeline**, **Leads** and **Custody** tabs.

The transcript describes observed inputs. Leads show supporting records, rule
thresholds and possible benign explanations; your review, including a false
positive assessment, stays separate from the original finding. **Custody** shows
retained artifacts, hashes, import details and equipment snapshots, with a text
report and private artifact downloads. Review evidence before sharing it.

To read existing saved HoneyTrace data, launch with
`--telemetry-root /absolute/path/to/existing/honeypot`. This reads saved sources;
it does not start or refresh sensors. A selected interaction can become a
log-only case when no unique, verified packet association is available. The
[workflow guide](FORENSIC_WORKFLOWS.md) explains those bounds.

## Your first report

1. Open **Settings**, turn on **Enable offline imports** and select the report's
   module. Choose **Save settings**. You can begin with SpiderFoot or BBOT;
   enable only the modules you intend to use.
2. Choose **Import evidence**, select the report type and format, then select
   your local report file. For a first try, use **Download sample CSV**, select
   SpiderFoot and CSV, and import that file. The sample is labeled synthetic.
3. Open **Evidence & Analysis** to search the imported findings. Select a
   finding's **Review provenance** action to inspect its source, record identity
   and hash, then choose **Export findings** when ready.

Use **Quick start & help** in the sidebar whenever you want the short walkthrough
again. Disabling imports preserves stored originals; re-enable the relevant
module to include its findings in the workspace and export.

Importing an existing report does not launch the tool that created it. Findings
are observations or review leads; they are not automatic proof of compromise.
Original report bytes remain in the private store, linked to the normalized
results by their SHA-256 hash. Dashboard export contains normalized findings.

## Find your way around

| Page | Use it for |
| --- | --- |
| **Overview** | See real import counts, recent activity and the next useful action |
| **Evidence & Analysis** | Search findings, inspect provenance and export results |
| **Forensic cases** | Analyze finished captures, follow jobs, review transcripts, timelines, leads and custody |
| **Diagnostics** | Search structured suite operations and export sanitized diagnostics |
| **My equipment** | Label hardware/tools/sensors, record class/value and follow sourced status |
| **Security review** | Prioritize approved Nmap/Nuclei observations, record triage and export reports |
| **Telemetry** | Review available saved health observations and source activity |
| **Honeypot** | Open saved interactions as cases, try the synthetic example and review recorded posture |
| **Integrations** | Import supported reports and use the available offline tools |
| **Settings** | Choose modules, asset scope and import preferences |

An empty workspace is expected on a new checkout. Missing telemetry means no
saved observation is available; it does not mean that a sensor is healthy or
unhealthy. The dashboard displays saved status and its timestamp rather than
running a fresh Docker, firewall or capture check.

## Specialized evidence

**Sentinel cases:** import a completed local Sentinel case folder. Folder paths
refer to the computer running the dashboard. The importer checks the case's
completion state and checksum ledger before accepting its exchange.
**Forensic cases → Packet Squirrel / capture** accepts a finished local
PCAP/PCAPNG by file selection or drop, up to 64 MiB. An oversized capture remains
rejected with a visible message. Analysis uses the bundled engine automatically,
retains a private source copy and leaves the original unchanged. You can optionally
select a separate trusted checkout with `--sentinel-root` at launch.
See the [forensic workflow guide](FORENSIC_WORKFLOWS.md) and
[Sentinel bridge guide](phase9/IMPLEMENTATION.md).

**iMazing/Apple backups:** provide `Manifest.plist`, `Status.plist` and
`Manifest.db` from a finished, unencrypted backup. This feature summarizes
backup metadata. It does not decrypt the backup or recover file contents.

**Threat intelligence:** current enrichment uses local mock responses. Provider
results are labeled as mock data and no indicator is sent to an external service.

BLE, Wi-Fi and RF capture are marked **Planned**. Their cards describe later
capabilities and do not start scanners or require hardware setup now.

## When something needs attention

- **Module disabled:** enable the relevant module in **Settings** and retry.
- **Report rejected:** check its selected format and supported input shape.
  Initial report imports support up to 8 MiB and 10,000 records; some specialized
  inputs have smaller limits.
- **Assessment scope required:** list the assets covered by your existing
  report and confirm permission in **Settings**. This still imports a report;
  it does not authorize or start an active scan.
- **Saved telemetry unavailable:** use the import and analysis workflow normally.
  Fresh runtime observations come from the existing HoneyTrace operator tools.
- **Capture too large:** the capture limit is 64 MiB, separate from the report
  import limit. Keep the original and choose a smaller finished capture.
- **Custody unavailable:** missing fields remain unknown. Preserve private job
  inputs and the known case ID if finalization failed; do not infer an earlier
  acquisition history from hashes or current equipment status.

For exact report formats and current bounds, see the
[import specification](phase10/PLUGIN_SPECIFICATION.md). The
[suite roadmap](SECURITY_SUITE_ROADMAP.md) separates this dashboard milestone from
later forensic, live-integration and hardware work.

## Milestone 2 validation — 2026-11-01

The dashboard MVP is source-complete on `codex/dashboard-mvp-20261101` in
`/workspace/work/honeytrace`, based on HoneyWatch commit
`bce3d92c608202db20a51c00cd8ee2c64093bf9e` plus the preceding foundation work.
The MVP was published as commit `77a04369922333a514db43d3a729c639f8271b8f` on
`codex/dashboard-mvp-20261101`. The forensic backbone builds on that publication.

- Full source baseline passed, including `make -C honeypot test` and
  `make -C honeypot verify`: 736 tests run, 729 passed and 7 native-tool skips.
  Repository tooling tests also passed (68 tests).
- Chromium checks passed the actual settings, CSV import, finding/provenance
  review and JSON download workflow. All six pages rendered without script
  errors. A separate 390 × 844 mobile browser passed navigation, evidence view,
  quick-start access and horizontal-overflow checks.
- Desktop, provenance and mobile screenshots are retained with local QA results
  under `/workspace/work/phase10/dashboard-qa`. Browser inputs were synthetic;
  screenshots are not live sensor or production evidence.
- Independent review found and corrected mobile navigation selectors, report
  format selection, recent-import ordering and unavailable-state messaging.

Brand marks, editorial labels and the observe-to-evidence workflow follow the
[Jay Forensics HoneyTrace page](https://jayforensics.com/honeytrace/). The local
palette uses the existing charcoal/red source theme; direct production stylesheet
downloads were unavailable in this environment, so exact CSS matching was not
verified.

This milestone adds a local browser workflow. Runtime collection and operational
deployment retain their existing status. Live provider clients, active scans,
large-case streaming and hardware capture remain later work.

The forensic increment adds **Forensic cases**, **Diagnostics** and **Honeypot →
Decoy identity**. The source now includes the complete tracked Sentinel tree;
its legacy React/Base44 pages are retained source, while this dashboard is the
active integrated interface. See [unified source](UNIFIED_SOURCE.md) for that
boundary and [suite logging](SUITE_LOGGING.md) for diagnostics and the optional
separate operator log root.
