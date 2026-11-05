# Phase 6: Security & Viability Hardening — Implementation Plan

**Status:** 🚧 IN PROGRESS  
**Start Date:** 2026-01-20  
**Target:** Production-Grade Multi-Tenant Security + Customizable Dashboard

---

## Objectives

Ship a production-grade, multi-tenant safe, audit-defensible Sentinel Forensics platform with:

1. **Tenant Isolation Enforcement**: No service role queries read/write tenant data without org scoping
2. **Tamper-Proof Audit Logs**: Server-side HMAC-signed audit events only
3. **MFA Security Hardening**: Server-side secret storage, no client-supplied authoritative data
4. **Internal Endpoint Protection**: Job secrets + rate limiting on sensitive endpoints
5. **Evidence Pipeline Hardening**: Server-side validation, type checking, no stack traces
6. **Customizable Dashboard**: Backend aggregation endpoints with secure drilldowns

---

## Implementation Progress

### Part 1: Security Middleware ✅ COMPLETE

**File:** `functions/helpers/security.js`

**Exports:**
- `requireAuth(base44)` — Returns user or throws 401
- `requireOrg(user)` — Returns orgId or throws 403
- `requireRole(user, roles[])` — Enforces RBAC
- `requireInternalJobSecret(req)` — Validates `X-Internal-Job-Secret`
- `orgScopedFilter(orgId, additionalFilters)` — Returns org-scoped query filter
- `safeJson(req, maxSizeBytes)` — Parses JSON with size limit
- `createRequestContext(req)` — Request metadata for logging
- `sanitizeError(error)` — Removes stack traces from client responses
- `assertOrgScoped(filter, functionName)` — Safety assertion for service role queries

**Security Guarantees:**
- All auth checks throw Response objects (not errors) for clean HTTP responses
- Organization context extracted from authenticated user (server-side trust)
- No stack traces in error responses
- Request size limits enforced (default 10MB)

---

### Part 2: Audit Trail Normalization ✅ COMPLETE

**File:** `functions/createAuditEvent.js`

**Canonical Audit Entity:** `SecurityAuditLog`

**Features:**
- Server-generated timestamps (tamper-proof)
- HMAC-SHA256 signatures using `SERVER_SIGNING_KEY`
- Payload hash (SHA-256) for integrity chain
- Organization scoping enforced
- Actor email + role captured server-side
- RLS prevents client writes (audit creation via function only)

**HMAC Signature:**
```javascript
const canonicalPayload = {
  organization_id: orgId,
  action,
  resource_type,
  resource_id,
  actor_email: user.email,
  actor_role: user.role,
  timestamp,
  severity,
  success
};
const signature = HMAC-SHA256(canonicalPayload, SERVER_SIGNING_KEY);
```

**Response:**
```json
{
  "audit_id": "...",
  "timestamp": "2026-01-20T15:30:00.000Z",
  "signature": "a3f8b9c2...",
  "message": "Audit event recorded"
}
```

**Frontend Migration Required:**
- Replace all `base44.entities.AuditLog.create()` calls
- Use `base44.functions.invoke('createAuditEvent', {...})`

---

### Part 3: Dashboard Metrics Endpoints ✅ COMPLETE

**File:** `functions/dashboardMetrics.js`

**Purpose:** Backend aggregation to avoid client pulling entire datasets

**Metrics Provided:**
- **Alerts**: Total, by severity, critical count, trend
- **Threats**: Total, active, mitigated, by type
- **Devices**: Total, compliant, non-compliant, avg compliance %
- **Policies**: Total, active, draft
- **Evidence**: Total, locked, integrity-verified, total size
- **Audit**: Total events, by severity, failed actions, unique actors
- **Timeseries**: Last 24 hours in hourly buckets (alerts, threats, audit events)

**Filters Supported:**
- `time_range`: 1h, 24h, 7d, 30d, 90d
- `severity_filter`: CRITICAL, HIGH, MEDIUM, LOW, INFO
- `device_ids[]`: Filter by specific devices
- `case_ids[]`: Filter by specific cases
- `policy_ids[]`: Filter by specific policies

**Security:**
- Always org-scoped via `orgScopedFilter(orgId)`
- Requires authentication + organization context
- No raw entity data exposed (aggregations only)

**Response Structure:**
```json
{
  "organization_id": "...",
  "time_range": "7d",
  "generated_at": "...",
  "filters_applied": {...},
  "metrics": {
    "alerts": {...},
    "threats": {...},
    "devices": {...},
    "policies": {...},
    "evidence": {...},
    "audit": {...},
    "timeseries": [...]
  }
}
```

---

### Part 4: Dashboard Drilldown Endpoint ✅ COMPLETE

**File:** `functions/dashboardDrilldown.js`

**Purpose:** Paginated row-level data for clicked chart segments

**Allowed Entities (Whitelist):**
- Alert
- ThreatDetection
- MobileDevice
- SecurityAuditLog
- EvidenceV2
- IncidentSession
- ControlPlaneIndicator
- ProactiveRiskAlert

**Features:**
- Organization scoping enforced
- Pagination (max 100 per page)
- Custom filters + sorting
- Sanitized output (removes internal fields, sensitive identifiers)

**Request:**
```json
{
  "entity_type": "Alert",
  "filters": { "severity": "CRITICAL" },
  "page": 1,
  "page_size": 50,
  "sort_by": "created_date",
  "sort_order": "desc"
}
```

