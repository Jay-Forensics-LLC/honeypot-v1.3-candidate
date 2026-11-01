# Phase 3 Backend Validation - Policy Version Lifecycle

## ✅ Backend Contracts Implemented

All Phase 3 backend functions are complete and ready for UI integration.

---

## Contract Functions

### 1. `migratePoliciesToVersions` (Admin-Only, Idempotent)

**Purpose**: One-time migration of legacy policies to version system.

**Input**: None (operates on all org policies)

**Output**:
```json
{
  "total_policies": 15,
  "migrated": 12,
  "skipped": 3,
  "errors": 0,
  "message": "Successfully migrated 12 policies. Skipped 3 (already have ACTIVE versions)."
}
```

**Rules**:
- Creates PolicyVersion v1 with status=ACTIVE for each policy lacking an ACTIVE version
- Idempotent: re-running does not create duplicates
- Logs `policy_version_migrated` audit event

**Test Scenario**:
```javascript
// First run: migrates 12 policies
{ operation: 'migratePoliciesToVersions' }

// Second run: skips all 12 (already migrated)
{ operation: 'migratePoliciesToVersions' }
```

---

### 2. `createPolicyVersion`

**Purpose**: Create a new draft version for an existing policy.

**Input**:
```json
{
  "operation": "createPolicyVersion",
  "policy_id": "pol_abc123",
  "change_summary": "Added stricter firewall rules",
  "payload": {
    "auto_response_rules": [],
    "firewall_config": { "profile": "STRICT" },
    "usb_restrictions": {},
    "hardening_checklist": {}
  }
}
```

**Output**:
```json
{
  "policy_id": "pol_abc123",
  "version_number": 3,
  "status": "DRAFT",
  "version_id": "ver_xyz789"
}
```

**Rules**:
- Increments version_number deterministically (current max + 1)
- Status always DRAFT
- Validates payload against canonical schema
- Logs `policy_version_created` audit event

**Test Scenario**:
```javascript
// Policy has v1 (ACTIVE) and v2 (ARCHIVED)
// Creates v3 (DRAFT)
{
  "operation": "createPolicyVersion",
  "policy_id": "pol_abc123",
  "change_summary": "Updated USB restrictions",
  "payload": { /* canonical payload */ }
}
```

---

### 3. `submitPolicyVersionForApproval`

**Purpose**: Submit a draft version for admin approval.

**Input**:
```json
{
  "operation": "submitPolicyVersionForApproval",
  "policy_id": "pol_abc123",
  "version_number": 3
}
```

**Output**:
```json
{
  "approval_queue_item_id": "apq_def456",
  "status": "PENDING_APPROVAL",
  "version_id": "ver_xyz789"
}
```

**Rules**:
- Only allowed when version status is DRAFT
- Transitions version to PENDING_APPROVAL
- Creates ApprovalQueueItem with category=POLICY_CHANGE
- Links approval_request_id to version
- Logs `policy_version_submitted` audit event

**Test Scenarios**:

✅ **Valid Submission**:
```javascript
// v3 is DRAFT -> submits successfully
{
  "operation": "submitPolicyVersionForApproval",
  "policy_id": "pol_abc123",
  "version_number": 3
}
```

❌ **Invalid: Already Submitted**:
```javascript
// v3 is PENDING_APPROVAL -> fails
{
  "operation": "submitPolicyVersionForApproval",
  "policy_id": "pol_abc123",
  "version_number": 3
}
// Error: "Cannot submit version in status PENDING_APPROVAL. Only DRAFT versions can be submitted."
```

---

### 4. `approvePolicyVersion` (Admin-Only)

**Purpose**: Approve and activate a pending policy version.

**Input**:
```json
{
  "operation": "approvePolicyVersion",
  "approval_queue_item_id": "apq_def456"
}
```

**Output**:
```json
{
  "policy_id": "pol_abc123",
  "activated_version": 3,
  "status": "ACTIVE",
  "version_id": "ver_xyz789"
}
```

