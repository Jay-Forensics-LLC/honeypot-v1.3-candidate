# Read-only Docker ownership diagnostic

This standalone diagnostic was developed from PR #3's reviewed source commit
`a240e772eb7d0523f413e3ae07f06c8e1a3820a0`. It addresses system/Snap runtime
ambiguity without changing `runtime_inventory.py`, deployment, or qualification
policy. It neither diagnoses compromise nor clears Stage 7 closeout or Stage 8.
The published repository cannot establish the Ubuntu laptop's current state.

## Run on the actual Ubuntu laptop

Use a separate source checkout of this diagnostic branch. Do not replace the
running stack or its original qualification working copy. Python 3.10+ standard
library only; no Docker CLI, Python Docker SDK, Compose rendering, `.env` reads,
installation, default-context selection, or network traffic outside local Unix
Docker sockets is needed. From the diagnostic checkout root:

```bash
python3 -B honeypot/scripts/docker_ownership.py
python3 -B honeypot/scripts/docker_ownership.py --json
```

Permission failures are results, not instructions to chmod sockets. If the
operator chooses to authorize elevated read access, rerun the same script with
interactive sudo; do not change socket permissions or Docker group membership:

```bash
sudo python3 -B honeypot/scripts/docker_ownership.py --json
```

To distinguish another HoneyTrace working tree, supply the exact deployed
`com.docker.compose.project.working_dir` value, not this diagnostic checkout:

```bash
sudo python3 -B honeypot/scripts/docker_ownership.py --runtime-root /absolute/deployed/honeypot --json
```

Additional local endpoints can be supplied with repeated
`--socket /absolute/path/to/docker.sock`. These are added to discovered paths;
no default endpoint is replaced. `DOCKER_HOST`, `DOCKER_CONTEXT`, Docker config,
and credentials are never consulted. `--timeout 3` is a per-request timeout;
maximum 30 seconds, maximum 8 MiB per response, maximum 1,024 containers or
networks per list. Larger inventories are incomplete, never silently truncated.
The script writes only stdout. Any locally retained JSON should be stored
privately outside this repository and protected evidence/capture directories.
Human and JSON invocations are separate observations, so timestamps may differ.

## Interpret the report

| Result | Meaning |
| --- | --- |
| `verified` service | One matching project/service identity returned by a specific daemon, container ID consistent with inspect, expected network IDs/placement and running endpoint membership corroborated. |
| `missing` service | No candidate found in successfully read daemon inventories; inaccessible/incomplete endpoints could still own it. |
| `unverified` service | Candidate found, but labels, working tree, one-off status, network identity, or membership did not corroborate it. |
| `conflicting` service | Multiple candidates claim the identity, even if container IDs are identical across installations. |
| `inaccessible` endpoint | Socket absent, access denied, refused, timed out, or invalid response before daemon identity could be read. |
| `incomplete` endpoint | Identity was read but subsequent reads failed or identities changed; partial rows cannot verify ownership. |
| `aliases` | Matching daemon ID, storage root and sanitized inventory observed through multiple paths; counted once. Disagreement is a conflict requiring another observation. |
| `unresolved_daemon_pids` | A visible running dockerd was not associated with a fully read endpoint through Unix peer or listener identity. |

