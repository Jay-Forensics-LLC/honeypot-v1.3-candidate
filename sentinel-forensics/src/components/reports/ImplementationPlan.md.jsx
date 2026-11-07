# EVIDENCE-GRADE REPORTING - IMPLEMENTATION PLAN

**Product:** Sentinel Forensics  
**Initiative:** Evidence-Grade DFIR Report Redesign  
**Target Delivery:** Phase 7  
**Effort Estimate:** 3-4 weeks  

---

## PHASE 1: DATA COLLECTION HARDENING (Week 1)

### Collector Changes

#### Network Collectors
**Current:** Basic NetworkLog entity with source_ip, dest_ip, port, protocol  
**Required:**
```javascript
// Add to network log collection:
{
  // CLARITY: Replace source/dest with local/remote + direction
  local_ip: "192.168.1.100",
  local_port: 52341,
  remote_ip: "1.1.1.1",
  remote_port: 443,
  direction: "outbound", // or "inbound"
  
  // ATTRIBUTION: Link to process
  process_id: 12345,
  process_name: "msedge.exe",
  process_hash_sha256: "abc123...",
  process_user: "SYSTEM",
  
  // PROVENANCE: Capture method
  capture_method: "pcap" | "socket_table" | "firewall_log",
  pcap_reference: "pcap_uuid + frame_number",
  
  // PROTOCOL: Application layer
  protocol_l7: "https" | "dns" | "http",
  tls_sni: "cloudflare-dns.com",
  ja3_hash: "abc123...",
  dns_query_name: "example.com",
  
  // METADATA
  collected_at: "2026-01-05T14:20:22.123-05:00", // RFC3339 w/ timezone
  collector_id: "agent_prod_001",
  ruleset_version: "threat_intel_v2.3.1"
}
```

**Implementation:**
- Update `functions/ingestLogs.js` or network collector agent
- Add socket table correlation (netstat -ano / ss -tpn)
- Capture TLS metadata where available
- Store PCAP reference if packet capture enabled

---

#### Vulnerability Scanners
**Current:** Generic alerts stored in Alert entity  
**Required:**
```javascript
// NEW entity or enhanced Alert:
{
  // MANDATORY for vulnerabilities
  cve_id: "CVE-2025-0001",
  cvss_score: 9.1,
  cvss_vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
  
  // PATCH INFO
  affected_component: "win32kfull.sys",
  installed_version: "10.0.22621.3080",
  fixed_version: "10.0.22621.3085",
  patch_kb: "KB5034123",
  patch_url: "https://msrc.microsoft.com/update-guide/...",
  
  // ADVISORY
  advisory_source: "Microsoft Security Response Center",
  advisory_published_date: "2025-01-08T00:00:00Z",
  
  // SBOM
  sbom_reference: "sbom_uuid_123",
  
  // SCANNER METADATA
  scanner_name: "Nessus",
  scanner_version: "10.4.2",
  scan_policy: "PCI-DSS Audit",
  plugin_id: "12345"
}
```

**Implementation:**
- Integrate real CVE scanner (Nessus, Qualys, OpenVAS, or Wazuh)
- Store SBOM (Software Bill of Materials)
- Separate "vulnerability" (CVE-verified) from "alert" (generic detection)

---

#### Malware Detections
**Current:** ZeroClickThreat with threat_type, severity  
**Required:**
```javascript
{
  // MANDATORY IOCs
  file_hash_sha256: "abc123...", // REQUIRED
  file_hash_md5: "def456...",
  file_path: "C:\\Users\\John\\AppData\\suspicious.exe",
  process_name: "suspicious.exe",
  process_id: 6789,
  process_command_line: "suspicious.exe --c2=malicious.com",
  
  // DETECTION METHOD
  detection_method: "yara" | "av_signature" | "heuristic" | "edr_behavior",
  yara_rule_matched: "NSO_Pegasus_v3",
  yara_ruleset_version: "2026.01.05",
  av_vendor: "Sophos",
  av_signature_name: "Troj/Pegasus-A",
  av_signature_version: "20260105.001",
  
  // VERIFICATION
  virustotal_hash: "abc123...",
  virustotal_detections: 45, // out of 70 vendors
  virustotal_url: "https://virustotal.com/...",
  
  // NETWORK IOCs
  c2_ips: ["203.0.113.45", "198.51.100.22"],
  c2_domains: ["malicious-c2.com"],
  
  // CONTEXT
  parent_process_id: 4567,
  parent_process_name: "explorer.exe"
}
```

