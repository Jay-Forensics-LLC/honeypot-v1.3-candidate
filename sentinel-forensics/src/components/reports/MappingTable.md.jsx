# CURRENT REPORT → EVIDENCE-GRADE REPORT MAPPING

| Current Field (v1.0) | vNext Field (v2.0) | Notes / New Data Required |
|----------------------|-------------------|---------------------------|
| `timestamp` | `report_metadata.generated_at` | ADD: timezone info (RFC3339 format) |
| `generated_by` | `acquisition_provenance.operator_id` | MOVE: from top-level to provenance section |
| `app_version` | `report_metadata.generator.app_version` | ADD: build_id, commit_hash, environment |
| `overallScore` | `scoring_model.overall_score` | ADD: formula, weights, thresholds, or REMOVE if not defensible |
| `checks.systemIntegrity.status` | `findings[].status` | TRANSFORM: convert check results to evidence-backed findings |
| `checks.systemIntegrity.message` | `ui_narrative.detailed_descriptions.system_integrity` | MOVE: UI drama to separate section |
| `checks.systemIntegrity.detailedDescription` | `ui_narrative` | REMOVE: speculation; REPLACE with observed facts |
| `checks.systemIntegrity.affectedDevices[]` | `target_identity` + `findings[].observed_facts` | REPLACE: "suspicious_device_001" with real device_id |
| `checks.malwareDetection.threatDetails[]` | `findings[].evidence_refs[]` | ADD: file hashes, process names, registry keys, or label as insufficient_evidence |
| `checks.networkSecurity.suspiciousConnections[]` | `findings[].observed_facts[]` + `evidence_refs[]` | ADD: timestamp, directionality, process attribution, PCAP reference |
| `checks.networkSecurity.suspiciousConnections[].sourceIP` | `findings[].observed_facts[].fact: "local_ip=X"` | CLARIFY: use local_ip/remote_ip + direction |
| `checks.networkSecurity.suspiciousConnections[].destIP` | `findings[].observed_facts[].fact: "remote_ip=Y"` | CLARIFY: avoid ambiguous source/dest |
| `checks.behavioralAnalysis.message` | `findings[].reasoning` + `limitations` | SEPARATE: facts from interpretation |
| `checks.encryptionStatus.evidenceDetails` | `evidence_inventory[]` | ADD: hash_sha256, collected_at, collector_id, method |
| `checks.vulnerabilities.vulnerabilityBreakdown.critical.alerts[]` | `findings[] WHERE category='vulnerability'` | **CRITICAL:** ONLY include if CVE ID present; otherwise reclassify as 'alert' |
| `checks.vulnerabilities.message` (claims exploitation) | `findings[].limitations` | REMOVE: speculation; ADD: "cannot confirm exploitation without runtime telemetry" |
| `recommendations[]` | `findings[].recommended_actions[]` | MOVE: from global to per-finding; make actionable and specific |
| *(missing)* | `report_metadata.mode` | **NEW:** live_scan / offline_analysis / demo |
| *(missing)* | `report_metadata.is_simulated` | **NEW:** boolean flag if ANY data is synthetic |
| *(missing)* | `target_identity.device_id` | **NEW:** stable UUID (not "suspicious_device_001") |
| *(missing)* | `acquisition_provenance.toolchain[]` | **NEW:** scanner versions, rule versions, config hashes |
| *(missing)* | `acquisition_provenance.time_sync_status` | **NEW:** NTP status, clock drift |
| *(missing)* | `evidence_inventory[]` | **NEW:** ledger of ALL raw artifacts with hashes |
| *(missing)* | `findings[].confidence` | **NEW:** 0.0-1.0 with explanation |
| *(missing)* | `findings[].confidence_explanation` | **NEW:** WHY this confidence level |
| *(missing)* | `findings[].observed_facts[]` | **NEW:** FACTS separated from interpretation |
| *(missing)* | `findings[].evidence_refs[]` | **NEW:** MANDATORY linkage to raw artifacts |
| *(missing)* | `findings[].reasoning` | **NEW:** inference logic |
| *(missing)* | `findings[].limitations` | **NEW:** what CANNOT be concluded |
| *(missing)* | `report_integrity.report_sha256` | **NEW:** tamper-evidence hash |
| *(missing)* | `report_integrity.evidence_merkle_root` | **NEW:** batch verification |
| *(missing)* | `report_integrity.signature` | **NEW:** digital signature (Ed25519) |
| *(missing)* | `ui_narrative` | **NEW:** container for UI-friendly copy (must reference finding_ids) |