Exit 0 requires all seven services verified, no unresolved discovered daemon,
no substantive socket failure, no process visibility gaps, and no alias conflict.
Exit 2 is an unresolved observation (also argparse's invalid-argument exit).
Absent well-known paths alone are normal and do not invalidate another complete
observation. They never hide a visible unresolved dockerd. `scope_complete`
refers only to this discovery scope, not a guarantee that every possible daemon
on the host has been found. Custom/rootless/hidden namespaces may require an
explicit socket path and operator review; `/proc` restrictions are reported.
Service identities may be split across daemons: inspect each candidate's
`socket`, daemon ID and storage root. A stopped service can have verified
ownership; its reported state remains stopped. This is not readiness validation.

Discovery includes `/run/docker.sock`, `/var/run/docker.sock`, two conventional
Snap candidate paths, explicit dockerd Unix host flags, dockerd listening socket
paths correlated by `/proc/PID/fd` socket inodes with `/proc/PID/net/unix`, and
`/proc/PID/root/...` paths through each dockerd mount namespace. A pathname is
never sufficient proof of installation ownership. Before any GET, the collector requires a socket file identity matched through
`/proc/PID/root` to an already-running dockerd listener whose kernel socket inode
is present in that daemon's FDs. An endpoint without that proof is reported as
`active_daemon_listener_not_established` and never contacted, avoiding intentional
activation of an inactive systemd-managed daemon. Elevated read access may be
needed to establish this listener ownership. Each GET records Linux Unix
peer PID/UID/GID (`SO_PEERCRED`); peer PID is matched to allowlisted dockerd
metadata. If socket activation exposes a systemd peer, a unique existing dockerd listener
with the same socket filesystem device/inode establishes association; multiple
listener owners remain unresolved unless the peer selects one. Executable paths and daemon data-root,
exec-root, containerd and Unix host flags help identify system versus Snap.
Relevant shim container IDs/PIDs and container init PIDs provide supplementary
process correlation; matching shim IDs alone do not prove daemon ownership.

GET endpoints are restricted in code to `/info`, `/containers/json?all=1`,
selected container inspect, `/networks` and selected network inspect. Inventory
includes all container IDs and only selected Compose identity labels; detailed
PID/network reads are limited to HoneyTrace candidates. Credentials, environment,
commands, mounts, image references, arbitrary labels, log/capture contents,
healthcheck output and IP addresses are not retained. Docker's inspect API may
return sensitive fields in memory; they are discarded, never serialized or
logged. HTTP error bodies and raw exception messages are not emitted.

Reads are sequential snapshots, not an atomic Docker transaction. Initial/final
daemon identity, consistent peers, container labels/IDs, network IDs and alias
inventory disagreements detect common races; they cannot establish continuity
between observations or forensic authenticity against a dishonest daemon.

## Offline validation and remaining live work

Run only constructed offline tests:

```bash
python3 -B -m unittest discover -s honeypot/tests -p test_docker_ownership.py -v
python3 -B tools/validate_baseline.py
```

The publication validator invokes the existing Stage 7 **offline test suite**,
behavioral tests and static verification. It does not execute Stage 7 or Stage 8
qualification. New tests cover an empty default socket with Snap ownership,
multiple installations, same-daemon aliases, conflicting aliases, duplicate
service identities within/across daemons, missing services, network mismatches,
wrong labels/trees, one-off candidates, inaccessible/permission/refused/timeout
failures, partial inventories, identity races, metadata redaction, explicit
GET transport, response limits, process discovery, listener file identity across namespaces, activation avoidance
and unresolved dockerd PIDs.

Offline results demonstrate classification and transport behavior against
synthetic responses. Actual Ubuntu socket locations, Snap namespace visibility,
peer attribution, storage roots, seven live container identities and network
memberships remain **NOT TESTED** until the operator runs the diagnostic there.
No claim of live ownership, Stage 7 completion, Stage 8 execution, capture
integrity or compromise follows from these tests. No Docker stop/restart, socket
permission/context, firewall, service identity, runtime configuration, capture,
evidence, or traffic-generation operation is performed.

Validation recorded in the development workspace on October 14, 2026 UTC:
23 diagnostic tests passed without skips. The full publication validator passed:
6 publication tests, 87 retained Stage 7 offline tests, and 298 behavioral tests
(294 passed, 4 environment-dependent skips: 3 require tshark, 1 requires Docker
CLI). Static checks: 14 PASS, 5 NOT TESTED. Runtime qualification was NOT RUN.
These workspace results do not replace the reviewed laptop's earlier results.
