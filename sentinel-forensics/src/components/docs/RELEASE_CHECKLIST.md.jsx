# Release Checklist (Phase 8)

Last Updated: 2025-12-14  
Status: PRODUCTION READY

---

## Pre-Release Testing

### 1. Authentication & Authorization

- [ ] Login with valid credentials
- [ ] Logout clears all session state
- [ ] MFA setup flow (TOTP)
- [ ] MFA verification on login
- [ ] Admin-only pages block non-admin users
- [ ] Session timeout after inactivity
- [ ] Password reset flow (if implemented)

Test Users:
- Admin user (with MFA)
- Regular user (without MFA)
- User from different organization

---

### 2. Billing & Subscriptions (Stripe Test Mode)

Test Card Numbers:
- Success: 4242 4242 4242 4242
- Decline: 4000 0000 0000 0002
- Requires 3DS: 4000 0025 0000 3155

#### Subscription Flow

- [ ] Visit /Pricing page
- [ ] Click "Upgrade Now" on Plus tier
- [ ] Stripe Checkout opens with correct:
  - Plan name
  - Price (19.99)
  - Interval (monthly)
  - Success URL (your-app.base44.com/payment-success)
  - Cancel URL (your-app.base44.com/payment-cancelled)
- [ ] Complete payment with test card 4242 4242 4242 4242
- [ ] Redirect to /payment-success
- [ ] User subscription_tier updated to "plus"
- [ ] User subscription_status updated to "active"
- [ ] Stripe customer_id stored in user record

#### Subscription Management

- [ ] Visit /Profile page
- [ ] Click "Manage Subscription"
- [ ] Stripe Customer Portal opens
- [ ] Can view payment methods
- [ ] Can update payment method
- [ ] Can cancel subscription
- [ ] Cancellation webhook updates subscription_status to "cancelled"

#### Webhook Testing

- [ ] Use Stripe CLI: stripe listen --forward-to localhost:3000/api/stripe/webhook
- [ ] Trigger event: stripe trigger checkout.session.completed
- [ ] Verify webhook logged: "Stripe webhook: checkout.session.completed"
- [ ] Verify user record updated
- [ ] Check AuditLog for webhook event

Webhook Events to Test:
- customer.subscription.created
- customer.subscription.updated
- customer.subscription.deleted
- invoice.payment_succeeded
- invoice.payment_failed

---

### 3. Referral System

#### Referral Code Creation

- [ ] Visit /Referrals page
- [ ] Click "Generate New Code"
- [ ] Code generated (format: BASE44-XXXXX)
- [ ] Code appears in "My Referral Codes" table
- [ ] Status: "active"
- [ ] Commission rate: 20%

#### Referral Tracking

- [ ] Copy referral link (e.g., /Pricing?ref=BASE44-ABC123)
- [ ] Open in incognito window
- [ ] Visit referral link
- [ ] Check Network tab for trackReferralClick call
- [ ] Response: { tracked: true }
- [ ] ReferralClick entity created with:
  - referral_code
  - session_id (hashed)
  - timestamp
  - user_agent
  - converted: false

#### Referral Conversion

- [ ] Continue signup flow in incognito
- [ ] Complete Stripe checkout
- [ ] ReferralClick.converted updated to true
- [ ] ReferralClick.user_email set
- [ ] Referral entity created with:
  - referrer_email
  - referee_email
  - status: "active"
  - commission_earned: 0

#### Payout Calculation (Admin Only)

- [ ] Visit /PayoutLedger page (admin only)
- [ ] Click "Compute Payouts"
- [ ] Function: computeMonthlyReferralPayouts
- [ ] PayoutLedger records created
- [ ] Total commission calculated correctly
- [ ] Status: "pending"
- [ ] Detailed referrals_included breakdown

---

### 4. Security Tests

#### Multi-Tenant Isolation

