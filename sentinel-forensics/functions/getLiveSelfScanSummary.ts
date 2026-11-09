/**
 * Get Live Self-Scan Summary
 * Returns aggregated security posture metrics from Finding records
 * 
 * Permissions: dashboards.view OR system.health.view
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { requireAuth, requireOrg, sanitizeError } from './helpers/security.js';

async function readJson(req: Request) {
  const text = await req.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'string') return JSON.parse(parsed);
    return parsed ?? {};
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await requireAuth(base44);
    const orgId = requireOrg(user);

    await readJson(req);

    const findings = await base44.asServiceRole.entities.Finding.filter({
      organization_id: orgId,
      status: 'open'
    });

    const agentEvents = await base44.asServiceRole.entities.AgentEvent.filter({
      organization_id: orgId
    });

    const inventories = await base44.asServiceRole.entities.SoftwareInventory.filter({
      organization_id: orgId
    });

    const devices = await base44.asServiceRole.entities.Device.filter({
      organization_id: orgId
    });

    const vulnerabilities = findings.filter(f => f.finding_type === 'vulnerability');
    const anomalies = findings.filter(f => f.finding_type === 'behavioral_anomaly');
    const networkThreats = findings.filter(f => f.finding_type === 'network_threat');

    const criticalCount = findings.filter(f => f.severity === 'CRITICAL').length;
    const highCount = findings.filter(f => f.severity === 'HIGH').length;
    const mediumCount = findings.filter(f => f.severity === 'MEDIUM').length;

    const topFindings = findings
      .slice()
      .sort((a, b) => {
        const severityOrder: any = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
        return (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99);
      })
      .slice(0, 5);

    const hasLiveTelemetry = agentEvents.length > 0;

    const lastEventTime = agentEvents.length > 0
      ? Math.max(...agentEvents.map(e => new Date(e.ingest_time).getTime()))
      : null;

    return Response.json({
      summary: {
        total_findings: findings.length,
        vulnerabilities: vulnerabilities.length,
        behavioral_anomalies: anomalies.length,
        network_threats: networkThreats.length,
        critical_count: criticalCount,
        high_count: highCount,
        medium_count: mediumCount
      },
      data_sources: {
        agent_telemetry: {
          connected: hasLiveTelemetry,
          event_count: agentEvents.length,
          last_event: lastEventTime ? new Date(lastEventTime).toISOString() : null
        },
        software_inventory: {
          connected: inventories.length > 0,
          device_count: inventories.length
        },
        devices: {
          total: devices.length,
          reporting: new Set(agentEvents.map(e => e.device_id)).size
        }
      },
      top_findings: topFindings.map(f => ({
        id: f.id,
        type: f.finding_type,
        severity: f.severity,
        title: f.title,
        device_id: f.device_id,
        details_json: f.details_json,
        provenance_json: f.provenance_json,
        evidence_links_json: f.evidence_links_json,
        created_at: f.created_date
      })),
      is_simulation: !hasLiveTelemetry,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    if (error instanceof Response) return error;
    console.error('[SELF-SCAN-SUMMARY] Error:', error);
    return Response.json(sanitizeError(error), { status: 500 });
  }
});