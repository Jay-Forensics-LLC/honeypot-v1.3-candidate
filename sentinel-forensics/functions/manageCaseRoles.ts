import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, case_id, user_email, role, role_id } = await req.json();

    if (!case_id) {
      return Response.json({ error: 'case_id required' }, { status: 400 });
    }

    // Verify user has access to this case
    const cases = await base44.entities.Case.filter({ id: case_id });
    if (!cases.length) {
      return Response.json({ error: 'Case not found' }, { status: 404 });
    }

    // Check if user can manage roles (admin or lead_investigator)
    const userRoles = await base44.entities.CaseRole.filter({
      case_id,
      user_email: user.email,
      is_active: true
    });

    const canManageRoles = user.role === 'admin' || 
      userRoles.some(r => r.role === 'lead_investigator');

    if (!canManageRoles && action !== 'list') {
      return Response.json({ error: 'Insufficient permissions to manage roles' }, { status: 403 });
    }

    if (action === 'assign') {
      if (!user_email || !role) {
        return Response.json({ error: 'user_email and role required' }, { status: 400 });
      }

      // Define default permissions by role
      const rolePermissions = {
        lead_investigator: {
          view_evidence: true,
          edit_evidence: true,
          view_technical_details: true,
          approve_for_court: true,
          invite_users: true,
          export_data: true
        },
        analyst: {
          view_evidence: true,
          edit_evidence: true,
          view_technical_details: true,
          approve_for_court: false,
          invite_users: false,
          export_data: true
        },
        legal_counsel: {
          view_evidence: true,
          edit_evidence: false,
          view_technical_details: false,
          approve_for_court: true,
          invite_users: true,
          export_data: true
        },
        law_enforcement: {
          view_evidence: true,
          edit_evidence: false,
          view_technical_details: true,
          approve_for_court: false,
          invite_users: false,
          export_data: false
        },
        external_counsel: {
          view_evidence: true,
          edit_evidence: false,
          view_technical_details: false,
          approve_for_court: false,
          invite_users: false,
          export_data: false
        },
        observer: {
          view_evidence: true,
          edit_evidence: false,
          view_technical_details: false,
          approve_for_court: false,
          invite_users: false,
          export_data: false
        }
      };

      const caseRole = await base44.asServiceRole.entities.CaseRole.create({
        organization_id: user.organization_id,
        case_id,
        user_email,
        role,
        permissions: rolePermissions[role] || rolePermissions.observer,
        assigned_by: user.email,
        assigned_at: new Date().toISOString(),
        is_active: true
      });

      // Log activity
      await base44.asServiceRole.entities.CaseActivity.create({
        organization_id: user.organization_id,
        case_id,
        activity_type: 'role_assigned',
        actor_email: user.email,
        actor_role: userRoles[0]?.role || 'admin',
        description: `Assigned ${role} role to ${user_email}`,
        target_entity_type: 'CaseRole',
        target_entity_id: caseRole.id,
        timestamp: new Date().toISOString()
      });

      // Invite user if not already in org
      try {
        await base44.users.inviteUser(user_email, 'user');
      } catch (error) {
        // User might already exist, ignore
      }

      return Response.json({
        success: true,
        case_role: caseRole
      });

    } else if (action === 'list') {
      const roles = await base44.entities.CaseRole.filter({ case_id, is_active: true });
      return Response.json({
        success: true,
        roles
      });

    } else if (action === 'revoke') {
      if (!role_id) {
        return Response.json({ error: 'role_id required' }, { status: 400 });
      }

      await base44.asServiceRole.entities.CaseRole.update(role_id, {
        is_active: false
      });

      await base44.asServiceRole.entities.CaseActivity.create({
        organization_id: user.organization_id,
        case_id,
        activity_type: 'role_assigned',
        actor_email: user.email,
        actor_role: userRoles[0]?.role || 'admin',
        description: `Revoked case access for role ${role_id}`,
        timestamp: new Date().toISOString()
      });

      return Response.json({ success: true });

    } else {
      return Response.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error) {
    console.error('Case role management error:', error);
    return Response.json({
      error: 'Role management failed',
      details: error.message
    }, { status: 500 });
  }
});