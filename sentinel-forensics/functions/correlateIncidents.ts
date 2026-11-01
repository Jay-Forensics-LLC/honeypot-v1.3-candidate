import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { enforceRBAC } from './enforceRBAC.js';
import { validators } from './validateInput.js';

/**
 * Phase 2: APT Correlation Engine
 * Correlates alerts, threats, and device activities to identify coordinated attacks
 */
Deno.serve(async (req) => {
  try {
    const { user, base44 } = await enforceRBAC(req, ['admin', 'analyst']);

    const { time_window_hours = 24, min_correlation_score = 0.7 } = await req.json();

    // Fetch recent alerts and threats
    const cutoffTime = new Date(Date.now() - time_window_hours * 60 * 60 * 1000).toISOString();
    
    const [alerts, threats, devices] = await Promise.all([
      base44.entities.Alert.filter({
        organization_id: user.organization_id,
        detection_timestamp: { $gte: cutoffTime }
      }, '-detection_timestamp', 500),
      base44.entities.ThreatDetection.filter({
        organization_id: user.organization_id,
        detected_at: { $gte: cutoffTime }
      }, '-detected_at', 500),
      base44.entities.Device.filter({
        organization_id: user.organization_id
      })
    ]);

    // Correlation logic
    const correlations = [];
    const deviceMap = new Map(devices.map(d => [d.id, d]));

    // Group by device and time proximity
    const eventsByDevice = new Map();
    
    alerts.forEach(alert => {
      alert.affected_systems?.forEach(deviceId => {
        if (!eventsByDevice.has(deviceId)) {
          eventsByDevice.set(deviceId, []);
        }
        eventsByDevice.get(deviceId).push({
          type: 'alert',
          data: alert,
          timestamp: new Date(alert.detection_timestamp).getTime()
        });
      });
    });

    threats.forEach(threat => {
      if (threat.device_id && !eventsByDevice.has(threat.device_id)) {
        eventsByDevice.set(threat.device_id, []);
      }
      threat.device_id && eventsByDevice.get(threat.device_id).push({
        type: 'threat',
        data: threat,
        timestamp: new Date(threat.detected_at).getTime()
      });
    });

    // Detect temporal correlation (events within 1 hour of each other)
    for (const [deviceId, events] of eventsByDevice.entries()) {
      if (events.length < 2) continue;

      events.sort((a, b) => a.timestamp - b.timestamp);
      
      for (let i = 0; i < events.length - 1; i++) {
        for (let j = i + 1; j < events.length; j++) {
          const timeDiff = Math.abs(events[j].timestamp - events[i].timestamp);
          const hoursDiff = timeDiff / (1000 * 60 * 60);

          if (hoursDiff <= 1) {
            const score = Math.max(0.5, 1 - (hoursDiff / 2));
            
            if (score >= min_correlation_score) {
              correlations.push({
                device_id: deviceId,
                device_name: deviceMap.get(deviceId)?.display_name || 'Unknown',
                event1: events[i],
                event2: events[j],
                correlation_score: score,
                time_diff_minutes: Math.round(timeDiff / (1000 * 60)),
                correlation_type: 'temporal_proximity'
              });
            }
          }
        }
      }
    }

    // Create correlation incident if high-confidence correlations found
    if (correlations.length >= 3) {
      const incident = await base44.asServiceRole.entities.Case.create({
        organization_id: user.organization_id,
        case_number: `APT-${Date.now()}`,
        title: 'Potential APT Activity Detected',
        description: `Automated correlation detected ${correlations.length} related events suggesting coordinated attack activity`,
        severity: 'critical',
        status: 'open',
        case_type: 'apt_investigation',
        assigned_to: user.email,
        priority: 'urgent',
        metadata: {
          correlation_count: correlations.length,
          affected_devices: [...new Set(correlations.map(c => c.device_id))],
          auto_generated: true
        }
      });

      // Log to audit
      await base44.asServiceRole.entities.AuditLog.create({
        organization_id: user.organization_id,
        event_type: 'apt_correlation_detected',
        severity: 'critical',
        description: `APT correlation engine detected ${correlations.length} correlated events`,
        user_id: 'system',
        action_performed: 'create_apt_case',
        timestamp: new Date().toISOString(),
        blockchain_hash: crypto.randomUUID(),
        metadata: { case_id: incident.id, correlations },
        success: true
      });
    }

    return Response.json({
      success: true,
      correlations_found: correlations.length,
      high_confidence: correlations.filter(c => c.correlation_score >= 0.85).length,
      correlations: correlations.slice(0, 50) // Return top 50
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});