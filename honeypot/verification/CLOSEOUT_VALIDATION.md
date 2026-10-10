# Close-out archive validation — 2026-09-28

Performed on the reconstructed close-out source tree before ZIP creation.

- Python compile of modified lifecycle/common/pcap/health/readiness scripts: PASS.
- `python3 -B -m unittest discover -s tests -v`: PASS (24 tests).
- Compose YAML parse: PASS; project `honeypot`; Cowrie DNS `172.29.40.254`; OpenCanary DNS `172.29.41.254`; both decoy restart policies `on-failure:5`.
- `boot_start()` static assertions: PASS; both decoys are inspected with per-decoy DNS before `compose start`; no build/pull/up/force-recreate is present in `boot_start()`.
- Runtime-material exclusion: PASS; no runtime `.env`, secrets, logs, captures, or pcap/pcapng files are included.
- Packaging-host `systemd-analyze verify`: NOT TESTED to completion because the packaging container does not contain target `/usr/sbin/nft`, Docker, or `docker.service`. The same Phase-A/Phase-B unit drafts were syntactically verified on the actual Ubuntu target during the live session; Phase-B installed-file hash matched the reviewed preview during its manual test (`e43f989074e573fa9820b421c32eddcd8a9f0c9e891021aacd5a78cde9a90d32`).

Live host claims are recorded separately in `docs/CLOSEOUT_2026-09-28.md`; this packaging validation does not re-run the operator laptop's live Docker/nftables/systemd state.
