/**
 * Rate Limiting Helper
 * Prevents brute-force and abuse attacks
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

interface RateLimitConfig {
  scope: string;
  maxAttempts: number;
  windowMinutes: number;
  identifier: string;
  organizationId?: string;
}

/**
 * Check and enforce rate limits using RateLimitTracker entity
 * Returns true if limit exceeded, false if within limits
 */
export async function checkRateLimit(
  base44: any,
  config: RateLimitConfig
): Promise<{ limited: boolean; remaining: number }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - config.windowMinutes * 60 * 1000);
  
  // Composite key for tenant isolation
  const resourceId = `${config.scope}:${config.identifier}`;
  
  // Get recent trackers within window
  const trackers = await base44.asServiceRole.entities.RateLimitTracker.filter({
    organization_id: config.organizationId || 'system',
    scope: config.scope,
    resource_id: resourceId
  }, '-created_date', 10);
  
  // Filter to current window
  const recentTrackers = trackers.filter(t => 
    new Date(t.window_start) >= windowStart
  );
  
  const currentCount = recentTrackers.reduce((sum, t) => sum + (t.count || 0), 0);
  
  if (currentCount >= config.maxAttempts) {
    return { limited: true, remaining: 0 };
  }
  
  // Create new tracker for this attempt
  await base44.asServiceRole.entities.RateLimitTracker.create({
    organization_id: config.organizationId || 'system',
    scope: config.scope,
    resource_id: resourceId,
    window_start: now.toISOString(),
    window_end: new Date(now.getTime() + config.windowMinutes * 60 * 1000).toISOString(),
    count: 1,
    last_action_at: now.toISOString(),
    metadata: {
      identifier: config.identifier,
      window_minutes: config.windowMinutes
    }
  });
  
  return { 
    limited: false, 
    remaining: config.maxAttempts - currentCount - 1 
  };
}

/**
 * Create composite rate limit key from IP + user identifier
 */
export function makeRateLimitKey(ip: string, userId?: string): string {
  return userId ? `${ip}:${userId}` : ip;
}