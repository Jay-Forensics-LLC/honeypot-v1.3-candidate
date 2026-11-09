import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Server-side Have I Been Pwned proxy with RBAC, rate-limiting, and audit logging
 * Respects HIBP's acceptable use policy and rate limits (1.6s between requests minimum)
 */

const rateLimits = new Map();
const lastHIBPCall = { timestamp: 0 };

function checkRateLimit(userId, tier, action) {
    const key = `${userId}:${action}`;
    const now = Date.now();
    const windowMs = 86400000; // 24 hours for HIBP (daily limits)
    
    const limits = {
        free: 0,
        professional: 50,
        enterprise: 500
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
        return { allowed: false, reason: 'Daily rate limit exceeded', resetAt: record.resetAt };
    }
    
    record.count++;
    return { allowed: true, remaining: limit - record.count };
}

async function enforceHIBPDelay() {
    const now = Date.now();
    const timeSinceLastCall = now - lastHIBPCall.timestamp;
    const minimumDelay = 1600;
    
    if (timeSinceLastCall < minimumDelay) {
        const waitTime = minimumDelay - timeSinceLastCall;
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    lastHIBPCall.timestamp = Date.now();
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

        const { action, account, domain } = await req.json();

        if (!action) {
            return Response.json({ error: 'action is required' }, { status: 400 });
        }

        const rateCheck = checkRateLimit(user.id, tier, 'hibp');
        if (!rateCheck.allowed) {
            await base44.entities.AuditLog.create({
                event_type: 'hibp_rate_limit',
                severity: 'warning',
                description: 'HIBP rate limit exceeded',
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

        const apiKey = Deno.env.get('HIBP_API_KEY');
        if (!apiKey) {
            return Response.json({ 
                error: 'HIBP integration not configured'
            }, { status: 500 });
        }

        await enforceHIBPDelay();

        let endpoint = '';
        let identifier = '';

        if (action === 'breachedaccount') {
            if (!account) {
                return Response.json({ error: 'account (email) required' }, { status: 400 });
            }
            endpoint = `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(account)}`;
            identifier = account;
        } else if (action === 'breaches') {
            if (domain) {
                endpoint = `https://haveibeenpwned.com/api/v3/breaches?domain=${encodeURIComponent(domain)}`;
                identifier = domain;
            } else {
                endpoint = 'https://haveibeenpwned.com/api/v3/breaches';
                identifier = 'all';
            }
        } else {
            return Response.json({ error: 'Invalid action' }, { status: 400 });
        }

        const response = await fetch(endpoint, {
            headers: {
                'hibp-api-key': apiKey,
                'User-Agent': 'Sentinel-Forensics-Platform'
            }
        });

        let data;
        if (response.ok) {
            data = await response.json();
        } else if (response.status === 404) {
            data = { message: 'No breaches found' };
        } else {
            data = { error: await response.text() };
        }

        await base44.entities.AuditLog.create({
            event_type: 'hibp_lookup',
            severity: response.ok ? 'info' : 'warning',
            description: `HIBP ${action} for ${identifier}`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: response.ok || response.status === 404,
            metadata: {
                action,
                identifier: identifier.includes('@') ? 'REDACTED_EMAIL' : identifier,
                status: response.status,
                remaining: rateCheck.remaining
            }
        });

        if (!response.ok && response.status !== 404) {
            return Response.json({ 
                error: 'HIBP API error',
                status: response.status,
                message: data.error || 'Unknown error'
            }, { status: response.status });
        }

        return Response.json({
            success: true,
            provider: 'HaveIBeenPwned',
            data: data,
            rate_limit: {
                remaining: rateCheck.remaining,
                tier: tier
            }
        });

    } catch (error) {
        console.error('HIBP proxy error:', error);
        return Response.json({ 
            error: 'Internal server error'
        }, { status: 500 });
    }
});