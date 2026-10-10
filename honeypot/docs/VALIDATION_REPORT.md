# Validation report

Generated 2026-09-29T08:05:25.974336Z

PASS: 15; FAIL: 0; NOT TESTED: 4

Each row is one validation category; behavioral tests are reported within their category. Dependency absence never counts as PASS.

## PASS — Required deliverables

All required source/docs/scripts present

## PASS — JSON syntax

6 JSON documents parsed

## PASS — YAML syntax

6 YAML documents parsed

## PASS — Compose safety invariants

No privileged containers or socket mounts; separate non-internal decoy bridges; DNS blackholes; loopback defaults; no published Loki

## PASS — Compose relative paths

All static bind mounts and Dockerfile paths resolve: []

## PASS — Python compilation

26 Python files compiled without writing pycache

## PASS — Cowrie INI syntax

Cowrie INI parsed; protocol forwarding disabled

## PASS — Duplicate paths

No case-insensitive duplicate relative paths; repeated basenames in different config directories are intentional

## PASS — Documentation relative links

Markdown relative links resolve; []

## PASS — Script references

Shell wrapper Python references resolve

## PASS — Build secret and evidence scan

No private key blocks, packaged .env, or capture files: []

## PASS — Bash syntax

bash -n passed for 26 scripts

## PASS — YARA syntax

Compiled with libyara via yara-python

## PASS — Behavioral unit tests

test_auth_threshold (test_engine.EngineTests.test_auth_threshold) ... ok
test_backup_verification_and_tamper_detection (test_engine.EngineTests.test_backup_verification_and_tamper_detection) ... ok
test_dedup (test_engine.EngineTests.test_dedup) ... ok
test_firewall_denial_not_compromise (test_engine.EngineTests.test_firewall_denial_not_compromise) ... ok
test_firewall_scoped (test_engine.EngineTests.test_firewall_scoped) ... ok
test_hash_manifest_replayed_after_restart (test_engine.EngineTests.test_hash_manifest_replayed_after_restart) ... ok
test_hash_stable_bytes (test_engine.EngineTests.test_hash_stable_bytes) ... ok
test_invalid_egress_rejected (test_engine.EngineTests.test_invalid_egress_rejected) ... ok
test_low_to_high_preservation (test_engine.EngineTests.test_low_to_high_preservation) ... ok
test_malicious_timestamp_no_path (test_engine.EngineTests.test_malicious_timestamp_no_path) ... ok
test_manifest_idempotent (test_engine.EngineTests.test_manifest_idempotent) ... ok
test_no_critical_from_attacker_text (test_engine.EngineTests.test_no_critical_from_attacker_text) ... ok
test_normalization_password (test_engine.EngineTests.test_normalization_password) ... ok
test_partial_line_checkpoint (test_engine.EngineTests.test_partial_line_checkpoint) ... ok
test_pcap_preserves_closed_segment_only (test_engine.EngineTests.test_pcap_preserves_closed_segment_only) ... ok
test_report_distinguishes_evidence (test_engine.EngineTests.test_report_distinguishes_evidence) ... ok
test_rotation_truncate (test_engine.EngineTests.test_rotation_truncate) ... ok
test_session_ip_enrichment (test_engine.EngineTests.test_session_ip_enrichment) ... ok
test_shared_username_links_not_merge (test_engine.EngineTests.test_shared_username_links_not_merge) ... ok
test_splitting_caps_incident_size (test_engine.EngineTests.test_splitting_caps_incident_size) ... ok
test_success_high (test_engine.EngineTests.test_success_high) ... ok
test_suricata_mapping (test_engine.EngineTests.test_suricata_mapping) ... ok
test_verified_boundary (test_engine.EngineTests.test_verified_boundary) ... ok
test_watermarks (test_engine.EngineTests.test_watermarks) ... ok
test_compose_dns_constants (test_hardening.GuardTests.test_compose_dns_constants) ... ok
test_loss_and_semantic_drift (test_hardening.GuardTests.test_loss_and_semantic_drift) ... ok
test_preview_never_stops_and_stop_failure_is_reported (test_hardening.GuardTests.test_preview_never_stops_and_stop_failure_is_reported) ... ok
test_rollback_rejects_other_tables_and_include (test_hardening.GuardTests.test_rollback_rejects_other_tables_and_include) ... ok
test_runtime_dns_rejects_extra_resolver (test_hardening.GuardTests.test_runtime_dns_rejects_extra_resolver) ... ok
test_table_deleted_unit_still_active_stops_only_decoys (test_hardening.GuardTests.test_table_deleted_unit_still_active_stops_only_decoys) ... ok
test_unreadable_policy_is_unsafe (test_hardening.GuardTests.test_unreadable_policy_is_unsafe) ... ok
test_valid_policy_and_counters (test_hardening.GuardTests.test_valid_policy_and_counters) ... ok
test_verdict_only_strips_log_limit (test_hardening.GuardTests.test_verdict_only_strips_log_limit) ... ok
test_boot_inspection_failure_after_start_stops_only_decoys (test_hardening.StartupTests.test_boot_inspection_failure_after_start_stops_only_decoys) ... ok
test_explicit_start_can_create_and_stops_on_postcheck_failure (test_hardening.StartupTests.test_explicit_start_can_create_and_stops_on_postcheck_failure) ... ok
test_exposure_requires_both_flag_and_fresh_pass (test_hardening.StartupTests.test_exposure_requires_both_flag_and_fresh_pass) ... ok
test_rendered_dns_and_actual_hostip_gates (test_hardening.StartupTests.test_rendered_dns_and_actual_hostip_gates) ... ok
test_start_stops_before_compose_when_guard_missing (test_hardening.StartupTests.test_start_stops_before_compose_when_guard_missing) ... ok
test_alloy_uses_sanitized_decoy_sources (test_hardening.TelemetryTests.test_alloy_uses_sanitized_decoy_sources) ... ok
test_approved_preview_install_never_enables_or_starts (test_hardening.TelemetryTests.test_approved_preview_install_never_enables_or_starts) ... ok
test_audit_allowlist_and_nested_redaction (test_hardening.TelemetryTests.test_audit_allowlist_and_nested_redaction) ... ok
test_backup_age_warning_is_optional_and_cumulative_drops_are_not_failure (test_hardening.TelemetryTests.test_backup_age_warning_is_optional_and_cumulative_drops_are_not_failure) ... ok
test_backup_failure_is_audited (test_hardening.TelemetryTests.test_backup_failure_is_audited) ... ok
test_drop_rate_counter_reset_and_initial_sample (test_hardening.TelemetryTests.test_drop_rate_counter_reset_and_initial_sample) ... ok
test_freshness_and_parser_last_hour (test_hardening.TelemetryTests.test_freshness_and_parser_last_hour) ... ok
test_password_never_enters_searchable_stream (test_hardening.TelemetryTests.test_password_never_enters_searchable_stream) ... ok
test_unit_preview_has_no_side_effects (test_hardening.TelemetryTests.test_unit_preview_has_no_side_effects) ... ok

----------------------------------------------------------------------
Ran 47 tests in 0.232s

OK

## NOT TESTED — Docker Compose validation

docker unavailable on build host; target validation required

## NOT TESTED — Suricata config validation

suricata unavailable on build host; target validation required

## NOT TESTED — Alloy configuration validation

alloy unavailable on build host; target validation required

## PASS — POSIX executable permissions

All shell entrypoints executable

## NOT TESTED — Ubuntu live integration

Build-only execution; no daemon, network listener, capture, or firewall action started

