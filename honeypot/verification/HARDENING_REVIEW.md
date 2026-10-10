# v1.2 hardening patch review

Baseline: honeypot-v1.2-closeout-2026-09-28.zip supplied by the operator.
The older Honeypot-Beta directory is unchanged. This is a focused source patch;
no target services, firewall rules, packages, or persistent units were installed.

Packaging continuation 2026-09-29: Codex/ChatGPT exhausted credits while
generating the ZIP, checksum, and baseline patch. The source tree already
contained the hardening modules and 46 passing unit tests. This closeout
does not change containment semantics. It restores POSIX execute bits,
drops leftover `logs/system/audit.jsonl` from unit-test runs, regenerates
`docs/FILE_TREE.txt` and `MANIFEST.sha256`, requires the new CLI/guard
files in `validate.py`, and emits the missing artifacts.

OBSERVED: 46 behavioral unit tests pass. Static validation on this Linux
packaging host has YAML and bash checks available; Docker/Suricata/Alloy/YARA
and live nft/systemd remain NOT TESTED. Tests cover table/chain/drop/DNS
drift, active-exited table deletion, selective stop and stop failure,
runtime resolver drift, rendered exposure gates, startup cleanup, redaction
through actual engine output, audit filtering, backup failure, health
rate/backup behavior, and preview installation without activation.
Pinned image digests and Compose loopback defaults are unchanged.

INFERRED: once activated, the preview watcher detects policy loss and requests
shutdown of only Cowrie/OpenCanary. Exact ordered matching is deliberately
conservative: unrecognized nft serialization may refuse a safe policy rather
than silently accept an unsafe one.

UNKNOWN: native nft/Compose/Alloy/systemd behavior, dashboard query execution,
and the supervised table-delete drill on the Ubuntu target. Polling and Docker
availability remain limits; this is not Internet-ready. Raw evidence, historical
Loki data, and arbitrary free text remain sensitive. No historical data was erased.

Start with the [operator one-pager](../docs/OPERATOR_MODEL.md). Exact Ubuntu
commands and the isolated, opt-in table-delete drill are in
[hardening validation](../docs/HARDENING_VALIDATION.md).

The standalone patch applies from inside a pristine extracted baseline's
`honeypot/` directory using `git apply --check /path/to/honeypot-v1.2-hardening.patch`
then `git apply /path/to/honeypot-v1.2-hardening.patch`. Review local differences
first. The new ZIP is a source candidate, not an in-place runtime upgrade script.
Its manifest excludes runtime data; never extract it over protected evidence.

## Changed / added files

- `.env.example`
- `ARCHITECTURE.md`
- `CHANGELOG.md`
- `DEPLOYMENT.md`
- `NETWORK_MAP.md`
- `README.md`
- `SECURITY.md`
- `configs/alloy/config.alloy`
- `configs/nftables/hp-guard.nft.in`
- `dashboards/honeypot-overview.json`
- `docs/CLOSEOUT_2026-09-28.md`
- `docs/HARDENING_VALIDATION.md`
- `docs/OPERATOR_MODEL.md`
- `docs/REQUIREMENTS.md`
- `docs/VALIDATION_REPORT.md`
- `docs/validation-results.json`
- `scripts/backup.py`
- `scripts/containment-hook.py`
- `scripts/firewall.py`
- `scripts/guard_policy.py`
- `scripts/guard_watch.py`
- `scripts/healthcheck.py`
- `scripts/hp.py`
- `scripts/hp.sh`
- `scripts/hp_common.py`
- `scripts/incidentd.py`
- `scripts/install-systemd.py`
- `scripts/ops.py`
- `scripts/pipeline_health.py`
- `scripts/quarantine.py`
- `scripts/validate.py`
- `systemd/README.md`
- `systemd/preview/honeypot-guard-watch.service.in`
- `systemd/preview/honeypot-guard-watch.timer.in`
- `systemd/preview/honeypot-hp-guard.service.in`
- `systemd/preview/honeypot-stack.service.in`
- `tests/firewall-netns.py`
- `tests/test_engine.py`
- `tests/test_hardening.py`
- `verification/OPEN_BLOCKERS.md`
- `docs/FILE_TREE.txt` and `MANIFEST.sha256` regenerated for the delivered tree.
- `verification/HARDENING_REVIEW.md` (this review).

## Replaced preview filenames

- `systemd/preview/honeypot-hp-guard.service` -> corresponding `.in` template
- `systemd/preview/honeypot-stack.service` -> corresponding `.in` template
