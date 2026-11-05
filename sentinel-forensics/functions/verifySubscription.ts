import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import Stripe from 'npm:stripe@17.5.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), {
  apiVersion: '2024-11-20.acacia'
});

Deno.serve(async (req) => {
  try {
    // RBAC: Authenticate user
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { session_id } = await req.json();

    if (!session_id) {
      return Response.json({ error: 'session_id required' }, { status: 400 });
    }

    // Retrieve checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['subscription', 'customer']
    });

    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    // Verify session belongs to this user
    if (session.customer_email !== user.email && session.customer?.email !== user.email) {
      return Response.json({ error: 'Session does not belong to user' }, { status: 403 });
    }

    const subscription = session.subscription;
    
    // Update user record if not already updated
    const updates = {};
    let shouldUpdate = false;

    if (subscription && typeof subscription === 'object') {
      const targetTier = session.metadata?.tier || 'pro';
      const subscriptionStatus = subscription.status;
      const expiresAt = new Date(subscription.current_period_end * 1000).toISOString();

      if (user.subscription_tier !== targetTier) {
        updates.subscription_tier = targetTier;
        shouldUpdate = true;
      }
      if (user.subscription_status !== subscriptionStatus) {
        updates.subscription_status = subscriptionStatus;
        shouldUpdate = true;
      }
      if (user.subscription_expires !== expiresAt) {
        updates.subscription_expires = expiresAt;
        shouldUpdate = true;
      }
      if (!user.stripe_customer_id && session.customer) {
        updates.stripe_customer_id = typeof session.customer === 'string' 
          ? session.customer 
          : session.customer.id;
        shouldUpdate = true;
      }
    }

    // Update user if needed
    if (shouldUpdate) {
      await base44.asServiceRole.auth.updateMe(updates);
    }

    return Response.json({
      success: true,
      verified: true,
      subscription_tier: updates.subscription_tier || user.subscription_tier,
      subscription_status: updates.subscription_status || user.subscription_status,
      expires_at: updates.subscription_expires || user.subscription_expires,
      updated: shouldUpdate
    });

  } catch (error) {
    console.error('Subscription verification error:', error);
    return Response.json({
      success: false,
      error: error.message || 'Verification failed'
    }, { status: 500 });
  }
});