**Implementation:**
- Update threat detection to REQUIRE file hashes
- Integrate YARA scanning
- Add VirusTotal API lookups
- Collect process tree (parent/child relationships)
- **REMOVE:** Speculative "Pegasus/Predator" labels unless YARA rule match

---

### System Integrity Baseline
**Current:** Undefined "anomaly_score"  
**Required:**
```javascript
{
  baseline_id: "baseline_v1_20260101",
  baseline_type: "config_hash" | "boot_measurements" | "file_integrity",
  baseline_hash_sha256: "abc123...",
  baseline_established_at: "2026-01-01T00:00:00Z",
  
  // DEVIATION
  current_hash_sha256: "def456...",
  deviation_detected: true,
  deviation_metric: "config hash mismatch",
  deviation_details: "Expected: abc123..., Observed: def456...",
  
  // BOOT CHAIN (if TPM available)
  secure_boot_enabled: true,
  tpm_pcr_values: {
    "0": "abc...",
    "7": "def..."
  },
  boot_measurements_verified: true
}
```

**Implementation:**
- Establish baselines (config snapshots, file hashes)
- Store baseline hashes
- Compare current state to baseline
- Capture TPM PCR values if available

---

## PHASE 2: STORAGE & SCHEMA (Week 2)

### Database Changes
1. Create `EvidenceGradeReport` entity (already done ✅)
2. Add fields to existing entities:
   - `NetworkLog`: Add `local_ip`, `remote_ip`, `direction`, `process_id`, `pcap_reference`, `collected_at`, `collector_id`
   - `Alert`: Add `cve_id`, `cvss_score`, `cvss_vector`, `affected_component`, `installed_version`, `fixed_version`, `patch_kb`, `advisory_url`
   - `ZeroClickThreat`: Add `file_hash_sha256`, `file_path`, `process_id`, `yara_rule_matched`, `virustotal_url`
   - `EvidenceV2`: Ensure `file_hash_sha256` MANDATORY, add `collector_id`, `collection_method`

### Storage Architecture
- Evidence artifacts → S3/object storage with versioning enabled
- Evidence metadata → Database (entity)
- Chain of custody → Append-only log (immutable)
- Report signatures → Secure key management (HSM or KMS)

---

## PHASE 3: REPORT GENERATOR REWRITE (Week 2-3)

### Core Logic: `functions/generateEvidenceGradeReport.js` (already created ✅)

**Enhancements needed:**
1. **Evidence inventory builder:**
   - Query ALL artifacts for case
   - Compute hashes if missing (on-the-fly)
   - Build chain of custody from audit logs
   - Detect simulation flags

2. **Finding builder (strict rules):**
   ```javascript
   function buildFinding(category, rawData) {
     // RULE: Must have evidence refs
     if (!rawData.evidence_refs || rawData.evidence_refs.length === 0) {
       return {
         finding_id: uuid(),
         title: `Insufficient evidence for ${category} analysis`,
         status: 'insufficient_evidence',
         confidence: 0.0,
         limitations: "No raw artifacts collected",
         recommended_actions: ["Collect required artifacts", "Re-run scan"]
       };
     }
     
     // RULE: CVE-only for vulnerabilities
     if (category === 'vulnerability') {
       const hasCVE = rawData.observed_facts.some(f => f.fact.includes('CVE-'));
       if (!hasCVE) {
         category = 'behavioral'; // Reclassify
         rawData.confidence = Math.min(rawData.confidence, 0.5);
       }
     }
     
     // RULE: Reduce confidence if missing key fields
     if (category === 'network' && !rawData.process_id) {
       rawData.confidence = Math.min(rawData.confidence, 0.5);
       rawData.limitations += " Cannot attribute to process.";
     }
     
     return rawData;
   }
   ```

3. **Integrity computation:**
   - Compute Merkle root over all evidence hashes
   - Compute report SHA-256 (canonical JSON)
   - Sign report with Ed25519 (use SERVER_SIGNING_KEY secret)

4. **Simulation detection:**
   - Check evidence IDs for test patterns
   - Propagate `is_simulated` flag
   - Block court-grade export if simulated

---

### UI Changes

#### Update `pages/SecurityValidator.js`
- Add "Export Evidence-Grade Report" button
- Call `generateEvidenceGradeReport` function
- Display `EvidenceGradeReportViewer` component (already created ✅)
- Add toggle: "Legacy UI Report" vs "Evidence-Grade Report"

#### Create `pages/EvidenceGradeReportExport.js`
- Admin page for generating court-ready exports
- Includes checklist:
  - [ ] All evidence hashed
  - [ ] No simulated data
  - [ ] Clock synchronized
  - [ ] Report signed
- Export formats: JSON, PDF (structured), XML

