# HoneyTrace source candidate

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
