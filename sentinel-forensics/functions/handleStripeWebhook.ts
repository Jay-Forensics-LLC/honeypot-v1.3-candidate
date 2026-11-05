import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import Stripe from 'npm:stripe@14.11.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

Deno.serve(async (req) => {
  try {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return Response.json({ error: 'No signature' }, { status: 400 });
    }

    // Verify webhook signature
    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return Response.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Initialize Base44 client with service role (webhooks don't have user context)
    const base44 = createClientFromRequest(req);

    console.log('Processing webhook event:', event.type);

    // SECURITY FIX: Check for replay attacks
    const existingWebhooks = await base44.asServiceRole.entities.ProcessedWebhook.filter({
      event_id: event.id
    }).catch(() => []);

    if (existingWebhooks && existingWebhooks.length > 0) {
      console.warn('Webhook replay detected:', event.id);
      return Response.json({ error: 'Event already processed' }, { status: 400 });
    }

    // Record this webhook as processed
    await base44.asServiceRole.entities.ProcessedWebhook.create({
      event_id: event.id,
      event_type: event.type,
      processed_at: new Date().toISOString(),
      customer_id: event.data.object.customer || 'unknown',
      status: 'processed'
    }).catch((err) => {
      console.error('Failed to record processed webhook:', err);
    });

    // PHASE 3: Audit log all webhook events
    await base44.asServiceRole.entities.SentinelAuditLog.create({
      organization_id: 'system',
      user_email: 'stripe_webhook',
      action: event.type,
      resource_type: 'subscription',
      resource_id: event.data.object.id,
      timestamp: new Date().toISOString(),
      hmac_signature: signature.substring(0, 50),
      verified: true,
      severity: 'info',
      details: {
        event_id: event.id,
        customer: event.data.object.customer,
        amount: event.data.object.amount_total || event.data.object.amount_paid
      }
    }).catch((err) => {
      console.warn('Failed to create audit log:', err);
    });

    // Process event based on type
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(base44, event.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(base44, event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(base44, event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(base44, event.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(base44, event.data.object);
        break;

      default:
        console.log('Unhandled event type:', event.type);
    }

    return Response.json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// Handle successful checkout
async function handleCheckoutCompleted(base44, session) {
const { customer_email, metadata } = session;
const { tier, period, referral_code } = metadata || {};

  // Find user by email
  const users = await base44.asServiceRole.entities.User.filter({ email: customer_email });
  
  if (!users || users.length === 0) {
    console.error('User not found:', customer_email);
    return;
  }

  const user = users[0];
  const subscriptionId = session.subscription;
  const customerId = session.customer;

  // Update user subscription
  await base44.asServiceRole.entities.User.update(user.id, {
    subscription_tier: tier,
    subscription_status: 'active',
    subscription_period: period,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    subscription_start_date: new Date().toISOString(),
    referred_by: referral_code || user.referred_by
  });

  // Process referral if exists
  if (referral_code) {
    await processReferral(base44, referral_code, user.email, tier);
  }

  // Send notification
  await base44.asServiceRole.entities.Notification.create({
    organization_id: user.organization_id,
    user_email: customer_email,
    type: 'case_status_changed',
    title: 'Subscription Activated',
    message: `Your ${tier.replace('_', ' ')} subscription is now active!`,
    severity: 'info'
  });

  // Log analytics
  await base44.asServiceRole.entities.AnalyticsEvent.create({
    organization_id: user.organization_id,
    event_type: 'subscription_activated',
    user_email: customer_email,
    timestamp: new Date().toISOString(),
    metadata: { tier, period, session_id: session.id }
  });

  console.log('Checkout completed for user, tier:', tier);
}

// Handle subscription updates
async function handleSubscriptionUpdated(base44, subscription) {
  const customerId = subscription.customer;
  
  // Find user by Stripe customer ID
  const users = await base44.asServiceRole.entities.User.filter({ 
    stripe_customer_id: customerId 
  });
  
  if (!users || users.length === 0) {
    console.error('User not found for customer:', customerId);
    return;
  }

  const user = users[0];
  const status = subscription.status;
  const endDate = new Date(subscription.current_period_end * 1000).toISOString();

  // Update subscription status
  await base44.asServiceRole.entities.User.update(user.id, {
    subscription_status: status,
    subscription_end_date: endDate
  });

  // Send notification if status changed
  if (status === 'past_due') {
    await base44.asServiceRole.entities.Notification.create({
      organization_id: user.organization_id,
      user_email: user.email,
      type: 'alert_critical',
      title: 'Payment Issue',
      message: 'Your subscription payment is past due. Please update your payment method.',
      severity: 'warning'
    });
  }

  console.log('Subscription updated, status:', status);
}

// Handle subscription cancellation
async function handleSubscriptionDeleted(base44, subscription) {
  const customerId = subscription.customer;
  
  const users = await base44.asServiceRole.entities.User.filter({ 
    stripe_customer_id: customerId 
  });
  
  if (!users || users.length === 0) {
    console.error('User not found for customer:', customerId);
    return;
  }

  const user = users[0];

  // Downgrade to free tier
  await base44.asServiceRole.entities.User.update(user.id, {
    subscription_tier: 'free',
    subscription_status: 'canceled',
    subscription_end_date: new Date().toISOString()
  });

  // Send notification
  await base44.asServiceRole.entities.Notification.create({
    organization_id: user.organization_id,
    user_email: user.email,
    type: 'case_status_changed',
    title: 'Subscription Canceled',
    message: 'Your subscription has been canceled. You now have access to the free tier.',
    severity: 'info'
  });

  console.log('Subscription canceled');
}

// Handle successful payment
async function handlePaymentSucceeded(base44, invoice) {
  const customerId = invoice.customer;
  
  const users = await base44.asServiceRole.entities.User.filter({ 
    stripe_customer_id: customerId 
  });
  
  if (!users || users.length === 0) return;

  const user = users[0];

  // Update subscription end date
  await base44.asServiceRole.entities.User.update(user.id, {
    subscription_status: 'active',
    subscription_end_date: new Date(invoice.period_end * 1000).toISOString()
  });

  // Log analytics
  await base44.asServiceRole.entities.AnalyticsEvent.create({
    organization_id: user.organization_id,
    event_type: 'payment_succeeded',
    user_email: user.email,
    timestamp: new Date().toISOString(),
    metadata: { 
      amount: invoice.amount_paid / 100,
      invoice_id: invoice.id
    }
  });

  console.log('Payment succeeded');
}

// Handle failed payment
async function handlePaymentFailed(base44, invoice) {
  const customerId = invoice.customer;
  
  const users = await base44.asServiceRole.entities.User.filter({ 
    stripe_customer_id: customerId 
  });
  
  if (!users || users.length === 0) return;

  const user = users[0];

  // Update status to past_due
  await base44.asServiceRole.entities.User.update(user.id, {
    subscription_status: 'past_due'
  });

  // Send critical notification
  await base44.asServiceRole.entities.Notification.create({
    organization_id: user.organization_id,
    user_email: user.email,
    type: 'alert_critical',
    title: 'Payment Failed',
    message: 'Your subscription payment failed. Please update your payment method to avoid service interruption.',
    severity: 'critical'
  });

  console.log('Payment failed');
}

// Process referral commission
async function processReferral(base44, referralCode, newUserEmail, tier) {
  try {
    const referrals = await base44.asServiceRole.entities.ReferralCode.filter({ 
      code: referralCode 
    });
    
    if (!referrals || referrals.length === 0) return;

    const referralRecord = referrals[0];

    // Create referral record
    await base44.asServiceRole.entities.Referral.create({
      organization_id: referralRecord.organization_id,
      referrer_email: referralRecord.created_by,
      referee_email: newUserEmail,
      referral_code: referralCode,
      conversion_date: new Date().toISOString(),
      subscription_tier: tier,
      status: 'active',
      commission_rate: 0.10
    });

    // Notify referrer
    await base44.asServiceRole.entities.Notification.create({
      organization_id: referralRecord.organization_id,
      user_email: referralRecord.created_by,
      type: 'case_status_changed',
      title: 'Referral Conversion!',
      message: `Someone subscribed using your referral code. You'll earn 10% recurring commission!`,
      severity: 'info'
    });

    console.log('Referral processed:', referralCode);
  } catch (error) {
    console.error('Referral processing error:', error);
  }
}