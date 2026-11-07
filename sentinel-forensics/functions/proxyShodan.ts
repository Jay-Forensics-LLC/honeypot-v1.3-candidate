import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Server-side Shodan proxy with RBAC, rate-limiting, and audit logging
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

        const { action, ip, query } = await req.json();

        if (!action) {
            return Response.json({ error: 'action is required' }, { status: 400 });
        }

        const rateCheck = checkRateLimit(user.id, tier, 'shodan');
        if (!rateCheck.allowed) {
            await base44.entities.AuditLog.create({
                event_type: 'shodan_rate_limit',
                severity: 'warning',
                description: 'Shodan rate limit exceeded',
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

        const apiKey = Deno.env.get('SHODAN_API_KEY');
        if (!apiKey) {
            return Response.json({ 
                error: 'Shodan integration not configured'
            }, { status: 500 });
        }

        let endpoint = '';
        let identifier = '';

        if (action === 'host') {
            if (!ip) {
                return Response.json({ error: 'ip required' }, { status: 400 });
            }
            endpoint = `https://api.shodan.io/shodan/host/${ip}?key=${apiKey}`;
            identifier = ip;
        } else if (action === 'search') {
            if (!query) {
                return Response.json({ error: 'query required' }, { status: 400 });
            }
            endpoint = `https://api.shodan.io/shodan/host/search?key=${apiKey}&query=${encodeURIComponent(query)}`;
            identifier = query;
        } else {
            return Response.json({ error: 'Invalid action' }, { status: 400 });
        }

        const response = await fetch(endpoint);
        const data = await response.json();

        await base44.entities.AuditLog.create({
            event_type: 'shodan_lookup',
            severity: response.ok ? 'info' : 'warning',
            description: `Shodan ${action} for ${identifier}`,
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
                error: 'Shodan API error',
                status: response.status,
                message: data.error || 'Unknown error'
            }, { status: response.status });
        }

        return Response.json({
            success: true,
            provider: 'Shodan',
            data: data,
            rate_limit: {
                remaining: rateCheck.remaining,
                tier: tier
            }
        });

    } catch (error) {
        console.error('Shodan proxy error:', error);
        return Response.json({ 
            error: 'Internal server error'
        }, { status: 500 });
    }
});