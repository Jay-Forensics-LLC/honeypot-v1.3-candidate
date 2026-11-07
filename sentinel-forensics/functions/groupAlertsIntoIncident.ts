import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * AUTO-TRIAGE: Group related alerts into incidents
 * 
 * UPDATED: Now supports both manual (alertIds) and automatic triage (severity_threshold)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { alertIds, severity_threshold, time_window_hours, auto_enrich, auto_assign } = payload;

    let targetAlerts = [];

    // AUTOMATIC MODE: Find alerts by criteria
    if (!alertIds && severity_threshold) {
      const timeWindowMs = (time_window_hours || 24) * 60 * 60 * 1000;
      const cutoffTime = new Date(Date.now() - timeWindowMs);

      const severityFilter = severity_threshold === 'critical' 
        ? { severity: 'critical' }
        : { severity: { $in: ['critical', 'high'] } };

      const allAlerts = await base44.asServiceRole.entities.Alert.filter({
        status: 'new',
        ...severityFilter
      });

      // Filter by time window
      targetAlerts = allAlerts.filter(alert => 
        new Date(alert.detection_timestamp || alert.created_date) >= cutoffTime
      );

      if (targetAlerts.length === 0) {
        return Response.json({
          success: true,
          message: 'No alerts matching criteria found',
          alerts_grouped: 0,
          incidents_created: 0
        });
      }
    } 
    // MANUAL MODE: Use provided alert IDs
    else if (alertIds && alertIds.length > 0) {
      targetAlerts = await base44.asServiceRole.entities.Alert.filter({
        id: { $in: alertIds }
      });

      if (targetAlerts.length === 0) {
        return Response.json({ error: 'No valid alerts found' }, { status: 404 });
      }
    }
    else {
      return Response.json({ 
        error: 'Either alertIds or severity_threshold must be provided',
        example: {
          automatic: { severity_threshold: 'high', time_window_hours: 24 },
          manual: { alertIds: ['alert-1', 'alert-2'] }
        }
      }, { status: 400 });
    }

    // Group alerts by type/source
    const groupedAlerts = groupAlertsByCorrelation(targetAlerts);
    
    const incidents = [];

    for (const [groupKey, alerts] of Object.entries(groupedAlerts)) {
      if (alerts.length === 0) continue;

      const incidentType = inferIncidentType(alerts);
      const maxSeverity = getMaxSeverity(alerts);

      // Extract affected systems
      const affectedSystems = new Set();
      for (const alert of alerts) {
        if (alert.affected_systems) {
          alert.affected_systems.forEach(sys => affectedSystems.add(sys));
        }
      }

      // Create or find case
      let caseId = null;
      const caseNumber = `CASE-${Date.now().toString().slice(-8)}`;
      const newCase = await base44.asServiceRole.entities.Case.create({
        case_number: caseNumber,
        title: `${incidentType.replace(/_/g, ' ')} - ${new Date().toLocaleDateString()}`,
        description: `Auto-generated from ${alerts.length} grouped alerts`,
        case_type: mapIncidentTypeToCase(incidentType),
        priority: maxSeverity,
        status: 'active',
        assigned_investigator: user.email,
        start_date: new Date().toISOString().split('T')[0],
        tags: ['auto_generated', 'incident_response']
      });
      caseId = newCase.id;

      // Create incident
      const incidentNumber = `INC-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
      
      const incident = await base44.asServiceRole.entities.IncidentResponse.create({
        incident_id: `INCIDENT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        incident_number: incidentNumber,
        incident_type: incidentType,
        severity: maxSeverity,
        status: 'detected',
        detected_at: new Date().toISOString(),
        detected_by: user.email,
        title: `${incidentType.replace(/_/g, ' ')} - ${alerts.length} alerts`,
        description: `Auto-grouped incident:\n\n${alerts.map((a, i) => `${i + 1}. ${a.title} (${a.severity})`).join('\n')}`,
        case_id: caseId,
        related_alert_ids: alerts.map(a => a.id),
        affected_systems: Array.from(affectedSystems),
        assigned_to: auto_assign ? user.email : null,
        timeline: [{
          timestamp: new Date().toISOString(),
          event: 'Incident auto-created from alert triage',
          actor: user.email,
          details: `${alerts.length} alerts grouped`,
          automated: true
        }]
      });

      incidents.push(incident);

      // Update alerts
      for (const alert of alerts) {
        await base44.asServiceRole.entities.Alert.update(alert.id, {
          status: 'investigating',
          resolution_notes: `Grouped into incident ${incidentNumber}`
        });
      }

      // Auto-enrich if requested
      if (auto_enrich) {
        try {
          await base44.asServiceRole.functions.invoke('enrichIncidentThreatIntel', {
            incidentId: incident.incident_id
          });
        } catch (error) {
          console.warn('Auto-enrichment failed:', error);
        }
      }

      // Generate AI suggestions
      try {
        await base44.asServiceRole.functions.invoke('generateAIResponseSuggestions', {
          incidentId: incident.incident_id
        });
      } catch (error) {
        console.warn('AI suggestions failed:', error);
      }

      // Auto-trigger playbooks
      try {
        await base44.asServiceRole.functions.invoke('autoTriggerIncidentPlaybook', {
          incidentId: incident.incident_id
        });
      } catch (error) {
        console.warn('Playbook trigger failed:', error);
      }
    }

    // Create audit log
    await base44.asServiceRole.entities.AuditLog.create({
      event_type: 'auto_triage_completed',
      severity: 'info',
      description: `Auto-triage created ${incidents.length} incident(s) from ${targetAlerts.length} alerts`,
      user_id: user.email,
      timestamp: new Date().toISOString(),
      success: true,
      metadata: {
        incidents_created: incidents.length,
        alerts_grouped: targetAlerts.length
      }
    });

    return Response.json({
      success: true,
      incidents_created: incidents.length,
      alerts_grouped: targetAlerts.length,
      incident_ids: incidents.map(i => i.incident_id)
    });
  } catch (error) {
    console.error('Group alerts error:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});

function groupAlertsByCorrelation(alerts) {
  // Group by alert type and time proximity
  const groups = {};
  
  for (const alert of alerts) {
    const key = `${alert.alert_type}_${alert.severity}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(alert);
  }

  return groups;
}

function inferIncidentType(alerts) {
  const types = alerts.map(a => a.alert_type);
  
  if (types.some(t => t.includes('ransomware'))) return 'ransomware';
  if (types.some(t => t.includes('breach'))) return 'data_breach';
  if (types.some(t => t.includes('malware'))) return 'malware_outbreak';
  if (types.some(t => t.includes('network'))) return 'unauthorized_access';
  
  return 'unauthorized_access';
}

function getMaxSeverity(alerts) {
  const severityOrder = ['low', 'medium', 'high', 'critical'];
  let maxSeverity = 'low';
  
  for (const alert of alerts) {
    const alertSev = alert.severity || 'low';
    if (severityOrder.indexOf(alertSev) > severityOrder.indexOf(maxSeverity)) {
      maxSeverity = alertSev;
    }
  }
  
  return maxSeverity;
}

function mapIncidentTypeToCase(incidentType) {
  const mapping = {
    'ransomware': 'malware_analysis',
    'data_breach': 'data_breach',
    'malware_outbreak': 'malware_analysis',
    'unauthorized_access': 'network_intrusion',
    'ddos': 'network_intrusion',
    'insider_threat': 'network_intrusion'
  };
  
  return mapping[incidentType] || 'network_intrusion';
}