- [ ] Login as User A (Org 1)
- [ ] Create a Case
- [ ] Note case_id
- [ ] Logout
- [ ] Login as User B (Org 2)
- [ ] Try to access User A's case via URL manipulation
- [ ] Verify: Access denied (403 or empty result)
- [ ] Check AuditLog for unauthorized access attempt

#### RLS Enforcement

- [ ] Query entities without org filter:
  ```javascript
  const cases = await base44.entities.Case.list();
  ```
- [ ] Verify: Only current user's org cases returned
- [ ] No cross-org data leakage

#### Audit Log Immutability

- [ ] Create audit log via function: createSecureAuditLog
- [ ] Try to update audit log directly:
  ```javascript
  await base44.entities.SentinelAuditLog.update(log.id, { ... })
  ```
- [ ] Verify: Update rejected (RLS blocks updates)
- [ ] Try to delete audit log
- [ ] Verify: Delete rejected (RLS blocks deletes)

#### HMAC Signature Validation

- [ ] Create audit log via createSecureAuditLog
- [ ] Verify hmac_signature field populated
- [ ] Verify signature matches server-generated hash
- [ ] Try to forge signature client-side
- [ ] Verify: Tampered logs detectable

#### Input Sanitization

- [ ] Create Case with title: `<script>alert('xss')</script>`
- [ ] Verify: Script tags stripped
- [ ] Case title stored as: `alert('xss')`
- [ ] No XSS execution on display

---

### 5. Performance Checks

#### Pagination

- [ ] Visit /AlertManagement
- [ ] Verify: Only 25 alerts loaded initially
- [ ] Click "Next Page"
- [ ] Verify: Next 25 alerts loaded
- [ ] Change page size to 50
- [ ] Verify: 50 alerts loaded
- [ ] Check Network tab: API call has limit=50 param

#### Query Limits

- [ ] Open DevTools → Network tab
- [ ] Navigate to Evidence page
- [ ] Check API calls to /entities/Evidence
- [ ] Verify: limit parameter present (max 50)
- [ ] No queries fetching 1000+ records

#### Polling Intervals

- [ ] Visit /AlertManagement
- [ ] Check Network tab
- [ ] Verify: Alert query refetches every 30s (if live updates ON)
- [ ] Toggle live updates OFF
- [ ] Verify: Polling stops

#### WebSocket Cleanup

- [ ] Visit /SecurityAgent (if uses WebSocket)
- [ ] Open DevTools → Network → WS tab
- [ ] Verify: WebSocket connection established
- [ ] Navigate away from page
- [ ] Verify: WebSocket connection closed
- [ ] No zombie connections

---

### 6. Navigation & UI

#### Core Pages (Accessible)

- [ ] Dashboard (/)
- [ ] Cases (/Cases)
- [ ] Evidence (/Evidence)
- [ ] Alerts (/AlertManagement)
- [ ] Devices (/Devices)
- [ ] Profile (/Profile)
- [ ] Referrals (/Referrals)
- [ ] Subscription (/Subscription)

#### Admin-Only Pages

- [ ] PayoutLedger (/PayoutLedger) - Blocked for non-admin
- [ ] RoleManagement (/RoleManagement) - Blocked for non-admin
- [ ] AuditTrail (/AuditTrail) - Accessible to admin

#### Mobile Responsiveness

- [ ] Open DevTools → Toggle device toolbar
- [ ] Test iPhone 12 Pro (390px)
- [ ] Test iPad (768px)
- [ ] Verify: Sidebar collapses
- [ ] Verify: Tables scroll horizontally
- [ ] Verify: Forms stack vertically
- [ ] Verify: Buttons are tap-friendly (min 44px)

---

### 7. Error Handling

#### Network Errors

- [ ] Open DevTools → Network tab → Throttle to "Offline"
- [ ] Try to create a Case
- [ ] Verify: Offline indicator appears
- [ ] Verify: Operation queued (OfflineQueue)
- [ ] Go back online
- [ ] Verify: Queued operation executes

#### API Errors

- [ ] Trigger 401 Unauthorized:
  - Delete auth cookie manually
  - Try to list Cases
