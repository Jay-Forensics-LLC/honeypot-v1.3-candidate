import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Server-side Censys proxy with RBAC, rate-limiting, and audit logging
 */

const rateLimits = new Map();

function checkRateLimit(userId, tier, action) {
    const key = `${userId}:${action}`;
    const now = Date.now();
    const windowMs = 60000;
    
    const limits = {
        free: 0,
        professional: 100,
        enterprise: 5000
    };
    
    const limit = limits[tier] || 0;
    
    if (limit === 0) {
        return { allowed: false, reason: 'Upgrade required' };
    }
    
    if (!rateLimits.has(key)) {
        rateLimits.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: limit - 1 };
    }
    
    const record = rateLimits.get(key);
    
    if (now > record.resetAt) {
        rateLimits.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: limit - 1 };
    }
    
    if (record.count >= limit) {
        return { allowed: false, reason: 'Rate limit exceeded', resetAt: record.resetAt };
    }
    
    record.count++;
    return { allowed: true, remaining: limit - record.count };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const tier = user.subscription_tier || 'free';
        if (tier === 'free') {
            return Response.json({ 
                error: 'Feature requires Pro or Enterprise subscription',
                upgrade_url: '/subscription'
            }, { status: 403 });
        }

        const { action, query, ip } = await req.json();

        if (!action) {
            return Response.json({ error: 'action is required' }, { status: 400 });
        }

        const rateCheck = checkRateLimit(user.id, tier, 'censys');
        if (!rateCheck.allowed) {
            await base44.entities.AuditLog.create({
                event_type: 'censys_rate_limit',
                severity: 'warning',
                description: 'Censys rate limit exceeded',
                user_id: user.email,
                timestamp: new Date().toISOString(),
                success: false,
                metadata: { reason: rateCheck.reason }
            });

            return Response.json({ 
                error: rateCheck.reason,
                resetAt: rateCheck.resetAt ? new Date(rateCheck.resetAt).toISOString() : undefined
            }, { status: 429 });
        }

        const apiId = Deno.env.get('CENSYS_API_ID');
        const apiSecret = Deno.env.get('CENSYS_API_SECRET');
        
        if (!apiId || !apiSecret) {
            return Response.json({ 
                error: 'Censys integration not configured'
            }, { status: 500 });
        }

        const auth = btoa(`${apiId}:${apiSecret}`);

        let endpoint = '';
        let identifier = '';
        const method = 'GET';

        if (action === 'search_hosts') {
            if (!query) {
                return Response.json({ error: 'query required' }, { status: 400 });
            }
            endpoint = `https://search.censys.io/api/v2/hosts/search?q=${encodeURIComponent(query)}`;
            identifier = query;
        } else if (action === 'view_host') {
            if (!ip) {
                return Response.json({ error: 'ip required' }, { status: 400 });
            }
            endpoint = `https://search.censys.io/api/v2/hosts/${ip}`;
            identifier = ip;
        } else {
            return Response.json({ error: 'Invalid action' }, { status: 400 });
        }

        const response = await fetch(endpoint, {
            method,
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        await base44.entities.AuditLog.create({
            event_type: 'censys_lookup',
            severity: response.ok ? 'info' : 'warning',
            description: `Censys ${action} for ${identifier}`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: response.ok,
            metadata: {
                action,
                identifier,
                status: response.status,
                remaining: rateCheck.remaining
            }
        });

        if (!response.ok) {
            return Response.json({ 
                error: 'Censys API error',
                status: response.status,
                message: data.error || data.error_message || 'Unknown error'
            }, { status: response.status });
        }

        return Response.json({
            success: true,
            provider: 'Censys',
            data: data,
            rate_limit: {
                remaining: rateCheck.remaining,
                tier: tier
            }
        });

    } catch (error) {
        console.error('Censys proxy error:', error);
        return Response.json({ 
            error: 'Internal server error'
        }, { status: 500 });
    }
});