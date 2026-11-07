# Phase 10 tool inventory

This source change does not install investigation tools. Availability in an old
desktop or laptop transcript does not establish availability in the current
environment or on another host.

The inventory command inspects the current environment without starting tools.
A discovered executable path establishes presence only. Version compatibility,
licensing, functioning dependencies, GUI availability and container state need
separate observations. Cross-host inventory has not been performed by this
implementation.

| Tool or service | Implemented Phase 10 use | Installation required for import |
| --- | --- | --- |
| SpiderFoot | Offline CSV/GEXF report import | No |
| Recon-ng | Approved version 1 workspace JSON import | No |
| BBOT | Offline JSONL event import | No |
| Nmap | Authorized, scoped XML report import | No |
| Nuclei | Authorized, scoped JSONL report import | No |
| CloudFox | Authorized version 1 report envelope | No |
| BloodHound | Authorized isolated-lab aggregate summary | No |
| GoPhish, King Phisher, Microsoft Attack Simulation Training | Authorized aggregate awareness metrics | No |
| OTX, AbuseIPDB, GreyNoise, VirusTotal, ThreatFox, certificate transparency | Injected mock response normalization | No credentials or client |
| ExifTool, CyberChef | Explicit local evidence-copy workflow; no execution | External analysis environment |
| TShark, Wireshark | Existing separately governed packet-analysis workflow | Outside new import package |
| PhoneInfoga, Sherlock, Maigret, Holehe, Maltego, Subfinder, Amass | Inventory/manual casework only | No new adapter |
| Caido, WhatWeb, WAFW00F, testssl.sh, TruffleHog | Inventory/manual workflow only | No new adapter |
| Evilginx3, Muraena, Modlishka, Social-Engineer Toolkit | Excluded from integration | Never loaded |

Run the local inventory command separately on each intended host and retain its
report privately with the checkout commit and observation time. Missing programs
are ordinary inventory results; they do not fail sensor startup. Do not turn a
path discovery into an installation or operational-qualification claim.
