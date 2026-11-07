/**
 * PHASE 6: User Shortcuts Management
 * CRUD operations for user shortcuts/pins
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { requireAuth, requireOrg, safeJson, sanitizeError } from './helpers/security.js';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await requireAuth(base44);
    const orgId = requireOrg(user);
    
    const { action, shortcut_id, label, target_type, target_value, sort_order } = await safeJson(req);
    
    if (!action) {
      return Response.json({ error: 'action is required' }, { status: 400 });
    }
    
    // LIST
    if (action === 'list') {
      const shortcuts = await base44.entities.UserShortcut.filter({
        organization_id: orgId,
        owner_user_id: user.email
      });
      
      return Response.json({
        shortcuts: shortcuts.sort((a, b) => a.sort_order - b.sort_order)
      });
    }
    
    // ADD
    if (action === 'add') {
      if (!label || !target_type || !target_value) {
        return Response.json({ 
          error: 'label, target_type, and target_value are required' 
        }, { status: 400 });
      }
      
      // Validate target_type
      const validTypes = ['page', 'case', 'evidence', 'device', 'dashboard', 'reviewQueue'];
      if (!validTypes.includes(target_type)) {
        return Response.json({ 
          error: 'Invalid target_type' 
        }, { status: 400 });
      }
      
      // Get max sort order
      const existing = await base44.entities.UserShortcut.filter({
        organization_id: orgId,
        owner_user_id: user.email
      });
      const maxOrder = existing.length > 0 
        ? Math.max(...existing.map(s => s.sort_order || 0)) 
        : 0;
      
      const shortcut = await base44.entities.UserShortcut.create({
        organization_id: orgId,
        owner_user_id: user.email,
        label: label.substring(0, 100), // Sanitize
        target_type,
        target_value: target_value.substring(0, 500),
        sort_order: sort_order ?? maxOrder + 1
      });
      
      return Response.json({ shortcut });
    }
    
    // REMOVE
    if (action === 'remove') {
      if (!shortcut_id) {
        return Response.json({ error: 'shortcut_id is required' }, { status: 400 });
      }
      
      // Verify ownership
      const shortcuts = await base44.entities.UserShortcut.filter({
        organization_id: orgId,
        owner_user_id: user.email,
        id: shortcut_id
      });
      
      if (shortcuts.length === 0) {
        return Response.json({ error: 'Shortcut not found' }, { status: 404 });
      }
      
      await base44.entities.UserShortcut.delete(shortcut_id);
      
      return Response.json({ message: 'Shortcut removed' });
    }
    
    // REORDER
    if (action === 'reorder') {
      if (!shortcut_id || sort_order === undefined) {
        return Response.json({ 
          error: 'shortcut_id and sort_order are required' 
        }, { status: 400 });
      }
      
      // Verify ownership
      const shortcuts = await base44.entities.UserShortcut.filter({
        organization_id: orgId,
        owner_user_id: user.email,
        id: shortcut_id
      });
      
      if (shortcuts.length === 0) {
        return Response.json({ error: 'Shortcut not found' }, { status: 404 });
      }
      
      await base44.entities.UserShortcut.update(shortcut_id, { sort_order });
      
      return Response.json({ message: 'Shortcut reordered' });
    }
    
    return Response.json({ error: 'Invalid action' }, { status: 400 });
    
  } catch (error) {
    if (error instanceof Response) return error;
    
    console.error('[SHORTCUT] Error:', error);
    return Response.json(sanitizeError(error), { status: 500 });
  }
});