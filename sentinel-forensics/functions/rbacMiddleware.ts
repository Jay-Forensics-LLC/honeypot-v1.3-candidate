import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * RBAC MIDDLEWARE
 * Backend permission enforcement with audit logging
 */

const RolePermissions = {
  admin: ['*'], // Full access
  analyst: [
    'case:create', 'case:read', 'case:update', 'case:assign',
    'evidence:create', 'evidence:read', 'evidence:update', 'evidence:analyze',
    'threat:create', 'threat:read', 'threat:update', 'threat:enrich',
    'alert:create', 'alert:read', 'alert:update', 'alert:acknowledge',
    'device:read', 'device:update', 'device:scan',
    'report:create', 'report:read', 'report:export'
  ],
  auditor: [
    'case:read', 'evidence:read', 'threat:read', 'alert:read', 'device:read',
    'audit:read', 'audit:export', 'compliance:view',
    'report:read', 'report:export'
  ],
  viewer: [
    'case:read', 'evidence:read', 'alert:read', 'device:read', 'report:read'
  ]
};

/**
 * Check if user has permission
 */
function hasPermission(userRole, permission) {
  const permissions = RolePermissions[userRole] || [];
  
  // Admin wildcard
  if (permissions.includes('*')) return true;
  
  // Exact match
  if (permissions.includes(permission)) return true;
  
  // Wildcard match (e.g., 'case:*' matches 'case:read')
  const [resource] = permission.split(':');
  if (permissions.includes(`${resource}:*`)) return true;
  
  return false;
}

/**
 * RBAC middleware handler
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { permission, resource, action } = await req.json();
    const requiredPermission = permission || `${resource}:${action}`;
    
    const allowed = hasPermission(user.role, requiredPermission);

    // Log permission check
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      event_type: allowed ? 'permission_granted' : 'permission_denied',
      severity: allowed ? 'info' : 'warning',
      description: `Permission ${requiredPermission} ${allowed ? 'granted' : 'denied'} for ${user.role}`,
      user_id: user.email,
      resource_type: 'Permission',
      action_performed: 'check',
      success: allowed,
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
      timestamp: new Date().toISOString(),
      blockchain_hash: crypto.randomUUID()
    });

    return Response.json({ 
      allowed,
      role: user.role,
      permission: requiredPermission
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});