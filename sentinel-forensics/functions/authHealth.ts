import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Auth Health Check - Admin-only endpoint
 * Reports authentication provider status, configuration, and recent login errors
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check admin role
        if (user.role !== 'admin') {
            return Response.json({ 
                error: 'Forbidden - Admin access required' 
            }, { status: 403 });
        }

        const health = {
            timestamp: new Date().toISOString(),
            checked_by: user.email,
            providers: {},
            environment: {
                app_id: Deno.env.get('BASE44_APP_ID'),
                deployment: Deno.env.get('DENO_DEPLOYMENT_ID') ? 'production' : 'development'
            },
            session_config: {
                secure: true,
                httpOnly: true,
                sameSite: 'strict'
            },
            recommendations: []
        };

        // Check Google OAuth
        const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID');
        const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
        const isGoogleConfigured = !!(googleClientId && googleClientSecret);
        
        health.providers.google = {
            configured: isGoogleConfigured,
            client_id_present: !!googleClientId,
            client_secret_present: !!googleClientSecret,
            redirect_uri_expected: `${req.headers.get('origin')}/api/auth/callback/google`,
            status: isGoogleConfigured ? 'configured' : 'not_configured'
        };

        if (!isGoogleConfigured) {
            health.recommendations.push({
                severity: 'high',
                message: 'Google OAuth not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.',
                action: 'Configure Google OAuth in Base44 dashboard settings'
            });
        }

        // Check email/password auth (Base44 built-in)
        health.providers.email_password = {
            configured: true,
            status: 'active',
            provider: 'base44_native'
        };

        // Check recent login failures from audit logs
        try {
            const recentLogs = await base44.asServiceRole.entities.AuditLog.filter({
                event_type: 'login_failed'
            }, '-timestamp', 10);

            health.recent_failures = {
                count: recentLogs.length,
                last_24h: recentLogs.filter(log => {
                    const logTime = new Date(log.timestamp).getTime();
                    const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
                    return logTime > dayAgo;
                }).length,
                recent_errors: recentLogs.slice(0, 5).map(log => ({
                    timestamp: log.timestamp,
                    user: log.user_id,
                    error: log.metadata?.error_message || 'Unknown error'
                }))
            };

            if (health.recent_failures.last_24h > 10) {
                health.recommendations.push({
                    severity: 'medium',
                    message: `${health.recent_failures.last_24h} login failures in last 24 hours`,
                    action: 'Review login error patterns and user feedback'
                });
            }
        } catch (error) {
            health.recent_failures = {
                error: 'Failed to fetch login failure logs'
            };
        }

        // Overall health status
        const criticalIssues = health.recommendations.filter(r => r.severity === 'high').length;
        health.overall_status = criticalIssues === 0 ? 'healthy' : 'needs_attention';

        // Log health check
        await base44.entities.AuditLog.create({
            event_type: 'auth_health_check',
            severity: 'info',
            description: 'Authentication health check performed',
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                status: health.overall_status,
                recommendations_count: health.recommendations.length
            }
        });

        return Response.json(health);

    } catch (error) {
        console.error('Auth health check error:', error);
        return Response.json({ 
            error: 'Health check failed', 
            message: error.message 
        }, { status: 500 });
    }
});