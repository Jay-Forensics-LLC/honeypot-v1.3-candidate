import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * GET SUBSCRIPTION PLANS API v1.0
 * Single source of truth for all subscription plans
 * 
 * Returns canonical plan definitions (free, plus, pro)
 * Used by frontend admin UI and entitlement checks
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Public endpoint - no auth required (plans are public info)
        // But we use service role to fetch all plans

        const plans = await base44.asServiceRole.entities.SubscriptionPlan.filter(
            { is_active: true },
            'tier',
            10
        );

        // Transform to canonical format
        const canonicalPlans = plans.map(plan => ({
            id: plan.plan_id,
            displayName: plan.name,
            slug: plan.tier,
            priceMonthly: plan.price_monthly,
            priceYearly: plan.price_annual,
            limits: {
                scansPerMonth: plan.limits?.max_scans_per_month === -1 ? null : plan.limits?.max_scans_per_month,
                evidenceStorageMB: plan.limits?.max_evidence_mb === -1 ? null : plan.limits?.max_evidence_mb,
                deviceLimit: plan.limits?.max_devices === -1 ? null : plan.limits?.max_devices
            },
            features: plan.features || [],
            stripe_price_id_monthly: plan.stripe_price_id_monthly,
            stripe_price_id_annual: plan.stripe_price_id_annual
        }));

        // Sort by tier: free, plus, pro
        const tierOrder = { free: 1, plus: 2, pro: 3 };
        canonicalPlans.sort((a, b) => tierOrder[a.slug] - tierOrder[b.slug]);

        return Response.json({
            success: true,
            plans: canonicalPlans,
            count: canonicalPlans.length
        });

    } catch (error) {
        console.error('Get subscription plans error:', error);
        return Response.json({ 
            error: 'Failed to fetch subscription plans', 
            message: error.message 
        }, { status: 500 });
    }
});