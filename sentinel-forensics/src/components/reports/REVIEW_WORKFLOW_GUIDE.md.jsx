# Attorney Review & Report Locking Workflow

## Overview
Sentinel-Forensics supports a formal review and approval workflow for court-ready reports, ensuring forensic defensibility through multi-party validation and immutable final artifacts.

---

## Workflow States

### State Machine
```
DRAFT → UNDER_REVIEW → APPROVED → LOCKED_FINAL
  ↓         ↓             ↓
  └─────→ REJECTED ──────┘
```

### State Definitions

**DRAFT**
- Initial state after report generation
- Report can be regenerated (overwrites draft)
- No legal weight

**UNDER_REVIEW**
- Review request submitted
- Assigned to specific reviewer (attorney/counsel)
- Reviewer notified via email
- Optional deadline tracking

**APPROVED**
- Reviewer accepted report
- Ready for finalization
- Can still be locked or regenerated

**REJECTED**
- Reviewer declined report
- Returns to DRAFT state
- Requires reviewer comments explaining rejection
- Original requester notified

**LOCKED_FINAL**
- Immutable artifact
- Forensically defensible
- Cannot be modified or overwritten
- Includes:
  - Reviewer identity and role
  - Approval timestamp
  - Evidence snapshot hash
  - Audit trail of all transitions

---

## Roles & Permissions

### Required Capabilities

**REPORT_REVIEW_REQUEST**
- Who: Analysts, Admins
- Action: Can request review of draft reports
- Assigns reviewer and sets optional deadline

**REPORT_REVIEW_APPROVE**
- Who: Attorneys, Admins
- Action: Can approve or reject reports under review
- Must provide comments for rejection

**REPORT_LOCK_FINALIZE**
- Who: Admins only (v1)
- Action: Can lock approved reports as final
- Creates immutable artifact

### Permission Assignment
Permissions are stored in `User.permissions` array:
```json
{
  "permissions": [
    "REPORT_REVIEW_REQUEST",
    "REPORT_REVIEW_APPROVE",
    "REPORT_LOCK_FINALIZE"
  ]
}
```

Admins have all permissions by default.

---

## Using the Workflow

### 1. Request Review (Analyst)
From **Case Detail → Reports → Report Runs**:
1. Generate report (becomes DRAFT)
2. Click "Request Review" button
3. Enter reviewer email (must be attorney/admin)
4. Optional: Set deadline
5. Optional: Add review notes/instructions
6. Click "Send Review Request"

System actions:
- Changes state to UNDER_REVIEW
- Sends email to reviewer
- Logs REPORT_REVIEW_REQUESTED event

### 2. Review Report (Attorney)
From **Reviewer Inbox** page:
1. View pending reviews assigned to you
2. Click "Review" on a request
3. Review report contents and metadata
4. Choose decision:
   - **Approve** - Report meets legal standards
   - **Reject** - Report needs changes (comments required)
5. Add comments (optional for approval, required for rejection)
6. Click "Submit Decision"

System actions:
- Creates ReportReviewDecision record
- Updates review_state (approved or rejected)
- Notifies original requester via email
- Logs REPORT_REVIEW_APPROVED or REPORT_REVIEW_REJECTED

### 3. Lock Final (Admin)
From **Case Detail → Reports → Report Runs**:
1. Find approved report
2. Click "Lock Final" button
3. Confirm action

System actions:
- Sets is_locked_final = true
- Freezes evidence snapshot with hash
- Records finalized_by and finalized_at
- Logs REPORT_LOCKED_FINAL event
- Report becomes immutable

---

## Defensibility Features

### Immutability Guarantees
When a report is LOCKED_FINAL:
- **Cannot regenerate** over locked artifact
- **Cannot modify** report configuration
- **Cannot change** evidence references
- Any changes require **new ReportRun** (new version lineage)

### Audit Trail
Every transition is logged:
- Request review: who, reviewer, deadline
- Decision: who, approve/reject, comments, timestamp
- Lock final: who, when, evidence snapshot hash

### Evidence Snapshot
Locked reports include:
- List of evidence IDs included
- Evidence count
- SHA-256 hash of snapshot (tamper-evident)
- Frozen at time of generation (not current state)

### Reviewer Attribution
Final reports embed:
- Reviewer name and email
- Reviewer role at time of decision
- Approval timestamp
- Decision comments (if any)

---

## Best Practices

### For Analysts
- Request review only when report is **complete**
- Provide clear context in review notes
- Set realistic deadlines (allow 2-3 business days minimum)
- Don't regenerate reports while under review

### For Reviewers
- Review **within deadline** if set
- Always check:
  - Mandatory sections present (scope, methodology, limitations, toolchain)
  - Evidence references are correct
  - No overstatement of findings
  - AI usage disclosed (if applicable)
- Reject with **specific, actionable feedback**
- Approve only if report is **court-ready**

### For Admins
- Lock reports only after **counsel approval**
- Verify evidence snapshot integrity before locking
- Archive locked reports in **secure, offline backup**
- Never delete locked final reports

---

## Common Scenarios

### Scenario 1: Report Needs Revisions
1. Analyst generates report (DRAFT)
2. Analyst requests review
3. Attorney reviews → REJECTS with comments
4. Report returns to DRAFT
5. Analyst regenerates with corrections
6. New review cycle begins

### Scenario 2: Multi-Version Lineage
1. Report v1 generated, reviewed, locked (LOCKED_FINAL)
2. New evidence discovered
3. Analyst generates **new ReportRun** (fresh DRAFT)
4. New report references v1 as "supersedes Report v1 (locked 2026-01-01)"
5. Independent review cycle for v2

### Scenario 3: Emergency Lock Override
- Not supported in v1
- If absolutely required, contact system admin
- All overrides logged at highest severity

---

## Technical Details

### State Transitions (Enforced)
```
draft → under_review (via request_review)
under_review → approved (via submit_decision: approved)
under_review → rejected (via submit_decision: rejected)
rejected → draft (automatic on next regeneration)
approved → locked_final (via lock_final, admin only)
```

Invalid transitions return HTTP 400 error.

### Hash Chain
Each locked report includes:
- config_hash (from ReportDefinitionVersion)
- report_hash (from generated output)
- snapshot_hash (from evidence snapshot)

Together these create a **triple-hash chain** for maximum integrity.

### RBAC Enforcement
- Backend functions check user.permissions array
- Frontend UI hides actions user cannot perform
- Audit logs record permission checks

---

## FAQ

**Q: Can I edit a locked report?**
A: No. Locked reports are immutable. Generate a new version instead.

**Q: What if reviewer is unavailable?**
A: Admin can reassign review request or cancel it (returns to DRAFT).

**Q: Can I lock a report without review?**
A: Not in v1. Review + approval is mandatory before locking.

**Q: Are review comments included in final report?**
A: Only if explicitly added to report sections. Review workflow is separate from report content (by design).

**Q: What happens if evidence is deleted after locking?**
A: Evidence snapshot preserves IDs and hashes. Deletion doesn't affect locked report, but audit log shows evidence no longer available.

**Q: Can I have multiple reviewers?**
A: Not in v1. Single reviewer per request. For multi-party approval, submit sequential review requests.

---

**Version:** 1.0  
**Last Updated:** 2026-01-01  
**Platform:** Sentinel-Forensics