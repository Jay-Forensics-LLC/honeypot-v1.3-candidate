# Policy Management System

## Overview
Production-ready policy lifecycle management for Sentinel Forensics. Supports definition, versioning, assignment (device/group), evaluation, and enforcement of security policies across 4 domains.

## Architecture

### Entities
1. **SecurityPolicy** - Policy definitions with versioning
2. **DeviceGroup** - Static/dynamic device grouping
3. **DeviceGroupMembership** - Static group membership
4. **PolicyAssignment** - Policy→Device/Group mappings
5. **EffectivePolicyResolution** - Computed merged policies per device
6. **PolicyEvaluation** - Compliance status per device
7. **PolicyActionQueue** - Enforcement actions (approval workflow)

### Policy Domains
**A) Auto-Response Rules**
- Trigger: CRITICAL_ALERT, MALWARE_CONFIRMED, PERSISTENCE_DETECTED, USB_VIOLATION, FIREWALL_TAMPER
- Actions: isolate_device, notify_admin, create_case, capture_triage_bundle
- Approval required for disruptive actions
- Rate limiting per device

**B) Firewall Configuration**
- Profiles: STRICT (deny-by-default), BALANCED, CUSTOM
- Custom rules: direction, protocol, ports, CIDR, allow/deny
- Logging levels: OFF, BASIC, VERBOSE
- Apply mode: RECOMMEND_ONLY vs ENFORCE

**C) USB Restrictions**
- Modes: ALLOW_ALL, ALLOWLIST, BLOCKLIST, BLOCK_ALL
- Match fields: vendor_id, product_id, device_class, serial
- Violation logging and alerting

**D) Hardening Checklist**
- Platform-specific controls (WINDOWS, MACOS, LINUX, ANY)
- Requirements: REQUIRED vs RECOMMENDED
- Validation: AUTOMATED_CHECK vs MANUAL_ATTESTATION
- Evidence: NONE, FILE_UPLOAD, COMMAND_OUTPUT, SCREENSHOT

## Conflict Resolution
When multiple policies apply to a device:

1. **Ordering**: Sort assignments by `priority` (higher wins)
2. **Auto-Response**: Union of enabled rules; duplicate triggers resolved by highest priority
3. **Firewall**: STRICT > BALANCED > CUSTOM; custom rules merged with deny-precedence
4. **USB**: Most restrictive wins (BLOCK_ALL > BLOCKLIST > ALLOWLIST > ALLOW_ALL)
5. **Hardening**: REQUIRED accumulates; duplicates resolved by highest priority

**Transparency**: Full conflict resolution log stored in `EffectivePolicyResolution.resolution_metadata`

## Enforcement Modes
- **AUDIT_ONLY**: Log findings only, no actions queued
- **ENFORCE**: Queue actions when conditions match, respect approval requirements

## Versioning & Rollback
- Publishing a PUBLISHED policy creates v2, archives v1
- Version lineage tracked via `parent_policy_id`
- All versions retained for audit trail
- Assignments reference specific policy versions

## Action Approval Workflow
1. Trigger event occurs (e.g., CRITICAL_ALERT)
2. Policy engine evaluates conditions
3. If enforcement_mode=ENFORCE and approval_required=true:
   - Action queued with status=PENDING_APPROVAL
4. Admin approves/denies via Actions Queue UI
5. On approval: status→APPROVED→RUNNING→SUCCESS/FAILED

## Current vs Future Agent Support
**Current (v1.0)**:
- Device isolation: Sets `containment_status` flag in Device entity
- Firewall/USB: Queues actions with "agent execution pending" guidance
- Hardening: Evidence requests tracked via PolicyActionQueue

**Future (with agent)**:
- Agent polls PolicyActionQueue for assigned device
- Executes approved actions locally (firewall rules, USB enforcement, etc.)
- Reports execution status back to queue

## Security & RBAC
- Only admins can create/edit/publish/assign policies
- Server-side authorization on all policy endpoints
- Full audit logging (who/what/when) via AuditLog entity
- Policy payload hashes for integrity verification

## API Usage

### Backend Functions
```javascript
// Create policy
await base44.functions.invoke('policyOperations', {
  operation: 'createPolicy',
  name: 'Corporate Baseline',
  description: 'Standard security policy',
  policy_payload_json: { ... }
});

// Publish (creates new version if already published)
await base44.functions.invoke('policyOperations', {
  operation: 'publishPolicy',
  policy_id: 'policy-id'
});

// Assign to device
await base44.functions.invoke('policyAssignments', {
  operation: 'assignPolicy',
  policy_id: 'policy-id',
  target_type: 'DEVICE',
  target_id: 'device-id',
  enforcement_mode: 'ENFORCE',
  priority: 10
});

// Compute effective policy
const resolution = await base44.functions.invoke('policyResolution', {
  device_id: 'device-id'
});

// Evaluate compliance
await base44.functions.invoke('policyEnforcement', {
  operation: 'evaluateCompliance',
  device_id: 'device-id'
});

// Approve action
await base44.functions.invoke('policyEnforcement', {
  operation: 'approveAction',
  action_id: 'action-id'
});
```

## Testing Checklist
- [ ] Create draft policy, publish v1, edit and publish v2 (verify version lineage)
- [ ] Assign policy to device and group, verify effective resolution
- [ ] Toggle AUDIT_ONLY vs ENFORCE, verify action queuing behavior
- [ ] Trigger CRITICAL_ALERT, verify auto-response rule creates action
- [ ] Approve/deny actions in queue, verify audit trail
- [ ] Export compliance dashboard as CSV
- [ ] Verify no placeholder data in any UI

## Guardrails
- **Defensive only**: No offensive/attack-back capabilities
- **Safe-by-default**: Disruptive actions require explicit approval
- **Fully auditable**: All changes logged with before/after diffs
- **Immutable artifacts**: Policy evaluations and resolutions never deleted
- **No placeholder data**: All UI driven by real entities or clean empty states