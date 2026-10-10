# v1.2 hardening validation and opt-in target drill

OBSERVED: unit tests and static validation run on any host with Python 3.
A 2026-09-29 packaging/lab host running Ubuntu 24.04 in a container had
nftables userspace but no `nft_log`/`nft_limit` kernel expressions, no Docker
daemon, and systemd `offline`. That host proved isolated veth drop/accept
behavior with a verdict-only policy. It did not prove full log/limit policy,
Compose, PCAP, decoys, Loki, Grafana, or the table-delete watcher drill.
INFERRED: the shared ordered-policy check detects changes in the supported nft
JSON schema and requests decoy-only stop. UNKNOWN: native Ubuntu desktop/server
behavior until the checks below pass. Do not mark this system Internet-ready.

Fast local check: `make verify` or `python3 -B scripts/target-validate.py`.
Full target check: `sudo python3 -B scripts/target-validate.py --runtime`.
`--write-report` writes `work/lab-acceptance-results.json` only; it does not
rewrite tracked docs.

## Read-only and isolated validation on Ubuntu

From the reviewed `honeypot` directory, with the source patch applied:

```bash
python3 -B scripts/target-validate.py
python3 -B -m unittest discover -s tests -v
python3 -B scripts/validate.py
docker compose config --quiet
python3 scripts/install-systemd.py --preview
sudo python3 scripts/firewall.py test
sudo python3 -B tests/firewall-netns.py
sudo python3 -B scripts/target-validate.py --runtime
```

The namespace test creates isolated temporary veth namespaces without a physical
uplink. It now checks live nft JSON against the shared verifier, in addition to
its connection/reply and owned-table removal checks. It never modifies the host
ruleset. The `firewall.py test` command writes a project-local preview file and
uses nft check mode; it does not apply policy. No command above installs units.

Render units into a temporary directory for native verification without /etc
writes (dependency warnings for units not installed on this host need review):

```bash
python3 - <<'PY'
import importlib.util, pathlib, subprocess, tempfile
spec = importlib.util.spec_from_file_location('installer', 'scripts/install-systemd.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
with tempfile.TemporaryDirectory(prefix='hp-unit-review-') as tmp:
    paths = []
    for name, content in m.render_units(preview_units=True).items():
        path = pathlib.Path(tmp) / name
        path.write_text(content)
        paths.append(str(path))
    subprocess.run(['systemd-analyze', 'verify', *paths], check=True)
PY
```

## Approved local upgrade and runtime checks

Stop decoys before replacing hp_guard. On an existing deployment, stop Alloy and
incidentd while relocating old `logs/normalized/*.jsonl*` into a new protected
evidence directory. Preserve files and their hashes; do not delete or overwrite
evidence. This prevents historical plaintext passwords being ingested when Alloy
restarts. Existing Loki data is not retroactively sanitized. Review data retention
separately. New sanitized per-source files start receiving newly processed events;
the correlator does not replay all old raw logs automatically.

After this evidence migration and source/config review, explicit local actions:

```bash
sudo docker compose stop cowrie opencanary
sudo python3 scripts/hp.py guard apply --apply
sudo python3 scripts/hp.py guard status
sudo python3 scripts/hp.py start
sudo docker compose exec -T alloy /bin/alloy validate /etc/alloy/config.alloy
sudo python3 scripts/healthcheck.py
python3 scripts/hp.py health
python3 scripts/hp.py logs --source audit last 20
sudo python3 -B tests/local-integration.py
sudo python3 scripts/hp.py readiness
```

For first deploy, follow DEPLOYMENT.md bootstrap, bridge creation and PCAP steps
before the decoy operation flow. Keep all binds loopback. Verify the three new
dashboard panels locally, generate synthetic probe traffic, and check increasing
drop counters and fresh audit rows. Queries and rendered native configuration
are not live-validated by the Windows unit suite.

## Supervised table-delete drill — opt-in only

APPROVAL REQUIRED. Run only at an isolated lab console with physical/WAN uplinks
disconnected, no router forwarding, loopback-only decoys, and no untrusted live
sessions. Deleting the table temporarily removes containment; loopback publishing
alone does not isolate decoy egress. Do not run over the only management path.
Have a second local root console available for `docker compose stop cowrie
opencanary` if the watcher cannot stop them. A timer is not an instantaneous
containment boundary.

