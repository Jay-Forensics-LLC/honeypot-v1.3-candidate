# systemd operation

`python3 scripts/install-systemd.py --preview` prints all rendered regular and
preview units to stdout without root, group creation, or writes to /etc.
`@ROOT@`, `@PCAP@`, and `@EVIDENCE_GROUP@` are resolved by the same renderer.
On Ubuntu the evidence group is the existing GID 2000 group, or the proposed
honeypot-evidence group if absent. Installing requires a path without spaces.

`sudo python3 scripts/install-systemd.py --install` installs the regular units
and enables only regular maintenance timers. PCAP starts explicitly after its
bridges exist. Preview guard/stack/watch units are **not installed, not enabled**
by default. `--install-preview --approved` installs the preview units without
starting or enabling any of them. Existing differing units cause refusal before
writes; review and back them up before replacement. No automatic decoy boot is
permitted by these flags. Watcher activation still requires explicit approval.

The preview watcher checks actual nft JSON, not oneshot unit state. It stops
only Cowrie/OpenCanary on missing table/chains, changed hooks, DNS policy drift,
or missing final drop, and records guard.table_missing. It never recreates
containers or applies firewall policy. The timer polls 10 seconds after each
completed check, with 1 second scheduling accuracy; query time, stop time, and
host scheduling add delay. Failure to stop is logged as success=false and the
unit fails. A subsequent timer run retries. This is not instantaneous isolation.

The existing firewall-log timer uses a journal cursor. Its period (plus scheduling
and command time) is the maximum intended detection delay while the journal and
service are healthy. A vacuumed cursor is reported in parser-errors.jsonl; no
finite delay guarantee applies until the cursor fault is reviewed. No rsyslog
or nft log-group service is introduced. See the
[supervised opt-in drill](../docs/HARDENING_VALIDATION.md).
