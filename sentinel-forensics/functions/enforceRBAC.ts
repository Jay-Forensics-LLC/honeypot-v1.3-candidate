import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * PRODUCTION: RBAC Enforcement Middleware
 * Validates user authentication and role-based access
 * Use in all sensitive backend functions
 */
export async function enforceRBAC(req, allowedRoles = ['admin']) {
  const base44 = createClientFromRequest(req);
  
  let user;
  try {
    user = await base44.auth.me();
  } catch (error) {
    throw new Error('Authentication required');
  }

  if (!user) {
    throw new Error('User not authenticated');
  }

  if (!allowedRoles.includes(user.role)) {
    throw new Error(`Access denied. Required roles: ${allowedRoles.join(', ')}`);
  }

  return { user, base44 };
}

/**
 * Standalone RBAC enforcement function
 */
Deno.serve(async (req) => {
  try {
    const { allowed_roles = ['admin'] } = await req.json();
    const { user } = await enforceRBAC(req, allowed_roles);

    return Response.json({
      success: true,
      user: {
        email: user.email,
        role: user.role,
        organization_id: user.organization_id
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 403 });
  }
});