- [ ] Verify: Redirect to login
- [ ] Trigger 403 Forbidden:
  - Try to access admin page as regular user
- [ ] Verify: "Insufficient permissions" error
- [ ] Trigger 500 Server Error:
  - Call non-existent backend function
- [ ] Verify: User-friendly error message

#### Error Boundaries

- [ ] Trigger React error (e.g., corrupt component state)
- [ ] Verify: ErrorBoundary catches error
- [ ] Verify: Fallback UI displayed
- [ ] Verify: Error logged to observabilityLogger
- [ ] Click "Reload" button
- [ ] Verify: App recovers

---

### 8. Observability & Logging

#### Structured Logging

- [ ] Open browser console
- [ ] Perform billing action (upgrade subscription)
- [ ] Check logs: `[INFO] BILLING: subscription_created`
- [ ] Verify context:
  - subscription_tier
  - subscription_status
  - stripe_customer_id
  - amount, currency

#### Webhook Logging

- [ ] Trigger Stripe webhook (via CLI or test mode)
- [ ] Check server logs: "Stripe webhook: checkout.session.completed"
- [ ] Verify logged:
  - webhook_type
  - webhook_id
  - processing_time_ms
  - status

#### Referral Logging

- [ ] Create referral code
- [ ] Check logs: `[INFO] REFERRAL: code_created`
- [ ] Track referral click
- [ ] Check logs: `[INFO] REFERRAL: click_tracked`
- [ ] Complete signup
- [ ] Check logs: `[INFO] REFERRAL: conversion_completed`

#### Security Event Logging

- [ ] Attempt unauthorized access
- [ ] Check logs: `[WARN] SECURITY: unauthorized_access_attempt`
- [ ] Verify logged:
  - event_type
  - severity: "critical"
  - user_email
  - resource_type, resource_id

---

### 9. Smoke Tests (Automated)

- [ ] Visit /SmokeTests page (admin only)
- [ ] Click "Run All Tests"
- [ ] Verify tests execute:
  1. Authentication - PASSED
  2. Entity Access - PASSED
  3. Referral Creation - PASSED
  4. Referral Click Tracking - PASSED
  5. Audit Logging - PASSED
  6. Subscription Status - PASSED
  7. Multi-Tenant Isolation - PASSED
- [ ] All tests should PASS
- [ ] If any FAIL, investigate immediately

---

### 10. Data Integrity

#### Evidence Chain of Custody

- [ ] Upload evidence file
- [ ] Verify ChainOfCustodyLog created:
  - action: "created"
  - actor_email
  - evidence_hash (SHA-256)
  - record_hash
  - previous_hash: null (first entry)
- [ ] Update evidence metadata
- [ ] Verify new chain entry:
  - action: "updated"
  - previous_hash: matches previous record_hash
- [ ] Verify hash chain integrity (no gaps)

#### Audit Log Retention

- [ ] Check AuditLog entity
- [ ] Verify logs from 7 days ago still present
- [ ] Verify RLS prevents deletion
- [ ] Verify immutability (no updates allowed)

---

### 11. Compliance Checks

#### GDPR

- [ ] Test "Right to Access":
  - Export user data (if implemented)
  - Verify all user data included
- [ ] Test "Right to Deletion":
  - Call forgetUserData function
  - Verify personal data anonymized
  - Verify audit logs preserved
- [ ] Test "Right to Portability":
  - Download data in CSV/JSON format

#### SOC 2

- [ ] Verify access control:
  - RBAC enforced
  - RLS active on all entities
- [ ] Verify encryption:
  - TLS 1.3 in transit
  - Evidence encrypted at rest
- [ ] Verify audit trail:
  - All sensitive actions logged
  - Logs immutable
  - Retention policy (7 years)

---

### 12. Browser Compatibility

Test on:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

Critical Paths:
- [ ] Login/logout
- [ ] Create Case
- [ ] Upload Evidence
- [ ] Subscription checkout

