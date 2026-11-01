/**
 * PHASE 6: Dashboard Layout List
 * Returns user's personal and team layouts
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { requireAuth, requireOrg, orgScopedFilter, sanitizeError } from './helpers/security.js';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await requireAuth(base44);
    const orgId = requireOrg(user);
    
    // Fetch personal layouts
    const personalLayouts = await base44.entities.DashboardLayout.filter({
      organization_id: orgId,
      owner_user_id: user.email
    });
    
    // Fetch team layouts (if org has any)
    const teamLayouts = await base44.entities.DashboardLayout.filter({
      organization_id: orgId,
      visibility: 'team'
    });
    
    // Filter out duplicates (user's own team layouts)
    const uniqueTeamLayouts = teamLayouts.filter(
      tl => !personalLayouts.some(pl => pl.id === tl.id)
    );
    
    return Response.json({
      personal: personalLayouts.map(l => ({
        id: l.id,
        name: l.name,
        description: l.description,
        is_default: l.is_default,
        visibility: l.visibility,
        version: l.version,
        created_date: l.created_date,
        updated_date: l.updated_date,
        owner_user_id: l.owner_user_id
      })),
      team: uniqueTeamLayouts.map(l => ({
        id: l.id,
        name: l.name,
        description: l.description,
        visibility: l.visibility,
        created_date: l.created_date,
        owner_user_id: l.owner_user_id
      }))
    });
    
  } catch (error) {
    if (error instanceof Response) return error;
    
    console.error('[LAYOUT-LIST] Error:', error);
    return Response.json(sanitizeError(error), { status: 500 });
  }
});