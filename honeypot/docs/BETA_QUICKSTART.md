> **Deployment interruption recorded 2026-10-16.** A temporary checkout on the live
> IdeaPad used the same Compose project and fixed container/network/bridge names,
> then removed the running deployment. Later operator output reports all seven
> staging services healthy and PCAP active after manual start. Later tracking and
> manager checks confirm synchronization. A successful health unit and later JSON
> with no problems/warnings are now supplied; their current-boot/invocation binding
> is incomplete. Clock/health diagnosis is closed for these observations. A displayed full
> guard table and Loki health warning are narrower successful observations.
> Fresh packet collection and evidence integrity remain unverified. Do not run Compose up/down from
> another checkout; a different directory or -p alone is not isolation. Use a
> separate dedicated machine/VM for an approved fresh installation test.

# Private beta source quickstart

This is an unverified source candidate, not installation or activation approval.
Use a new review directory; never extract over staging or start a second stack.
Read [beta acceptance](BETA_ACCEPTANCE.md) before target work.

Scope is frozen to supervised, localhost-only operation. New features, Phase 8
automatic boot/recovery and WAN exposure are separate deferred work. The linked
checklist is the single initial-beta release decision; it remains BLOCKED on incomplete live/package acceptance.
Daemon-reload stays on hold while its named review prerequisites remain open.

The 2026-10-16 install-test distribution is built from the uncommitted candidate
based on ee0b7e3, including the applied qualification patch. Its BUILD_INFO.json,
MANIFEST.sha256 and sibling ZIP checksum identify the actual bytes; HEAD alone
does not identify this working tree. It is UNVERIFIED and does not authorize target
installation. See the packaged INSTALL_TEST_CANDIDATE.md for scope and exclusions.
The older a9414aef source ZIP remains a separate historical artifact.

Documented target: dedicated Ubuntu 24.04 LTS x86_64, Python 3.12, one system
Docker Engine with Compose v2, nftables, tshark/dumpcap and protected storage.
The current laptop is Ubuntu 26.04.1/Python 3.14.4. Source tests there do not
certify a fresh target installation or boot recovery.

## Isolated review and demonstration

Verify the sibling ZIP checksum, extract to a new directory, then:

```bash
cd honeypot
sha256sum -c MANIFEST.sha256
make test
make verify
make stage7-test
python3 -B scripts/hp.py demo --mode replay
```

Inspect the printed local `index.html` and `report.json`. Synthetic Cowrie records
pass through the real engine: normalization, HIGH classification, incident
retention and duplicate prevention after reload. This writes a new sandbox only;
no network, live logs, services or firewall changes. Replay does not test live
decoys, Loki, packet capture or containment.

The qualification-portability patch is applied, uncommitted. The seven synthetic
modules and their reviewed helpers are included; clean-extract and identical
candidate-copy runs each passed 89 Stage 7 tests and 8 runner regressions. The
historical missing-module failure is retained in B04's evidence. These synthetic
results do not establish live Stage 7 closeout, packet preservation, full current
application-suite acceptance or a supported-environment installation.

## Read-only runtime diagnosis

```bash
python3 -B scripts/hp.py doctor --runtime-root /home/joe/honeypot-staging/honeypot
```

PASS_DAEMON_OWNERSHIP is not health or qualification PASS. A failed check blocks
startup; it does not authorize Docker recovery. The agent's process sandbox may
be incomplete. Native privileged observations use existing operator sudo only.

| Result | Appropriate next step |
|---|---|
| Permission denied | Use approved operator sudo for read-only diagnosis; retain socket/group controls |
| Missing socket | Inspect intended endpoint and unit state; do not create or symlink substitutes |
| Connection refused | Inspect daemon identity and journal; distinguish refusal from permissions |
| Successful zero-container response | API works; reconcile context/store/workload ownership |
| Multiple daemons or unexpected data root | Block startup; review both stores before any service-change proposal |
| API incompatibility | Retain versions and exact error; do not force API version without evidence |
| Timeout/operation error | Preserve it separately; neither establishes a complete inventory |

The current tooling uses Docker CLI subprocesses, not the Docker Python SDK.
Service dependencies are specified in Dockerfiles; no requirements.txt workflow.

## Operator visibility and storage

Saved status is dated evidence, not a refresh. Source status rejects stale or
previous-boot snapshots; staging helpers may differ. `logs --source normalized
last 20` uses a bounded tail. Operational logs remain private: structured secret
redaction does not certify arbitrary captured free text for sharing.

Read [storage](../STORAGE.md), [security](../SECURITY.md),
[architecture](../ARCHITECTURE.md) and [recovery](../RECOVERY.md).
The default PCAP ring is roughly 100 GB, not total disk demand. Loki, protected
evidence and backups have no hard aggregate byte cap. Measure growth, keep free
space and review retention. Critical storage handling currently stops PCAP only.
Automatic fail-closed decoy shutdown/recovery is not a proven installed safeguard.

## Deployment and rollback boundary

No beta source deployment is performed or approved. These changes affect operator
tooling, not incidentd's deployed evidence schema. Do not synchronize whole trees.
After ownership and acceptance gates pass, review a file allowlist, backup hashes
and exact rollback before target changes. Changed ops/inventory modules require
`daemon_check.py`; changed CLI log display also requires `log_tail.py`.

For source rollback, reconstruct the preserved freeze in a new checkout and
compare reviewed files. Do not reset current work, overwrite runtime, remove
evidence or run Compose down/prune. Live recovery must preserve evidence, offsets,
custody and prior policies; unverified guard/capture blocks decoy activation.