**Rules**:
- Admin-only (role check enforced)
- Resolves queue item -> policy_id/version_number
- Archives prior ACTIVE version(s) (status -> ARCHIVED)
- Activates target version (status -> ACTIVE)
- Updates SecurityPolicy.version convenience field
- Transitions queue item to EXECUTED
- Logs `policy_version_approved` audit event

**Test Scenario**:
```javascript
// Before: v2 is ACTIVE, v3 is PENDING_APPROVAL
{
  "operation": "approvePolicyVersion",
  "approval_queue_item_id": "apq_def456"
}
// After: v2 is ARCHIVED, v3 is ACTIVE
```

**Audit Trail Output**:
```json
{
  "event_type": "policy_version_approved",
  "description": "Approved and activated version 3",
  "actor": "admin@example.com",
  "metadata": {
    "policy_id": "pol_abc123",
    "version_number": 3,
    "activated_version": 3,
    "archived_versions": 1
  }
}
```

---

### 5. `rejectPolicyVersion` (Admin-Only)

**Purpose**: Reject a pending policy version with mandatory reason.

**Input**:
```json
{
  "operation": "rejectPolicyVersion",
  "approval_queue_item_id": "apq_def456",
  "reason": "Firewall rules too restrictive for current environment"
}
```

**Output**:
```json
{
  "status": "REJECTED",
  "version_id": "ver_xyz789",
  "reverted_to": "DRAFT"
}
```

**Rules**:
- Admin-only (role check enforced)
- Requires non-empty reason
- Reverts version to DRAFT (allows resubmission without forking)
- Stores rejection metadata in diff_from_previous:
  - last_rejected_at
  - last_rejected_by
  - last_rejection_reason
- Transitions queue item to REJECTED
- Logs `policy_version_rejected` audit event

**Test Scenarios**:

✅ **Valid Rejection**:
```javascript
{
  "operation": "rejectPolicyVersion",
  "approval_queue_item_id": "apq_def456",
  "reason": "Needs additional hardening checks"
}
```

❌ **Invalid: Missing Reason**:
```javascript
{
  "operation": "rejectPolicyVersion",
  "approval_queue_item_id": "apq_def456",
  "reason": ""
}
// Error: "Rejection reason is required"
```

**Audit Trail Output**:
```json
{
  "event_type": "policy_version_rejected",
  "description": "Rejected version 3: Needs additional hardening checks",
  "actor": "admin@example.com",
  "metadata": {
    "policy_id": "pol_abc123",
    "version_number": 3,
    "reason": "Needs additional hardening checks"
  }
}
```

---

### 6. `createPolicyFromTemplate`

**Purpose**: Create a new policy from a template.

**Input**:
```json
{
  "operation": "createPolicyFromTemplate",
  "template_id": "tpl_abc123",
  "name": "High Security Workstation Policy",
  "description": "Strict policy for executive workstations"
}
```

**Output**:
```json
{
  "policy_id": "pol_new789",
  "version_number": 1,
  "status": "DRAFT",
  "version_id": "ver_new456"
}
```

**Rules**:
- Validates template access (global or org-owned)
- Creates SecurityPolicy record
- Creates PolicyVersion v1 as DRAFT (not ACTIVE by default)
- Increments template.usage_count
- Logs `policy_created_from_template` audit event

**Test Scenario**:
```javascript
// Template has usage_count=5
{
  "operation": "createPolicyFromTemplate",
  "template_id": "tpl_abc123",
  "name": "New Endpoint Security Policy",
  "description": "Policy for engineering laptops"
}
// Template usage_count becomes 6
// Policy created with v1 (DRAFT)
```

---

## Backward Compatibility (Legacy Fallback)

### Updated `policyOperations` Behavior

**Legacy `update` Operation**:

```javascript
// If policy has ACTIVE version (migrated):
{
  "operation": "update",
  "policy_id": "pol_abc123",
  "name": "Updated Policy",
  "policy_payload_json": { /* payload */ }
}
// Result: Creates new DRAFT version instead of direct update
// Response includes warning to use new lifecycle
```

