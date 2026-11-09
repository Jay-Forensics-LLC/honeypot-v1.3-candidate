/**
 * PHASE 6: Role Management
 * Admin-only role and permission management
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { requireAuth, requireOrg, requireAdmin, safeJson, sanitizeError } from './helpers/security.js';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await requireAuth(base44);
    requireAdmin(user);
    const orgId = requireOrg(user);
    
    const { action, role_id, name, description, permission_keys } = await safeJson(req);
    
    if (!action) {
      return Response.json({ error: 'action is required' }, { status: 400 });
    }
    
    // LIST
    if (action === 'list') {
      const roles = await base44.asServiceRole.entities.Role.filter({
        organization_id: orgId
      });
      
      const rolePermissions = await base44.asServiceRole.entities.RolePermission.filter({
        organization_id: orgId
      });
      
      const enriched = roles.map(r => ({
        ...r,
        permissions: rolePermissions
          .filter(rp => rp.role_id === r.id)
          .map(rp => rp.permission_key)
      }));
      
      return Response.json({ roles: enriched });
    }
    
    // CREATE
    if (action === 'create') {
      if (!name) {
        return Response.json({ error: 'name is required' }, { status: 400 });
      }
      
      const role = await base44.asServiceRole.entities.Role.create({
        organization_id: orgId,
        name,
        description,
        is_system_role: false
      });
      
      // Audit
      await base44.asServiceRole.entities.SecurityAuditLog.create({
        organization_id: orgId,
        event_type: 'role.created',
        severity: 'info',
        description: `Role created: ${name}`,
        actor_email: user.email,
        timestamp_utc: new Date().toISOString(),
        metadata: { role_id: role.id, name }
      });
      
      return Response.json({ role });
    }
    
    // UPDATE
    if (action === 'update') {
      if (!role_id) {
        return Response.json({ error: 'role_id is required' }, { status: 400 });
      }
      
      const roles = await base44.asServiceRole.entities.Role.filter({
        organization_id: orgId,
        id: role_id
      });
      
      if (roles.length === 0) {
        return Response.json({ error: 'Role not found' }, { status: 404 });
      }
      
      if (roles[0].is_system_role) {
        return Response.json({ 
          error: 'Cannot modify system roles' 
        }, { status: 403 });
      }
      
      await base44.asServiceRole.entities.Role.update(role_id, {
        name: name || roles[0].name,
        description: description || roles[0].description
      });
      
      return Response.json({ message: 'Role updated' });
    }
    
    // DELETE
    if (action === 'delete') {
      if (!role_id) {
        return Response.json({ error: 'role_id is required' }, { status: 400 });
      }
      
      const roles = await base44.asServiceRole.entities.Role.filter({
        organization_id: orgId,
        id: role_id,
        is_system_role: false
      });
      
      if (roles.length === 0) {
        return Response.json({ 
          error: 'Role not found or is a system role' 
        }, { status: 404 });
      }
      
      await base44.asServiceRole.entities.Role.delete(role_id);
      
      return Response.json({ message: 'Role deleted' });
    }
    
    // SET_PERMISSIONS
    if (action === 'set_permissions') {
      if (!role_id || !Array.isArray(permission_keys)) {
        return Response.json({ 
          error: 'role_id and permission_keys[] are required' 
        }, { status: 400 });
      }
      
      // Remove existing permissions
      const existing = await base44.asServiceRole.entities.RolePermission.filter({
        organization_id: orgId,
        role_id
      });
      
      for (const rp of existing) {
        await base44.asServiceRole.entities.RolePermission.delete(rp.id);
      }
      
      // Add new permissions
      for (const key of permission_keys) {
        await base44.asServiceRole.entities.RolePermission.create({
          organization_id: orgId,
          role_id,
          permission_key: key
        });
      }
      
      // Audit
      await base44.asServiceRole.entities.SecurityAuditLog.create({
        organization_id: orgId,
        event_type: 'role.permissions.updated',
        severity: 'info',
        description: `Permissions updated for role ${role_id}`,
        actor_email: user.email,
        timestamp_utc: new Date().toISOString(),
        metadata: { role_id, permission_keys }
      });
      
      return Response.json({ message: 'Permissions updated' });
    }
    
    return Response.json({ error: 'Invalid action' }, { status: 400 });
    
  } catch (error) {
    if (error instanceof Response) return error;
    
    console.error('[ROLE-MGMT] Error:', error);
    return Response.json(sanitizeError(error), { status: 500 });
  }
});