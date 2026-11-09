# Error Handling Architecture (Phase 2)

**Last Updated:** 2025-12-14  
**Status:** ✅ IMPLEMENTED

---

## Overview

This document describes the error handling strategy implemented in Sentinel Forensics following Phase 2 hardening. The system uses a **layered approach** with React ErrorBoundaries and a centralized API error handler.

---

## Key Principles

1. **No Global Suppression** - Global `window.addEventListener('error')` handlers have been REMOVED
2. **Fail Visible** - Errors surface to users with friendly messages + developers get full context
3. **Targeted Retry** - Only idempotent operations (GET) retry automatically
4. **Audit Trail** - Critical errors logged to backend for forensic analysis

---

## Error Boundary Hierarchy

### 1. StartupErrorBoundary (Outermost Layer)
**Location:** `components/errors/StartupErrorBoundary.js`  
**Scope:** Catches catastrophic initialization failures

**Handles:**
- Failed module imports
- DI container initialization errors
- Critical security check failures

**UI:** Full-screen error with "Reload" button

---

### 2. GlobalErrorBoundary (App Layer)
**Location:** `components/errors/GlobalErrorBoundary.js`  
**Scope:** Catches unhandled errors in any component

**Handles:**
- Unexpected component crashes
- Uncaught promise rejections that bubble up
- React lifecycle errors

**Special Logic:**
- **Narrowly** allows React/Radix DOM reconciliation errors:
  - `removeChild: The node to be removed is not a child of this node`
  - `insertBefore: Child to insert before is not a child of this node`
- All other errors are surfaced and logged

**UI:** Red error card with error message + "Reload App" button

**Backend Logging:**
- Sends error to `createAuditLog` function
- Includes error message, stack trace (truncated), component stack
- Non-blocking (silent fail if logging fails)

---

### 3. RouteErrorBoundary (Per-Route Layer)
**Location:** `components/errors/RouteErrorBoundary.js`  
**Scope:** Catches errors in specific routes without crashing entire app

**Handles:**
- Page-specific failures (data fetching, rendering)
- Component errors within a route

**UI:** In-page error card with:
- "Retry This Page" button
- "Go Home" button
- "Copy Bug Report" (dev mode only)

**Wrapped Routes:**
- Dashboard
- Cases / CaseDetail
- Evidence / EvidenceDetail
- Credentials

---

## Centralized API Error Handler

**Location:** `components/utils/apiErrorHandler.js`

### Features

#### 1. Automatic Retry (Idempotent Only)
```javascript
import { withRetry } from '@/components/utils/apiErrorHandler';

const data = await withRetry(
  () => base44.entities.Case.list(),
  { 
    maxRetries: 2, 
    method: 'GET', 
    context: 'Loading cases' 
  }
);
```

**Retry Logic:**
- Only retries `GET` requests by default
- Retries on: 408, 429, 500, 502, 503, 504 status codes
- Exponential backoff: 1s → 2s → 4s
- **Never retries:** POST, PUT, DELETE (non-idempotent)

#### 2. User-Friendly Toast Notifications
- Maps technical errors to human-readable messages
- Shows toast automatically on failure
- Can be silenced with `silent: true` option

#### 3. Safe API Wrapper (Always Resolves)
```javascript
import { safeAPI } from '@/components/utils/apiErrorHandler';

const { success, data, error } = await safeAPI(
  () => base44.entities.Alert.list()
);

if (!success) {
  console.log('Error:', error);
  // Handle gracefully without try/catch
}
```

---

## Route Protection & RBAC

### Authentication Check
**Location:** `components/security/ProtectedRoute.js`

**Logic:**
- Calls `base44.auth.me()` on mount
- Blocks unauthenticated users with upgrade prompt
- Shows loading spinner during check

**Tier Hierarchy:**
```javascript
free: 0
plus: 1
pro: 2
forensic_suite: 3
```

### Backend RBAC Enforcement
**Location:** `functions/rbacMiddleware.js`

**Critical:** All backend functions MUST call `rbacMiddleware` before business logic:

```javascript
// REQUIRED in every backend function
const base44 = createClientFromRequest(req);
const user = await base44.auth.me();

if (!user) {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

// Check permissions
const hasPermission = hasPermission(user.role, Permissions.CASES_WRITE);
if (!hasPermission) {
  return Response.json({ error: 'Forbidden' }, { status: 403 });
}
```

**Audit Logging:**
- All permission checks logged to `SentinelAuditLog`
- Unauthorized attempts flagged as `security_breach`

