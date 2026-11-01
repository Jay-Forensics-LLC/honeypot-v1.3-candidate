import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import Stripe from 'npm:stripe@14.10.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
    apiVersion: '2023-10-16'
});

/**
 * Cancels user's subscription
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!user.stripe_subscription_id) {
            return Response.json({ error: 'No active subscription found' }, { status: 400 });
        }

        // Cancel subscription at period end
        const subscription = await stripe.subscriptions.update(
            user.stripe_subscription_id,
            { cancel_at_period_end: true }
        );

        // Update user status
        await base44.auth.updateMe({
            subscription_status: 'cancelled',
        });

        // Log cancellation
        await base44.entities.AuditLog.create({
            event_type: 'subscription_cancelled',
            severity: 'info',
            description: 'User cancelled subscription',
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                subscription_id: subscription.id,
                cancel_at: new Date(subscription.cancel_at * 1000).toISOString()
            }
        });

        return Response.json({
            success: true,
            message: 'Subscription will cancel at period end',
            cancel_at: new Date(subscription.cancel_at * 1000).toISOString()
        });

    } catch (error) {
        console.error('Subscription cancellation error:', error);
        return Response.json({
            error: 'Failed to cancel subscription',
            message: error.message
        }, { status: 500 });
    }
});