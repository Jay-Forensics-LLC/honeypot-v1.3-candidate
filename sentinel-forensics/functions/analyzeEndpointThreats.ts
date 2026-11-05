
import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * AI-powered endpoint threat analysis
 * Analyzes agent data to identify threats, anomalies, and suspicious patterns
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { agentId, analysisType = 'comprehensive' } = await req.json();

    // Get agent data
    const agents = await base44.asServiceRole.entities.EndpointAgent.filter({ 
      agent_id: agentId 
    });
    
    if (!agents || agents.length === 0) {
      return Response.json({ error: 'Agent not found' }, { status: 404 });
    }
    const agent = agents[0];

    // Build context for AI analysis
    const context = {
      hostname: agent.hostname,
      platform: agent.platform,
      health_metrics: agent.health_metrics,
      network_summary: agent.network_summary,
      log_summary: agent.log_summary,
      security_posture: agent.security_posture,
      anomalies_detected: agent.anomalies_detected || []
    };

    // Generate AI analysis
    const prompt = `You are a cybersecurity threat analyst. Analyze this endpoint agent data and identify potential threats, anomalies, or security issues.

Endpoint: ${context.hostname} (${context.platform})

Health Metrics:
- CPU: ${context.health_metrics?.cpu_usage_percent}%
- Memory: ${context.health_metrics?.memory_usage_mb} MB
- Disk: ${context.health_metrics?.disk_usage_percent}%
- Uptime: ${context.health_metrics?.uptime_seconds} seconds

Network Activity:
- Active Connections: ${context.network_summary?.active_connections}
- Suspicious: ${context.network_summary?.suspicious_connections}
- DNS Queries: ${context.network_summary?.dns_queries_count}
- Blocked: ${context.network_summary?.blocked_connections}

Security Posture:
- Firewall: ${context.security_posture?.firewall_enabled ? 'Enabled' : 'Disabled'}
- Antivirus: ${context.security_posture?.antivirus_enabled ? 'Enabled' : 'Disabled'}
- Encryption: ${context.security_posture?.encryption_enabled ? 'Enabled' : 'Disabled'}
- Known Vulnerabilities: ${context.security_posture?.known_vulnerabilities}
- Risk Score: ${context.security_posture?.risk_score}/100

Recent Anomalies: ${context.anomalies_detected.length}
${context.anomalies_detected.slice(0, 5).map(a => `- ${a.anomaly_type}: ${a.description}`).join('\n')}

Analyze this data and provide:
1. Threat assessment (is this device compromised or at risk?)
2. Identified threats or suspicious patterns
3. Recommended remediation actions
4. Hunting queries to investigate further
5. Overall risk classification

Provide response in JSON format.`;

    const response = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          threat_level: {
            type: 'string',
            enum: ['safe', 'low', 'medium', 'high', 'critical']
          },
          confidence_score: {
            type: 'number',
            description: '0-100'
          },
          identified_threats: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                threat_type: { type: 'string' },
                description: { type: 'string' },
                severity: { type: 'string' },
                evidence: { type: 'string' }
              }
            }
          },
          suspicious_patterns: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                pattern: { type: 'string' },
                indicator: { type: 'string' },
                risk_level: { type: 'string' }
              }
            }
          },
          remediation_actions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                action: { type: 'string' },
                priority: { type: 'string' },
                description: { type: 'string' }
              }
            }
          },
          hunting_queries: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                query_type: { type: 'string' },
                query: { type: 'string' },
                reasoning: { type: 'string' }
              }
            }
          },
          summary: {
            type: 'string'
          }
        }
      }
    });

    // Store analysis results
    await base44.asServiceRole.entities.EndpointAgent.update(agent.id, {
      ai_threat_analysis: {
        analyzed_at: new Date().toISOString(),
        threat_level: response.threat_level,
        confidence_score: response.confidence_score,
        summary: response.summary,
        identified_threats: response.identified_threats || [],
        hunting_queries: response.hunting_queries || []
      }
    });

    // Create alerts for high/critical threats
    if (response.threat_level === 'high' || response.threat_level === 'critical') {
      for (const threat of (response.identified_threats || []).slice(0, 3)) {
        await base44.asServiceRole.entities.Alert.create({
          alert_type: 'device_tampering',
          severity: threat.severity || response.threat_level,
          title: `Endpoint Threat: ${threat.threat_type}`,
          description: threat.description,
          source: `AI Analysis - ${agent.hostname}`,
          detection_timestamp: new Date().toISOString(),
          status: 'new',
          affected_systems: [agent.hostname]
        });
      }
    }

    // Create audit log
    await base44.asServiceRole.entities.AuditLog.create({
      event_type: 'ai_threat_analysis',
      severity: response.threat_level === 'critical' ? 'critical' : 'info',
      description: `AI threat analysis completed for ${agent.hostname}`,
      user_id: user.email,
      timestamp: new Date().toISOString(),
      success: true,
      metadata: {
        agent_id: agentId,
        threat_level: response.threat_level,
        threats_found: response.identified_threats?.length || 0
      }
    });

    return Response.json({
      success: true,
      analysis: response
    });
  } catch (error) {
    console.error('AI analysis error:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});
