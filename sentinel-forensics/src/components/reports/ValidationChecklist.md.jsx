# EVIDENCE-GRADE REPORT - VALIDATION & TEST CHECKLIST

## AUTOMATED VALIDATION CHECKS

### Schema Validation
- [ ] Report validates against JSON Schema Draft 2020-12
- [ ] All required fields present (`report_metadata`, `target_identity`, `acquisition_provenance`, `evidence_inventory`, `findings`, `report_integrity`)
- [ ] No `additionalProperties` violations
- [ ] All UUIDs are valid v4 format
- [ ] All timestamps are RFC3339 with timezone
- [ ] All SHA-256 hashes match `^[a-f0-9]{64}$` pattern

### Evidence Integrity Checks
- [ ] Every `evidence_inventory` item has `hash_sha256`
- [ ] Every `evidence_inventory` item has `collected_at` timestamp
- [ ] Every `evidence_inventory` item has `chain_of_custody` with at least one entry
- [ ] Merkle root (if present) verifies against all evidence hashes
- [ ] No duplicate `evidence_id` values

### Finding Validation
- [ ] Every finding has at least 1 `evidence_refs` entry
- [ ] All `evidence_refs[].evidence_id` values exist in `evidence_inventory`
- [ ] Every finding has `confidence` field (0.0-1.0)
- [ ] Every finding with confidence < 0.6 has `confidence_explanation`
- [ ] Every finding has `limitations` field populated
- [ ] Findings with `status='insufficient_evidence'` have confidence <= 0.5
- [ ] No finding uses speculative language ("Pegasus", "APT", "nation-state") without IOC reference

### Report Integrity
- [ ] `report_sha256` field present
- [ ] Computed SHA-256 of canonical JSON matches `report_sha256`
- [ ] If `signature` present, signature validates with public key
- [ ] `verification_instructions` field populated

### Simulation Detection
- [ ] If ANY `evidence_inventory[].is_simulated == true`, then `report_metadata.is_simulated == true`
- [ ] If `report_metadata.is_simulated == true`, report includes "DEMO/TEST" disclaimer
- [ ] Findings referencing simulated evidence are labeled appropriately

### Vulnerability vs Alert Distinction
- [ ] All findings with `category='vulnerability'` have CVE ID in `observed_facts`
- [ ] Findings WITHOUT CVE IDs are NOT categorized as 'vulnerability'
- [ ] Alert counts NOT conflated with CVE counts

### Network Evidence Quality
- [ ] Network findings specify `local_ip` and `remote_ip` (not ambiguous source/dest)
- [ ] Network findings include `direction` (outbound/inbound) or state "cannot determine"
- [ ] If process attribution missing, `limitations` field states this explicitly
- [ ] Network findings with missing process attribution have confidence <= 0.5

---

## QA TEST SCENARIOS

### Scenario 1: Demo Mode Report
**Setup:**
- Generate report with `mode='demo'`
- Include 3 simulated evidence items

**Expected Results:**
- ✅ `report_metadata.is_simulated == true`
- ✅ `evidence_inventory[0,1,2].is_simulated == true`
- ✅ Report includes disclaimer: "Contains simulated data - NOT evidence-grade"
- ✅ Findings status set to `insufficient_evidence` or labeled "[DEMO/TEST]"
- ✅ Export blocked OR prominently watermarked as "NON-EVIDENTIARY"

---

### Scenario 2: Partial Telemetry (Network Only)
**Setup:**
- Collect PCAP only (no process snapshots, no vuln scan, no system logs)
- Generate report

**Expected Results:**
- ✅ Network findings present with appropriate confidence (0.3-0.5)
- ✅ Vulnerability findings: status=`needs_more_data`, title="No vulnerability scan performed"
- ✅ Malware findings: status=`insufficient_evidence`
- ✅ `limitations` field for each finding states: "Cannot attribute network connections to processes - socket table not collected"
- ✅ `recommended_actions` includes: "Deploy endpoint agent for process telemetry"

---

### Scenario 3: Clock Drift Detected
**Setup:**
- Set `acquisition_provenance.time_sync_status = 'drifted'`
- Set `clock_drift_ms = 120000` (2 minutes)

**Expected Results:**
- ✅ Report includes warning in `ui_narrative`: "Clock drift of 120000ms detected - timestamps may be inaccurate"
- ✅ All findings include disclaimer: "Timestamp accuracy ±2 minutes"
- ✅ Confidence reduced for time-sensitive findings (e.g., correlation analysis)
- ✅ `recommended_actions` includes: "Sync system clock with NTP before next scan"

---

### Scenario 4: Missing Privileges (Limited Data)
**Setup:**
- Run scan without admin privileges
- Cannot collect: registry hives, memory dumps, full process list

**Expected Results:**
- ✅ `evidence_inventory` includes only artifacts collected with user-level permissions
- ✅ Findings state: "Partial scan - elevated privileges required for complete analysis"
- ✅ `limitations` field: "Cannot access protected system areas without admin rights"
- ✅ `recommended_actions`: "Re-run scan with administrator privileges"
- ✅ Overall confidence reduced

