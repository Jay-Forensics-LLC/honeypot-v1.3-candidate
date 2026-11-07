
import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Get Threat Intelligence - Professional Tier Required
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

        // RBAC Check - Professional tier required
        const userTier = user.subscription_tier || 'free';
        const userTierLevel = TIER_HIERARCHY[userTier] || 0;
        const requiredTierLevel = TIER_HIERARCHY.professional;
        const isAdmin = user.role === 'admin';

        if (userTierLevel < requiredTierLevel && !isAdmin) {
            // Log access denial
            await base44.asServiceRole.entities.AuditLog.create({
                event_type: 'rbac_denied_tier',
                severity: 'info',
                description: 'User attempted to access Professional-tier threat intelligence',
                user_id: user.email,
                timestamp: new Date().toISOString(),
                success: false,
                metadata: {
                    user_tier: userTier,
                    required_tier: 'professional'
                }
            });

            return Response.json({
                error: 'Upgrade Required',
                message: 'This feature requires Professional subscription or higher',
                currentTier: userTier,
                requiredTier: 'professional'
            }, { status: 402 });
        }

        // Check subscription status
        if (user.subscription_status === 'expired' || user.subscription_status === 'cancelled') {
            return Response.json({
                error: 'Subscription Expired',
                message: 'Your subscription has expired. Please renew to continue.'
            }, { status: 402 });
        }

        // User has access - fetch threat intelligence using user-scoped client (RLS enforced)
        const { limit = 100 } = await req.json().catch(() => ({}));
        const threatIntel = await base44.entities.ThreatIntelligence.list('-timestamp', limit);

        // SECURITY FIX: Audit log with user-scoped client (RLS enforced)
        await base44.entities.AuditLog.create({
            event_type: 'threat_intel_accessed',
            severity: 'info',
            description: 'Threat intelligence data accessed',
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                records_returned: threatIntel.length,
                user_tier: userTier
            }
        });

        return Response.json({
            success: true,
            data: threatIntel,
            count: threatIntel.length
        });

    } catch (error) {
        console.error('Get threat intel error:', error);
        return Response.json({
            error: 'Failed to fetch threat intelligence',
            message: error.message
        }, { status: 500 });
    }
});
