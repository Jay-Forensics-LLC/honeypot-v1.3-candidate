
import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Get Correlation Analysis - Enterprise Tier Required
 * Includes inline RBAC enforcement
 */

const TIER_HIERARCHY = {
  free: 0,
  professional: 1,
  enterprise: 2,
  forensic_suite: 3
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Get authenticated user
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({
                error: 'Unauthorized',
                message: 'Authentication required'
            }, { status: 401 });
        }

        // RBAC Check - Enterprise tier required
        const userTier = user.subscription_tier || 'free';
        const userTierLevel = TIER_HIERARCHY[userTier] || 0;
        const requiredTierLevel = TIER_HIERARCHY.enterprise;
        const isAdmin = user.role === 'admin';

        if (userTierLevel < requiredTierLevel && !isAdmin) {
            await base44.asServiceRole.entities.AuditLog.create({
                event_type: 'rbac_denied_tier',
                severity: 'info',
                description: 'User attempted to access Enterprise-tier correlation engine',
                user_id: user.email,
                timestamp: new Date().toISOString(),
                success: false,
                metadata: {
                    user_tier: userTier,
                    required_tier: 'enterprise'
                }
            });

            return Response.json({
                error: 'Upgrade Required',
                message: 'This feature requires Enterprise subscription or higher',
                currentTier: userTier,
                requiredTier: 'enterprise'
            }, { status: 402 });
        }

        // Check subscription status
        if (user.subscription_status === 'expired' || user.subscription_status === 'cancelled') {
            return Response.json({
                error: 'Subscription Expired',
                message: 'Your subscription has expired. Please renew to continue.'
            }, { status: 402 });
        }

        // User has access - fetch correlation graphs
        const { limit = 50 } = await req.json().catch(() => ({}));
        const correlations = await base44.entities.CorrelationGraph.list('-created_at', limit);

        // SECURITY FIX: Audit log with user-scoped client (RLS enforced)
        await base44.entities.AuditLog.create({
            event_type: 'correlation_data_accessed',
            severity: 'info',
            description: 'Correlation engine data accessed',
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                records_returned: correlations.length,
                user_tier: userTier
            }
        });

        return Response.json({
            success: true,
            data: correlations,
            count: correlations.length
        });

    } catch (error) {
        console.error('Get correlations error:', error);
        return Response.json({
            error: 'Failed to fetch correlation data',
            message: error.message
        }, { status: 500 });
    }
});