**Legacy `create` Operation**:

```javascript
// Always creates with initial DRAFT version
{
  "operation": "create",
  "name": "New Policy",
  "policy_payload_json": { /* payload */ }
}
// Result: Policy + PolicyVersion v1 (DRAFT)
```

**Audit Log Warning**:
When legacy update fallback is used:
```json
{
  "event_type": "policy_updated",
  "severity": "warning",
  "description": "Updated policy (LEGACY: not using version system)",
  "metadata": {
    "legacy_update_fallback": true
  }
}
```

---

## Enforcement Compatibility

**Active Version Resolution** (for enforcement/assignment):

```javascript
// Preferred: Query ACTIVE PolicyVersion
const activeVersions = await base44.entities.PolicyVersion.filter({
  policy_id,
  status: 'ACTIVE'
}, '-version_number', 1);

if (activeVersions.length > 0) {
  // Use activeVersions[0].payload
  const policyPayload = activeVersions[0].payload;
} else {
  // FALLBACK: Use SecurityPolicy.policy_payload_json (log warning)
  const policy = await base44.entities.SecurityPolicy.get(policy_id);
  const policyPayload = policy.policy_payload_json;
  
  // Log fallback usage
  await writeAuditLog(base44, {
    event_type: 'policy_version_fallback_used',
    severity: 'warning',
    description: `Policy ${policy_id} has no ACTIVE version, using legacy payload`,
    metadata: { policy_id }
  });
}
```

---

## Sample Workflow: Full Lifecycle

### Scenario: Admin creates and publishes a new policy

```javascript
// 1. Create policy from template
{
  "operation": "createPolicyFromTemplate",
  "template_id": "tpl_strict_security",
  "name": "Production Servers Policy",
  "description": "Security baseline for production"
}
// Result: policy_id=pol_123, version_id=ver_456, status=DRAFT

// 2. Submit for approval
{
  "operation": "submitPolicyVersionForApproval",
  "policy_id": "pol_123",
  "version_number": 1
}
// Result: approval_queue_item_id=apq_789, status=PENDING_APPROVAL

// 3. Admin reviews and approves
{
  "operation": "approvePolicyVersion",
  "approval_queue_item_id": "apq_789"
}
// Result: v1 is ACTIVE, SecurityPolicy.status=PUBLISHED

// 4. Policy is now enforced (enforcement queries ACTIVE version)
```

---

## Migration Outcomes (Sample)

**Organization with 15 policies**:

```json
{
  "total_policies": 15,
  "migrated": 12,
  "skipped": 3,
  "errors": 0,
  "details": {
    "migrated_policies": [
      "pol_001: Endpoint Security v2 -> ACTIVE",
      "pol_002: Network Firewall v1 -> ACTIVE",
      // ... 10 more
    ],
    "skipped_policies": [
      "pol_013: Already has ACTIVE v3",
      "pol_014: Already has ACTIVE v1",
      "pol_015: Already has ACTIVE v2"
    ]
  }
}
```

---

## Phase 3 Backend Status: ✅ COMPLETE

All contracts implemented and ready for UI wiring:
- [x] Migration helper (idempotent)
- [x] createPolicyVersion
- [x] submitPolicyVersionForApproval
- [x] approvePolicyVersion (admin-gated)
- [x] rejectPolicyVersion (admin-gated)
- [x] createPolicyFromTemplate
- [x] Legacy policyOperations refactored (backward-compatible)
- [x] Audit logging at every transition
- [x] Enforcement compatibility preserved

**No regressions**: Existing enforcement/resolution continues to work via ACTIVE version queries with legacy fallback.

---

## Next Step: Phase 3 UI Wiring

UI implementation can now proceed with confidence:
- Backend contracts are locked and validated
- All transitions are deterministic
- Audit trail is complete
- RBAC enforcement is correct
- No breaking changes to existing policy enforcement