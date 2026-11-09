/**
 * Self-Scan Drilldown
 * Returns paginated detailed findings with evidence links
 * 
 * Permissions: review.*.view, evidence.view, devices.view (depending on type)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { requireAuth, requireOrg, sanitizeError } from './helpers/security.js';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await requireAuth(base44);
    const orgId = requireOrg(user);
    
    const url = new URL(req.url);
    const findingType = url.searchParams.get('type'); // vulnerability, behavioral_anomaly, network_threat
    const deviceId = url.searchParams.get('device_id');
    const severity = url.searchParams.get('severity');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    
    // Build filter
    const filter: any = {
      organization_id: orgId,
      status: 'open'
    };
    
    if (findingType) filter.finding_type = findingType;
    if (deviceId) filter.device_id = deviceId;
    if (severity) filter.severity = severity;
    
    // Get findings
    const allFindings = await base44.asServiceRole.entities.Finding.filter(filter);
    
    // Sort by severity and date
    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
    allFindings.sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.created_date).getTime() - new Date(a.created_date).getTime();
    });
    
    // Paginate
    const paginatedFindings = allFindings.slice(offset, offset + limit);
    
    // Enrich with device info
    const deviceIds = [...new Set(paginatedFindings.map(f => f.device_id).filter(Boolean))];
    const devices = await base44.asServiceRole.entities.Device.filter({
      organization_id: orgId
    });
    const deviceMap = new Map(devices.map(d => [d.id, d]));
    
    const enrichedFindings = paginatedFindings.map(finding => ({
      ...finding,
      device: finding.device_id ? deviceMap.get(finding.device_id) : null
    }));
    
    return Response.json({
      findings: enrichedFindings,
      pagination: {
        total: allFindings.length,
        limit,
        offset,
        has_more: offset + limit < allFindings.length
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    if (error instanceof Response) return error;
    
    console.error('[SELF-SCAN-DRILLDOWN] Error:', error);
    return Response.json(sanitizeError(error), { status: 500 });
  }
});