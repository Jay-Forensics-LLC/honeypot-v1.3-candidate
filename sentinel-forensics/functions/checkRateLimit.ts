import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * RATE LIMITING FUNCTION v2.0 - HARDENED
 * 
 * REMEDIATION: REM-002
 * 
 * Token Bucket Algorithm with:
 * - IP + User + Endpoint composite keys
 * - Burst capacity + sustained rate limits
 * - Progressive penalties for repeat offenders
 * - 429 responses with Retry-After headers
 * 
 * CRITICAL FIX: This function now actually blocks requests
 * when limits are exceeded (not just tracking)
 */

// In-memory token buckets (use Redis in production)
const tokenBuckets = new Map();

// Clean up old buckets every 10 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of tokenBuckets.entries()) {
        if (now - bucket.last_refill > 600000) { // 10 minutes
            tokenBuckets.delete(key);
        }
    }
}, 600000);

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Get user (may be unauthenticated for pentest)
        let user;
        try {
            user = await base44.auth.me();
        } catch {
            user = null;
        }

        const { feature_name, custom_limit, endpoint, ip_address } = await req.json();

        // Extract real IP address
        const clientIP = ip_address || 
                        req.headers.get('CF-Connecting-IP') || 
                        req.headers.get('X-Forwarded-For')?.split(',')[0] || 
                        req.headers.get('X-Real-IP') ||
                        'unknown';

        const userId = user?.email || 'anonymous';
        const userTier = user?.subscription_tier || 'free';
        const endpointPath = endpoint || feature_name || 'default';

        // Define rate limits per tier (requests per minute)
        const tierLimits = {
            free: {
                rate_per_second: 2,    // 2 req/s
                burst_capacity: 10,     // Allow burst of 10
                max_per_minute: 100     // Hard cap per minute
            },
            plus: {
                rate_per_second: 10,
                burst_capacity: 50,
                max_per_minute: 500
            },
            pro: {
                rate_per_second: 50,
                burst_capacity: 200,
                max_per_minute: 2000
            },
            admin: {
                rate_per_second: 100,
                burst_capacity: 500,
                max_per_minute: 5000
            }
        };

        const limits = user?.role === 'admin' ? tierLimits.admin : tierLimits[userTier];

        // Composite key for granular tracking
        const compositeKey = `${clientIP}:${userId}:${endpointPath}`;
        
        // Token bucket implementation
        const now = Date.now();
        let bucket = tokenBuckets.get(compositeKey);

        if (!bucket) {
            bucket = {
                tokens: limits.burst_capacity,
                last_refill: now,
                requests_this_minute: 0,
                minute_start: now,
                total_requests: 0,
                blocked_requests: 0,
                penalty_multiplier: 1.0
            };
            tokenBuckets.set(compositeKey, bucket);
        }

        // Reset minute counter if needed
        if (now - bucket.minute_start > 60000) {
            bucket.requests_this_minute = 0;
            bucket.minute_start = now;
        }

        bucket.total_requests++;
        bucket.requests_this_minute++;

        // HARD LIMIT: Reject if exceeded per-minute cap
        if (bucket.requests_this_minute > limits.max_per_minute) {
            bucket.blocked_requests++;
            
            const resetAfter = Math.ceil((60000 - (now - bucket.minute_start)) / 1000);

            // Log high-volume abuse
            if (bucket.blocked_requests > 20) {
                await base44.asServiceRole.entities.SecurityEvent.create({
                    event_type: 'brute_force',
                    severity: 'high',
                    user_email: userId !== 'anonymous' ? userId : null,
                    ip_address: clientIP,
                    details: {
                        endpoint: endpointPath,
                        blocked_requests: bucket.blocked_requests,
                        total_requests: bucket.total_requests,
                        action: 'rate_limit_hard_block'
                    },
                    timestamp: new Date().toISOString()
                }).catch(err => console.warn('Failed to log security event:', err));
            }

            return Response.json({
                allowed: false,
                rate_limited: true,
                reason: 'per_minute_limit_exceeded',
                limit: limits.max_per_minute,
                remaining: 0,
                reset_after_seconds: resetAfter,
                tier: userTier,
                message: `Rate limit exceeded. Maximum ${limits.max_per_minute} requests per minute.`,
                blocked_count: bucket.blocked_requests
            }, { 
                status: 429,
                headers: {
                    'Retry-After': resetAfter.toString(),
                    'X-RateLimit-Limit': limits.max_per_minute.toString(),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': new Date(bucket.minute_start + 60000).toISOString()
                }
            });
        }

        // Token bucket refill
        const elapsedSeconds = (now - bucket.last_refill) / 1000;
        const tokensToAdd = elapsedSeconds * limits.rate_per_second * bucket.penalty_multiplier;
        bucket.tokens = Math.min(limits.burst_capacity, bucket.tokens + tokensToAdd);
        bucket.last_refill = now;

        // Check if tokens available
        if (bucket.tokens < 1) {
            bucket.blocked_requests++;
            
            // Progressive penalty for repeat offenders
            if (bucket.blocked_requests > 10) {
                bucket.penalty_multiplier = Math.max(0.5, bucket.penalty_multiplier * 0.95);
            }

            const resetAfter = Math.ceil((1 - bucket.tokens) / limits.rate_per_second);

            return Response.json({
                allowed: false,
                rate_limited: true,
                reason: 'token_bucket_depleted',
                limit: limits.rate_per_second,
                remaining: 0,
                reset_after_seconds: resetAfter,
                tier: userTier,
                message: `Rate limit exceeded. Retry after ${resetAfter} seconds.`,
                blocked_count: bucket.blocked_requests
            }, { 
                status: 429,
                headers: {
                    'Retry-After': resetAfter.toString(),
                    'X-RateLimit-Limit': limits.rate_per_second.toString(),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': new Date(now + (resetAfter * 1000)).toISOString()
                }
            });
        }

        // Consume token
        bucket.tokens -= 1;

        return Response.json({
            allowed: true,
            rate_limited: false,
            limit: limits.rate_per_second,
            remaining: Math.floor(bucket.tokens),
            reset_after_seconds: Math.ceil((limits.burst_capacity - bucket.tokens) / limits.rate_per_second),
            tier: userTier,
            requests_this_minute: bucket.requests_this_minute,
            composite_key: compositeKey
        }, {
            headers: {
                'X-RateLimit-Limit': limits.rate_per_second.toString(),
                'X-RateLimit-Remaining': Math.floor(bucket.tokens).toString(),
                'X-RateLimit-Reset': new Date(now + 60000).toISOString()
            }
        });

    } catch (error) {
        console.error('Rate limit check error:', error);
        
        // FAIL-CLOSED: Reject on error (secure default)
        return Response.json({ 
            allowed: false,
            error: 'Rate limit check failed',
            message: error.message,
            rate_limited: true
        }, { status: 429 });
    }
});