import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import Stripe from 'npm:stripe@17.5.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), {
  apiVersion: '2024-11-20.acacia'
});

/**
 * GET STRIPE CONNECT STATUS
 * 
 * Returns the current Stripe Connect account status for the user.
 * Used to check if payout setup is complete.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accountId = user.stripe_connect_account_id;

    if (!accountId) {
      return Response.json({
        connected: false,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false
      });
    }

    // Retrieve account from Stripe
    const account = await stripe.accounts.retrieve(accountId);

    return Response.json({
      connected: true,
      account_id: accountId,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      country: account.country,
      default_currency: account.default_currency,
      requirements: {
        currently_due: account.requirements?.currently_due || [],
        eventually_due: account.requirements?.eventually_due || [],
        past_due: account.requirements?.past_due || []
      }
    });

  } catch (error) {
    console.error('[GetConnectStatus] Error:', error);
    return Response.json({
      error: error.message || 'Failed to get connect status'
    }, { status: 500 });
  }
});