**Response:**
```json
{
  "organization_id": "...",
  "entity_type": "Alert",
  "pagination": {
    "page": 1,
    "page_size": 50,
    "total_records": 127,
    "total_pages": 3,
    "has_next": true,
    "has_prev": false
  },
  "results": [...]
}
```

**Sanitization:**
- Removes: `created_by_id`, `app_id`, `is_sample`, `is_deleted`, etc.
- Truncates sensitive identifiers (device IDs, etc.)
- Strips raw signing keys from metadata

---

## Pending Implementation

### Part 5: Tenant Isolation Enforcement (HIGH PRIORITY)

**Audit Required:** Scan all functions using `asServiceRole` for:
1. Unscoped `.list()` calls on tenant entities
2. Missing `organization_id` in `.filter()` queries
3. `.create()` calls that don't stamp `organization_id`

**Functions to Review:**
- `refreshAndCorrelateThreatIntel.js`
- `evaluateControlPlaneMitigations.js`
- `policyResolution.js`
- `policyEnforcement.js`
- All agent/automation functions

**Fix Pattern:**
```javascript
// ❌ WRONG: Unscoped list
const devices = await base44.asServiceRole.entities.MobileDevice.list();

// ✅ CORRECT: Org-scoped filter
const devices = await base44.asServiceRole.entities.MobileDevice.filter(
  orgScopedFilter(orgId)
);
```

---

### Part 6: MFA Repair (SECURITY CRITICAL)

**Current Problem:** Client-supplied secrets treated as authoritative

**New Flow:**
1. **Setup Start**: Server generates TOTP secret, encrypts, stores temporarily, returns QR URI
2. **Setup Verify**: User submits TOTP code, server validates against stored secret, marks `mfa_enabled=true`
3. **Backup Codes**: Server generates random codes, stores salted hashes only
4. **Disable**: Requires re-auth or admin

**Files to Create:**
- `functions/mfaSetupStart.js`
- `functions/mfaSetupVerify.js`
- `functions/mfaDisable.js`
- `functions/mfaBackupCodesRegenerate.js`

**User Entity Changes:**
- Add: `mfa_secret_encrypted` (server-side only, never sent to client)
- Add: `mfa_backup_codes_hashed[]` (salted SHA-256 hashes)

---

### Part 7: Internal Endpoint Lockdown (SECURITY CRITICAL)

**Endpoints to Protect:**
- `validateLogin` → Require internal secret OR rate limit by IP
- `checkAccountLockout` → Internal secret only
- `autoTriggerIncidentPlaybook` → Internal secret only
- `generateScheduledReport` → Internal secret only

**Pattern:**
```javascript
import { requireInternalJobSecret } from './helpers/security.js';

Deno.serve(async (req) => {
  requireInternalJobSecret(req); // Throws 401 if invalid
  // ... internal logic
});
```

**Rate Limiting:**
- Token/email-based endpoints: 5 attempts per 15 minutes per IP
- Prevents user enumeration attacks

---

### Part 8: Evidence Pipeline Hardening (DATA INTEGRITY)

**Requirements:**
1. Verify user access to `case_id` server-side before accepting evidence
2. Strict type validation: magic byte checking (not extension-only)
3. Streaming file hashing (avoid loading entire file into memory)
4. Remove stack traces from error responses

**Files to Update:**
- `secureEvidenceUpload` (or similar upload endpoint)
- `uploadEvidenceFile`
- Evidence-related quarantine/alert functions

---

## Security Validation Checklist

- [ ] No service role queries read tenant data without `organization_id` filter
- [ ] Audit logs cannot be forged by clients (HMAC signatures enforced)
- [ ] MFA secrets never stored plaintext or accessible to client
- [ ] Internal endpoints protected by job secret or admin RBAC
- [ ] Dashboard metrics served by backend aggregation (no raw data exposure)
- [ ] Drilldowns are org-scoped, paginated, sanitized
- [ ] No stack traces in error responses
- [ ] All file uploads validate magic bytes + size limits
- [ ] Rate limiting on auth endpoints prevents enumeration

---

## Deployment Strategy

1. **Phase 6.1**: Deploy security middleware + audit endpoint (non-breaking)
2. **Phase 6.2**: Migrate frontend to use `createAuditEvent` (breaking for audit writes)
3. **Phase 6.3**: Deploy dashboard metrics/drilldown endpoints
4. **Phase 6.4**: Fix tenant isolation violations in existing functions
5. **Phase 6.5**: Deploy MFA repair (requires User entity migration)
6. **Phase 6.6**: Lock down internal endpoints + add rate limiting
7. **Phase 6.7**: Harden evidence pipeline

**Rollback Plan:** Each phase is independently deployable. If Phase N fails, rollback to Phase N-1.

---

## Acceptance Criteria (Phase 6 Complete)

✅ Consolidated security middleware in use across all functions  
✅ Server-side HMAC-signed audit logs operational  
✅ Dashboard metrics endpoint returns aggregated data  
✅ Drilldown endpoint provides paginated, sanitized results  
⏳ No tenant isolation violations in service role queries  
⏳ MFA flow uses server-side secret storage only  
⏳ Internal endpoints require job secret or admin auth  
⏳ Evidence pipeline validates types server-side  
⏳ No stack traces in production error responses  

---

**Next Steps:** Execute Part 5 (tenant isolation audit) and Part 6 (MFA repair).