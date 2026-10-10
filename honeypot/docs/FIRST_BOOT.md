# First boot workflow

Follow DEPLOYMENT.md for commands. The ordered sequence is:

1. Transfer the ZIP to the Ubuntu laptop.
2. Verify the ZIP SHA-256 against the separately trusted checksum.
3. Extract; verify MANIFEST.sha256 and retain the original ZIP.
4. Run `bash scripts/preflight.sh`.
5. Review detected interfaces, disk models, storage, ports, routes and time sync.
6. Create/edit .env with actual protected network and loopback bindings.
7. Approve and install dependencies using the explicit --install command.
8. Validate configurations; resolve failures and note native checks pending images.
9. Bootstrap runtime directories and initial secrets. Review/apply temporary hp_guard
   now: the local stack deliberately refuses startup without this safety prerequisite.
10. Start internal/loopback services; install reviewed timers and start bounded PCAP.
11. Run readiness and acceptance tests from the **runtime** tree only (today `/home/joe/honeypot-staging/honeypot`). Evidence is written to that tree’s `state/test-results/`. A FAIL in `~/hp-src` after tests ran in staging is the wrong tree, not a lab regression.
12. Inspect authenticated Grafana and verify datasource queries.
13. Perform localhost-only SSH/HTTP probes (the integration test does this).
14. Verify synthetic benign artifact hashing, incident reports and evidence paths.
15. Review broader router/DMZ isolation and isolated namespace firewall/rollback tests.
16. Obtain explicit approval before Internet exposure; require fresh readiness PASS.
17. Deliberately bind the chosen decoy address and expose selected router ports only.
18. Monitor initial traffic, CPU, disk and Suricata drops closely.
19. Tune detections using actual false-positive evidence, keeping change records.
20. Back up configuration, rules, dashboards, incident metadata and hash manifests.

The baseline nftables guard is deliberately earlier than Internet topology work.
Nothing automatically creates an Internet port forward, changes host management,
or persists firewall policy. After reboot, reapply the temporary guard before start.