---

## Error Types & Messages

### User-Facing Errors (Friendly)

| Technical Error | User Message |
|----------------|--------------|
| `401 Unauthorized` | "Please log in to continue" |
| `403 Forbidden` | "You do not have permission to perform this action" |
| `404 Not Found` | "The requested item could not be found" |
| `429 Rate Limit` | "You are making requests too quickly. Please wait" |
| `500 Internal Error` | "An unexpected error occurred. Please try again" |
| `503 Service Unavailable` | "Service temporarily unavailable. Please try again later" |
| Legal Hold | "This item is under legal hold and cannot be modified" |
| Network Error | "Connection error. Please check your internet" |

### Developer Errors (Console)

All errors logged with full context:
```javascript
{
  context: 'Loading cases',
  message: 'Network request failed',
  status: 500,
  data: { ... }
}
```

---

## Common Failure Scenarios & Debugging

### 1. "User sees white screen"

**Cause:** GlobalErrorBoundary caught an error  
**Debug:**
1. Open browser console
2. Look for `🚨 Global Error Boundary:` log
3. Check error stack trace
4. Check `SentinelAuditLog` entity for backend error log

**Fix:**
- Wrap problematic component in RouteErrorBoundary
- Fix underlying bug based on stack trace

---

### 2. "API call fails silently"

**Cause:** Error not surfaced to UI  
**Debug:**
1. Check if `safeAPI` wrapper is being used
2. Check console for API error logs
3. Verify error handling in component

**Fix:**
```javascript
// Before (silent fail)
const data = await base44.entities.Case.list();

// After (surfaces error)
const data = await withRetry(
  () => base44.entities.Case.list(),
  { context: 'Loading cases' }
);
```

---

### 3. "Unauthorized errors not showing"

**Cause:** Missing auth check in backend function  
**Debug:**
1. Check backend function for `base44.auth.me()`
2. Verify `Authorization` header is being sent
3. Check `AuditLog` for failed permission checks

**Fix:**
```javascript
// Add to backend function
const base44 = createClientFromRequest(req);
const user = await base44.auth.me();

if (!user) {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
```

---

### 4. "Infinite retry loop"

**Cause:** Retrying non-idempotent operation  
**Debug:**
1. Check if operation is POST/PUT/DELETE
2. Verify `method` parameter in `withRetry`

**Fix:**
```javascript
// Don't retry mutations
const result = await base44.entities.Case.create(data);
// No withRetry wrapper needed
```

---

## Testing Error Handling

### Manual Testing Checklist

- [ ] Kill backend → verify offline indicator shows
- [ ] Trigger 401 error → verify "Please log in" toast
- [ ] Trigger 403 error → verify permission denied message
- [ ] Throw error in component → verify RouteErrorBoundary catches
- [ ] Break API call → verify retry logic works
- [ ] Simulate slow network → verify loading states

### Automated Tests (Future)

```javascript
// Example test
test('API retry logic retries GET requests', async () => {
  let attempts = 0;
  const failingCall = () => {
    attempts++;
    if (attempts < 3) throw new Error('Network error');
    return { success: true };
  };

  await withRetry(failingCall, { maxRetries: 2, method: 'GET' });
  expect(attempts).toBe(3);
});
```

---

## Monitoring & Alerts

### Backend Error Logging

All critical errors logged to `SentinelAuditLog`:
```javascript
{
  event_type: 'frontend_error',
  severity: 'critical',
  description: 'Frontend error: ...',
  metadata: {
    error_message: '...',
    error_stack: '...',
    component_stack: '...'
  }
}
```

### Metrics to Track
- Error rate by route
- API failure rate
- Retry success rate
- Auth failure rate

---

## Future Improvements (Phase 3+)

1. **Sentry Integration** - Centralized error tracking
2. **Error Recovery UI** - Auto-refresh stale data
3. **Offline Queue** - Persist mutations when offline
4. **Circuit Breaker** - Stop retrying after too many failures
5. **Error Replay** - Reproduce errors from logs

---

## Summary

✅ **No global error suppression** - Errors surface properly  
✅ **Layered ErrorBoundaries** - Graceful degradation  
✅ **Centralized API handler** - Consistent retry + toast  
✅ **RBAC enforcement** - Backend validates permissions  
✅ **Audit trail** - All errors logged for forensics

**Result:** Users see clear errors, developers can debug, no silent failures.

---

**Document Version:** 1.0  
**Author:** Base44 AI Assistant  
**Phase:** 2 of 5 (Error Handling Hardening)