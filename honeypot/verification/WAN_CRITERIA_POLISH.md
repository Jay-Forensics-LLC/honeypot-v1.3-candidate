# WAN criteria polish — 2026-09-30

Source-only polish of `honeypot-v1.2-wan-2026-09-30.zip`
(SHA256 `42341a238c05a740911a546b6579f7b364891d24231d348bf075a28aef3ab2cd`
verified on the file used as the baseline). No router rules were changed.
`DECOY_BIND` was not changed. Staging was not touched. `compose up` was not run.

## Inventory (before edits)

| Topic | Finding | Action |
|---|---|---|
| Test counts | This tree: 60. Lab validation doc still says 47. `docs/VALIDATION_REPORT.md` is a dated lab/hardening snapshot. | Left historical reports alone. README now states 60 for **this** tree. |
| ZIP SHA256 | Baseline file hashes to `42341a23…`. Older handoff cited `d83d14e0…`. | README records the current hash and calls `d83d14e0…` stale. |
| Ubuntu | Image pin `ubuntu:24.04`. Live host Ubuntu 26.04. | DEPLOYMENT labels both. Pin unchanged. |
| `PROTECTED_SUBNET` | `.env.example` is `192.168.0.0/16`. Live must stay `10.0.0.0/24`. | Full-line comments only. Example value unchanged. |
| Approval examples | Identical files under `configs/wan/` and `state/`. | Documented. Both kept (`state/**` gitignore exception). |
| Readiness footgun | Evidence is per-tree. hp-src FAIL after staging tests is the wrong tree. | README, FIRST_BOOT, OPERATIONS, existing WAN_CRITERIA note. |
| Grafana panels | REQUIREMENTS already says 19 panels including bait ids. | No change. |
| WAN window docs | DEPLOYMENT §12 already points at `wan check` + approval + source mode. | No change. |
| UPnP | `project_uses_upnp()` remains false. | No change. |
| Live bait tagging | Compose volume present; running image UNKNOWN until rebuild. | Not claimed OBSERVED. |
| FILE_TREE | Matched disk before polish file added. | Regenerated after last edit. |

## What changed

Docs and comments only:

- `README.md` — title, current ZIP name/checksum, do-not-extract-over-staging, per-tree readiness, test count 60.
- `DEPLOYMENT.md` — 24.04 pin vs live 26.04 labeled.
- `.env.example` — comments warning not to overwrite live `PROTECTED_SUBNET`.
- `docs/WAN_CRITERIA.md` — duplicate approval templates explained.
- `docs/FIRST_BOOT.md`, `docs/OPERATIONS.md` — runtime-tree readiness.
- `CHANGELOG.md` — polish heading.
- This file.

No change to `exposure_gate`, `boot_start`, Redis `127.0.0.1` pin, port matrix eligibility, default readiness names, alert-bus default, or bait generator behavior.

Shell `+x` bits were restored on `scripts/*.sh` for POSIX packaging (zip extract/copy had dropped them). That is packaging hygiene, not a gate change.

## OBSERVED

- `python3 -B -m unittest discover -s tests -v` — Ran 60 tests, OK.
- `python3 -B scripts/validate.py` — PASS 14, NOT TESTED 5 on this sandbox (PyYAML and bash available here; YARA/Docker/Suricata/Alloy/live Ubuntu not). Historical WAN note of 11 PASS / 6 NOT TESTED was a poorer sandbox, not a different tree.
- `hp.py wan matrix` — eligible 2222, 2223, 8080, 2121; Redis 16379 ineligible.
- `hp.py wan status` — `DECOY_BIND=127.0.0.1`, `MANAGEMENT_BIND=127.0.0.1`, WAN mode asserted false.
- `hp.py wan check` — six `wan_*.json` PASS on loopback; fidelity `scope` detector-only. Those JSON files were deleted before packaging.
- Markdown relative links resolve.

## INFERRED

An operator who hashes the polished ZIP will not see `42341a23…` (that is the unpolished baseline). Use the new `.sha256` beside the polished ZIP. Staging readiness remains UNKNOWN until run in `/home/joe/honeypot-staging/honeypot`.

## UNKNOWN

Live WAN bind, router forwards, `wlp2s0` DNAT source fidelity, netns fidelity on the IdeaPad kernel with this tree, table-delete while the oneshot guard unit stays active, automatic boot, watcher latency, bait annotate inside the running incidentd image.

## Not done

Live exposure, automatic boot, preview watcher enablement, Redis on the WAN, extra protocols, UPnP, reputation lookups, copying this candidate onto staging, `compose up` from `~/hp-src`.

This is still not authorization to bind or forward.

No router rules were changed.
