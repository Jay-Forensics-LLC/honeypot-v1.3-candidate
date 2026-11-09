import Stripe from 'npm:stripe@14.7.0';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

/**
 * CREATE CUSTOMER PORTAL SESSION
 * 
 * Generates a Stripe Customer Portal session URL for subscription management.
 * Allows users to:
 * - Cancel their subscription
 * - Change payment method
 * - View billing history
 * - Update payment information
 */
Deno.serve(async (req) => {
  try {
    // PHASE 8: Authenticate user
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    const { return_url } = body;

    if (!return_url) {
      return Response.json({ 
        error: 'return_url is required' 
      }, { status: 400 });
    }

    // Check if user has a Stripe customer ID
    if (!user.stripe_customer_id) {
      return Response.json({ 
        error: 'No subscription found. Please subscribe first.' 
      }, { status: 400 });
    }

    // Create Customer Portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: return_url
    });

    console.log('[CustomerPortal] Session created:', {
      user_email: user.email,
      customer_id: user.stripe_customer_id,
      session_id: session.id
    });

    return Response.json({
      url: session.url,
      session_id: session.id
    });

  } catch (error) {
    console.error('[CustomerPortal] Error:', error);
    
    return Response.json({
      error: 'Failed to create portal session',
      message: error.message
    }, { status: 500 });
  }
});