---

### Scenario 5: CVE vs Alert Distinction
**Setup:**
- 10 alerts with `severity='critical'` but NO `cve_id`
- 2 alerts with `severity='high'` and VALID `cve_id` (CVE-2025-0001, CVE-2025-0002)

**Expected Results:**
- ✅ Vulnerability finding count: **2** (ONLY CVE-verified)
- ✅ Alert finding count: **10** (categorized as 'behavioral' or 'other')
- ✅ Report does NOT state "12 critical vulnerabilities"
- ✅ Report correctly states: "2 verified CVEs, 10 critical alerts (non-CVE)"
- ✅ Alert findings have lower confidence (0.5) and status `needs_more_data`

---

### Scenario 6: False Positive - 1.1.1.1 Flagged
**Setup:**
- Network log flags connection to 1.1.1.1:443 with `threat_score=85`

**Expected Results:**
- ✅ Finding title: "Connection to 1.1.1.1:443 (Cloudflare DNS) - likely benign"
- ✅ Severity: `info` or `low` (NOT high/critical)
- ✅ Status: `false_positive`
- ✅ Reasoning: "1.1.1.1 is Cloudflare DNS resolver - legitimate DoH traffic"
- ✅ `limitations`: "Cannot confirm application using DoH without process attribution"
- ✅ Confidence: 0.6 (moderate - benign IP but unverified purpose)

---

### Scenario 7: Placeholder Device ID Detected
**Setup:**
- `target_identity.device_id = "suspicious_device_001"`

**Expected Results:**
- ❌ Validation FAILS with error: "device_id appears to be placeholder - use stable UUID or hardware hash"
- ✅ Report generation blocked until real device_id provided
- ✅ Suggested fix: "Use hardware-derived UUID or assign stable identifier"

---

### Scenario 8: Report Tampering Detection
**Setup:**
- Export report JSON
- Manually edit a finding title
- Attempt to verify integrity

**Expected Results:**
- ✅ SHA-256 verification FAILS
- ✅ Error message: "Report hash mismatch - content has been altered"
- ✅ Signature verification FAILS (if signed)
- ✅ Tamper-evident log entry created

---

### Scenario 9: Zero Evidence Refs in Finding
**Setup:**
- Attempt to create finding with `evidence_refs = []`

**Expected Results:**
- ❌ Validation FAILS: "Finding MUST have at least 1 evidence reference"
- ✅ Report generation blocked
- ✅ Error suggests: "Add evidence_refs or set status='insufficient_evidence'"

---

### Scenario 10: High Confidence Without Justification
**Setup:**
- Finding has `confidence=0.9` but no `confidence_explanation`

**Expected Results:**
- ⚠️ Warning: "High confidence (>=0.8) requires confidence_explanation"
- ✅ Report generation succeeds but validation warning logged
- ✅ Recommended: Add explanation field

---

## MANUAL QA CHECKLIST

### Pre-Export Review
- [ ] Review all findings - do they avoid speculation?
- [ ] Check for placeholder IDs ("suspicious_device_001", "_test_", "_demo_")
- [ ] Verify NO claims without evidence refs
- [ ] Confirm neutral language (no "EXTREME RISK", "NEAR CERTAIN", etc.)
- [ ] Check confidence levels align with evidence quality
- [ ] Verify limitations field populated for all non-trivial findings

### Third-Party Verification Test
- [ ] Provide report + raw artifacts to independent analyst
- [ ] Analyst can locate all referenced evidence items
- [ ] Analyst can verify report_sha256 hash
- [ ] Analyst can reproduce key findings from raw artifacts
- [ ] Analyst confirms no unevidenced claims

### Court-Readiness Test
- [ ] Report uses neutral, professional language
- [ ] Every claim is traceable to evidence
- [ ] Chain of custody documented for all artifacts
- [ ] No speculation or attribution without supporting intel
- [ ] Report integrity cryptographically verifiable
- [ ] Simulation data clearly labeled or excluded

---

## CONTINUOUS VALIDATION (CI/CD)

```bash
# Automated tests to run on every report export

1. Schema validation:
   ajv validate -s schema.json -d report.json

2. Evidence ref integrity:
   jq '.findings[] | select(.evidence_refs | length == 0)' report.json
   # Should return EMPTY (all findings have evidence refs)

3. Hash verification:
   sha256sum report.json | compare to report_integrity.report_sha256

4. Placeholder detection:
   grep -i "suspicious_device\|_test_\|_demo_" report.json
   # Should return EMPTY (no placeholders)

5. Speculation language check:
   grep -i "pegasus\|predator\|apt\|nation-state\|near certain" report.json
   # Flag for manual review unless IOC-backed

6. CVE verification:
   jq '.findings[] | select(.category=="vulnerability") | select(.observed_facts | map(.fact | contains("CVE-")) | any | not)' report.json
   # Should return EMPTY (all vulns have CVE IDs)
```

---

*End of Validation Checklist*