# Deliberate extensions

OpenCanary examples already specify disabled MySQL 13306, MSSQL 11433, VNC 15900,
SIP UDP 15060 and SNMP UDP 1161. To enable one, edit opencanary.conf, add an explicit
loopback Compose port, install required optional Python extras (SNMP may require
additional dependencies), validate and probe only locally first. FTP/HTTP/Redis
are the default small subset. SMB support in OpenCanary reads Samba audit logs;
it is not a standalone SMB server. Do not enable smb.enabled unless separately
reviewed Samba audit production and read-only log mounts exist. Suricata outbound
SMB detection already works without adding a vulnerable Samba service.

Possible later public router mappings (approval required, and only if the WAN
port matrix marks them eligible): 2222, 2223, 8080, 2121. Redis `16379` is
default deny. Disabled Canary examples (MySQL, MSSQL, VNC, SIP, SNMP) stay off
the matrix. Do not expose UDP decoys without evaluating amplification risk.

Suricata starter rules are deliberately small. Add reviewed community rules via
suricata-update on an isolated update host, verify them with the deployed engine,
and copy the reviewed rule files to detections/suricata. Never blindly enable every
rule on a laptop. TLS/SSH contents are encrypted; signatures do not inspect decrypted
commands, while Cowrie application JSON does.

Sigma is portable detection documentation here, not an installed Sigma execution
engine. Translate its field mapping to a chosen backend later. YARA is optional
offline static inspection, not automatic malware family attribution. Local SHA-256
IOCs are active in incidentd and ship empty deliberately.

Zeek can later consume a mirrored interface for richer protocol metadata on a
separate sensor. OpenSearch/Elasticsearch can receive a copy of normalized events
if full-text analysis justifies the RAM/disk. Wazuh or another reviewed host audit
agent can emit verified boundary events after careful trust/false-positive design.
Do not add these to this initial 16 GB host without measurement and approval.
Remote write-once evidence storage, authenticated log shipping, signed manifests,
continuous alert notification and a dedicated artifact sandbox are further options.
No external notification connector is configured by default.