---

## NEW DATA COLLECTION REQUIREMENTS

To support evidence-grade reporting, collectors MUST now capture:

### Network Collectors
- **ADD:** `timestamp` (RFC3339 w/ timezone)
- **ADD:** `direction` (outbound/inbound)
- **ADD:** `local_ip`, `local_port`, `remote_ip`, `remote_port` (replace source/dest)
- **ADD:** `process_id`, `process_name`, `process_hash` (where OS supports)
- **ADD:** `pcap_reference` (if PCAP available)
- **ADD:** `tls_sni`, `ja3_hash` (if TLS)
- **ADD:** `dns_query_name` (if DNS)
- **ADD:** `capture_method` ("pcap" | "socket_table" | "firewall_log")

### Vulnerability Scanners
- **ADD:** `cve_id` (MANDATORY for vulnerabilities)
- **ADD:** `cvss_score`, `cvss_vector`
- **ADD:** `affected_component`, `installed_version`, `fixed_version`
- **ADD:** `advisory_url`
- **ADD:** `sbom_reference` (if available)
- **REMOVE:** Generic alerts from "vulnerability" category unless CVE-verified

### Malware Detections
- **ADD:** `file_hash_sha256` (MANDATORY)
- **ADD:** `file_path`, `process_name`, `pid`
- **ADD:** `yara_rule_matched` (if YARA)
- **ADD:** `av_vendor`, `av_signature_version`
- **ADD:** `ioc_source` (e.g., "VirusTotal", "internal_ruleset_v2.3")
- **REMOVE:** Speculative attribution (Pegasus/Predator) unless IOC matched

### System Integrity
- **ADD:** `baseline_id`, `baseline_hash`, `baseline_established_at`
- **ADD:** `deviation_metric` (e.g., "config hash mismatch: expected abc, observed xyz")
- **ADD:** `boot_measurements` (TPM PCR values if available)
- **ADD:** `secure_boot_status`

### Device Metadata
- **REPLACE:** "suspicious_device_001" placeholder IDs
- **ADD:** `device_uuid` (stable, hardware-derived)
- **ADD:** `hostname`, `os_name`, `os_version`, `os_build`
- **ADD:** `hardware_id_hash` (SHA-256 of serial numbers)

---

## TRANSFORMATION RULES

### Rule 1: Vulnerability vs Alert Distinction
```
IF alert.cve_id EXISTS:
  → finding.category = "vulnerability"
  → finding.title = "CVE-{cve_id}: {title}"
  → finding.severity = map_cvss_to_severity(alert.cvss_score)
  → finding.confidence = 0.9
ELSE:
  → finding.category = "behavioral" or "other"
  → finding.title = "Security alert: {title} (non-CVE)"
  → finding.severity = lower by one level (critical → high)
  → finding.confidence = 0.5 or lower
  → finding.limitations = "No CVE ID - requires investigation"
```

### Rule 2: Network Attribution
```
IF network_log.process_id EXISTS:
  → finding.confidence >= 0.7
  → observed_facts += "Process: {process_name} (PID {process_id})"
ELSE:
  → finding.confidence <= 0.5
  → limitations += "Cannot attribute to process"
  → status = "needs_more_data"
```

### Rule 3: Simulation Detection
```
IF ANY evidence.is_simulated == true:
  → report_metadata.is_simulated = true
  → finding.title = "[DEMO/TEST] " + finding.title
  → finding.status = "insufficient_evidence"
  → ui_narrative.executive_summary += "⚠️ Contains simulated data - NOT evidence-grade"
```

---

*End of Mapping*