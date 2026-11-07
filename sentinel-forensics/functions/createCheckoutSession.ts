import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import Stripe from 'npm:stripe@17.5.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
    apiVersion: '2024-11-20.acacia'
});

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { priceId, tier, period, referralCode } = await req.json();

        if (!tier) {
            return Response.json({ 
                error: 'Missing required field: tier'
            }, { status: 400 });
        }

        // Map tier to Stripe price IDs (to be replaced with actual Stripe price IDs)
        const stripePriceMapping = {
            analyst: {
                monthly: 'price_analyst_monthly', // Replace with actual Stripe price ID
                annual: 'price_analyst_annual'
            },
            professional: {
                monthly: 'price_professional_monthly',
                annual: 'price_professional_annual'
            },
            enterprise: {
                monthly: 'price_enterprise_monthly',
                annual: 'price_enterprise_annual'
            }
        };

        const billingPeriod = period || 'monthly';
        const stripePriceId = priceId || stripePriceMapping[tier]?.[billingPeriod];

        if (!stripePriceId) {
            return Response.json({ 
                error: 'Invalid tier or price ID not configured'
            }, { status: 400 });
        }

        // Create or get Stripe customer
        let customerId = user.stripe_customer_id;
        
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                name: user.full_name,
                metadata: {
                    base44_user_id: user.id
                }
            });
            customerId = customer.id;
            
            await base44.auth.updateMe({ stripe_customer_id: customerId });
        }

        const origin = req.headers.get('origin') || 'https://app.base44.com';

        // Create checkout session
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [
                {
                    price: stripePriceId,
                    quantity: 1
                }
            ],
            allow_promotion_codes: true,
            success_url: `${origin}/SubscriptionSuccess?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/Subscription`,
            metadata: {
                user_id: user.email,
                tier: tier,
                price_id: stripePriceId,
                billing_period: billingPeriod,
                referral_code: referralCode || ''
            },
            subscription_data: {
                metadata: {
                    tier: tier,
                    billing_period: billingPeriod,
                    user_email: user.email
                }
            }
        });

        // Log checkout initiation
        await base44.asServiceRole.entities.AuditLog.create({
            event_type: 'subscription_checkout_initiated',
            severity: 'info',
            description: `User initiated ${tier} subscription checkout`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                session_id: session.id,
                tier,
                price_id: stripePriceId,
                billing_period: billingPeriod
            }
        });

        return Response.json({
            sessionId: session.id,
            url: session.url
        });

    } catch (error) {
        console.error('Checkout session creation error:', error);
        return Response.json({
            error: 'Failed to create checkout session',
            message: error.message
        }, { status: 500 });
    }
});