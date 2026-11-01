import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * SECURITY EVENT CORRELATION
 * Cross-references alerts, threats, and vulnerabilities for attack pattern detection
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch recent security events (last 24 hours)
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const [alerts, threats, vulnerabilities, deviceLogs] = await Promise.all([
      base44.entities.Alert.filter({
        organization_id: user.organization_id,
        status: 'new'
      }, '-detection_timestamp', 100),
      
      base44.entities.ZeroClickThreat.filter({
        organization_id: user.organization_id,
        status: 'active'
      }),
      
      base44.entities.VulnerabilityAssessment.filter({
        organization_id: user.organization_id
      }, '-risk_priority_score', 50),
      
      base44.entities.DeviceLog.filter({
        organization_id: user.organization_id,
        is_suspicious: true
      }, '-timestamp', 100)
    ]);

    const correlations = [];

    // Correlate by device_id
    const deviceIdMap = new Map();
    
    deviceLogs.forEach(log => {
      if (!deviceIdMap.has(log.device_id)) {
        deviceIdMap.set(log.device_id, { logs: [], threats: [], alerts: [] });
      }
      deviceIdMap.get(log.device_id).logs.push(log);
    });

    threats.forEach(threat => {
      if (deviceIdMap.has(threat.device_id)) {
        deviceIdMap.get(threat.device_id).threats.push(threat);
      }
    });

    alerts.forEach(alert => {
      alert.affected_systems?.forEach(device => {
        if (deviceIdMap.has(device)) {
          deviceIdMap.get(device).alerts.push(alert);
        }
      });
    });

    // Identify correlated attack patterns
    for (const [deviceId, events] of deviceIdMap.entries()) {
      if (events.threats.length > 0 && events.logs.length > 0) {
        const correlation = {
          pattern_type: 'zero_click_attack_chain',
          confidence: 0.9,
          device_id: deviceId,
          threat_count: events.threats.length,
          suspicious_logs: events.logs.length,
          alerts_triggered: events.alerts.length,
          severity: 'critical',
          description: `Correlated zero-click attack on device ${deviceId}`,
          recommended_actions: [
            'Immediate device isolation',
            'Full forensic capture',
            'Threat actor profiling',
            'Review all device connections'
          ]
        };

        correlations.push(correlation);

        // Create incident
        await base44.asServiceRole.entities.SecurityEvent.create({
          organization_id: user.organization_id,
          event_type: 'correlated_attack_pattern',
          severity: 'critical',
          device_id: deviceId,
          correlation_data: correlation,
          detection_timestamp: new Date().toISOString()
        });
      }
    }

    // Correlate vulnerabilities with active threats
    const aptCorrelations = vulnerabilities
      .filter(v => v.apt_relevance?.is_apt_targeted && (v.risk_priority_score || 0) >= 85)
      .map(v => ({
        pattern_type: 'apt_vulnerability_exploitation',
        confidence: 0.85,
        cve_id: v.cve_id,
        apt_groups: v.apt_relevance?.apt_groups || [],
        risk_score: v.risk_priority_score,
        severity: 'high',
        description: `Active APT-targeted vulnerability: ${v.cve_id}`,
        recommended_actions: [
          'Emergency patching',
          'Network isolation',
          'Enhanced monitoring'
        ]
      }));

    correlations.push(...aptCorrelations);

    // Log correlation analysis
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      user_email: 'system',
      action: 'security_event_correlation_completed',
      resource_type: 'security',
      severity: correlations.length > 0 ? 'high' : 'info',
      details: {
        events_analyzed: alerts.length + threats.length + deviceLogs.length,
        correlations_found: correlations.length
      }
    });

    return Response.json({
      success: true,
      analyzed: {
        alerts: alerts.length,
        threats: threats.length,
        vulnerabilities: vulnerabilities.length,
        device_logs: deviceLogs.length
      },
      correlations_found: correlations.length,
      correlations
    });

  } catch (error) {
    console.error('Security event correlation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});