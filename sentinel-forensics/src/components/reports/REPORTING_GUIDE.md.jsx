# Evidence Tagging & Advanced Reporting System

## Overview
The Sentinel-Forensics platform includes a comprehensive evidence tagging and reporting system designed for forensic defensibility and legal compliance.

---

## Evidence Tagging

### What are Tags?
- **User-applied metadata** for evidence organization
- **Do not modify** evidence content or integrity hashes
- All tag operations are **logged in audit trail**
- Tags are **searchable and filterable**

### Tag Scopes
1. **CASE** - Tags specific to a single case
2. **ORG** - Organization-wide tags (reusable across cases)
3. **USER** - Personal tags (visible only to creator)

### Creating Tags
Navigate to **Tag Management** (under Core Operations):
1. Click "New Tag"
2. Enter tag name (2-32 characters, lowercase recommended)
3. Optional: Set display name, color, and scope
4. Click "Create Tag"

### Applying Tags to Evidence
From **Evidence Detail** page:
1. Scroll to "Tags (User Metadata)" section
2. Click "Add" button
3. Select from available tags or search
4. Tags appear immediately with visual indicators

### Filtering Evidence by Tags
From **Evidence** or **Case Detail** pages:
1. Use Tag Filters panel
2. Select match mode: ANY (OR logic) or ALL (AND logic)
3. Click tags to include or exclude
4. Evidence list updates automatically

### Tag Search Syntax
In the search box, use:
- `tag:apt` - Find evidence tagged "apt"
- `tag:"wifi mitm"` - Multi-word tags (quoted)
- `tag:apt tag:ble` - Multiple tags (respects match mode)

---

## Advanced Reporting

### Report Templates
Six court-ready templates available:

1. **Data Breach Investigation**
   - Unauthorized access analysis
   - Exfiltration detection
   - Impact assessment

2. **Device Compromise / Malware Analysis**
   - File system examination
   - Persistence mechanisms
   - IOC identification

3. **Network Intrusion**
   - Traffic analysis
   - Lateral movement detection
   - Endpoint correlation

4. **Chain-of-Custody Summary**
   - Evidence handling documentation
   - Integrity verification records
   - Custodian tracking

5. **Expert Declaration / Affidavit**
   - Professional opinion format
   - Methodology disclosure
   - Qualification statements

6. **Custom Report**
   - Flexible template
   - User-defined sections

### Generating Reports
From **Case Detail** page:
1. Scroll to "Advanced Report Builder"
2. Select report template
3. Enter report title
4. Optional: Filter evidence by tags
5. Optional: Select specific evidence items
6. Choose which optional sections to include
7. Add custom notes if needed
8. Select export format (PDF, HTML, JSON)
9. Click "Generate Report"

### Mandatory Sections
All reports include **non-removable** sections:
- **Scope of Analysis** - What was examined
- **Methodology Disclosure** - How analysis was performed
- **Limitations and Assumptions** - Analysis constraints
- **Toolchain Disclosure** - Tools and AI usage (if any)

These sections ensure **forensic defensibility** and **legal admissibility**.

### Optional Sections
- Executive Summary
- Evidence Listing (with hashes and metadata)
- Timeline Analysis
- Key Findings
- Recommendations
- AI-Generated Insights (clearly labeled)
- Case Audit Log (tamper-evident chain)

### Export Formats
- **PDF** - Court-ready, print-safe (production only)
- **HTML** - Interactive, with clickable evidence links
- **JSON** - Machine-readable, full structured data

---

## Audit Log Export

### Purpose
Export complete, tamper-evident audit trail for:
- Legal discovery compliance
- Independent forensic verification
- Chain-of-custody documentation

### Exporting Audit Logs
From **Case Detail** page:
1. Scroll to "Export Case Audit Log"
2. Select format: HTML, CSV, or JSON
3. Click "Export Audit Log"
4. File downloads automatically

### Audit Log Contents
Each export includes:
- All case-related events (evidence collection, tagging, edits, reports)
- Timestamps (UTC)
- User attribution
- Success/failure status
- **Cryptographic hash chain** (previous_hash → current_hash)
- Export integrity hash (SHA-256)

