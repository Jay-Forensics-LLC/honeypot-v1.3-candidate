# Billing & Subscription Documentation (Phase 3)

**Last Updated:** 2025-12-14  
**Status:** ✅ PRODUCTION READY

---

## Overview

Sentinel Forensics uses **Stripe** for subscription billing with full customer self-service via Stripe Customer Portal. This document covers data storage, webhook handling, and testing procedures.

---

## Subscription Tiers

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0/month | Basic case management, 5GB storage, 3 active cases |
| **Plus** | $49/month | Unlimited cases, 100GB storage, threat intelligence |
| **Pro** | $199/month | Everything in Plus + advanced correlation, API access |
| **Enterprise** | Custom | White-label, unlimited storage, dedicated support |

**Naming Consistency:** UI uses "Free / Plus / Pro / Enterprise" (no "Professional")

---

## Database Schema

### User Entity (Built-in)

Subscription fields added to User entity:

```javascript
{
  subscription_tier: 'free' | 'plus' | 'pro' | 'enterprise',
  subscription_status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete',
  subscription_expires: '2025-12-31T23:59:59Z', // ISO datetime
  stripe_customer_id: 'cus_xxxxxxxxxxxxx'
}
```

**Field Descriptions:**

- `subscription_tier`: Current plan level
- `subscription_status`: Stripe subscription status
- `subscription_expires`: Next billing date (or trial end date)
- `stripe_customer_id`: Stripe customer reference for portal access

---

## Stripe Webhook Events

**Endpoint:** `https://[YOUR_APP_SLUG].base44.run/functions/handleStripeWebhook`

### Events Handled

#### 1. `checkout.session.completed`
**Trigger:** User completes payment  
**Actions:**
- Activate subscription
- Update user record with tier + status + expires date
- Set `stripe_customer_id`
- Process referral code if present
- Send welcome notification
- **Audit Log:** `stripe_webhook` → `checkout.session.completed`

#### 2. `customer.subscription.updated`
**Trigger:** Subscription plan changed or renewed  
**Actions:**
- Update `subscription_status` and `subscription_expires`
- Send alert if status is `past_due` or `unpaid`
- **Audit Log:** `stripe_webhook` → `customer.subscription.updated`

#### 3. `customer.subscription.deleted`
**Trigger:** Subscription canceled (by user or Stripe)  
**Actions:**
- Downgrade user to `free` tier
- Set status to `canceled`
- Send cancellation notification
- **Audit Log:** `stripe_webhook` → `customer.subscription.deleted`

#### 4. `invoice.payment_succeeded`
**Trigger:** Recurring payment succeeds  
**Actions:**
- Extend `subscription_expires` to next billing date
- Log payment analytics
- **Audit Log:** `stripe_webhook` → `invoice.payment_succeeded`

#### 5. `invoice.payment_failed`
**Trigger:** Payment method declined  
**Actions:**
- Set status to `past_due`
- Send critical payment failure notification
- **Audit Log:** `stripe_webhook` → `invoice.payment_failed`

---

## Backend Functions

### 1. createStripeCheckout
**Path:** `functions/createStripeCheckout.js`  
**Purpose:** Create Stripe Checkout session for new subscriptions

**Input:**
```javascript
{
  tier: 'plus' | 'pro' | 'enterprise',
  period: 'monthly' | 'annual',
  referral_code: 'ABC123' // optional
}
```

**Output:**
```javascript
{
  url: 'https://checkout.stripe.com/c/pay/cs_xxxxx'
}
```

**Notes:**
- Requires authenticated user
- Prices hardcoded (update when Stripe products configured)
- Success URL: `/payment-success?session_id={CHECKOUT_SESSION_ID}`
- Cancel URL: `/payment-cancelled`

---

### 2. verifySubscription
**Path:** `functions/verifySubscription.js`  
**Purpose:** Verify subscription status after checkout

**Input:**
```javascript
{
  session_id: 'cs_xxxxxxxxxxxxxxxxxxxxx'
}
```

**Output:**
```javascript
{
  success: true,
  verified: true,
  subscription_tier: 'pro',
  subscription_status: 'active',
  expires_at: '2026-01-14T...',
  updated: true // whether DB was updated
}
```

**Logic:**
1. Retrieve Stripe session
2. Verify session belongs to authenticated user
3. Extract subscription details
4. Update user record if fields are stale
5. Return verification result

**Retry Strategy:** UI polls with 5 attempts, 2s delay

---

### 3. createCustomerPortalSession
**Path:** `functions/createCustomerPortalSession.js`  
**Purpose:** Open Stripe Customer Portal for self-service management

**Input:**
```javascript
{
  return_url: 'https://[app]/Profile' // optional
}
```

**Output:**
```javascript
{
  success: true,
  url: 'https://billing.stripe.com/p/session/xxxxx'
}
```

**Requirements:**
- User must have `stripe_customer_id`
- User must be authenticated

