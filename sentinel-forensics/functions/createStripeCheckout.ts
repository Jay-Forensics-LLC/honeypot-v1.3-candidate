import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import Stripe from 'npm:stripe@14.11.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tier, period, referralCode } = await req.json();

    // Define product prices
    const prices = {
      plus: { monthly: 19.99, annual: 199.99 },
      pro: { monthly: 49.99, annual: 499.99 },
      forensic_suite: { monthly: 99.99, annual: 999.99 }
    };

    if (!prices[tier]) {
      return Response.json({ error: 'Invalid tier' }, { status: 400 });
    }

    const amount = prices[tier][period];
    const isAnnual = period === 'annual';

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Sentinel ${tier.charAt(0).toUpperCase() + tier.slice(1).replace('_', ' ')}`,
              description: `${isAnnual ? 'Annual' : 'Monthly'} subscription`
            },
            unit_amount: Math.round(amount * 100),
            recurring: {
              interval: isAnnual ? 'year' : 'month'
            }
          },
          quantity: 1
        }
      ],
      success_url: `${req.headers.get('origin')}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get('origin')}/payment-cancelled`,
      customer_email: user.email,
      metadata: {
        user_id: user.id,
        user_email: user.email,
        tier,
        period,
        referral_code: referralCode || ''
      }
    });

    // Log checkout creation
    await base44.asServiceRole.entities.AnalyticsEvent.create({
      organization_id: user.organization_id,
      event_type: 'checkout_created',
      user_email: user.email,
      timestamp: new Date().toISOString(),
      metadata: {
        tier,
        period,
        session_id: session.id
      }
    });

    return Response.json({ url: session.url });

  } catch (error) {
    console.error('Stripe checkout error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});