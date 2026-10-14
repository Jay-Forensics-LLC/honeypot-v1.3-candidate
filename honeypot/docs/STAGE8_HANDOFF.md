# Stage 8 supervised boot and recovery handoff

Current disposition: the `stage7-fresh-ewnrhtur` report records **Stage 7 PASS**,
all seven restart rows PASS and Stage 8 `READY_FOR_OPERATOR_DIRECTION`.
**Independent completion verification is pending protected packet/evidence
access.** Stage 8 execution remains NOT TESTED and requires separate operator
direction. WAN remains unauthorized. This document installs or enables nothing.

The locally hash-verified matrix report is
`work/live-qualification/stage7-fresh-ewnrhtur/report.json`, SHA-256
`97bee3ef001e17c0c65b376cf472ea183fff5ce6e37db6c938278dcf50fcbdbc`.
Qualification source is `1a2b8c73106763d824999091c4e56c64f061f59e`; boot ID
`67a93065-7f07-40e5-aa12-806d9ff14dcc`. The completed run's final health,
containment, capture, logging and complete evidence checks passed. Independent
local metadata verification confirms all required rows/checks and eight exact
event relationships. Re-parsing protected packet copies and checking finite
baseline prefixes require the single read-only command in DEMO.md. Do not
repeat the completed restart matrix. Finish that closeout before issuing the
verified Stage 8 handoff; an authentication failure does not imply packet loss.

Historical result (October 10, 2026 UTC): `stage7-fresh-u4vb87q6` FAILED after the
OpenCanary restart. Its exact FTP event correctly reached MEDIUM at the
three-service correlation threshold; the harness required LOW. Retrospective
packet discovery proves that marker was captured but does not complete the row.
The row postflight passed. The outer postflight used the pre-restart anchor,
failed, and discarded its observation; that historical result stays FAILED.

Source-only classification and postflight/reporting repairs have offline
regression coverage and were exercised by the later completed matrix. No
deployment, restart-policy or capture-policy change occurred. The original
failed report stays unchanged. Source publication, healthy reconciliation and
offline CI alone cannot qualify a restart matrix or boot/recovery behavior.

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
