/**
 * PHASE 6: Secure Dashboard Metrics Aggregation
 * 
 * Provides aggregated metrics for customizable dashboard without exposing raw data.
 * Always org-scoped, RBAC enforced, optimized for performance.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { requireAuth, requireOrg, safeJson, orgScopedFilter, sanitizeError } from './helpers/security.js';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await requireAuth(base44);
    const orgId = requireOrg(user);
    
    // Permission check
    await requirePermission(base44, user, 'dashboards.view');
    
    const {
      time_range = '7d',
      severity_filter,
      device_ids,
      case_ids,
      policy_ids
    } = await safeJson(req);
    
    // Calculate time window
    const now = new Date();
    const timeRangeMap = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000
    };
    
    const timeWindowMs = timeRangeMap[time_range] || timeRangeMap['7d'];
    const startTime = new Date(now.getTime() - timeWindowMs).toISOString();
    
    // Base filter (always org-scoped)
    const baseFilter = orgScopedFilter(orgId, {
      created_date: { $gte: startTime }
    });
    
    // Fetch aggregated data in parallel
    const [
      alerts,
      threats,
      devices,
      policies,
      evidenceItems,
      auditLogs
    ] = await Promise.all([
      // Active alerts
      base44.entities.Alert.filter({
        ...baseFilter,
        ...(severity_filter ? { severity: severity_filter } : {}),
        ...(device_ids ? { device_id: { $in: device_ids } } : {})
      }),
      
      // Threat detections
      base44.entities.ThreatDetection.filter({
        ...baseFilter,
        ...(case_ids ? { case_id: { $in: case_ids } } : {})
      }),
      
      // Device health
      base44.entities.MobileDevice.filter(orgScopedFilter(orgId)),
      
      // Policy compliance
      base44.entities.SecurityPolicy.filter({
        ...orgScopedFilter(orgId),
        ...(policy_ids ? { id: { $in: policy_ids } } : {})
      }),
      
      // Evidence integrity
      base44.entities.EvidenceV2.filter({
        ...baseFilter,
        ...(case_ids ? { case_id: { $in: case_ids } } : {})
      }),
      
      // Recent audit events
      base44.entities.SecurityAuditLog.filter(baseFilter)
    ]);
    
    // Aggregate metrics
    const metrics = {
      // Alert metrics
      alerts: {
        total: alerts.length,
        by_severity: aggregateBySeverity(alerts),
        critical_count: alerts.filter(a => a.severity === 'CRITICAL' || a.severity === 'critical').length,
        trend: calculateTrend(alerts, timeWindowMs)
      },
      
      // Threat metrics
      threats: {
        total: threats.length,
        active: threats.filter(t => t.status === 'ACTIVE' || t.status === 'OPEN').length,
        mitigated: threats.filter(t => t.status === 'MITIGATED' || t.status === 'RESOLVED').length,
        by_type: aggregateByType(threats)
      },
      
      // Device posture
      devices: {
        total: devices.length,
        compliant: devices.filter(d => d.policy_state?.compliance_summary?.compliance_percentage >= 90).length,
        non_compliant: devices.filter(d => d.policy_state?.compliance_summary?.compliance_percentage < 90).length,
        avg_compliance: calculateAvgCompliance(devices)
      },
      
      // Policy compliance
      policies: {
        total: policies.length,
        active: policies.filter(p => p.is_enabled && p.status === 'PUBLISHED').length,
        draft: policies.filter(p => p.status === 'DRAFT').length
      },
      
      // Evidence integrity
      evidence: {
        total: evidenceItems.length,
        locked: evidenceItems.filter(e => e.is_locked).length,
        integrity_verified: evidenceItems.filter(e => e.sha256_hash).length,
        total_size_mb: Math.round(evidenceItems.reduce((sum, e) => sum + (e.size || 0), 0) / (1024 * 1024))
      },
      
      // Audit activity
      audit: {
        total_events: auditLogs.length,
        by_severity: aggregateBySeverity(auditLogs),
        failed_actions: auditLogs.filter(a => !a.success).length,
        unique_actors: new Set(auditLogs.map(a => a.actor_email)).size
      },
      
      // Time series data (last 24 hours in hourly buckets)
      timeseries: generateTimeseries(alerts, threats, auditLogs, 24)
    };
    
    return Response.json({
      organization_id: orgId,
      time_range,
      generated_at: now.toISOString(),
      filters_applied: {
        severity_filter,
        device_ids: device_ids?.length || 0,
        case_ids: case_ids?.length || 0,
        policy_ids: policy_ids?.length || 0
      },
      metrics
    });
    
  } catch (error) {
    if (error instanceof Response) return error;
    
    console.error('[DASHBOARD-METRICS] Error:', error);
    return Response.json(sanitizeError(error), { status: 500 });
  }
});

// Helper functions for aggregation
function aggregateBySeverity(items) {
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  items.forEach(item => {
    const sev = (item.severity || 'INFO').toUpperCase();
    if (counts[sev] !== undefined) counts[sev]++;
  });
  return counts;
}

function aggregateByType(items) {
  const counts = {};
  items.forEach(item => {
    const type = item.threat_type || item.indicator_type || 'UNKNOWN';
    counts[type] = (counts[type] || 0) + 1;
  });
  return counts;
}

function calculateTrend(items, timeWindowMs) {
  const halfwayPoint = Date.now() - (timeWindowMs / 2);
  const firstHalf = items.filter(i => new Date(i.created_date).getTime() < halfwayPoint).length;
  const secondHalf = items.length - firstHalf;
  
  if (firstHalf === 0) return secondHalf > 0 ? 100 : 0;
  return Math.round(((secondHalf - firstHalf) / firstHalf) * 100);
}

function calculateAvgCompliance(devices) {
  if (devices.length === 0) return 0;
  const sum = devices.reduce((acc, d) => 
    acc + (d.policy_state?.compliance_summary?.compliance_percentage || 0), 0);
  return Math.round(sum / devices.length);
}

function generateTimeseries(alerts, threats, auditLogs, hours) {
  const buckets = [];
  const now = Date.now();
  
  for (let i = hours - 1; i >= 0; i--) {
    const bucketStart = now - (i * 60 * 60 * 1000);
    const bucketEnd = bucketStart + (60 * 60 * 1000);
    
    buckets.push({
      timestamp: new Date(bucketStart).toISOString(),
      alerts: alerts.filter(a => {
        const t = new Date(a.created_date).getTime();
        return t >= bucketStart && t < bucketEnd;
      }).length,
      threats: threats.filter(t => {
        const time = new Date(t.created_date).getTime();
        return time >= bucketStart && time < bucketEnd;
      }).length,
      audit_events: auditLogs.filter(l => {
        const t = new Date(l.created_date).getTime();
        return t >= bucketStart && t < bucketEnd;
      }).length
    });
  }
  
  return buckets;
}