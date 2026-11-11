/**
 * PHASE 6: Dashboard Layout Set Default
 * Sets a layout as user's default
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { requireAuth, requireOrg, safeJson, sanitizeError } from './helpers/security.js';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await requireAuth(base44);
    const orgId = requireOrg(user);
    
    const { layout_id } = await safeJson(req);
    
    if (!layout_id) {
      return Response.json({ 
        error: 'Validation Error',
        detail: 'layout_id is required'
      }, { status: 400 });
    }
    
    // Verify layout exists and user has access
    const layouts = await base44.entities.DashboardLayout.filter({
      organization_id: orgId,
      id: layout_id
    });
    
    if (layouts.length === 0) {
      return Response.json({ 
        error: 'Layout Not Found',
        detail: 'Layout does not exist'
      }, { status: 404 });
    }
    
    const targetLayout = layouts[0];
    
    // Can only set own layouts as default (not team layouts owned by others)
    if (targetLayout.owner_user_id !== user.email) {
      return Response.json({ 
        error: 'Forbidden',
        detail: 'You can only set your own layouts as default'
      }, { status: 403 });
    }
    
    // Unset all other defaults for this user
    const allUserLayouts = await base44.entities.DashboardLayout.filter({
      organization_id: orgId,
      owner_user_id: user.email,
      is_default: true
    });
    
    for (const layout of allUserLayouts) {
      if (layout.id !== layout_id) {
        await base44.entities.DashboardLayout.update(layout.id, { is_default: false });
      }
    }
    
    // Set new default
    await base44.entities.DashboardLayout.update(layout_id, { is_default: true });
    
    return Response.json({
      message: 'Default layout updated',
      layout_id
    });
    
  } catch (error) {
    if (error instanceof Response) return error;
    
    console.error('[LAYOUT-SET-DEFAULT] Error:', error);
    return Response.json(sanitizeError(error), { status: 500 });
  }
});