---

## PHASE 4: BACKWARD COMPATIBILITY (Week 3)

### Versioning Strategy
- Schema version field: `schema_version: "2.0.0"`
- Legacy reports: `schema_version: "1.0.0"`
- UI adapter: maps v2.0 → v1.0 for existing dashboard components

### Dual Export
```javascript
// Offer both formats
exportLegacyReport() → generates v1.0 (UI-friendly, dramatic)
exportEvidenceGradeReport() → generates v2.0 (court-defensible)
```

### Migration Path
- Phase 1: Both formats available (users choose)
- Phase 2: Evidence-grade becomes default
- Phase 3: Legacy deprecated (6-month sunset)

---

## PHASE 5: SECURITY & KEY MANAGEMENT (Week 4)

### Digital Signature Implementation
1. Use existing `SERVER_SIGNING_KEY` secret (Ed25519)
2. Sign canonical JSON (stable key ordering, no whitespace)
3. Store signature in `report_integrity.signature`
4. Provide public key for verification

### Access Control
- Report generation: Requires `reports:write` or analyst role
- Evidence-grade export: Requires admin OR case owner
- Signature verification: Public (anyone can verify)

### Audit Trail
- Log all report generations
- Log all exports (who, when, format)
- Log signature verifications

---

## ROLLOUT PLAN

### Week 1: Foundation
- ✅ Create `EvidenceGradeReport` entity
- ✅ Create `generateEvidenceGradeReport` function
- ✅ Create `EvidenceGradeReportViewer` component
- Update network/alert/threat entities (add required fields)

### Week 2: Integration
- Wire up evidence-grade export button
- Implement Merkle root computation
- Implement Ed25519 signing
- Add validation checks

### Week 3: Testing
- QA all test scenarios
- Third-party verification test
- Performance testing (large evidence sets)
- Security audit

### Week 4: Documentation & Release
- Write user guide
- Write verification guide for third parties
- Update legal disclaimer
- Train analysts
- Beta release to select users

---

## RISKS & MITIGATIONS

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Collectors missing required fields** | Reports incomplete | Graceful degradation: mark as `insufficient_evidence` |
| **Performance - large evidence sets** | Slow export | Implement pagination, stream JSON |
| **Key management complexity** | Signing failures | Use managed KMS; fallback to unsigned mode |
| **User confusion - two report types** | Adoption issues | Clear labeling; wizard to guide selection |
| **Backward compatibility breaks** | Existing integrations fail | Maintain v1.0 API endpoint indefinitely |
| **False negatives - overly strict** | Legitimate findings rejected | Allow `needs_more_data` status (not binary pass/fail) |

---

## SUCCESS CRITERIA

### Technical
- [ ] 100% of findings have evidence_refs
- [ ] 0 placeholder device IDs in production
- [ ] 0 unevidenced speculation ("Pegasus" without IOCs)
- [ ] All reports pass schema validation
- [ ] Signature verification success rate: 100%

### Usability
- [ ] Analysts can generate report in <5 clicks
- [ ] Report export completes in <10 seconds (for typical case)
- [ ] Third-party can verify report integrity without Sentinel access

### Legal/Compliance
- [ ] Report accepted by court (pilot case)
- [ ] Passes expert witness scrutiny
- [ ] Meets ISO 27037 (digital evidence guidelines)
- [ ] Meets NIST SP 800-86 (forensic integration guide)

---

## SECURITY CONSIDERATIONS

### Key Management
- Signing keys: Store in KMS or HSM
- Key rotation: Annual or per-incident
- Public key distribution: Publish on website + in report metadata
- Revocation: Maintain key revocation list

### Access Control
- Evidence-grade export: Admin-only OR case owner with MFA
- Report tampering: Monitored via integrity checks
- Evidence access: RLS enforced; audit logged

### Privacy
- PII redaction: Automatic for ui_narrative
- User context: Hashed or redacted per privacy policy
- Data retention: Align with legal hold requirements

---

## ROLLBACK PLAN

If issues arise:
1. **Immediate:** Disable evidence-grade export button
2. **Fallback:** Revert to legacy v1.0 format
3. **Hotfix:** Patch and redeploy within 24 hours
4. **Communication:** Notify users of temporary downgrade

---

## POST-LAUNCH MONITORING

### Metrics to Track
- Reports generated per day
- Evidence-grade vs legacy ratio
- Validation failure rate
- Signature verification success rate
- Third-party verification attempts

### Quality Gates
- Monthly audit: Random sample of 10 reports
- Expert review: External forensic analyst validates structure
- Compliance check: Align with updated legal standards

---

*End of Implementation Plan*