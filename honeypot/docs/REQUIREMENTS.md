# Implementation map

| Capability | Implementation and acceptance |
|---|---|
| SSH/Telnet sessions and credentials | Cowrie JSON/TTY, persistent state, tests/local-integration.py |
| Decoy services | OpenCanary HTTP/FTP/Redis; disabled examples documented in EXTENDING.md |
| IDS and protocol telemetry | Suricata AF_PACKET on both bridges; EVE; 11 local signatures |
| Central logging | Alloy fixed source paths, internal Loki TSDB retention, provisioned Grafana |
| Red flags/severity | detections/correlation/rules.json; incidentd.py; 4 levels and trusted CRITICAL boundary signals |
| Correlation | Source IP/window/session grouping; inferred links by username/fingerprint/UA/domain/URL/hash/command |
| PCAP | dumpcap finite ring, timestamp names, root systemd unit, loopback rotation test |
| Hashing | stable-file SHA-256/size/time/name/path manifest; no execution |
| Evidence | per-incident JSON/Markdown/events/commands/hashes/metadata and bounded PCAP/sample copies |
| Containment | nft table backup/preview/check/apply/scoped rollback; single-IP timeouts; reversible Docker pause |
| Automatic hook | opt-in host timer handles CRITICAL requests after evidence exists; no Docker socket in incidentd |
| Dashboard | 19 panels; credentials counted without displaying passwords; bait ids are separate |
| Health | disk/RAM/load/interfaces/Docker/services/logs/drop counts/HTTP/clock/permissions/forwarding/backups; alert bus only if configured and last delivery failed |
| Backups | timestamp archive + checksum; safe restore-check; optional verified protected-evidence copy to mount |
| Retention | Loki compactor, bounded writer/Docker logs, raw logrotate, finite capture; protected evidence manual |
| Deployment | preflight/bootstrap/start/stop/status/update and explicit dependency/systemd installation |
| Safety gates | fresh test records + current checks, fail-closed non-loopback startup, WAN matrix, approval record, source-fidelity evidence |
| Intel product | sanitized pack, STIX bundle, and brief from incident evidence; no raw password field |
| Bait | per-deployment tripwires under state/bait; not valid credentials |
| Alerts | disabled-by-default redacted webhook or SMTP; no reputation lookup |
| Validation | static validators, behavioral unit suite and target-only integration/namespace/ring tests |

Important limits: this is a build artifact, not a target runtime acceptance record.
No host EDR, unrestricted outbound downloads, automatic exposure, automatic sample
execution, automatic evidence deletion, or proof of complete network visibility
is claimed. Optional static file/strings/YARA inspection is documented and never
automatically runs a sample. Readiness checks require operator-run target tests;
they cannot certify the external router or prevent someone bypassing the scripts.
