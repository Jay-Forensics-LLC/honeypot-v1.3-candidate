# Reconstruction validation

This archive was rebuilt from the original `honeypot-ubuntu-portable-v1` source archive plus the source changes demonstrated during the live session. It is not a byte-for-byte export of the running laptop.

Validation performed on the reconstructed source:

- Python syntax/bytecode compilation: PASS.
- YAML parsing for Compose, Loki, Grafana provisioning, Suricata, Sigma: PASS.
- Python unit tests: 24/24 PASS.
- No runtime `.env`, generated Grafana secret, runtime logs, state, artifacts, or PCAP evidence included.
- `MANIFEST.sha256` regenerated after reconstruction.

Live-only checks that cannot be reproduced in this packaging environment are documented in `LIVE_EVIDENCE_SUMMARY.md`.
