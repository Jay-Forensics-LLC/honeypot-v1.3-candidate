/**
 * PHASE 6: Dashboard Template Management
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { requireAuth, requireOrg, requirePermission, safeJson, sanitizeError } from './helpers/security.js';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await requireAuth(base44);
    const orgId = requireOrg(user);
    
    const { action, template_id, name, description, default_layout_json, allowed_widget_keys, required_permissions } = await safeJson(req);
    
    if (!action) {
      return Response.json({ error: 'action is required' }, { status: 400 });
    }
    
    // LIST
    if (action === 'list') {
      await requirePermission(base44, user, 'dashboards.view');
      
      const templates = await base44.asServiceRole.entities.DashboardTemplate.filter({});
      
      // Filter to org + system templates
      const accessible = templates.filter(t => 
        t.visibility === 'system' || t.organization_id === orgId
      );
      
      return Response.json({ templates: accessible });
    }
    
    // SAVE
    if (action === 'save') {
      await requirePermission(base44, user, 'dashboards.share');
      
      if (!name || !default_layout_json) {
        return Response.json({ error: 'name and default_layout_json required' }, { status: 400 });
      }
      
      const data = {
        organization_id: orgId,
        name,
        description,
        default_layout_json: typeof default_layout_json === 'string' 
          ? default_layout_json 
          : JSON.stringify(default_layout_json),
        allowed_widget_keys_json: JSON.stringify(allowed_widget_keys || []),
        required_permissions_json: JSON.stringify(required_permissions || []),
        visibility: 'org',
        created_by_user_id: user.email
      };
      
      let template;
      if (template_id) {
        template = await base44.asServiceRole.entities.DashboardTemplate.update(template_id, data);
      } else {
        template = await base44.asServiceRole.entities.DashboardTemplate.create(data);
      }
      
      return Response.json({ template });
    }
    
    // DELETE
    if (action === 'delete') {
      await requirePermission(base44, user, 'dashboards.share');
      
      if (!template_id) {
        return Response.json({ error: 'template_id required' }, { status: 400 });
      }
      
      await base44.asServiceRole.entities.DashboardTemplate.delete(template_id);
      
      return Response.json({ message: 'Template deleted' });
    }
    
    return Response.json({ error: 'Invalid action' }, { status: 400 });
    
  } catch (error) {
    if (error instanceof Response) return error;
    
    console.error('[DASHBOARD-TEMPLATES] Error:', error);
    return Response.json(sanitizeError(error), { status: 500 });
  }
});