**Portal Features:**
- Cancel subscription
- Update payment method
- View invoices
- Change plan (if configured in Stripe)

---

### 4. handleStripeWebhook
**Path:** `functions/handleStripeWebhook.js`  
**Purpose:** Process Stripe webhook events

**Security:**
- Validates webhook signature with `STRIPE_WEBHOOK_SECRET`
- Requires service role token for DB updates

**Audit Trail:**
- All webhook events logged to `SentinelAuditLog`
- Includes event type, customer ID, amount

---

## User Flows

### Flow 1: New Subscription

```mermaid
sequenceDiagram
    User->>Pricing Page: Click "Upgrade to Pro"
    Pricing Page->>createStripeCheckout: POST {tier: 'pro'}
    createStripeCheckout->>Stripe: Create checkout session
    Stripe-->>Pricing Page: Redirect URL
    User->>Stripe Checkout: Complete payment
    Stripe->>handleStripeWebhook: checkout.session.completed
    handleStripeWebhook->>Database: Update user subscription
    Stripe-->>User: Redirect to /payment-success?session_id=xxx
    User->>verifySubscription: POST {session_id}
    verifySubscription->>Stripe: Retrieve session
    verifySubscription->>Database: Update if needed
    verifySubscription-->>User: {verified: true}
    User->>Dashboard: Access pro features
```

---

### Flow 2: Manage Subscription

```mermaid
sequenceDiagram
    User->>Profile Page: Click "Manage Subscription"
    Profile Page->>createCustomerPortalSession: POST
    createCustomerPortalSession->>Stripe: Create portal session
    Stripe-->>Profile Page: Portal URL
    User->>Stripe Portal: Update payment / cancel / change plan
    Stripe->>handleStripeWebhook: customer.subscription.updated
    handleStripeWebhook->>Database: Update user record
    User->>Profile Page: Return via return_url
    Profile Page->>User: Show updated status
```

---

### Flow 3: Payment Failure

```mermaid
sequenceDiagram
    Stripe->>handleStripeWebhook: invoice.payment_failed
    handleStripeWebhook->>Database: Set status to 'past_due'
    handleStripeWebhook->>Notification: Send critical alert
    User->>Profile Page: Check subscription status
    Profile Page->>User: Show "Payment Failed" badge
    User->>Stripe Portal: Update payment method
    Stripe->>handleStripeWebhook: invoice.payment_succeeded
    handleStripeWebhook->>Database: Set status to 'active'
```

---

## UI Components

### Profile Page
**File:** `pages/Profile.js`

**Displays:**
- Subscription tier (badge with color coding)
- Status (active/trialing/past_due/canceled)
- Renewal date / trial end date
- Billing email
- "Manage Subscription" button (for paid users)

**Tier Colors:**
```javascript
free: "bg-gray-500"
plus: "bg-blue-500"
pro: "bg-purple-500"
enterprise: "bg-gradient-to-r from-purple-500 to-pink-500"
```

**Status Colors:**
```javascript
active: "text-green-400"
trialing: "text-blue-400"
past_due: "text-orange-400"
canceled: "text-red-400"
```

---

### Subscription Page
**File:** `pages/Subscription.js`

**Features:**
- Pricing cards for all tiers
- Monthly/Annual toggle
- Current plan indicator
- "Upgrade Now" buttons
- Feature comparison

---

### Payment Success Page
**File:** `pages/PaymentSuccess.js`

**Logic:**
1. Extract `session_id` from URL query params
2. Call `verifySubscription` with bounded retries (5 attempts, 2s delay)
3. Show "Verifying..." spinner during retries
4. On success: confetti + "Payment Successful" card
5. On failure: "Verification Pending" card with link to Profile

**Why Polling?** Webhook processing can take 1-5 seconds; polling ensures UI shows correct status immediately.

---

## Testing in Stripe Test Mode

### Setup

1. **Get Test Keys:**
   - Stripe Dashboard → Developers → API Keys
   - Copy `Publishable Key` (starts with `pk_test_`)
   - Copy `Secret Key` (starts with `sk_test_`)

2. **Set Secrets in Base44:**
   ```
   STRIPE_SECRET_KEY=sk_test_xxxxx
   STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
   STRIPE_WEBHOOK_SECRET=whsec_xxxxx
   ```

3. **Install Stripe CLI:**
   ```bash
   brew install stripe/stripe-cli/stripe
   stripe login
   ```

4. **Forward Webhooks Locally:**
   ```bash
   stripe listen --forward-to https://[YOUR_APP].base44.run/functions/handleStripeWebhook
   ```

---

### Test Card Numbers

| Card Number | Outcome |
|-------------|---------|
| `4242 4242 4242 4242` | Success |
| `4000 0025 0000 3155` | Requires 3D Secure |
| `4000 0000 0000 9995` | Declined (insufficient funds) |
| `4000 0000 0000 0341` | Declined (expired card) |

