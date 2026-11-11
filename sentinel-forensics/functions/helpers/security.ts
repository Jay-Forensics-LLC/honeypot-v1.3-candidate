/**
 * PHASE 6: Consolidated Security Middleware
 * 
 * Provides standardized authentication, authorization, and request validation
 * for all backend functions. Enforces tenant isolation and RBAC.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Requires authenticated user session
 * @throws {Response} 401 if not authenticated
 */
export async function requireAuth(base44) {
  const user = await base44.auth.me();
  if (!user) {
    throw new Response(JSON.stringify({ 
      error: 'Unauthorized',
      detail: 'Authentication required'
    }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  return user;
}

/**
 * Extracts organization_id from authenticated user
 * @throws {Response} 403 if no organization context
 */
export function requireOrg(user) {
  const orgId = user.organization_id;
  if (!orgId) {
    throw new Response(JSON.stringify({ 
      error: 'Forbidden',
      detail: 'No organization context for this user'
    }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  return orgId;
}

/**
 * Requires user to have one of the specified roles
 * @param {object} user - Authenticated user
 * @param {string[]} allowedRoles - Allowed role names (e.g., ['admin', 'analyst'])
 * @throws {Response} 403 if role not allowed
 */
export function requireRole(user, allowedRoles) {
  if (!allowedRoles.includes(user.role)) {
    throw new Response(JSON.stringify({ 
      error: 'Forbidden',
      detail: `Role '${user.role}' not authorized. Required: ${allowedRoles.join(' or ')}`,
      required_roles: allowedRoles
    }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * Validates internal job secret for scheduled/system tasks
 * @throws {Response} 401 if secret invalid or missing
 */
export function requireInternalJobSecret(req) {
  const providedSecret = req.headers.get('X-Internal-Job-Secret');
  const expectedSecret = Deno.env.get('INTERNAL_JOB_SECRET');
  
  if (!expectedSecret) {
    throw new Response(JSON.stringify({ 
      error: 'Configuration Error',
      detail: 'Internal job secret not configured'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  
  if (!providedSecret || providedSecret !== expectedSecret) {
    throw new Response(JSON.stringify({ 
      error: 'Unauthorized',
      detail: 'Invalid or missing internal job secret'
    }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * Creates organization-scoped filter for queries
 * Ensures all tenant data queries include organization_id
 */
export function orgScopedFilter(orgId, additionalFilters = {}) {
  return {
    organization_id: orgId,
    ...additionalFilters
  };
}

/**
 * Safely parses JSON with size limit and error handling
 * @param {Request} req
 * @param {number} maxSizeBytes - Default 10MB
 * @throws {Response} 400 if invalid JSON or too large
 */
export async function safeJson(req, maxSizeBytes = 10 * 1024 * 1024) {
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > maxSizeBytes) {
    throw new Response(JSON.stringify({ 
      error: 'Payload Too Large',
      detail: `Request exceeds ${maxSizeBytes} bytes`,
      max_size_bytes: maxSizeBytes
    }), { status: 413, headers: { 'Content-Type': 'application/json' } });
  }
  
  try {
    const text = await req.text();
    if (text.length > maxSizeBytes) {
      throw new Response(JSON.stringify({ 
        error: 'Payload Too Large',
        detail: `Request exceeds ${maxSizeBytes} bytes`
      }), { status: 413, headers: { 'Content-Type': 'application/json' } });
    }
    
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof Response) throw error;
    
    throw new Response(JSON.stringify({ 
      error: 'Invalid JSON',
      detail: 'Request body must be valid JSON'
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * Creates standardized request context for logging/tracing
 */
export function createRequestContext(req) {
  const requestId = crypto.randomUUID();
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';
  
  return {
    request_id: requestId,
    started_at: new Date().toISOString(),
    ip_address: ip,
    user_agent: userAgent
  };
}

/**
 * Sanitizes error for client response (no stack traces)
 */
export function sanitizeError(error) {
  // Never return stack traces to clients
  return {
    error: error.message || 'Internal Server Error',
    detail: error.detail || 'An unexpected error occurred',
    timestamp: new Date().toISOString()
  };
}

/**
 * Validates that a service role query includes organization_id
 * Use this as a safety assertion in functions that use asServiceRole
 */
export function assertOrgScoped(filter, functionName) {
  if (!filter || !filter.organization_id) {
    console.error(`[TENANT-SAFETY] ${functionName} attempted service role query without organization_id:`, filter);
    throw new Error(`Tenant isolation violation: ${functionName} must scope queries by organization_id`);
  }
}