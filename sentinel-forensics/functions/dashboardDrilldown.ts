/**
 * PHASE 6: Secure Dashboard Drilldown
 * 
 * Returns paginated row-level data for clicked chart segments.
 * Always org-scoped, RBAC enforced, prevents data leakage.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { requireAuth, requireOrg, safeJson, orgScopedFilter, sanitizeError } from './helpers/security.js';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await requireAuth(base44);
    const orgId = requireOrg(user);
    
    // Permission check based on entity type
    const entityPermissionMap = {
      'Alert': 'review.alerts.view',
      'ThreatDetection': 'review.alerts.view',
      'EvidenceV2': 'evidence.view',
      'MobileDevice': 'devices.view',
      'SecurityAuditLog': 'system.health.view'
    };
    
    const requiredPermission = entityPermissionMap[entity_type];
    if (requiredPermission) {
      await requirePermission(base44, user, requiredPermission);
    }
    
    const {
      entity_type,
      filters = {},
      page = 1,
      page_size = 50,
      sort_by,
      sort_order = 'desc'
    } = await safeJson(req);
    
    // Validate entity type (whitelist allowed entities)
    const allowedEntities = [
      'Alert',
      'ThreatDetection',
      'MobileDevice',
      'SecurityAuditLog',
      'EvidenceV2',
      'IncidentSession',
      'ControlPlaneIndicator',
      'ProactiveRiskAlert'
    ];
    
    if (!allowedEntities.includes(entity_type)) {
      return Response.json({ 
        error: 'Invalid Entity Type',
        detail: `Entity type '${entity_type}' not allowed for drilldown`,
        allowed_types: allowedEntities
      }, { status: 400 });
    }
    
    // Build org-scoped filter
    const query = orgScopedFilter(orgId, filters);
    
    // Pagination
    const skip = (page - 1) * page_size;
    const limit = Math.min(page_size, 100); // Max 100 per page
    
    // Fetch data
    const entity = base44.entities[entity_type];
    if (!entity) {
      return Response.json({ 
        error: 'Entity Not Found',
        detail: `Entity '${entity_type}' does not exist`
      }, { status: 404 });
    }
    
    // Get total count for pagination
    const allResults = await entity.filter(query);
    const total = allResults.length;
    
    // Sort results
    let sorted = allResults;
    if (sort_by) {
      sorted.sort((a, b) => {
        const aVal = a[sort_by];
        const bVal = b[sort_by];
        
        if (sort_order === 'asc') {
          return aVal > bVal ? 1 : -1;
        } else {
          return aVal < bVal ? 1 : -1;
        }
      });
    }
    
    // Paginate
    const results = sorted.slice(skip, skip + limit);
    
    // Sanitize results (remove sensitive fields)
    const sanitized = results.map(item => sanitizeRecord(item, entity_type));
    
    return Response.json({
      organization_id: orgId,
      entity_type,
      filters_applied: filters,
      pagination: {
        page,
        page_size: limit,
        total_records: total,
        total_pages: Math.ceil(total / limit),
        has_next: (page * limit) < total,
        has_prev: page > 1
      },
      sort: {
        field: sort_by,
        order: sort_order
      },
      results: sanitized,
      generated_at: new Date().toISOString()
    });
    
  } catch (error) {
    if (error instanceof Response) return error;
    
    console.error('[DASHBOARD-DRILLDOWN] Error:', error);
    return Response.json(sanitizeError(error), { status: 500 });
  }
});

/**
 * Sanitize records before returning to client
 * Removes internal fields, sensitive data
 */
function sanitizeRecord(record, entityType) {
  const sanitized = { ...record };
  
  // Remove internal metadata
  delete sanitized.created_by_id;
  delete sanitized.app_id;
  delete sanitized.is_sample;
  delete sanitized.is_deleted;
  delete sanitized.deleted_date;
  delete sanitized.environment;
  
  // Entity-specific sanitization
  if (entityType === 'SecurityAuditLog') {
    // Keep HMAC signature but remove raw signing key references
    if (sanitized.metadata?.signing_key) {
      delete sanitized.metadata.signing_key;
    }
  }
  
  if (entityType === 'MobileDevice') {
    // Remove sensitive device identifiers
    if (sanitized.device_identifier?.length > 10) {
      sanitized.device_identifier = sanitized.device_identifier.slice(0, 8) + '...';
    }
  }
  
  return sanitized;
}