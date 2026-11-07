# Configuration Guide - Sentinel Forensics

## Environment Variables

All configuration is managed via environment variables in the Base44 dashboard (Settings → Environment Variables).

### Required for Core Features

#### 1. Twilio SMS MFA
Multi-factor authentication via SMS requires Twilio credentials:

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+15551234567
```

Get these from: https://console.twilio.com

**Usage:** `functions/sendMFACode.ts`, `functions/verifyMFA.ts`

#### 2. Stripe Payments
Subscription billing requires Stripe API keys:

```bash
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

Get these from: https://dashboard.stripe.com/apikeys

**Usage:** `functions/handleStripeWebhook.ts`, `functions/createStripeCheckout.ts`

---

## Security Settings

### Upload Size Limits

**Default:** 100MB per file

**Location to modify:**
- `functions/uploadEvidenceFile.ts` - Line 6: `MAX_UPLOAD_SIZE_BYTES`
- `functions/secureEvidenceUpload.ts` - Line 5: `MAX_UPLOAD_SIZE_BYTES`

**Example:**
```typescript
const MAX_UPLOAD_SIZE_BYTES = 500 * 1024 * 1024; // 500MB
```

**Impact:** Larger limits increase storage costs and DoS risk. Smaller limits may block legitimate forensic images.

---

### Rate Limiting

**Default Limits:**
- Login attempts: 10 per 10 minutes (per IP + email)
- Evidence uploads: 50 per minute (per user)
- API calls: Various limits per endpoint

**Configuration:**
Rate limits are embedded in function code. To modify:

1. **Login validation:** `functions/validateLogin.ts` - Lines 46-51
   ```typescript
   const rateCheck = await checkRateLimit(base44, {
       scope: 'login_validation',
       maxAttempts: 10,
       windowMinutes: 10,
       identifier: rateLimitKey
   });
   ```

2. **Evidence uploads:** `functions/secureEvidenceUpload.ts` - Line 161
   ```typescript
   }, { limit: 50, windowMs: 60000 }); // 50 uploads per minute
   ```

**Behavior:**
- Returns HTTP 429 "Too Many Requests" when exceeded
- Tracked in `RateLimitTracker` entity
- Resets after time window expires

---

## Optional Integrations

### Threat Intelligence APIs
Enhance detection with external threat feeds:

```bash
VIRUSTOTAL_API_KEY=your_key
URLSCAN_API_KEY=your_key
ABUSEIPDB_API_KEY=your_key
ALIENVAULT_OTX_API_KEY=your_key
HIBP_API_KEY=your_key
SHODAN_API_KEY=your_key
CENYS_API_ID=your_id
CENYS_API_SECRET=your_secret
```

**Usage:** `functions/virusTotal.ts`, `functions/urlscan.ts`, etc.

### AI Analysis
Enable AI-powered case analysis:

```bash
ANTHROPIC_API_KEY=your_key
OPEN_API_KEY=your_key
```

**Usage:** `functions/aiCaseAnalysis.ts`, `functions/aiThreatDetector.ts`

---

## Security Tokens

### System Tokens (generate with openssl)

```bash
# Evidence signing key (64 chars hex)
openssl rand -hex 32
SERVER_SIGNING_KEY=generated_output

# Internal job secret for scheduled tasks
openssl rand -hex 32
SYSTEM_WORKER_TOKEN=generated_output

# Agent authentication token
openssl rand -hex 32
AGENT_SECRET_TOKEN=generated_output
```

**Critical:** Never commit these to version control. Rotate regularly.

---

## Frontend Configuration

VITE environment variables are exposed to the browser. They are set by Base44 platform automatically:

- `VITE_API_URL` - Base44 API endpoint
- `VITE_APP_NAME` - Application name
- `VITE_ENVIRONMENT` - Deployment environment (production/staging/dev)

**Do not store secrets in VITE_* variables** - they are visible in browser DevTools.

---

## Deployment Checklist

Before deploying to production:

1. ✅ Set all required environment variables in Base44 dashboard
2. ✅ Generate secure random values for `SERVER_SIGNING_KEY`, `SYSTEM_WORKER_TOKEN`, `AGENT_SECRET_TOKEN`
3. ✅ Set up Twilio account and verify phone number works
4. ✅ Configure Stripe webhook endpoint and verify signature validation
5. ✅ Test MFA flow end-to-end
6. ✅ Verify rate limiting works (attempt > 10 logins)
7. ✅ Test evidence upload with 100MB+ file (should reject)
8. ✅ Review audit logs are being created

---

## Troubleshooting

**MFA codes not sending:**
- Verify `TWILIO_FROM_NUMBER` is verified in Twilio console
- Check Twilio account balance
- Review Twilio logs: https://console.twilio.com/logs

**Evidence uploads failing:**
- Check file size < 100MB
- Verify user has case access (owner/investigator/team member)
- Review `AuditLog` or `SentinelAuditLog` entity for rejection reasons

**Rate limiting too aggressive:**
- Modify limits in respective function files
- Consider per-org vs per-user limits based on use case

**Webhook failures:**
- Verify `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard
- Check webhook endpoint is publicly accessible
- Review `functions/handleStripeWebhook.ts` logs

---

## Security Best Practices

1. **Never commit secrets** - Use Base44 dashboard for all sensitive values
2. **Rotate tokens quarterly** - Especially `SERVER_SIGNING_KEY` and `AGENT_SECRET_TOKEN`
3. **Monitor rate limit logs** - Excessive 429 errors may indicate attacks
4. **Review audit logs weekly** - Check for suspicious patterns
5. **Test MFA enforcement** - Ensure all admin accounts require MFA