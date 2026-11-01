# Install HoneyTrace locally and open your first case

The local dashboard connects the free honeypot core's saved observations to
forensic cases. It runs the bundled Sentinel analyzer on your computer. The
optional modules in Settings choose the evidence workflows you use; no paid
service or external account is required for the workflow below.

## Download and start

[Download the Milestone 5 review ZIP](https://github.com/Jay-Forensics-LLC/honeypot-v1.3-candidate/archive/refs/heads/codex/local-case-workflow-20261101.zip)
or [view its source](https://github.com/Jay-Forensics-LLC/honeypot-v1.3-candidate/tree/codex/local-case-workflow-20261101).

Use Linux, Bash and Python 3.11 or newer with its standard-library `sqlite3`
module. Keep the complete downloaded repository in a writable, private location
owned by your normal user, including `honeypot/` and `sentinel-forensics/`.
Use the supplied source revision or review branch containing this workflow.
Downloading an older default branch does not add unpublished changes.

From that repository's root:

```sh
bash tools/launch-dashboard.sh --port 8765
```

The launcher checks Python and SQLite before opening the dashboard. No pip/npm
installation, Node build, Docker, root account, `.env` setup or cloud key is
needed. Open the complete `http://127.0.0.1:8765/#token=…` session link printed in
the terminal; keep it private. Leave the terminal open while using the dashboard.
Use `Ctrl+C` there to stop it. If port 8765 is already in use, choose another
local port with `--port 8766`.

## Open a first case

1. Open **Settings**, select **Enable offline imports** and **Sentinel
   Forensics**, then choose **Save settings**.
2. Open **Honeypot** and choose **Try a synthetic interaction**. This creates an
   explicitly synthetic local interaction for the walkthrough; it does not
   contact a decoy.
3. Choose that interaction's **Open case**. The bundled analyzer runs locally;
   follow its stages and open the completed case in **Forensic cases**.
4. In **Overview**, read the command transcript and packet-association limits.
   Use **Timeline** to inspect observations and **Leads** to review the rule's
   supporting records, thresholds and possible benign explanations.
5. In **Leads**, record your assessment, including **False positive** when
   appropriate. Your review remains separate from the original analyzer finding.
6. Open **Custody** to inspect acquisition/import details, source hashes,
   retained evidence and any equipment snapshot. Download the custody text report
   or a retained artifact when you need it. The minimized case export is a
   separate download.

The example proves the local workflow with synthetic evidence. It does not
establish that a honeypot, containment policy or capture service is running.

## Use existing honeypot observations

The default **Honeypot** view reads saved normalized observations associated with
this checkout. To select an existing local HoneyTrace application directory:

```sh
bash tools/launch-dashboard.sh --port 8765 --telemetry-root /absolute/path/to/existing/honeypot
```

This selects saved data for reading; it does not start services or refresh their
health. Keep the dashboard's policy, imports and case workspace in its own
operator-owned location. Do not overwrite the selected sensor directory to
install this dashboard.

Choose a retained Cowrie session or OpenCanary interaction and **Open case**.
HoneyTrace preserves the selected log projection and its provenance, prepares a
derived analysis input, and retains a transcript when command input is present.
OpenCanary probe/authentication observations do not supply a command transcript.
Command input observed in an emulated shell does not prove execution on a real
host. Sensor timestamps and the completeness of saved selections remain limited.

A preserved PCAP is included only when its acquisition receipt verifies and a
unique candidate matches the connection tuple and observation window, with a
two-second tolerance. Missing, ambiguous or oversized packet support produces an
explicit log-only case. The combined log and capture analysis inputs must fit
within 64 MiB. Packet overlap is an association, not proof of a complete session
or an actor's identity.

## Bring a Packet Squirrel capture

Collect using your authorized device setup, stop capture, then copy the finished
PCAP or PCAPNG to this computer. Open **Forensic cases → Packet Squirrel /
capture** and drop or select the file. You may associate equipment from **My
equipment** before starting analysis. HoneyTrace retains a private copy and leaves
the source file unchanged.

The limit is **64 MiB (67,108,864 bytes)**. An oversized file stays rejected in
the dialog with a visible message; no analysis starts. Preserve that original
and choose a smaller finished capture. Streaming and automatic splitting are
later work. Device acquisition and live hardware control are outside this local
import workflow.

## Keep work through updates and recovery

Stop the dashboard before changing source or backing up its workspace. With
default paths, keep these private items together:

| Item | Default location |
| --- | --- |
| Module settings | `honeypot/configs/phase10.json` |
| Imported originals, normalized cases and private review/custody state | `honeypot/state/` |
| Retained analysis inputs, attachments, case bundles and job history | `honeypot/state/phase10-cases/` |
| Equipment inventory | `honeypot/state/equipment.json` |
| Suite diagnostics | `honeypot/logs/system/` |

These paths can contain sensitive evidence and are ignored by Git. A source ZIP
or a minimized case export does not back them up. Preserve originals separately
and keep a private backup of the workspace before an update.

For an existing clean Git checkout, update the selected source branch using your
normal source-review process; preserve ignored state. For an archive update,
extract the new source separately and retain the old checkout privately until
your saved cases are accessible. Restore private state with its permissions and
configured absolute paths intact. A moved evidence folder may need its recorded
locations restored before artifact access works.

You can keep policy, case imports and diagnostics at stable external paths:

```sh
bash tools/launch-dashboard.sh --port 8765 --policy /private/workspace/policy.json --store /private/workspace/imports --log-root /private/workspace
```

The job directory is a sibling of the store (`imports-cases` in this example).
Equipment remains in the selected checkout's `honeypot/state/equipment.json`;
preserve it separately when changing checkouts. Reopen the new session link
after every dashboard restart. Interrupted jobs remain interrupted and do not
resume automatically. If custody finalization fails after a case import, retain
its private job folder and known case identity for review; a retry is not an
automatic repair.

Use **Diagnostics** for sanitized operational troubleshooting. Keep raw captures,
transcripts and custody artifacts private when sharing results. Hashes show
consistency with their references; they do not establish authorship or capture
authenticity. Equipment status is a snapshot at case creation, not proof of
historical device identity or health.

See the [dashboard guide](DASHBOARD.md), [forensic workflows](FORENSIC_WORKFLOWS.md)
and [Milestone 5 handoff](MILESTONE5_HANDOFF.md). Live decoy installation and runtime
qualification retain their separate [deployment status](CURRENT_PHASE_STATUS.md).