---

### 13. CSP & Security Headers

#### CSP Validation

- [ ] Open DevTools → Console
- [ ] Check for CSP violations
- [ ] Verify: No blocked scripts
- [ ] Verify: No inline script errors

#### Security Headers

Check Response Headers (DevTools → Network → select request → Headers):
- [ ] Strict-Transport-Security: max-age=31536000
- [ ] X-Content-Type-Options: nosniff
- [ ] X-Frame-Options: DENY
- [ ] X-XSS-Protection: 1; mode=block

---

### 14. Secrets & Environment Variables

Verify all secrets configured in Base44 dashboard:
- [ ] STRIPE_SECRET_KEY
- [ ] STRIPE_PUBLISHABLE_KEY
- [ ] STRIPE_WEBHOOK_SECRET
- [ ] SERVER_SIGNING_KEY
- [ ] ANTHROPIC_API_KEY
- [ ] OPENAI_API_KEY
- [ ] VIRUSTOTAL_API_KEY
- [ ] WS_URL
- [ ] AGENT_SECRET_TOKEN

Test secret access:
- [ ] Backend function can read Deno.env.get('STRIPE_SECRET_KEY')
- [ ] Frontend cannot access secret
- [ ] No secrets in browser console
- [ ] No secrets in network payloads

---

### 15. Deployment Readiness

#### Code Quality

- [ ] No console.error in production build
- [ ] No hardcoded credentials
- [ ] No debug flags enabled
- [ ] No commented-out code blocks

#### Documentation

- [ ] README updated with:
  - Setup instructions
  - Environment variables
  - Testing procedures
  - Deployment steps
- [ ] API documentation (if public API)
- [ ] Runbooks for common issues

#### Monitoring

- [ ] Error tracking configured
- [ ] Performance monitoring enabled
- [ ] Uptime monitoring set up
- [ ] Alert notifications configured

---

## Post-Release Validation

### Immediate (within 1 hour)

- [ ] Health check endpoint responding
- [ ] User signup flow working
- [ ] Stripe webhooks receiving events
- [ ] No critical errors in logs
- [ ] No performance degradation

### 24 Hours

- [ ] Monitor error rates (< 1%)
- [ ] Monitor API response times (< 500ms p95)
- [ ] Check conversion funnel (signup → payment)
- [ ] Review audit logs for anomalies
- [ ] Check referral tracking accuracy

### 7 Days

- [ ] Review subscription retention
- [ ] Analyze referral conversion rates
- [ ] Check payout calculations
- [ ] Review security events
- [ ] Performance optimization opportunities

---

## Rollback Plan

If critical issue detected:

1. **Immediate Actions**
   - [ ] Notify team
   - [ ] Assess impact severity
   - [ ] Decision: Rollback vs. Hotfix

2. **Rollback Procedure**
   - [ ] Revert to previous version
   - [ ] Clear CDN cache
   - [ ] Verify rollback successful
   - [ ] Notify users (if necessary)

3. **Post-Mortem**
   - [ ] Document root cause
   - [ ] Identify prevention measures
   - [ ] Update tests to catch issue
   - [ ] Add to known issues list

---

## Sign-Off

**Release Manager:** ___________________  
**Date:** ___________________  
**Version:** ___________________  

**QA Lead:** ___________________  
**Date:** ___________________  

**Security Review:** ___________________  
**Date:** ___________________  

**Approval:** ___________________  
**Date:** ___________________  

---

## Quick Command Reference

```bash
# Stripe CLI
stripe listen --forward-to localhost:3000/api/stripe/webhook
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated

# Test payment
# Card: 4242 4242 4242 4242
# Expiry: Any future date
# CVC: Any 3 digits
# ZIP: Any 5 digits

# Backend function testing
curl -X POST https://your-app.base44.com/api/function-name \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"key": "value"}'
```

---

Document Version: 1.0  
Author: Base44 AI Assistant  
Phase: 8 of 8 (QA & Release Readiness)