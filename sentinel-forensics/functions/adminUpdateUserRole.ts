import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * ADMIN ONLY - Update user role
 * Fixes Issue #009: Prevents privilege escalation
 * 
 * Authorization:
 * - Caller MUST be admin
 * - Cannot escalate self to admin
 * - Audit log created for all role changes
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const admin = await base44.auth.me();

    // Issue #009, #046: Verify caller is admin
    if (!admin || admin.role !== 'admin') {
      return Response.json({ 
        error: 'Forbidden: Admin role required',
        issue: '#009, #046'
      }, { status: 403 });
    }

    if (!admin.organization_id) {
      return Response.json({ 
        error: 'Admin missing organization_id' 
      }, { status: 400 });
    }

    const { user_id, new_role } = await req.json();

    if (!user_id || !new_role) {
      return Response.json({ 
        error: 'Missing user_id or new_role' 
      }, { status: 400 });
    }

    // Validate role value
    const validRoles = ['user', 'admin'];
    if (!validRoles.includes(new_role)) {
      return Response.json({ 
        error: 'Invalid role. Must be: user, admin' 
      }, { status: 400 });
    }

    // Get target user
    const targetUser = await base44.asServiceRole.entities.User.get(user_id);
    
    if (!targetUser) {
      return Response.json({ 
        error: 'User not found' 
      }, { status: 404 });
    }

    // Issue #009: Prevent cross-tenant role modification
    if (targetUser.organization_id !== admin.organization_id) {
      return Response.json({ 
        error: 'Cannot modify user from different organization',
        issue: '#043'
      }, { status: 403 });
    }

    // Issue #009: Prevent self-escalation
    if (targetUser.id === admin.id && new_role === 'admin') {
      return Response.json({ 
        error: 'Cannot self-escalate to admin',
        issue: '#009'
      }, { status: 403 });
    }

    const oldRole = targetUser.role;

    // Update role using service role (bypasses RLS immutable_fields)
    await base44.asServiceRole.entities.User.update(user_id, {
      role: new_role
    });

    // Create audit log
    await base44.functions.invoke('createAuditLog', {
      event_type: 'user_role_changed',
      severity: 'warning',
      description: `Role changed from ${oldRole} to ${new_role}`,
      resource_type: 'User',
      resource_id: user_id,
      action_performed: 'update_role',
      fields_changed: ['role'],
      previous_state: { role: oldRole },
      new_state: { role: new_role },
      metadata: {
        admin_email: admin.email,
        target_email: targetUser.email,
        old_role: oldRole,
        new_role: new_role
      }
    });

    return Response.json({ 
      success: true,
      user_id,
      old_role: oldRole,
      new_role,
      message: `User role updated from ${oldRole} to ${new_role}`
    });

  } catch (error) {
    console.error('Role update failed:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});