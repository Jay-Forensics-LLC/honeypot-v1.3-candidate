import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { errorJson } from './helpers/http.ts';

/**
 * Endpoint Agent Heartbeat
 * Receives health data, network summary, and log summary from deployed agents
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Agent authentication via API key
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json({ error: 'Missing agent token' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    
    // Verify agent token
    const agents = await base44.asServiceRole.entities.EndpointAgent.filter({
      agent_id: token
    });

    if (!agents || agents.length === 0) {
      return Response.json({ error: 'Invalid agent token' }, { status: 401 });
    }

    const agent = agents[0];

    // Parse heartbeat data
    const data = await req.json();

    // Update agent with latest data
    await base44.asServiceRole.entities.EndpointAgent.update(agent.id, {
      last_heartbeat: new Date().toISOString(),
      status: 'online',
      health_metrics: {
        cpu_usage_percent: data.cpu_usage || 0,
        memory_usage_mb: data.memory_usage_mb || 0,
        disk_usage_percent: data.disk_usage || 0,
        network_rx_bytes: data.network_rx || 0,
        network_tx_bytes: data.network_tx || 0,
        uptime_seconds: data.uptime || 0,
        process_count: data.process_count || 0,
        last_updated: new Date().toISOString()
      },
      network_summary: {
        active_connections: data.network?.active_connections || 0,
        suspicious_connections: data.network?.suspicious_count || 0,
        total_traffic_mb: data.network?.total_mb || 0,
        dns_queries_count: data.network?.dns_queries || 0,
        blocked_connections: data.network?.blocked || 0,
        last_updated: new Date().toISOString()
      },
      log_summary: {
        error_count_24h: data.logs?.errors_24h || 0,
        warning_count_24h: data.logs?.warnings_24h || 0,
        security_events_24h: data.logs?.security_events_24h || 0,
        last_log_timestamp: data.logs?.last_timestamp || new Date().toISOString()
      },
      security_posture: {
        firewall_enabled: data.security?.firewall || false,
        antivirus_enabled: data.security?.antivirus || false,
        encryption_enabled: data.security?.encryption || false,
        auto_updates_enabled: data.security?.auto_updates || false,
        known_vulnerabilities: data.security?.vulnerabilities || 0,
        risk_score: calculateRiskScore(data)
      }
    });

    // Check for anomalies
    const anomalies = detectAnomalies(data, agent);
    
    if (anomalies.length > 0) {
      // Create alerts for significant anomalies
      for (const anomaly of anomalies.filter(a => a.severity === 'high' || a.severity === 'critical')) {
        await base44.asServiceRole.entities.Alert.create({
          alert_type: 'device_tampering',
          severity: anomaly.severity,
          title: `Agent Anomaly: ${anomaly.anomaly_type}`,
          description: anomaly.description,
          source: `Endpoint Agent - ${agent.hostname}`,
          detection_timestamp: new Date().toISOString(),
          status: 'new',
          affected_systems: [agent.hostname]
        });
      }

      // Update agent with anomalies
      await base44.asServiceRole.entities.EndpointAgent.update(agent.id, {
        anomalies_detected: [
          ...(agent.anomalies_detected || []),
          ...anomalies.map(a => ({
            anomaly_type: a.anomaly_type,
            severity: a.severity,
            description: a.description,
            detected_at: new Date().toISOString(),
            auto_resolved: false
          }))
        ].slice(-10) // Keep last 10 anomalies
      });
    }

    return Response.json({
      success: true,
      status: 'acknowledged',
      anomalies_detected: anomalies.length,
      next_heartbeat_seconds: agent.configuration?.reporting_interval_seconds || 300
    });
  } catch (error) {
    console.error('Agent heartbeat error:', error);
    return errorJson(500, 'Heartbeat processing failed');
  }
});

function calculateRiskScore(data) {
  let score = 0;
  
  if (data.cpu_usage > 90) score += 20;
  if (data.memory_usage_mb > 8000) score += 15;
  if (data.disk_usage > 90) score += 10;
  if (data.network?.suspicious_count > 0) score += 30;
  if (data.logs?.security_events_24h > 10) score += 25;
  if (!data.security?.firewall) score += 20;
  if (!data.security?.antivirus) score += 20;
  if (data.security?.vulnerabilities > 0) score += data.security.vulnerabilities * 5;
  
  return Math.min(100, score);
}

function detectAnomalies(data, agent) {
  const anomalies = [];
  
  // High CPU usage
  if (data.cpu_usage > 90) {
    anomalies.push({
      anomaly_type: 'high_cpu_usage',
      severity: 'medium',
      description: `CPU usage at ${data.cpu_usage}%`
    });
  }
  
  // Suspicious network activity
  if (data.network?.suspicious_count > 5) {
    anomalies.push({
      anomaly_type: 'suspicious_network_activity',
      severity: 'high',
      description: `${data.network.suspicious_count} suspicious connections detected`
    });
  }
  
  // Security events spike
  if (data.logs?.security_events_24h > 50) {
    anomalies.push({
      anomaly_type: 'security_event_spike',
      severity: 'high',
      description: `${data.logs.security_events_24h} security events in 24h`
    });
  }
  
  // Firewall disabled
  if (!data.security?.firewall) {
    anomalies.push({
      anomaly_type: 'firewall_disabled',
      severity: 'critical',
      description: 'System firewall is disabled'
    });
  }
  
  return anomalies;
}