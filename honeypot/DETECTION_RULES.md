# Detection rules and limitations

All starter signatures are experimental. A match is telemetry to review, not proof of exploit success. Suricata watches plaintext/network metadata; Cowrie provides emulated application input.

| SID | Detection | Severity | Likely false positives / limits |
|---|---|---|---|
| 1000001 | Outbound shell marker | HIGH | Benign plaintext scripts; misses encrypted shells |
| 1000002 | Reverse-shell port behavior | HIGH | Any legitimate service using 4444/5555/1337/9001 |
| 1000003 | RFC1918/protected attempt | HIGH | Docker private-range traffic; observes attempts, not success |
| 1000004 | HTTP MZ executable | HIGH | Legitimate executable download; MZ prefix is weak |
| 1000005 | Repeated SSH SYNs | MEDIUM | Health/test retries; threshold 10 per source per minute |
| 1000006 | masscan HTTP UA | MEDIUM | Spoofed/test user agent |
| 1000007 | DNS burst | MEDIUM | Resolver retries/bursts; 50 UDP packets per minute |
| 1000008 | Metadata IP contact | HIGH | Cloud SDK probes; not proof of metadata retrieval |
| 1000009 | Outbound SMB SYN | HIGH | Deliberately enabled administration |
| 1000010 | Outbound RDP SYN | HIGH | Deliberately enabled administration |
| 1000011 | mining.subscribe plaintext | HIGH | Pasted samples or test clients; TLS mining missed |

## Application and correlation rules

LOW: isolated generic probe/background connection. MEDIUM: eight authentication attempts or three services in one source/time window, suspicious HTTP paths, scanner or DNS rules. HIGH: successful emulated login, commands, file transfer, hash IOC match, outbound denial or listed IDS high indicator. CRITICAL: only verified trusted boundary signals from the root-owned read-only input.

- `command.persistence`: HIGH. Pattern: `(?i)(crontab|authorized_keys|/etc/systemd|\.bashrc)`. False positives: authorized exercises, pasted text or emulated commands that never execute on the host.
- `command.reverse_shell`: HIGH. Pattern: `(?i)(/dev/tcp/|\bnc\b.*\s-e\s|bash\s+-i|socat.*exec)`. False positives: authorized exercises, pasted text or emulated commands that never execute on the host.
- `command.tunnel`: HIGH. Pattern: `(?i)(ssh\s+.*-[DRL]\s|chisel|frpc)`. False positives: authorized exercises, pasted text or emulated commands that never execute on the host.
- `command.mining`: HIGH. Pattern: `(?i)(xmrig|minerd|stratum\+tcp)`. False positives: authorized exercises, pasted text or emulated commands that never execute on the host.
- `command.logging_disable`: HIGH. Pattern: `(?i)(history\s+-c|systemctl\s+stop\s+(auditd|rsyslog)|/dev/null.*log)`. False positives: authorized exercises, pasted text or emulated commands that never execute on the host.
- `command.escape_indicator`: HIGH. Pattern: `(?i)(/var/run/docker.sock|nsenter|/proc/1/root|mount.*cgroup)`. False positives: authorized exercises, pasted text or emulated commands that never execute on the host.

Session IDs enrich missing Cowrie source fields. Username, SSH/TLS fingerprint, user-agent, domain, URL, SHA-256 and command similarity links are INFERRED, not identity proof. Receipt-time windows are configurable; fields are bounded to resist log-based resource exhaustion. Source IPs may represent NAT or a Docker workload.

Sigma: cowrie-persistence.yml mirrors persistence input detection; experimental HIGH, not automatically executed.

YARA Suspicious_Shell_Combination: paired shell networking/execution strings; benign scripts and test text can match. Suspicious_Mining_Config: paired mining configuration markers; legitimate mining software can match. Neither identifies a malware family. Static rules cannot prove malicious behavior.

SHA-256 IOCs: exact reviewed digests only, shipped empty; hash match confidence depends on indicator provenance. No remote reputation service is contacted.

Health: 80% MEDIUM, 90% HIGH, 95% CRITICAL disk thresholds. Idle logs, stale backups, unknown drops and failed services produce health warnings. Health CRITICAL disk state does not manufacture an attacker compromise incident.

See detections/correlation/rules.json for actual thresholds, and tests/test_engine.py for exercised cases. Tune against local false positives, record changes in CHANGELOG.md, and validate Suricata/YARA syntax before activation.
