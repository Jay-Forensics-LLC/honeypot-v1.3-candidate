import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { alert_id } = await req.json();

    if (!alert_id) {
      return Response.json({ error: 'alert_id required' }, { status: 400 });
    }

    // SECURITY FIX: Validate organization access before processing
    const alerts = await base44.entities.Alert.filter(
      { id: alert_id, organization_id: user.organization_id },
      '-detection_timestamp',
      1
    );

    if (!alerts || alerts.length === 0) {
      // Log unauthorized access attempt
      await base44.asServiceRole.entities.AuditLog.create({
        organization_id: user.organization_id,
        user_email: user.email,
        action: 'unauthorized_alert_access',
        resource_type: 'alert',
        resource_id: alert_id,
        severity: 'critical',
        details: { attempted_action: 'ai_triage' }
      }).catch(() => {});
      
      return Response.json({ error: 'Alert not found or access denied' }, { status: 404 });
    }

    const alert = alerts[0];

    // Fetch related alerts for correlation (use user context for proper RLS)
    const recentAlerts = await base44.entities.Alert.filter(
      { 
        organization_id: user.organization_id,
        detection_timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }
      },
      '-detection_timestamp',
      100
    );

    // Fetch available playbooks (use user context)
    const playbooks = await base44.entities.AutomatedPlaybook.filter(
      { organization_id: user.organization_id, enabled: true },
      '-created_date',
      50
    );

    // Build AI prompt
    const prompt = `You are an expert security analyst performing alert triage. Analyze this alert and provide structured recommendations.

ALERT DETAILS:
- Type: ${alert.alert_type}
- Severity: ${alert.severity}
- Title: ${alert.title}
- Description: ${alert.description}
- Source: ${alert.source}
- Threat Score: ${alert.threat_score || 'N/A'}
- Affected Systems: ${alert.affected_systems?.join(', ') || 'Unknown'}

RECENT ALERT CONTEXT (last 24h):
${recentAlerts.slice(0, 10).map(a => `- ${a.alert_type} (${a.severity}): ${a.title}`).join('\n')}

AVAILABLE PLAYBOOKS:
${playbooks.map(p => `- ${p.name}: Triggers on ${p.trigger?.type}, conditions: ${JSON.stringify(p.trigger?.conditions || {})}`).join('\n')}

Provide a comprehensive triage analysis with:
1. Urgency assessment (critical/high/medium/low)
2. Whether this requires immediate human intervention
3. Correlation with other recent alerts (pattern detection)
4. Recommended playbook(s) from the available list with confidence score
5. Suggested investigation steps
6. Estimated time to respond
7. Potential false positive indicators`;

    const response = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          urgency: {
            type: 'string',
            enum: ['critical', 'high', 'medium', 'low']
          },
          requires_human_intervention: {
            type: 'boolean'
          },
          intervention_reason: {
            type: 'string'
          },
          correlation_analysis: {
            type: 'object',
            properties: {
              pattern_detected: {
                type: 'boolean'
              },
              related_alerts: {
                type: 'array',
                items: { type: 'string' }
              },
              attack_stage: {
                type: 'string'
              },
              confidence: {
                type: 'number'
              }
            }
          },
          recommended_playbooks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                playbook_name: { type: 'string' },
                confidence: { type: 'number' },
                reasoning: { type: 'string' }
              }
            }
          },
          investigation_steps: {
            type: 'array',
            items: { type: 'string' }
          },
          estimated_mttr_minutes: {
            type: 'number'
          },
          false_positive_indicators: {
            type: 'array',
            items: { type: 'string' }
          },
          summary: {
            type: 'string'
          }
        },
        required: ['urgency', 'requires_human_intervention', 'summary']
      }
    });

    // Auto-trigger playbook if high confidence and doesn't require human intervention
    let auto_triggered = null;
    if (!response.requires_human_intervention && response.recommended_playbooks?.length > 0) {
      const topRecommendation = response.recommended_playbooks[0];
      if (topRecommendation.confidence > 0.85) {
        const matchedPlaybook = playbooks.find(p => 
          p.name.toLowerCase() === topRecommendation.playbook_name.toLowerCase()
        );
        
        if (matchedPlaybook) {
          try {
            const execution = await base44.functions.invoke('executePlaybook', {
              playbook_id: matchedPlaybook.id,
              trigger_source: alert_id,
              context: {
                alert_id,
                severity: alert.severity,
                alert_type: alert.alert_type,
                trigger_type: 'ai_auto_triage'
              }
            });
            auto_triggered = {
              playbook_id: matchedPlaybook.id,
              playbook_name: matchedPlaybook.name,
              execution_id: execution.execution_id
            };
          } catch (error) {
            console.error('Auto-trigger failed:', error);
          }
        }
      }
    }

    // Update alert with triage results
    await base44.asServiceRole.entities.Alert.update(alert_id, {
      status: response.requires_human_intervention ? 'investigating' : 'new',
      recommended_actions: response.investigation_steps || []
    });

    return Response.json({
      success: true,
      triage: response,
      auto_triggered,
      alert_id
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});