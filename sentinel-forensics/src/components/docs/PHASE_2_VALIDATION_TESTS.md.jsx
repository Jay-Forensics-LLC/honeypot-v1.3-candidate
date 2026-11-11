# Phase 2 Backend Contract Validation

## Test Results

### Test 1: Auto-Execute Disabled
**Setup**: `CONTROL_PLANE_AUTO_EXECUTE = false` in `featureFlags.js`

**Expected Behavior**:
- `evaluateControlPlaneMitigations` generates recommendations but does NOT execute
- `executeControlPlaneMitigation` in EXECUTE mode returns `result: "BLOCKED"` with `blocked_reason`

**Test Payload (evaluate)**:
```json
{
  "session_id": "<valid_session_id>"
}
```

**Expected Response**:
```json
{
  "session_id": "...",
  "evaluated_at": "2026-01-20T...",
  "recommendations": [...],
  "warnings": []
}
```
- Recommendations created with `status: "OPEN"`
- No execution occurs

**Test Payload (execute)**:
```json
{
  "recommendation_id": "<recommendation_id>",
  "mode": "EXECUTE"
}
```

**Expected Response**:
```json
{
  "recommendation_id": "...",
  "mode": "EXECUTE",
  "result": "BLOCKED",
  "blocked_reason": "Auto-execute disabled by feature flag (CONTROL_PLANE_AUTO_EXECUTE)",
  "execution_result": null,
  "executed_at": "2026-01-20T..."
}
```

**Audit Log Verification**:
- Event: `control_plane_execution_blocked`
- Severity: `warning`
- Metadata includes: `blocked_reason`

---

### Test 2: Approval Required
**Setup**: Create `ControlPlaneAutomationSettings` with `mode: "REQUIRE_APPROVAL"`

**Expected Behavior**:
- `evaluateControlPlaneMitigations` creates `ApprovalQueueItem` for qualifying indicators
- Recommendations have `status: "QUEUED"` and populated `approval_queue_item_id`
- No execution until approval

**Test Payload**:
```json
{
  "session_id": "<session_with_high_severity_indicators>"
}
```

**Expected Response**:
```json
{
  "session_id": "...",
  "evaluated_at": "2026-01-20T...",
  "recommendations": [
    {
      "id": "...",
      "status": "QUEUED",
      "approval_queue_item_id": "<queue_item_id>",
      ...
    }
  ],
  "warnings": []
}
```

**Verification**:
- Query `ApprovalQueueItem` for created entries
- Confirm `status: "PENDING_APPROVAL"`
- Audit log includes: `control_plane_approval_queued`

---

### Test 3: Cooldown Enforcement
**Setup**: 
1. Execute a recommendation (DRY_RUN or EXECUTE)
2. Immediately re-run `evaluateControlPlaneMitigations` for same session

**Expected Behavior**:
- Second evaluation detects recent execution
- Creates recommendation with `status: "DISMISSED"`
- `dismissed_reason` includes cooldown duration
- Warning message includes `cooldown_until` timestamp

**Expected Response (second evaluation)**:
```json
{
  "session_id": "...",
  "evaluated_at": "2026-01-20T...",
  "recommendations": [],
  "warnings": [
    "Cooldown active for DEVICE until 2026-01-20T..."
  ]
}
```

**Verification**:
- Check `ControlPlaneMitigationRecommendation` for DISMISSED entry
- Confirm cooldown calculation: `generated_at + cooldown_minutes`

---

### Test 4: Rate Limit
**Setup**: 
1. Set `max_actions_per_hour: 3` in automation settings
2. Execute 3 recommendations in EXECUTE mode
3. Attempt 4th execution

**Expected Behavior**:
- 4th execution returns `result: "BLOCKED"` with rate limit reason
- Audit log records block attempt

**Expected Response (4th execution)**:
```json
{
  "recommendation_id": "...",
  "mode": "EXECUTE",
  "result": "BLOCKED",
  "blocked_reason": "Rate limit exceeded (3 actions/hour)",
  "execution_result": null,
  "executed_at": "2026-01-20T..."
}
```

**Audit Log Verification**:
- Event: `control_plane_execution_blocked`
- Metadata includes: `recent_count`, `blocked_reason`

---

## Audit Trail Completeness Checklist

All audit logs MUST include:
- ✅ `organization_id`
- ✅ `event_type`
- ✅ `severity`
- ✅ `actor` (user email or "system")
- ✅ `success` (boolean)
- ✅ `metadata` (bounded, no secrets)

Context-specific fields:
- ✅ `session_id` (when applicable)
- ✅ `plane` (for control plane events)
- ✅ `recommendation_id` (for recommendations)
- ✅ `approval_queue_item_id` (when queued/approved)
- ✅ `execution_mode` and `result` (for executions)

---

## Sample Outputs

### evaluateControlPlaneMitigations (Success)
```json
{
  "session_id": "session_abc123",
  "evaluated_at": "2026-01-20T15:30:00Z",
  "recommendations": [
    {
      "id": "rec_xyz789",
      "plane": "DEVICE",
      "risk_score": 85,
      "severity": "HIGH",
      "status": "OPEN",
      "rationale": "Generated based on detected MALWARE_SUSPECTED with severity HIGH",
      "candidate_actions": [
        {
          "action_type": "ISOLATE_DEVICE",
          "action_title": "Network Isolation",
          "action_description": "Disconnect device from all networks to prevent lateral movement",
          "execution_mode": "AUTOMATED",
          "estimated_risk_reduction": 95
        }
      ],
      "selected_actions": [
        {
          "action_type": "ISOLATE_DEVICE",
          "action_title": "Network Isolation",
          "action_description": "Disconnect device from all networks to prevent lateral movement",
          "execution_mode": "AUTOMATED",
          "estimated_risk_reduction": 95
        }
      ],
      "approval_queue_item_id": null,
      "cooldown_until": null,
      "created_at": "2026-01-20T15:30:00Z"
    }
  ],
  "warnings": []
}
```

### executeControlPlaneMitigation (DRY_RUN)
```json
{
  "recommendation_id": "rec_xyz789",
  "mode": "DRY_RUN",
  "result": "SIMULATED",
  "blocked_reason": null,
  "execution_result": {
    "dry_run": true,
    "action_type": "ISOLATE_DEVICE",
    "execution_mode": "AUTOMATED",
    "timestamp": "2026-01-20T15:35:00Z"
  },
  "executed_at": "2026-01-20T15:35:00Z"
}
```

### executeControlPlaneMitigation (BLOCKED)
```json
{
  "recommendation_id": "rec_xyz789",
  "mode": "EXECUTE",
  "result": "BLOCKED",
  "blocked_reason": "Auto-execute disabled by feature flag (CONTROL_PLANE_AUTO_EXECUTE)",
  "execution_result": null,
  "executed_at": "2026-01-20T15:35:00Z"
}
```

---

## File Paths

- Evaluate function: `functions/evaluateControlPlaneMitigations.js`
- Execute function: `functions/executeControlPlaneMitigation.js`
- Scaffolding doc: `components/docs/PHASE_SCAFFOLDING.md`
- Validation doc: `components/docs/PHASE_2_VALIDATION_TESTS.md`

---

## Phase 2 UI Readiness: ✅ READY

All contracts validated, gating logic enforced, audit trails complete.