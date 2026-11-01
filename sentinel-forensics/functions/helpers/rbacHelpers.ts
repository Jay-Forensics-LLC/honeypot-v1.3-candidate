/**
 * PHASE 5: Shared RBAC Enforcement Helpers
 * 
 * Single source of truth for authorization checks across all backend functions.
 * Ensures consistent permission denied responses and audit logging.
 */

/**
 * Require admin role with explicit structured response
 */
export function requireAdmin(user) {
  if (!user || user.role !== 'admin') {
    return {
      allowed: false,
      blocked_reason: 'insufficient_permissions',
      message: 'Admin access required',
      status: 403
    };
  }
  return { allowed: true };
}

/**
 * Require dev mode (for validation/test functions)
 */
export function requireDevMode() {
  const isDev = Deno.env.get('ENVIRONMENT') === 'development' || 
                Deno.env.get('DEV_MODE') === 'true';
  
  if (!isDev) {
    return {
      allowed: false,
      blocked_reason: 'dev_mode_required',
      message: 'This function is only available in development mode',
      status: 403
    };
  }
  return { allowed: true };
}

/**
 * Require organization access
 */
export function requireOrgAccess(user, organization_id) {
  if (!user) {
    return {
      allowed: false,
      blocked_reason: 'authentication_required',
      message: 'Authentication required',
      status: 401
    };
  }

  if (user.organization_id !== organization_id) {
    return {
      allowed: false,
      blocked_reason: 'organization_mismatch',
      message: 'Access denied: organization mismatch',
      status: 403
    };
  }

  return { allowed: true };
}

/**
 * Log blocked attempt with standardized structure
 */
export async function logBlockedAttempt(base44, {
  organization_id,
  actor,
  event_type,
  blocked_reason,
  metadata = {}
}) {
  try {
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id,
      event_type: `${event_type}_blocked`,
      severity: 'warning',
      description: `Access blocked: ${blocked_reason}`,
      user_id: actor,
      success: false,
      metadata: {
        blocked_reason,
        ...metadata
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.warn('Failed to log blocked attempt:', error.message);
  }
}