# HoneyTrace Forensic Dashboard

One local workspace connects the free honeypot core, telemetry, offline evidence
analysis, verified cases and diagnostics. The complete tracked Sentinel-Forensics
source is bundled in [sentinel-forensics/](sentinel-forensics/README.md), so a
second checkout is not needed for capture analysis.

Use Linux with Python 3.11 or newer, including its standard-library SQLite module.
From this downloaded repository's root, run as your normal user:

```sh
bash tools/launch-dashboard.sh --port 8765
```

Open the private session link printed in the terminal. In **Settings**, enable
offline imports and **Sentinel Forensics** and save settings. Open **Honeypot**,
choose **Try a synthetic interaction**, then **Open case** to follow a saved example
through local analysis, transcript, timeline, review leads and custody. The
[installation guide](docs/INSTALL.md) covers that first case, existing saved
honeypot data, updates and recovery. No pip/npm packages, Docker or cloud account
are needed for this local workflow.

For a finished Packet Squirrel PCAP/PCAPNG, open **Forensic cases → Packet
Squirrel / capture** and drop the file. Captures up to 64 MiB are accepted; a
larger file stays rejected with a clear size message and the original unchanged.

The [dashboard guide](docs/DASHBOARD.md) covers import, provenance review and
export. The [forensic workflow guide](docs/FORENSIC_WORKFLOWS.md) covers jobs,
case timelines and coverage; [suite logging](docs/SUITE_LOGGING.md) covers
diagnostics and decoy identity preparation. See [unified source](docs/UNIFIED_SOURCE.md)
for the bundled source revision and active integration scope, and the
[roadmap](docs/SECURITY_SUITE_ROADMAP.md) for later capabilities.

The [feature review and debugging handoff](docs/FEATURE_DEBUG_HANDOFF.md) records
the current review branch, validation and remaining limits.

The application source is in [honeypot/](honeypot/README.md).
The [current phase status](docs/CURRENT_PHASE_STATUS.md) records HoneyWatch at
`efac52cce39cd8adcf86a00cd4fe2cb7ab66f607` and the separate October 31 lab closeout.
See [source provenance](docs/SOURCE_SYNC.md) and
[beta acceptance](honeypot/docs/BETA_ACCEPTANCE.md).

**Phase 7: CLOSED — OWNER-ACCEPTED WITH EXCEPTIONS — ISOLATED LAB ONLY** for
candidate `40d31fce8322feee41ac766717a9369bfc762373`, as reported from the owner's
private gate ledger. Independent acceptance remains unestablished.

**Current HoneyWatch image set: NOT LIVE-QUALIFIED. Beta release remains BLOCKED.**
The candidate's reported seven-row B18 PASS does not qualify the newer Loki,
Grafana and Alloy image pins on HoneyWatch. Source merges do not establish that
the running VM changed images. The closeout, evidence limits and image comparison
are recorded in current status. Phase 8, WAN exposure and automatic decoy boot
remain unauthorized; daemon-reload remains HOLD.

Do not deploy over a live staging tree or start Compose from another checkout
on the staging daemon. Runtime changes require their own reviewed scope.

The September 30 ZIPs and import receipts are preserved historical artifacts;
they are not the current application source. Source validation verifies their
immutability separately from the current source manifest. No live logs, captures,
incidents, credentials, private review packages or deployment secrets are included.

See the [integration review](docs/INTEGRATION_REVIEW.md) for the combined source, dependency safeguards and restoration-test limits.
