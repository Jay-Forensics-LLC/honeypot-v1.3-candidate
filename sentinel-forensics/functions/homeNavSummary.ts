/**
 * PHASE 6: Home Navigation Summary
 * Single endpoint for Home page navigation data
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { requireAuth, requireOrg, sanitizeError } from './helpers/security.js';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await requireAuth(base44);
    const orgId = requireOrg(user);
    
    const url = new URL(req.url);
    const timeRange = url.searchParams.get('timeRange') || '7d';
    const limitRecents = parseInt(url.searchParams.get('limitRecents') || '10');
    
    // Calculate time range
    const now = new Date();
    const rangeHours = timeRange === '24h' ? 24 : timeRange === '7d' ? 168 : 720;
    const rangeStart = new Date(now.getTime() - rangeHours * 60 * 60 * 1000).toISOString();
    
    // Permission checks
    const canViewDashboards = true; // All authenticated users
    const canReviewAlerts = user.role === 'admin' || user.role === 'analyst';
    const canReviewEvidence = user.role === 'admin' || user.role === 'analyst';
    const canViewCompliance = user.role === 'admin';
    
    // Fetch dashboards (lightweight)
    let dashboardsData = {
      defaultLayout: null,
      recentLayouts: [],
      templateLinks: [
        { key: 'executive', label: 'Executive Dashboard' },
        { key: 'soc', label: 'SOC Operations' },
        { key: 'forensics', label: 'Forensics Analysis' },
        { key: 'compliance', label: 'Compliance Overview' }
      ]
    };
    
    if (canViewDashboards) {
      try {
        const layouts = await base44.entities.DashboardLayout.filter({
          organization_id: orgId,
          owner_user_id: user.email
        });
        
        const defaultLayout = layouts.find(l => l.is_default);
        if (defaultLayout) {
          dashboardsData.defaultLayout = {
            id: defaultLayout.id,
            name: defaultLayout.name,
            updated_date: defaultLayout.updated_date
          };
        }
        
        dashboardsData.recentLayouts = layouts
          .sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date))
          .slice(0, 5)
          .map(l => ({
            id: l.id,
            name: l.name,
            updated_date: l.updated_date
          }));
      } catch (err) {
        console.warn('Failed to fetch dashboard layouts:', err);
      }
    }
    
    // Telemetry health tracking
    const telemetry = {
      lastAlertIngestAt: null,
      lastThreatIntelIngestAt: null,
      lastEvidenceUploadAt: null,
      lastAgentHeartbeatAt: null,
      lastJobSuccessAt: null,
      dataFreshness: 'unknown'
    };
    
    // Fetch review queue counts
    const reviewQueues = {
      criticalAlertsCount: 0,
      untriagedAlertsCount: 0,
      evidencePendingReviewCount: 0,
      complianceExceptionsCount: 0,
      quarantineItemsCount: 0,
      riskyDevicesCount: 0
    };
    
    if (canReviewAlerts) {
      try {
        const alerts = await base44.asServiceRole.entities.Alert.filter({
          organization_id: orgId,
          status: 'open'
        });
        reviewQueues.criticalAlertsCount = alerts.filter(a => a.severity === 'CRITICAL').length;
        reviewQueues.untriagedAlertsCount = alerts.filter(a => !a.reviewed_by).length;
      } catch (err) {
        console.warn('Failed to fetch alerts:', err);
      }
    }
    
    if (canReviewEvidence) {
      try {
        const evidence = await base44.asServiceRole.entities.EvidenceV2.filter({
          organization_id: orgId
        });
        reviewQueues.evidencePendingReviewCount = evidence.filter(
          e => e.metadata?.status === 'pending_review'
        ).length;
      } catch (err) {
        console.warn('Failed to fetch evidence:', err);
      }
    }
    
    if (canViewCompliance) {
      try {
        const devices = await base44.asServiceRole.entities.MobileDevice.filter({
          organization_id: orgId
        });
        reviewQueues.complianceExceptionsCount = devices.filter(
          d => d.policy_state?.compliance_summary?.compliance_percentage < 80
        ).length;
        reviewQueues.riskyDevicesCount = devices.filter(
          d => d.policy_state?.compliance_summary?.compliance_percentage < 50
        ).length;
      } catch (err) {
        console.warn('Failed to fetch devices:', err);
      }
      
      try {
        const quarantine = await base44.asServiceRole.entities.QuarantineItem.filter({
          organization_id: orgId,
          status: 'quarantined'
        });
        reviewQueues.quarantineItemsCount = quarantine.length;
      } catch (err) {
        console.warn('Failed to fetch quarantine items:', err);
      }
    }
    
    // Fetch recent items
    const recents = [];
    
    // Recent cases
    try {
      const cases = await base44.asServiceRole.entities.Case.filter({
        organization_id: orgId
      });
      const recentCases = cases
        .sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date))
        .slice(0, 3);
      
      recents.push(...recentCases.map(c => ({
        type: 'case',
        id: c.id,
        title: c.case_name || c.id,
        subtitle: c.status,
        updated_date: c.updated_date
      })));
    } catch (err) {
      console.warn('Failed to fetch recent cases:', err);
    }
    
    // Recent evidence (if permitted)
    if (canReviewEvidence) {
      try {
        const evidence = await base44.asServiceRole.entities.EvidenceV2.filter({
          organization_id: orgId
        });
        const recentEvidence = evidence
          .sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date))
          .slice(0, 3);
        
        recents.push(...recentEvidence.map(e => ({
          type: 'evidence',
          id: e.id,
          title: e.artifact_name || e.id,
          subtitle: e.artifact_type,
          updated_date: e.updated_date
        })));
      } catch (err) {
        console.warn('Failed to fetch recent evidence:', err);
      }
    }
    
    // Check telemetry health
    try {
      // Last alert ingest
      const recentAlerts = await base44.asServiceRole.entities.Alert.filter({
        organization_id: orgId
      });
      if (recentAlerts.length > 0) {
        const sorted = recentAlerts.sort((a, b) => 
          new Date(b.created_date) - new Date(a.created_date)
        );
        telemetry.lastAlertIngestAt = sorted[0].created_date;
      }
      
      // Last threat intel ingest
      const recentIntel = await base44.asServiceRole.entities.IntelIngestRun.filter({
        organization_id: orgId
      });
      if (recentIntel.length > 0) {
        const sorted = recentIntel.sort((a, b) => 
          new Date(b.created_date) - new Date(a.created_date)
        );
        telemetry.lastThreatIntelIngestAt = sorted[0].created_date;
      }
      
      // Last evidence upload
      const recentEvidence = await base44.asServiceRole.entities.EvidenceV2.filter({
        organization_id: orgId
      });
      if (recentEvidence.length > 0) {
        const sorted = recentEvidence.sort((a, b) => 
          new Date(b.created_date) - new Date(a.created_date)
        );
        telemetry.lastEvidenceUploadAt = sorted[0].created_date;
      }
      
      // Last agent heartbeat
      const recentAgents = await base44.asServiceRole.entities.AgentSession.filter({
        organization_id: orgId
      });
      if (recentAgents.length > 0) {
        const sorted = recentAgents.sort((a, b) => 
          new Date(b.updated_date) - new Date(a.updated_date)
        );
        telemetry.lastAgentHeartbeatAt = sorted[0].updated_date;
      }
      
      // Calculate freshness
      const thresholds = {
        alert: 60 * 60 * 1000, // 60 minutes
        agent: 15 * 60 * 1000, // 15 minutes
        evidence: 24 * 60 * 60 * 1000 // 24 hours
      };
      
      const isStale = (timestamp, threshold) => {
        if (!timestamp) return true;
        return (now - new Date(timestamp)) > threshold;
      };
      
      const hasAnyData = telemetry.lastAlertIngestAt || 
                         telemetry.lastThreatIntelIngestAt ||
                         telemetry.lastEvidenceUploadAt ||
                         telemetry.lastAgentHeartbeatAt;
      
      if (!hasAnyData) {
        telemetry.dataFreshness = 'unknown';
      } else if (
        (telemetry.lastAlertIngestAt && isStale(telemetry.lastAlertIngestAt, thresholds.alert)) ||
        (telemetry.lastAgentHeartbeatAt && isStale(telemetry.lastAgentHeartbeatAt, thresholds.agent))
      ) {
        telemetry.dataFreshness = 'stale';
      } else {
        telemetry.dataFreshness = 'healthy';
      }
      
    } catch (err) {
      console.warn('Failed to calculate telemetry health:', err);
      telemetry.dataFreshness = 'unknown';
    }
    
    // Sort all recents and limit
    recents.sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date));
    const limitedRecents = recents.slice(0, limitRecents);
    
    return Response.json({
      responseVersion: '1.0',
      organization_id: orgId,
      dashboards: dashboardsData,
      reviewQueues,
      telemetry,
      recents: limitedRecents,
      permissions: {
        canViewDashboards,
        canReviewAlerts,
        canReviewEvidence,
        canViewCompliance
      }
    });
    
  } catch (error) {
    if (error instanceof Response) return error;
    
    console.error('[HOME-NAV] Error:', error);
    return Response.json(sanitizeError(error), { status: 500 });
  }
});