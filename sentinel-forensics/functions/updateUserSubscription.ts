import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * UPDATE USER SUBSCRIPTION (ADMIN ONLY) v1.0
 * Allows admins to manually assign subscription tiers
 * 
 * Use cases:
 * - Beta tester assignments
 * - Manual upgrades/downgrades
 * - Refunds/credits
 * - Override billing issues
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { 
            user_email,
            subscription_tier,
            reason
        } = await req.json();

        if (!user_email || !subscription_tier) {
            return Response.json({ 
                error: 'user_email and subscription_tier required',
                example: {
                    user_email: 'beta@example.com',
                    subscription_tier: 'plus',
                    reason: 'Beta tester assignment'
                }
            }, { status: 400 });
        }

        // Validate tier exists
        const validTiers = ['free', 'plus', 'pro'];
        if (!validTiers.includes(subscription_tier)) {
            return Response.json({ 
                error: `Invalid tier. Must be one of: ${validTiers.join(', ')}`
            }, { status: 400 });
        }

        // Fetch target user (admin can access any user)
        const targetUsers = await base44.asServiceRole.entities.User.filter({ email: user_email });
        
        if (!targetUsers || targetUsers.length === 0) {
            return Response.json({ 
                error: 'User not found',
                user_email 
            }, { status: 404 });
        }

        const targetUser = targetUsers[0];

        // Update user subscription
        await base44.asServiceRole.entities.User.update(targetUser.id, {
            subscription_tier,
            subscription_status: 'active',
            subscription_start_date: new Date().toISOString(),
            usage_metrics: {
                scans_count: 0,
                evidence_mb: 0,
                devices_enrolled: targetUser.usage_metrics?.devices_enrolled || 0,
                last_reset: new Date().toISOString()
            }
        });

        // Create audit log
        await base44.entities.AuditLog.create({
            event_type: 'subscription_tier_updated',
            severity: 'info',
            description: `Admin ${user.email} updated ${user_email} to ${subscription_tier} tier`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                target_user: user_email,
                new_tier: subscription_tier,
                previous_tier: targetUser.subscription_tier || 'free',
                reason: reason || 'Manual admin assignment',
                admin: user.email
            }
        });

        // Create analytics event
        await base44.entities.AnalyticsEvent.create({
            event_type: 'upgrade_clicked',
            user_email,
            metadata: {
                from_tier: targetUser.subscription_tier || 'free',
                to_tier: subscription_tier,
                method: 'admin_override',
                admin: user.email
            },
            timestamp: new Date().toISOString()
        });

        return Response.json({
            success: true,
            user_email,
            previous_tier: targetUser.subscription_tier || 'free',
            new_tier: subscription_tier,
            updated_at: new Date().toISOString()
        });

    } catch (error) {
        console.error('Update user subscription error:', error);
        return Response.json({ 
            error: 'Failed to update subscription', 
            message: error.message 
        }, { status: 500 });
    }
});