# Honeypot close-out archive — 2026-09-28

Purpose: preserve the reviewed source/config state reached at the end of the 2026-09-28 local-lab session.

This archive intentionally excludes runtime `.env`, secrets, logs, PCAPs, captured credentials/payloads, Docker state, and host-installed `/etc/systemd/system` files. The systemd drafts under `systemd/preview/` are source/reference copies only.

Start with `docs/CLOSEOUT_2026-09-28.md` and `verification/OPEN_BLOCKERS.md`.

Do not interpret this ZIP as approval for WAN exposure, `DECOY_BIND` changes, automatic decoy boot, or an installed nft watcher.
