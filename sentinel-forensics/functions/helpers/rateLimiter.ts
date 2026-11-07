/**
 * PHASE 5: Durable Rate Limiting Infrastructure
 * 
 * Persists rate limit counters in RateLimitTracker entity (no in-memory state).
 * Enforces max actions/hour per org + cooldown windows.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Check and enforce rate limits for a given scope
 * 
 * @param {Object} base44 - Base44 SDK client
 * @param {Object} params - Rate limit parameters
 * @param {string} params.organization_id - Organization ID
 * @param {string} params.scope - Rate limit scope (e.g., 'control_plane_execution', 'threat_intel_correlation')
 * @param {number} params.max_per_hour - Maximum allowed actions per hour
 * @param {number} params.cooldown_minutes - Minimum minutes between actions (optional)
 * @param {string} params.resource_id - Specific resource ID for cooldown tracking (optional)
 * @returns {Object} { allowed: boolean, blocked_reason?: string, count?: number, cooldown_until?: string }
 */
export async function checkRateLimit(base44, {
  organization_id,
  scope,
  max_per_hour,
  cooldown_minutes = 0,
  resource_id = null
}) {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Fetch or create rate limit tracker
  const trackers = await base44.asServiceRole.entities.RateLimitTracker.filter({
    organization_id,
    scope,
    resource_id
  });

  let tracker;
  if (trackers.length === 0) {
    tracker = await base44.asServiceRole.entities.RateLimitTracker.create({
      organization_id,
      scope,
      resource_id,
      window_start: now.toISOString(),
      window_end: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      count: 0,
      last_action_at: null,
      metadata: {}
    });
  } else {
    tracker = trackers[0];
  }

  // Reset window if expired
  const windowEnd = new Date(tracker.window_end);
  if (now > windowEnd) {
    tracker = await base44.asServiceRole.entities.RateLimitTracker.update(tracker.id, {
      window_start: now.toISOString(),
      window_end: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      count: 0
    });
  }

  // Check hourly limit
  if (tracker.count >= max_per_hour) {
    return {
      allowed: false,
      blocked_reason: 'rate_limit_exceeded',
      message: `Rate limit exceeded: ${max_per_hour} actions/hour`,
      count: tracker.count,
      reset_at: tracker.window_end
    };
  }

  // Check cooldown (resource-specific)
  if (cooldown_minutes > 0 && tracker.last_action_at) {
    const lastAction = new Date(tracker.last_action_at);
    const minutesAgo = (now - lastAction) / (1000 * 60);
    
    if (minutesAgo < cooldown_minutes) {
      const cooldownUntil = new Date(lastAction.getTime() + cooldown_minutes * 60000).toISOString();
      return {
        allowed: false,
        blocked_reason: 'cooldown_active',
        message: `Cooldown active: ${cooldown_minutes} minutes between actions`,
        cooldown_until: cooldownUntil
      };
    }
  }

  return {
    allowed: true,
    count: tracker.count
  };
}

/**
 * Increment rate limit counter after successful action
 */
export async function incrementRateLimit(base44, {
  organization_id,
  scope,
  resource_id = null
}) {
  const trackers = await base44.asServiceRole.entities.RateLimitTracker.filter({
    organization_id,
    scope,
    resource_id
  });

  if (trackers.length > 0) {
    const tracker = trackers[0];
    await base44.asServiceRole.entities.RateLimitTracker.update(tracker.id, {
      count: tracker.count + 1,
      last_action_at: new Date().toISOString()
    });
  }
}

/**
 * Wrapper function that applies rate limiting to a handler
 */
export async function withRateLimit(base44, limitConfig, handler) {
  const limitCheck = await checkRateLimit(base44, limitConfig);
  
  if (!limitCheck.allowed) {
    return {
      blocked: true,
      blocked_reason: limitCheck.blocked_reason,
      message: limitCheck.message,
      reset_at: limitCheck.reset_at,
      cooldown_until: limitCheck.cooldown_until
    };
  }

  // Execute handler
  const result = await handler();

  // Increment counter on success
  await incrementRateLimit(base44, limitConfig);

  return {
    blocked: false,
    result
  };
}