### Hash Chain Verification
The audit log uses a **hash chain** for tamper-evidence:
1. Each entry hashes: timestamp + event_type + description + previous_hash
2. Any modification breaks the chain
3. Export includes full chain for independent verification

---

## Security & Permissions

### Role-Based Access Control (RBAC)
- **Analysts** - Can create/apply tags, generate reports
- **Admin** - Can manage org-wide tags, delete tags
- **Viewer** - Can view tags, read reports (no modifications)

### Audit Logging
Every action is logged:
- TAG_CREATED
- TAG_APPLIED
- TAG_REMOVED
- TAG_DELETED
- REPORT_GENERATED
- AUDIT_LOG_EXPORTED

### Rate Limiting
- Tag creation: 50 per user per hour
- Tag application: 200 per user per hour
- Report generation: 10 per case per day

---

## Best Practices

### Tag Naming
- Use **lowercase** for consistency
- Keep tags **concise** (2-32 characters)
- Use **hyphens** for multi-word tags (e.g., `wifi-mitm`)
- Avoid special characters

### Tag Organization
- Create **case-specific tags** for unique artifacts
- Use **org-wide tags** for recurring patterns (e.g., `apt`, `malware`, `phishing`)
- Avoid tag proliferation - reuse existing tags when possible

### Report Generation
- Generate reports only when case is **closed** or **archived**
- Include **all relevant evidence** (use tag filtering for focus)
- Always include **mandatory sections** - they ensure legal defensibility
- Add **custom notes** for context that doesn't fit structured sections

### Audit Log Hygiene
- Export audit logs **before closing** cases
- Store exports in **secure, offline location**
- Verify hash chains when challenged
- Include audit logs in **legal discovery** packages

---

## Forensic Defensibility Notes

### Evidence Integrity
- Tags are **metadata only** - they do not modify evidence
- Evidence hashes (SHA-256) remain **unchanged** after tagging
- Original evidence artifacts are **immutable**

### Report Integrity
- Each report includes a **SHA-256 hash** of its content
- Reports reference evidence by **immutable ID and hash**
- Report generation is **logged and timestamped**

### Legal Admissibility
- Reports include **methodology disclosure** per Daubert/Frye standards
- Toolchain disclosure includes **AI usage** (if any)
- Limitations section prevents **overstatement of findings**
- Audit logs provide **chain of custody** documentation

### Cross-Examination Readiness
- All AI-generated content is **clearly labeled**
- Analyst can explain **every included section**
- Evidence references are **verifiable independently**
- Audit trail proves **when reports were generated** (not retroactively)

---

## Troubleshooting

### Tags Not Appearing in Filter
- Ensure tag scope matches current context (case vs org)
- Check that tag is not soft-deleted
- Verify RBAC permissions

### Search Not Finding Tagged Evidence
- Use correct syntax: `tag:name` (no spaces after colon)
- Quote multi-word tags: `tag:"multi word"`
- Check case scope setting (This Case vs All Cases)

### Report Generation Fails
- Verify case has at least one evidence item
- Check that mandatory sections are included
- Ensure user has report generation permissions
- Review audit log for specific error details

---

## API Reference (Backend Functions)

### Tag Management
- `tagManagement` - CRUD operations for tags
  - Actions: create, list, update, delete

### Evidence Tagging
- `evidenceTagging` - Apply/remove tags
  - Actions: apply, remove, get, bulk_apply

### Search
- `searchEvidence` - Advanced search with tag support
  - Params: searchTerm, caseId, tagsAny, tagsAll, excludeTags, caseScope

### Reporting
- `generateCourtReadyReport` - Generate forensic reports
  - Returns: Structured report with mandatory + optional sections

### Audit Export
- `exportCaseAuditLog` - Export tamper-evident audit trail
  - Formats: html, csv, json

---

## Future Enhancements
- Auto-tag rules (user-defined, default OFF)
- Tag suggestions based on prior case usage
- PDF export with embedded signatures
- Cross-case tag analytics
- Tag usage heatmaps

---

**Version:** 1.0  
**Last Updated:** 2026-01-01  
**Platform:** Sentinel-Forensics