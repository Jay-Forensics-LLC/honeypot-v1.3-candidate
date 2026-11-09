import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * CHECK SUBSCRIPTION LIMIT v2.0
 * Server-side entitlement enforcement
 * 
 * CRITICAL: All feature usage MUST check limits server-side
 * Never trust frontend checks alone
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { 
            limit_type, // 'scans', 'evidence_storage', 'devices'
            increment = false // Whether to increment usage counter
        } = await req.json();

        if (!limit_type) {
            return Response.json({ 
                error: 'limit_type required',
                valid_types: ['scans', 'evidence_storage', 'devices']
            }, { status: 400 });
        }

        // Get user's current tier
        const tier = user.subscription_tier || 'free';

        // Fetch plan limits from SubscriptionPlan entity (single source of truth)
        const plans = await base44.asServiceRole.entities.SubscriptionPlan.filter({ tier });
        
        if (!plans || plans.length === 0) {
            // Fallback to free tier if plan not found
            const freePlans = await base44.asServiceRole.entities.SubscriptionPlan.filter({ tier: 'free' });
            if (!freePlans || freePlans.length === 0) {
                throw new Error('No subscription plans configured');
            }
            plans[0] = freePlans[0];
        }

        const plan = plans[0];
        const limits = plan.limits || {};

        // Get current usage
        const usage = user.usage_metrics || {
            scans_count: 0,
            evidence_mb: 0,
            devices_enrolled: 0,
            last_reset: new Date().toISOString()
        };

        let allowed = true;
        let current = 0;
        let limit = 0;
        let remaining = 0;

        // Check specific limit type
        switch (limit_type) {
            case 'scans':
                limit = limits.max_scans_per_month;
                current = usage.scans_count || 0;
                
                // null or -1 means unlimited
                if (limit === null || limit === -1) {
                    allowed = true;
                    remaining = 999999;
                } else {
                    allowed = current < limit;
                    remaining = Math.max(0, limit - current);
                }

                // Increment if requested and allowed
                if (increment && allowed) {
                    await base44.asServiceRole.entities.User.update(user.id, {
                        'usage_metrics.scans_count': current + 1
                    });
                }
                break;

            case 'evidence_storage':
                limit = limits.max_evidence_mb;
                current = usage.evidence_mb || 0;
                
                if (limit === null || limit === -1) {
                    allowed = true;
                    remaining = 999999;
                } else {
                    allowed = current < limit;
                    remaining = Math.max(0, limit - current);
                }
                break;

            case 'devices':
                limit = limits.max_devices;
                current = usage.devices_enrolled || 0;
                
                if (limit === null || limit === -1) {
                    allowed = true;
                    remaining = 999999;
                } else {
                    allowed = current < limit;
                    remaining = Math.max(0, limit - current);
                }

                // Increment if requested and allowed
                if (increment && allowed) {
                    await base44.asServiceRole.entities.User.update(user.id, {
                        'usage_metrics.devices_enrolled': current + 1
                    });
                }
                break;

            default:
                return Response.json({ 
                    error: 'Invalid limit_type',
                    valid_types: ['scans', 'evidence_storage', 'devices']
                }, { status: 400 });
        }

        return Response.json({
            allowed,
            tier,
            limit_type,
            current,
            limit: limit === null || limit === -1 ? 'unlimited' : limit,
            remaining,
            plan_name: plan.name,
            incremented: increment && allowed
        });

    } catch (error) {
        console.error('Check subscription limit error:', error);
        return Response.json({ 
            error: 'Failed to check limit', 
            message: error.message 
        }, { status: 500 });
    }
});