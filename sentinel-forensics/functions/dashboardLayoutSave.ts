/**
 * PHASE 6: Dashboard Layout Save
 * Validates and persists dashboard layout configurations
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { requireAuth, requireOrg, safeJson, orgScopedFilter, sanitizeError } from './helpers/security.js';

const MAX_LAYOUT_SIZE = 50 * 1024; // 50KB
const MAX_WIDGETS = 20;
const MAX_VERSIONS = 5;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await requireAuth(base44);
    const orgId = requireOrg(user);
    
    // Permission check
    await requirePermission(base44, user, 'dashboards.edit');
    
    const {
      layout_id,
      name,
      description,
      visibility = 'personal',
      layout_json,
      set_default = false
    } = await safeJson(req);
    
    // Validate required fields
    if (!name || !layout_json) {
      return Response.json({ 
        error: 'Validation Error',
        detail: 'name and layout_json are required'
      }, { status: 400 });
    }
    
    // Parse and validate layout JSON
    let layoutData;
    try {
      layoutData = typeof layout_json === 'string' ? JSON.parse(layout_json) : layout_json;
    } catch (error) {
      return Response.json({ 
        error: 'Invalid Layout JSON',
        detail: 'layout_json must be valid JSON'
      }, { status: 400 });
    }
    
    // Validate layout schema
    if (!layoutData.version || layoutData.version !== '2.0') {
      return Response.json({ 
        error: 'Invalid Layout Version',
        detail: 'layout_json.version must be "2.0"'
      }, { status: 400 });
    }
    
    if (!Array.isArray(layoutData.grid)) {
      return Response.json({ 
        error: 'Invalid Layout Grid',
        detail: 'layout_json.grid must be an array'
      }, { status: 400 });
    }
    
    if (layoutData.grid.length > MAX_WIDGETS) {
      return Response.json({ 
        error: 'Too Many Widgets',
        detail: `Maximum ${MAX_WIDGETS} widgets allowed per layout`
      }, { status: 400 });
    }
    
    // Validate each widget
    for (const widget of layoutData.grid) {
      if (!widget.widgetKey || typeof widget.x !== 'number' || typeof widget.y !== 'number') {
        return Response.json({ 
          error: 'Invalid Widget Configuration',
          detail: 'Each widget must have widgetKey, x, y, w, h'
        }, { status: 400 });
      }
    }
    
    // Check size limit
    const layoutString = JSON.stringify(layoutData);
    if (layoutString.length > MAX_LAYOUT_SIZE) {
      return Response.json({ 
        error: 'Layout Too Large',
        detail: `Layout exceeds ${MAX_LAYOUT_SIZE} bytes`
      }, { status: 400 });
    }
    
    // Sanitize strings (no HTML)
    const sanitizedName = name.replace(/<[^>]*>/g, '');
    const sanitizedDesc = description?.replace(/<[^>]*>/g, '') || '';
    
    // Check visibility permissions
    if (visibility === 'team' && user.role !== 'admin') {
      return Response.json({ 
        error: 'Insufficient Permissions',
        detail: 'Only admins can create team layouts'
      }, { status: 403 });
    }
    
    let savedLayout;
    
    if (layout_id) {
      // Update existing layout
      const existing = await base44.entities.DashboardLayout.filter({
        organization_id: orgId,
        owner_user_id: user.email,
        id: layout_id
      });
      
      if (existing.length === 0) {
        return Response.json({ 
          error: 'Layout Not Found',
          detail: 'Layout does not exist or you do not have permission'
        }, { status: 404 });
      }
      
      const current = existing[0];
      
      // Build version history
      let previousVersions = current.previous_versions || [];
      previousVersions.unshift({
        version: current.version || 1,
        layout_json: current.layout_json,
        saved_at: current.updated_date || current.created_date
      });
      
      // Keep only last 5 versions
      previousVersions = previousVersions.slice(0, MAX_VERSIONS);
      
      savedLayout = await base44.entities.DashboardLayout.update(layout_id, {
        name: sanitizedName,
        description: sanitizedDesc,
        layout_json: layoutString,
        visibility,
        version: (current.version || 1) + 1,
        previous_versions: previousVersions
      });
    } else {
      // Create new layout
      savedLayout = await base44.entities.DashboardLayout.create({
        organization_id: orgId,
        owner_user_id: user.email,
        name: sanitizedName,
        description: sanitizedDesc,
        layout_json: layoutString,
        visibility,
        is_default: set_default,
        version: 1,
        previous_versions: []
      });
    }
    
    // If set as default, unset other defaults
    if (set_default) {
      const otherLayouts = await base44.entities.DashboardLayout.filter({
        organization_id: orgId,
        owner_user_id: user.email,
        is_default: true
      });
      
      for (const layout of otherLayouts) {
        if (layout.id !== savedLayout.id) {
          await base44.entities.DashboardLayout.update(layout.id, { is_default: false });
        }
      }
    }
    
    return Response.json({
      layout_id: savedLayout.id,
      name: savedLayout.name,
      version: savedLayout.version,
      is_default: savedLayout.is_default,
      message: layout_id ? 'Layout updated' : 'Layout created'
    });
    
  } catch (error) {
    if (error instanceof Response) return error;
    
    console.error('[LAYOUT-SAVE] Error:', error);
    return Response.json(sanitizeError(error), { status: 500 });
  }
});