# Security Posture Sweep - Phase 4

**Date:** 2026-01-23  
**Scope:** Repo-wide scan for confirmed security anti-patterns

---

## ✅ CHECKLIST

### 1. Error Disclosure (error.message/error.stack returned to clients)

| File | Status | Issue |
|------|--------|-------|
| `functions/agentHeartbeat.ts` | ❌ FAIL | Returns `error.message` directly (line 113) |
| `functions/updateCase.ts` | ❌ FAIL | Returns `error.message` + `error.stack` (lines 196-197) |
| `functions/executeRemoteDeviceAction.ts` | ✅ PASS | Uses `errorJson` helper |
| `functions/uploadEvidenceFile.ts` | ✅ PASS | Uses `errorJson` helper |
| `functions/downloadEvidenceFile.ts` | ✅ PASS | Uses `errorJson` helper |
| `functions/validateLogin.ts` | ✅ PASS | Uses `errorJson` helper |
| `functions/sendMFACode.ts` | ✅ PASS | Uses `errorJson` helper |
| `functions/endpointIsolation.ts` | ✅ PASS | Uses `errorJson` helper |

### 2. Missing requireUser/requireOrg (org-scoped endpoints)

| File | Status | Issue |
|------|--------|-------|
| `functions/agentHeartbeat.ts` | ✅ PASS | Agent auth (no user context needed) |
| `functions/agentIngestEvent.ts` | ✅ PASS | Agent auth + org scoping verified |
| `functions/createCase.ts` | ✅ PASS | User auth + org context checked |
| `functions/updateCase.ts` | ✅ PASS | User auth + access control verified |
| `functions/executeRemoteDeviceAction.ts` | ✅ PASS | User auth + org scoping enforced |

### 3. Missing Organization Scoping (reading/writing org entities)

| File | Status | Issue |
|------|--------|-------|
| `functions/agentIngestEvent.ts` | ✅ PASS | Validates device belongs to org (lines 98-109) |
| `functions/createCase.ts` | ✅ PASS | Filters by organization_id (line 46-49) |
| `functions/updateCase.ts` | ✅ PASS | Access control validates org membership |
| `functions/executeRemoteDeviceAction.ts` | ✅ PASS | Filters devices by organization_id (line 47-50) |

---

## 🔧 FIXES REQUIRED

### Fix 1: `functions/agentHeartbeat.ts`
**Issue:** Line 113 returns raw `error.message`  
**Risk:** Information disclosure (stack traces, internal paths)  
**Fix:** Use `errorJson` helper

### Fix 2: `functions/updateCase.ts`
**Issue:** Lines 196-197 return raw `error.message` + `error.stack`  
**Risk:** Critical - exposes stack traces to client  
**Fix:** Use `errorJson` helper or `createErrorResponse` from existing errorHandler

---

## 📊 SUMMARY

- **Total Endpoints Audited:** 8
- **PASS:** 6
- **FAIL:** 2
- **Critical Fixes:** 2

---

## 🎯 MITIGATION STRATEGY

1. Replace raw error returns with `errorJson(500, 'Generic user-safe message')`
2. Preserve existing audit logging and telemetry
3. No changes to success paths or entity schemas
4. Verify with smoke tests after patching