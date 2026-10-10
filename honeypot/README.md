# Portable defensive honeypot — v1.3 production candidate

An Ubuntu deployment bundle for a dedicated Lenovo IdeaPad Slim 3 (Ryzen 7,
16 GB RAM, approximately 500 GB SSD). The build contains configuration, application
code, rules and operator tooling; it does not include Docker images or an offline
Ubuntu package mirror. Nothing automatically forwards router ports.

See [WAN criteria](docs/WAN_CRITERIA.md) for the technical gates. See
[production readiness](verification/PRODUCTION_READINESS.md) for what is
repository-complete versus live-only. Unit tests in this tree: 63.

**Deployment candidate, not a claim of production certification.** Read
[validation results](docs/VALIDATION_REPORT.md) and the
[lab checklist](docs/LAB_ACCEPTANCE.md). `make verify` is the fast local check;
`sudo make verify-full` is the documented target check. Native runtime checks
must pass on the isolated Ubuntu lab before calling the stack functional.

## Quick start on the Ubuntu target

Read the [one-screen operator model](docs/OPERATOR_MODEL.md) first. Use
`python3 scripts/hp.py status` (or `bash scripts/hp.sh status`) as the single entrypoint.
Legacy wrappers remain supported. See [patch validation](docs/HARDENING_VALIDATION.md)
for the preview-only watcher and supervised target checks.

This ZIP is a **source candidate**. It does not authorize a WAN bind. Do not
extract it over a live tree (`/home/joe/honeypot-staging/honeypot`). Do not
`compose up` from a second checkout (`~/hp-src`) while staging is the runtime.
Run `readiness.py` and lab tests from the runtime tree; they write
`state/test-results/` next to that tree only.

Current pack: `honeypot-v1.3-production-candidate-2026-09-30-polish2.zip`
Verify the sibling `.sha256` file. Do not reuse older digests
(`30bfa139…` was the first v1.3 candidate; `42341a23…` was the pre-v1.3 WAN zip; `d83d14e0…` is stale).

```bash
sha256sum -c honeypot-v1.3-production-candidate-2026-09-30.zip.sha256
unzip honeypot-v1.3-production-candidate-2026-09-30.zip
cd honeypot
sha256sum -c MANIFEST.sha256
bash scripts/preflight.sh
# Read DEPLOYMENT.md, configure .env, and approve target dependency installation.
cp -n .env.example .env
sudo bash scripts/install-dependencies.sh --install
bash scripts/validate.sh
sudo bash scripts/bootstrap.sh
sudo bash scripts/apply-containment.sh --apply
sudo bash scripts/start.sh
```

Continue with [exact deployment steps](DEPLOYMENT.md) and
[first boot](docs/FIRST_BOOT.md). Grafana defaults to localhost:3000; its initial
admin password is generated only on the target. The first local services are
Cowrie SSH 2222, Telnet 2223, OpenCanary HTTP 8080, FTP 2121, and Redis 16379 on loopback. Redis stays on 127.0.0.1 even if other decoy binds change. See docs/WAN_CRITERIA.md.
Loki and Alloy have no published host port. No real passwords, API keys, private
keys or captured samples are included.

The runtime capture of credentials is sensitive. Restrict membership in numeric
group 2000 and access to the target. Dashboard queries intentionally count password
attempts rather than showing their values. Raw restricted evidence retains them.

Start with [architecture](ARCHITECTURE.md), [security](SECURITY.md),
[storage](STORAGE.md), [detections](DETECTION_RULES.md) and [recovery](RECOVERY.md).
The [requirements map](docs/REQUIREMENTS.md) identifies implemented functions and
limitations. Ordinary status: `sudo bash scripts/status.sh` and
`sudo bash scripts/healthcheck.sh`. Shutdown: `sudo bash scripts/stop.sh`.
