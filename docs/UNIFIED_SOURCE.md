# Unified HoneyTrace source

The **HoneyTrace Forensic Dashboard** is the master local interface for the free
honeypot core, telemetry, offline analysis, cases, jobs and diagnostics. One
downloaded checkout now includes both the HoneyTrace application and the full
tracked Sentinel-Forensics source.

## Source layout and active behavior

| Location | Role |
| --- | --- |
| `honeypot/dashboard/` | Active local dashboard interface |
| `honeypot/scripts/dashboard.py` | Authenticated loopback dashboard and case/job API |
| `honeypot/scripts/phase10/` | Optional imports, evidence store, case workspace and offline analysis jobs |
| `sentinel-forensics/tools/evidence_lab/` | Bundled offline analysis engine, protocols, reports and independent tooling |
| `sentinel-forensics/tools/ios_sysdiagnose/` | Bundled supported diagnostic-archive ingestion |
| `sentinel-forensics/src/` and `sentinel-forensics/functions/` | Retained upstream React/Base44 application and backend source |

The legacy React/Base44 files are included, not started or rebuilt by the local
launcher. Their presence does not establish that every legacy page, cloud
function, integration or advertised capability works in the unified dashboard.
The active integration is the offline analyzer → verified exchange → case/job
workspace, with HoneyTrace's existing import, telemetry and diagnostics paths.
No Node build, Base44 account or cloud key is needed for that workflow.

## Start from one checkout

Use Python 3.11 or newer on Linux. From the downloaded repository root:

```sh
bash tools/launch-dashboard.sh --port 8765
```

The dashboard discovers `sentinel-forensics/` beside the application automatically.
Open the printed private session link, enable **Sentinel Forensics** in
**Settings**, then use **Honeypot → Open case** or **Forensic cases → Packet
Squirrel / capture**. A separate checkout
can be selected explicitly with `--sentinel-root /absolute/path/to/checkout`.
See the [workflow guide](FORENSIC_WORKFLOWS.md) for the complete user journey.

Private captures, generated cases and logs are not written into the bundled
Sentinel source. Default completed-case storage is the ignored
`honeypot/state/phase10-cases` directory in the outer HoneyTrace checkout.

## Exact bundled provenance

| Item | Recorded value |
| --- | --- |
| Upstream | `Jay-Forensics-LLC/sentinel-forensics` |
| Commit | `187bec14835fc9497b05594ca467a49259553d64` |
| Git tree | `45e7025dd351732dfa0d321362891ff353f8b940` |
| Imported prefix | `sentinel-forensics/` |
| Tracked files | 1,416 |
| Upstream file bytes | 11,448,833 |
| License | AGPL-3.0, preserved in `sentinel-forensics/LICENSE` |

[The import manifest](sentinel-source.json) records the upstream, exact revision,
tree, inventory totals and license digest. `tools/validate_sentinel_bundle.py`
reconstructs the Git tree from the bundled file bytes and Git file modes without
requiring a nested Git checkout. The import includes the complete committed tree,
with the local replacements and additions recorded individually in the manifest;
upstream Git metadata/history and untracked files are not copied. Its current
inventory totals and effective tree include the preserved review-branch fixes.

The original license, source notices, upstream documentation and retained test
fixtures stay with the imported source. See
[third-party notices](../THIRD_PARTY_NOTICES.md). This import record is not an
exhaustive security clearance or a claim about evidence acquisition authenticity.

## Qualification remains explicit

Normal offline analysis and the unified dashboard workflow are separate from
upstream's native real-dataset qualification command. That command expects the
Sentinel directory to be its own Git top level. In this bundled layout its
unchanged guard reports `workspace_mismatch`; the guard has not been weakened to
turn a source copy into an upstream-qualified checkout.

The pinned import manifest establishes source identity. Current HoneyTrace
workflow checks are recorded in the [forensic acceptance receipt](FORENSIC_ACCEPTANCE.md).
Historical Sentinel qualification receipts retain their original source/dataset
scope. A separate upstream checkout can still be used when that native workflow
is needed.

Publication note: GitHub push protection rejected a credential-shaped value in
Sentinel's mocked code-audit input. That one demo literal is replaced by an
explicit placeholder, with a modification notice. The source manifest records
both effective and upstream tree identities and each changed file. A second
recorded patch closes test-owned descriptors on setup/diagnostic failure after PR
review; production reconstruction behavior is unchanged. Later local source
changes are listed individually in the manifest. Snapshot validation verifies the
upstream and effective trees; all 1,416 upstream files and the license remain.