Review the rendered units first. The installer refuses differing installed units;
back up and reconcile any older guard/stack unit before continuing. Installing
these drafts is a separate approved step and enables nothing:

```bash
python3 scripts/install-systemd.py --preview
sudo python3 scripts/install-systemd.py --install-preview --approved
```

At the isolated root console, from the project directory, after explicit approval:

```bash
sudo -s
set -eu
# A failure or normal exit stops decoys and restores only the owned table.
cleanup() {
    docker compose stop cowrie opencanary
    python3 scripts/firewall.py apply --apply
    systemctl stop honeypot-guard-watch.timer
}
trap cleanup EXIT

docker compose stop cowrie opencanary
systemctl stop honeypot-hp-guard.service
systemctl start honeypot-hp-guard.service
systemctl start honeypot-pcap.service
python3 scripts/hp.py boot-start
python3 scripts/hp.py guard status
systemctl show honeypot-hp-guard.service -p ActiveState -p SubState
docker inspect --format '{{.Name}} {{.Id}} {{.State.Running}}' \
    honeypot-cowrie honeypot-opencanary honeypot-loki honeypot-alloy \
    honeypot-grafana honeypot-incidentd > /tmp/hp-drill-before.txt

# Start for this supervised session only; DO NOT enable the timer or stack.
systemctl start honeypot-guard-watch.timer
nft delete table inet hp_guard
sleep 15
systemctl show honeypot-hp-guard.service -p ActiveState -p SubState
docker inspect --format '{{.Name}} {{.Id}} {{.State.Running}}' \
    honeypot-cowrie honeypot-opencanary honeypot-loki honeypot-alloy \
    honeypot-grafana honeypot-incidentd > /tmp/hp-drill-after.txt
cat /tmp/hp-drill-before.txt /tmp/hp-drill-after.txt
python3 scripts/hp.py logs --source audit last 20
journalctl -u honeypot-guard-watch.service --since '-5 min' --no-pager
python3 - <<'PY'
import json, subprocess
names = ['cowrie', 'opencanary', 'loki', 'alloy', 'grafana', 'incidentd']
rows = json.loads(subprocess.check_output(['docker', 'inspect', *['honeypot-'+n for n in names]]))
for name, row in zip(names, rows):
    assert row['State']['Running'] == (name not in ('cowrie', 'opencanary')), name
PY
exit
```

Required observations: guard service still `active/exited`; both decoys stopped;
same container IDs; observability still running; `guard.table_missing` audit with
observed/expected fields and `success=true`. Watch service exit 1 is intentional
when guard policy is absent, even after a successful stop. The 15-second wait is
a test expectation on a responsive host, not a real-time guarantee. A timeout,
Docker error, or unchanged running decoy is FAIL: stop decoys at the second console.
Cleanup leaves decoys stopped and restores hp_guard, without automatic restart.
Review artifacts before recording a target PASS. Do not infer PCAP-loss behavior,
WAN readiness, or boot authorization from this drill.

## Review notes and semantics references

- OBSERVED: the checker compares ordered policy expressions, ignoring packet
  counter values and non-verdict logging rules. UNKNOWN schemas fail closed.
- INFERRED: polling reduces the table-deletion window once explicitly activated.
  UNKNOWN: future Docker stop availability and host scheduling delays. A host-root
  attacker can disable both controls; use the preferred external DMZ boundary.
- OBSERVED: backup-age and rising Suricata-drop rates are MEDIUM warnings;
  `BACKUP_REQUIRED=true` makes backup age a readiness-blocking problem. Initial
  counters and counter resets have no computable rate.
- OBSERVED: normalized password fields are removed. UNKNOWN: secrets embedded in
  arbitrary command/URL text or old data; protected access is still required.

The conntrack JSON `in` representation is consistent with
[firewalld's nft backend](https://github.com/firewalld/firewalld/blob/main/src/firewall/core/nftables.py).
The [nftables reference](https://www.netfilter.org/projects/nftables/manpage.html)
describes ordered rule verdicts and hook behavior. Target namespace validation
is required to verify the installed nft version's serialization.
