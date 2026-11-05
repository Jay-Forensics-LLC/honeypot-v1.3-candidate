/**
 * User Management (Admin Only)
 * Handles user invitations, role changes, and user operations
 * 
 * CRITICAL: All operations require admin role
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { requireAuth, requireOrg, requireAdmin, sanitizeError } from './helpers/security.js';
import { validateInput, InviteUserSchema, UpdateUserRoleSchema } from './helpers/zodSchemas.ts';
import { secureJsonResponse } from './helpers/securityHeaders.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await requireAuth(base44);
    const orgId = requireOrg(user);
    requireAdmin(user); // CRITICAL: Admin only
    
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    const body = await req.json();
    
    // Invite user
    if (action === 'invite') {
      const validation = validateInput(InviteUserSchema, body);
      if (!validation.success) {
        return secureJsonResponse({ error: 'Invalid input', details: validation.errors }, 400);
      }
      
      const { email, role, message } = validation.data;
      
      await base44.users.inviteUser(email, role);
      
      await base44.asServiceRole.entities.SecurityAuditLog.create({
        organization_id: orgId,
        event_type: 'user_invited',
        severity: 'info',
        description: `Admin invited user: ${email} with role: ${role}`,
        actor_email: user.email,
        success: true,
        metadata: { invitee_email: email, role },
        timestamp_utc: new Date().toISOString()
      });
      
      return secureJsonResponse({
        success: true,
        message: `Invitation sent to ${email}`
      });
    }
    
    // Update user role
    if (action === 'update_role') {
      const validation = validateInput(UpdateUserRoleSchema, body);
      if (!validation.success) {
        return secureJsonResponse({ error: 'Invalid input', details: validation.errors }, 400);
      }
      
      const { user_id, role } = validation.data;
      
      // Prevent self-demotion
      if (user_id === user.id && role !== 'admin') {
        return secureJsonResponse({ error: 'Cannot change your own admin role' }, 403);
      }
      
      await base44.asServiceRole.entities.User.update(user_id, { role });
      
      await base44.asServiceRole.entities.SecurityAuditLog.create({
        organization_id: orgId,
        event_type: 'user_role_changed',
        severity: 'warning',
        description: `Admin changed user role`,
        actor_email: user.email,
        success: true,
        metadata: { target_user_id: user_id, new_role: role },
        timestamp_utc: new Date().toISOString()
      });
      
      return secureJsonResponse({
        success: true,
        message: 'User role updated'
      });
    }
    
    // List users (admin only)
    if (action === 'list') {
      const users = await base44.asServiceRole.entities.User.filter({
        organization_id: orgId
      });
      
      // Redact sensitive data
      const safeUsers = users.map(u => ({
        id: u.id,
        email: u.email,
        full_name: u.full_name,
        role: u.role,
        created_date: u.created_date
      }));
      
      return secureJsonResponse({ users: safeUsers });
    }
    
    return secureJsonResponse({ error: 'Invalid action' }, 400);
    
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('[USER-MGMT] Error:', error);
    return secureJsonResponse(sanitizeError(error), 500);
  }
});