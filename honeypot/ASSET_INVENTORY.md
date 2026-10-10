# Planned asset inventory

| Asset | Planned value / discovery status |
|---|---|
| Host | Lenovo IdeaPad Slim 3, dedicated honeypot |
| CPU | AMD Ryzen 7; exact model UNKNOWN |
| Memory | 16 GB RAM |
| Disk | Approximately 500 GB SSD; exact model/filesystems UNKNOWN |
| OS | Ubuntu Linux; baseline 24.04 LTS; installed version UNKNOWN |
| Interfaces | One physical adapter assumed; names/MACs UNKNOWN |
| Protected subnet | UNKNOWN until preflight; sample default is not discovery |
| Management address/subnet | UNKNOWN until configured; initial services loopback only |
| Virtualization | UNKNOWN until preflight |
| Software | Cowrie, OpenCanary, Suricata, Alloy, Loki, Grafana, incidentd, dumpcap, nftables |
| Docker bridges | br-hp-cowrie, br-hp-canary; separate observability network |
| Owners | Host operator root; decoy UIDs 999/10002; incidentd/Loki/Alloy 10001; Grafana 472 |
| Evidence group | Numeric GID 2000; audit existing group before bootstrap |

Update with preflight output and date after target inspection. Do not infer actual
hardware or connectivity from the reference inventory. Record deployed image
digests and installed package versions under state/ and in your change record.
