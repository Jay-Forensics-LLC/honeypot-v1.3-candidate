# HoneyTrace Forensic Dashboard: delivery milestones

HoneyTrace's free honeypot core is the entry point. The suite adds one operator
workspace for telemetry, evidence analysis and optional security integrations.
The master interface is the HoneyTrace Forensic Dashboard.
The existing honeypot keeps its own deployment status while suite source work
progresses separately.

Each milestone is complete when its main workflow works, focused checks pass,
and known limitations are recorded. Optional polish and additional formats move
to the backlog. Completing a source milestone does not require finishing every
later feature or requalifying unrelated runtime components.

| Milestone | Useful result | Completion check |
| --- | --- | --- |
| **1. Offline foundation — complete** | Optional-module policy, private originals and provenance, report imports, Sentinel exchange bridge, unencrypted backup metadata and mock enrichment | Import, review/export and repeat-import work; disabled modules leave sensors alone |
| **2. Dashboard MVP — complete** | One local interface for the free honeypot core, evidence/imports, findings, saved telemetry and module settings | An operator can import a report, inspect its provenance and export results without using the CLI |
| **3. Forensic backbone — complete** | Verified case workspaces, precise searchable timelines, coverage, offline PCAP/Packet Squirrel jobs, diagnostics and decoy identity preparation | A representative capture completes end to end with progress, useful results and exports |
| **4. Assessment review — complete** | Approved Nmap/Nuclei review, exact-asset grouping, private triage and provenance-linked reporting; equipment inventory with sourced status | Selected reports can be reviewed, triaged and exported without changing evidence |
| **5. Product packaging** | Practical installation, updates, recovery and clear free-core/optional-module presentation | A fresh local installation reaches the main workflow using the guide |
| **6. Hardware capture** | BLE, Wi-Fi and RF adapters as hardware and supported formats become available | One supported device produces usable telemetry through an isolated adapter |

## Current source scope

The foundation uses standard-library Python and an optional operator CLI. The
dashboard now provides the main workflow in a responsive local browser interface.
Live provider clients, active scanners, billing, new sensor listeners and hardware
capture remain later capabilities.

- [Phase 10 architecture and commands](phase10/ARCHITECTURE.md)
- [Supported import formats](phase10/PLUGIN_SPECIFICATION.md)
- [Sentinel bridge and limits](phase9/IMPLEMENTATION.md)
- [Validation results](phase10/ACCEPTANCE_REPORT.md)
- [Dashboard guide and validation](DASHBOARD.md)

The complete tracked Sentinel-Forensics source is bundled in the unified
checkout. The dashboard discovers its offline analyzer automatically; an optional
`--sentinel-root` selects a separate trusted checkout. Packet Squirrel input uses
its PCAP path. The new iMazing/Apple adapter inventories metadata from finished,
unencrypted backups; it does not decrypt backups or recover file contents.
Initial imports are bounded small datasets. Large-case streaming and expanded
backup recovery extend the forensic backbone in follow-up increments.
Threat-intelligence providers currently use local mock responses. Bundling the
legacy React/Base44 source does not activate every page or backend function;
the working integration is the local dashboard and offline case/job backbone.

## Backlog without blocking milestone 1

Further dashboard polish, large-case streaming, representative real-tool
export compatibility, persistent provider caches, richer forensic details,
cross-host inventory, installer packaging and hardware drivers are later work.
The prior broad security audit remains partial; its unvalidated source leads
are not a completed security certification of these additions.

Continuous sysdiagnose analysis with alerts is deferred until the watcher and
notification rules can build on the case/job APIs. No hardware is required for
the current offline analysis workflow.

- [Forensic workflow guide](FORENSIC_WORKFLOWS.md)
- [Unified source and import provenance](UNIFIED_SOURCE.md)
- [Software-wide logging and private management](SUITE_LOGGING.md)
- [Forensic backbone validation and handoff](FORENSIC_ACCEPTANCE.md)
- [My equipment](MY_EQUIPMENT.md)
- [Assessment review](SECURITY_REVIEW.md)

Live provider clients extend milestone 4 later; the working assessment workflow
does not depend on an external account or new scanner.

The forensic backbone builds on published dashboard commit
`77a04369922333a514db43d3a729c639f8271b8f` on review branch
`codex/forensic-workflows-20261101`. Deployment,
firewall, WAN and daemon operations retain their existing target-specific
authorization; they are separate from these source milestones.
