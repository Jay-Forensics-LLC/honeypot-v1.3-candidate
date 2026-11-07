/**
 * PHASE 6: Dashboard Layout Delete
 * Deletes user's dashboard layout
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
    
    // Verify ownership
    const layouts = await base44.entities.DashboardLayout.filter({
      organization_id: orgId,
      owner_user_id: user.email,
      id: layout_id
    });
    
    if (layouts.length === 0) {
      return Response.json({ 
        error: 'Layout Not Found',
        detail: 'Layout does not exist or you do not have permission'
      }, { status: 404 });
    }
    
    await base44.entities.DashboardLayout.delete(layout_id);
    
    return Response.json({
      message: 'Layout deleted',
      layout_id
    });
    
  } catch (error) {
    if (error instanceof Response) return error;
    
    console.error('[LAYOUT-DELETE] Error:', error);
    return Response.json(sanitizeError(error), { status: 500 });
  }
});