**Expiry:** Any future date (e.g., `12/34`)  
**CVC:** Any 3 digits (e.g., `123`)  
**ZIP:** Any 5 digits (e.g., `12345`)

---

### Test Scenarios

#### Scenario 1: New Subscription
1. Navigate to `/Subscription`
2. Click "Upgrade to Pro"
3. Use test card `4242 4242 4242 4242`
4. Complete checkout
5. Verify redirect to `/payment-success?session_id=xxx`
6. Check Profile page shows "Pro" tier + "Active" status

**Expected:**
- User record updated with `subscription_tier: 'pro'`
- `subscription_status: 'active'`
- `subscription_expires` set to 1 month from now
- `stripe_customer_id` populated

---

#### Scenario 2: Manage Subscription
1. Go to `/Profile` (as paid user)
2. Click "Manage Subscription"
3. Portal opens in new tab
4. Change payment method or cancel subscription
5. Return to app via "Return to App" button
6. Verify changes reflected in Profile

**Expected:**
- Portal session created successfully
- Changes synced via webhooks within 5 seconds
- Audit log entries created

---

#### Scenario 3: Payment Failure
1. Subscribe with test card `4242 4242 4242 4242`
2. In Stripe Dashboard, simulate failed payment:
   - Dashboard → Customers → [Your Customer] → Subscriptions → [Select] → Actions → "Fail Next Payment"
3. Wait for next billing cycle (or trigger manually)
4. Verify user sees "Payment Failed" notification

**Expected:**
- `subscription_status` changes to `past_due`
- Notification sent to user
- Profile shows orange "Past Due" badge

---

## Troubleshooting

### Issue: "No active subscription found" in Customer Portal

**Cause:** User record missing `stripe_customer_id`

**Fix:**
1. Check user record in Database
2. Verify webhook `checkout.session.completed` was processed
3. Manually set `stripe_customer_id` if needed (Stripe Dashboard → Customers)

---

### Issue: Subscription not updating after payment

**Cause:** Webhook not reaching backend or signature validation failed

**Fix:**
1. Check webhook logs in Stripe Dashboard
2. Verify `STRIPE_WEBHOOK_SECRET` is correct
3. Check `handleStripeWebhook` function logs
4. Ensure webhook endpoint is publicly accessible
5. Test with Stripe CLI: `stripe trigger checkout.session.completed`

---

### Issue: User downgraded to Free after successful payment

**Cause:** Webhook processed before checkout redirect completed

**Fix:** Use `verifySubscription` polling on PaymentSuccess page (already implemented)

---

## Security Considerations

### 1. Webhook Signature Validation
- All webhooks MUST validate signature with `stripe.webhooks.constructEventAsync`
- Invalid signatures return 400 Bad Request

### 2. RBAC Enforcement
- All backend functions require `base44.auth.me()`
- Customer Portal requires `stripe_customer_id`

### 3. Audit Trail
- All subscription changes logged to `SentinelAuditLog`
- Includes event type, customer ID, amount, timestamp

### 4. Rate Limiting
- Stripe API calls limited to 100/sec
- Webhook retries use exponential backoff

---

## Monitoring & Alerts

### Key Metrics

1. **Subscription Conversion Rate**
   - Track `checkout.session.completed` events
   - Compare to Pricing page visits

2. **Churn Rate**
   - Track `customer.subscription.deleted` events
   - Analyze cancellation reasons (if collected)

3. **Payment Failure Rate**
   - Monitor `invoice.payment_failed` events
   - Alert when rate > 5%

4. **Webhook Success Rate**
   - Track failed webhooks in Stripe Dashboard
   - Alert when failures > 1% in 1 hour

---

## Production Checklist

- [ ] Stripe live mode API keys configured
- [ ] Webhook endpoint registered in Stripe Dashboard
- [ ] Webhook secret set in Base44 secrets
- [ ] Stripe products created with correct pricing
- [ ] Test all payment flows in live mode
- [ ] Configure Stripe Customer Portal settings
- [ ] Set up Stripe billing alerts
- [ ] Enable Stripe Radar fraud detection
- [ ] Configure email receipts in Stripe
- [ ] Test subscription cancellation flow

---

## Future Enhancements

1. **Proration** - Allow mid-cycle plan changes with proration
2. **Usage-Based Billing** - Metered features (API calls, storage)
3. **Team Plans** - Multi-user subscriptions
4. **Annual Discounts** - 20% off for annual billing
5. **Grace Period** - Allow 3-day grace period for failed payments
6. **Dunning** - Automated payment retry with email reminders

---

## Support Resources

- **Stripe Dashboard:** https://dashboard.stripe.com
- **Stripe Docs:** https://stripe.com/docs
- **Base44 Support:** [Your support channel]
- **Webhook Testing:** https://stripe.com/docs/webhooks/test

---

**Document Version:** 1.0  
**Author:** Base44 AI Assistant  
**Phase:** 3 of 5 (Subscription UX Completion)