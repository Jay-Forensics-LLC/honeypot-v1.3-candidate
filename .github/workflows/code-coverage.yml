# HoneyTrace review instructions

HoneyTrace handles honeypot containment, telemetry ingestion, forensic
artifacts, and evidence verification. Read AGENTS.md and SECURITY.md.

Review changed code and its affected execution paths. Prioritize:

- Containment failures, unintended network exposure, privilege escalation,
  unsafe subprocess arguments, and incorrect Docker daemon or checkout identity.
- Evidence loss, modification, duplication, ambiguous provenance, premature
  checkpoint advancement, unsafe replay, and incorrect rotation handling.
- Path traversal, symlinks, unsafe archive extraction, unbounded resource use,
  secret exposure, and sensitive data entering logs or CI artifacts.
- Inconsistent image pins across Compose, environment examples, Dockerfiles,
  and image metadata.
- Changes that weaken required checks or alter historical archives, receipts,
  or qualification-source pins without an explained, reviewed change.

Distinguish deduplicated retained evidence from at-least-once search telemetry.
Matching hashes do not independently prove authenticity or completeness.

Use coverage to identify missing tests for affected behavior, especially
failure paths, corruption, replay, and permission boundaries. Do not treat
coverage percentages, skipped tests, or synthetic fixtures as proof of live
containment, packet flow, durability, or release acceptance.

Preserve the existing offline-validation check. Review activities must not
start deployments, change firewalls, reload daemons, or modify live evidence.
Keep unrelated development moving; identify the affected component when
recommending a release hold.

For each finding, identify the location, triggering condition, impact, and
smallest practical correction or regression test. Distinguish demonstrated
defects from concerns requiring verification. Avoid unrelated refactors and
style-only comments already covered by automated checks.
