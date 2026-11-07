import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Server-side VirusTotal proxy with RBAC, rate-limiting, and audit logging
 * NEVER exposes API keys to the browser
 */

// Rate limiter (in-memory, suitable for serverless)
const rateLimits = new Map();

function checkRateLimit(userId, tier, action) {
    const key = `${userId}:${action}`;
    const now = Date.now();
    const windowMs = 60000; // 1 minute window
    
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

        // RBAC: Only Pro and Enterprise tiers
        const tier = user.subscription_tier || 'free';
        if (tier === 'free') {
            return Response.json({ 
                error: 'Feature requires Pro or Enterprise subscription',
                upgrade_url: '/subscription'
            }, { status: 403 });
        }

        const { action, hash, ip, domain, url } = await req.json();

        if (!action) {
            return Response.json({ error: 'action is required' }, { status: 400 });
        }

        // Rate limiting
        const rateCheck = checkRateLimit(user.id, tier, 'virustotal');
        if (!rateCheck.allowed) {
            await base44.entities.AuditLog.create({
                event_type: 'virustotal_rate_limit',
                severity: 'warning',
                description: 'VirusTotal rate limit exceeded',
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

        // Get API key from server environment (NEVER sent to client)
        const apiKey = Deno.env.get('VIRUSTOTAL_API_KEY');
        if (!apiKey) {
            return Response.json({ 
                error: 'VirusTotal integration not configured',
                message: 'Contact administrator to set up API keys'
            }, { status: 500 });
        }

        let endpoint = '';
        let identifier = '';

        // Route to correct VirusTotal endpoint
        if (action === 'file_report') {
            if (!hash) {
                return Response.json({ error: 'hash required' }, { status: 400 });
            }
            endpoint = `https://www.virustotal.com/api/v3/files/${hash}`;
            identifier = hash;
        } else if (action === 'url_report') {
            if (!url) {
                return Response.json({ error: 'url required' }, { status: 400 });
            }
            const urlId = btoa(url).replace(/=/g, '');
            endpoint = `https://www.virustotal.com/api/v3/urls/${urlId}`;
            identifier = url;
        } else if (action === 'ip_report') {
            if (!ip) {
                return Response.json({ error: 'ip required' }, { status: 400 });
            }
            endpoint = `https://www.virustotal.com/api/v3/ip_addresses/${ip}`;
            identifier = ip;
        } else if (action === 'domain_report') {
            if (!domain) {
                return Response.json({ error: 'domain required' }, { status: 400 });
            }
            endpoint = `https://www.virustotal.com/api/v3/domains/${domain}`;
            identifier = domain;
        } else {
            return Response.json({ error: 'Invalid action' }, { status: 400 });
        }

        // Make request to VirusTotal
        const response = await fetch(endpoint, {
            headers: {
                'x-apikey': apiKey,
                'Accept': 'application/json'
            }
        });

        const data = await response.json();

        // Audit log (includes success/failure)
        await base44.entities.AuditLog.create({
            event_type: 'virustotal_lookup',
            severity: response.ok ? 'info' : 'warning',
            description: `VirusTotal ${action} for ${identifier}`,
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
                error: 'VirusTotal API error',
                status: response.status,
                message: data.error?.message || 'Unknown error'
            }, { status: response.status });
        }

        // Return sanitized response (no secrets)
        return Response.json({
            success: true,
            provider: 'VirusTotal',
            data: data,
            rate_limit: {
                remaining: rateCheck.remaining,
                tier: tier
            }
        });

    } catch (error) {
        console.error('VirusTotal proxy error:', error);
        // NEVER echo secrets in error messages
        return Response.json({ 
            error: 'Internal server error',
            message: 'Failed to complete VirusTotal lookup'
        }, { status: 500 });
    }
});