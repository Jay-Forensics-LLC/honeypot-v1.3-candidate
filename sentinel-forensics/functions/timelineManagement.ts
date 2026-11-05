/**
 * PHASE 6: Timeline Management
 * List and add timeline events for cases
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { requireAuth, requireOrg, requirePermission, safeJson, sanitizeError } from './helpers/security.js';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await requireAuth(base44);
    const orgId = requireOrg(user);
    
    const { action, case_id, filters, page = 1, page_size = 50, timestamp, event_type, title, details_json } = await safeJson(req);
    
    if (!action) {
      return Response.json({ error: 'action is required' }, { status: 400 });
    }
    
    // LIST
    if (action === 'list') {
      await requirePermission(base44, user, 'cases.view');
      
      if (!case_id) {
        return Response.json({ error: 'case_id is required' }, { status: 400 });
      }
      
      // Build query
      const query: any = {
        organization_id: orgId,
        case_id
      };
      
      if (filters?.event_type) {
        query.event_type = filters.event_type;
      }
      
      const events = await base44.asServiceRole.entities.TimelineEvent.filter(query);
      
      // Sort by timestamp
      const sorted = events.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      // Paginate
      const startIdx = (page - 1) * page_size;
      const endIdx = startIdx + page_size;
      const paginated = sorted.slice(startIdx, endIdx);
      
      return Response.json({
        events: paginated,
        pagination: {
          page,
          page_size,
          total_records: sorted.length,
          total_pages: Math.ceil(sorted.length / page_size)
        }
      });
    }
    
    // ADD_EVENT (manual curator entry)
    if (action === 'add_event') {
      await requirePermission(base44, user, 'cases.manage');
      
      if (!case_id || !timestamp || !event_type || !title) {
        return Response.json({ 
          error: 'case_id, timestamp, event_type, and title are required' 
        }, { status: 400 });
      }
      
      const event = await base44.asServiceRole.entities.TimelineEvent.create({
        organization_id: orgId,
        case_id,
        timestamp,
        event_type,
        title,
        details_json: details_json || {},
        created_by: user.email
      });
      
      // Audit
      await base44.asServiceRole.entities.SecurityAuditLog.create({
        organization_id: orgId,
        event_type: 'timeline.event.added',
        severity: 'info',
        description: `Timeline event added to case ${case_id}`,
        actor_email: user.email,
        timestamp_utc: new Date().toISOString(),
        metadata: { case_id, event_id: event.id, title }
      });
      
      return Response.json({ event });
    }
    
    return Response.json({ error: 'Invalid action' }, { status: 400 });
    
  } catch (error) {
    if (error instanceof Response) return error;
    
    console.error('[TIMELINE] Error:', error);
    return Response.json(sanitizeError(error), { status: 500 });
  }
});