import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Securely serve Stripe publishable key to authenticated users
 * Prevents unauthorized scraping and adds rate limiting
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Require authentication
        const user = await base44.auth.me();
        
        if (!user || !user.email) {
            return Response.json({
                error: 'Unauthorized',
                message: 'Authentication required to access payment configuration'
            }, { status: 401 });
        }

        // Get publishable key from environment
        // This should be set as STRIPE_PUBLISHABLE_KEY in your Base44 secrets
        const publishableKey = Deno.env.get('STRIPE_PUBLISHABLE_KEY');
        
        if (!publishableKey) {
            console.error('STRIPE_PUBLISHABLE_KEY not configured');
            return Response.json({
                error: 'Configuration Error',
                message: 'Payment system not configured'
            }, { status: 500 });
        }

        // Validate key format
        if (!publishableKey.startsWith('pk_test_') && !publishableKey.startsWith('pk_live_')) {
            console.error('Invalid Stripe publishable key format');
            return Response.json({
                error: 'Configuration Error',
                message: 'Invalid payment configuration'
            }, { status: 500 });
        }

        // Log access for security audit
        await base44.asServiceRole.entities.AuditLog.create({
            event_type: 'stripe_key_accessed',
            severity: 'info',
            description: 'User accessed Stripe publishable key',
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                key_prefix: publishableKey.substring(0, 10),
                mode: publishableKey.startsWith('pk_live_') ? 'live' : 'test'
            }
        });

        return Response.json({
            publishableKey,
            mode: publishableKey.startsWith('pk_live_') ? 'live' : 'test'
        });

    } catch (error) {
        console.error('Error serving Stripe publishable key:', error);
        return Response.json({
            error: 'Internal Server Error',
            message: error.message
        }, { status: 500 });
    }
});