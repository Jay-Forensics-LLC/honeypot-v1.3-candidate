# Stage 8 supervised boot and recovery handoff

Current disposition: **BLOCKED pending a complete verified Stage 7 restart
matrix**. Stage 8 execution is NOT TESTED and requires separate operator
direction. WAN remains unauthorized. This document installs or enables nothing.

Stage 7 checks process/container restarts on one unchanged host boot, with the
existing capture process running throughout. Stage 8 must establish safe boot
and recovery ordering on the actual Ubuntu host. A Stage 7 PASS is its prerequisite,
not proof of boot recovery, power-loss durability or zero packet loss.

## Observed safeguards and unresolved startup defect

The reviewed capture unit is static, with `Restart=no`. Its finite dumpcap ring
captures `br-hp-cowrie` and `br-hp-canary`, rotates every 300 seconds or the
configured size, and refuses startup at the critical disk watermark. Health
monitoring stops capture and decoys at the critical watermark. That deliberate
stop must remain distinguishable from capture failure; automatic recovery must
never bypass storage or containment gates. High/critical values must be read
from the deployed configuration; the retained observation uses 90%/95%.

After earlier host reboots, decoys and capture did not safely auto-start. A
running process later cannot establish capture continuity or identify its start
requester. The historical capture gap remains UNKNOWN. The preview guard/watch
units are not a qualified installed boot chain. Their `After`/`Before` ordering
alone neither pulls required units into a transaction nor prevents unsafe
independent starts. Keep preview units disabled pending review and approval.

## Concrete next Stage 8 action after Stage 7 passes

Prepare and validate the smallest capture/containment startup transaction and
rollback for review, using the actual installed units and Docker bridge lifecycle.
Submit that exact deployment for separate approval before installing/enabling
units or changing boot/restart policy. The proposal must establish:

1. Expected Docker bridges exist before capture configuration is validated.
2. The owned hp_guard chains, ordered rules and DNS isolation pass before decoys
   can become reachable; guard failure must leave decoys stopped.
3. Fresh storage checks allow capture; PID/start identity, expected interfaces,
   finite ring and fresh output are verified before the decoys start.
4. Capture loss is detected and handled safely, without restart loops following
   a watermark stop or starting into a full disk.
5. Observability and incident ingestion recover without losing old evidence or
   replaying duplicate incident records. Management stays loopback-only.
6. A console-supervised, separately authorized boot test retains exact UTC boot,
   shutdown, service and packet times. Measure the last pre-boot and first
   post-boot packets from preserved segments; unavailable times remain UNKNOWN.
7. Stop on any failed containment, management, capture or evidence invariant.
   Do not retry boots or delete forensic data to obtain a PASS.

Rollback must preserve copies/hashes of the installed unit files and prior
enablement/restart policy, restore only the approved boot changes, and leave
decoys stopped if guard/capture cannot be verified. Do not flush the host firewall,
expose management, enable WAN, or erase evidence as part of rollback.

The historical corrupted original remains unchanged and hash-pinned, with a
separately attributed recovery derivative. Its cause and power-loss durability
investigation stay tracked separately. Boot testing must not relabel the
derivative as original evidence or the October 7 FAILED demo as successful.
