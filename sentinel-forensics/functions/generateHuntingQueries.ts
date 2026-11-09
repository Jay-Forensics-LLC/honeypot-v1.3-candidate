
import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Generate AI-powered threat hunting queries
 * Based on current threat intel, incidents, and IOCs
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { context = 'general' } = await req.json();

    // Gather threat intelligence context
    const recentIncidents = await base44.asServiceRole.entities.IncidentResponse.filter(
      { status: { $in: ['detected', 'investigating', 'contained'] } },
      '-detected_at',
      5
    );

    const recentAlerts = await base44.asServiceRole.entities.Alert.filter(
      { status: 'open', severity: { $in: ['high', 'critical'] } },
      '-detection_timestamp',
      10
    );

    const aptGroups = await base44.asServiceRole.entities.APTGroup.filter(
      { activity_status: 'active' },
      '-last_updated',
      5
    );

    const highRiskIOCs = await base44.asServiceRole.entities.IOCIndicator.filter(
      { 
        threat_classification: { $in: ['malicious', 'critical'] },
        status: 'new'
      },
      '-last_seen',
      10
    );

    // Build context summary
    const contextSummary = {
      active_incidents: recentIncidents.map(i => ({
        type: i.incident_type,
        severity: i.severity,
        description: i.title
      })),
      critical_alerts: recentAlerts.map(a => ({
        type: a.alert_type,
        severity: a.severity,
        description: a.title
      })),
      active_apt_groups: aptGroups.map(apt => ({
        name: apt.group_name,
        ttps: apt.ttps,
        target_sectors: apt.target_sectors
      })),
      high_risk_iocs: highRiskIOCs.map(ioc => ({
        type: ioc.indicator_type,
        value: ioc.value,
        threat_score: ioc.aggregated_threat_score
      }))
    };

    // Generate hunting queries using AI
    const prompt = `You are a threat hunting expert. Based on the current security landscape, generate 10 proactive threat hunting queries to identify potential threats.

Current Security Context:
- Active Incidents: ${contextSummary.active_incidents.length}
${contextSummary.active_incidents.slice(0, 3).map(i => `  * ${i.type} (${i.severity}): ${i.description}`).join('\n')}

- Critical Alerts: ${contextSummary.critical_alerts.length}
${contextSummary.critical_alerts.slice(0, 3).map(a => `  * ${a.type}: ${a.description}`).join('\n')}

- Active APT Groups: ${contextSummary.active_apt_groups.length}
${contextSummary.active_apt_groups.slice(0, 3).map(apt => `  * ${apt.name}: ${apt.ttps?.initial_access?.join(', ') || 'Unknown TTPs'}`).join('\n')}

- High-Risk IOCs: ${contextSummary.high_risk_iocs.length}
${contextSummary.high_risk_iocs.slice(0, 5).map(ioc => `  * ${ioc.type}: ${ioc.value} (score: ${ioc.threat_score})`).join('\n')}

Generate hunting queries that:
1. Focus on current threat landscape
2. Target TTPs used by active APT groups
3. Look for IOC patterns in network/endpoint data
4. Identify persistence mechanisms
5. Detect lateral movement
6. Find data exfiltration attempts

Each query should include:
- query_name: Short descriptive name
- query_type: Type of hunt (network, endpoint, memory, logs)
- description: What we're hunting for
- query_logic: Specific search criteria or filter logic
- expected_findings: What might indicate compromise
- severity: low, medium, high, critical
- mitre_techniques: Related MITRE ATT&CK techniques

Return as JSON array of hunting queries.`;

    const response = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          queries: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                query_name: { type: 'string' },
                query_type: { type: 'string' },
                description: { type: 'string' },
                query_logic: { type: 'string' },
                expected_findings: { type: 'string' },
                severity: { type: 'string' },
                mitre_techniques: { type: 'array', items: { type: 'string' } }
              }
            }
          }
        }
      }
    });

    // Create audit log
    await base44.asServiceRole.entities.AuditLog.create({
      event_type: 'hunting_queries_generated',
      severity: 'info',
      description: `Generated ${response.queries?.length || 0} AI hunting queries`,
      user_id: user.email,
      timestamp: new Date().toISOString(),
      success: true,
      metadata: {
        query_count: response.queries?.length || 0,
        context_type: context
      }
    });

    return Response.json({
      success: true,
      queries: response.queries || [],
      context: contextSummary
    });
  } catch (error) {
    console.error('Query generation error:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});
