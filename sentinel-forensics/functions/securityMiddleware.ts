import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * PHASE 7: Security Middleware
 * Enforces multi-tenant boundaries and auth validation
 */

export async function requireAuth(req) {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  
  if (!user) {
    throw new Error('Unauthorized: Authentication required');
  }
  
  return { user, base44 };
}

export async function requireAdmin(req) {
  const { user, base44 } = await requireAuth(req);
  
  if (user.role !== 'admin') {
    throw new Error('Forbidden: Admin access required');
  }
  
  return { user, base44 };
}

export async function requireOrganization(req) {
  const { user, base44 } = await requireAuth(req);
  
  if (!user.organization_id) {
    throw new Error('Forbidden: Organization membership required');
  }
  
  return { user, base44 };
}

/**
 * Validate that a resource belongs to user's organization
 */
export async function validateOrgOwnership(base44, entityName, resourceId, user) {
  const resource = await base44.asServiceRole.entities[entityName].filter({
    id: resourceId
  });
  
  if (!resource || resource.length === 0) {
    throw new Error('Resource not found');
  }
  
  if (resource[0].organization_id !== user.organization_id) {
    throw new Error('Forbidden: Resource belongs to different organization');
  }
  
  return resource[0];
}

/**
 * Sanitize user input to prevent injection attacks
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  
  // Remove script tags, event handlers, and dangerous patterns
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '');
}

/**
 * Rate limiting helper
 */
export async function checkRateLimit(base44, identifier, maxRequests = 100, windowMs = 60000) {
  const now = Date.now();
  const key = `rate_limit_${identifier}`;
  
  const existing = await base44.asServiceRole.entities.RateLimitTracker.filter({
    identifier: identifier,
    window_start: { $gte: new Date(now - windowMs).toISOString() }
  });
  
  if (existing.length >= maxRequests) {
    throw new Error('Rate limit exceeded');
  }
  
  await base44.asServiceRole.entities.RateLimitTracker.create({
    identifier,
    window_start: new Date(now).toISOString(),
    request_count: 1
  });
  
  return true;
}