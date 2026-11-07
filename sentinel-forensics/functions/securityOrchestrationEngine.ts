import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { enforceRBAC } from './enforceRBAC.js';

Deno.serve(async (req) => {
  try {
    // Enforce admin-only access
    const { user, base44 } = await enforceRBAC(req, ['admin']);

    // Fetch all devices and their security posture
    const devices = await base44.entities.Device.filter({
      organization_id: user.organization_id
    });

    // Fetch threat intelligence
    const threatActors = await base44.entities.APTGroup.filter({}, '-last_updated', 10);

    // Fetch recent alerts
    const alerts = await base44.entities.Alert.filter({
      status: 'new'
    }, '-detection_timestamp', 50);

    // Analyze device security posture
    const criticalDevices = devices.filter(d => (d.anomaly_score || 0) >= 80);
    const vulnerableDevices = devices.filter(d => 
      d.security_profile?.known_vulnerabilities?.length > 0
    );

    // Build context for AI orchestration
    const securityContext = {
      total_devices: devices.length,
      critical_devices: criticalDevices.length,
      vulnerable_devices: vulnerableDevices.length,
      active_threats: threatActors.length,
      unresolved_alerts: alerts.length,
      device_summary: devices.map(d => ({
        id: d.id,
        name: d.display_name,
        anomaly_score: d.anomaly_score || 0,
        vulnerabilities: d.security_profile?.known_vulnerabilities?.length || 0,
        compliance_status: d.compliance_status
      }))
    };

    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt: `Analyze the security posture and recommend automated orchestration actions.

Security Context:
${JSON.stringify(securityContext, null, 2)}

Recent Alerts:
${alerts.slice(0, 5).map(a => `- ${a.title} (${a.severity})`).join('\n')}

Threat Intelligence:
${threatActors.slice(0, 3).map(t => `- ${t.group_name} (${t.threat_level})`).join('\n')}

Tasks:
1. Identify devices requiring immediate action
2. Recommend coordinated response actions
3. Suggest orchestration rules to prevent future incidents
4. Prioritize actions by risk level

Consider:
- Device criticality and business impact
- Threat actor TTPs
- Compliance requirements
- Automation feasibility`,
      response_json_schema: {
        type: "object",
        properties: {
          immediate_actions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                device_id: { type: "string" },
                action_type: { type: "string" },
                reason: { type: "string" },
                priority: { type: "number" }
              }
            }
          },
          suggested_orchestration_rules: {
            type: "array",
            items: {
              type: "object",
              properties: {
                rule_name: { type: "string" },
                trigger_conditions: { type: "object" },
                actions: { type: "array", items: { type: "string" } },
                rationale: { type: "string" }
              }
            }
          },
          overall_risk_assessment: {
            type: "string"
          },
          recommendations: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    });

    // Execute immediate high-priority actions
    const executedActions = [];
    for (const action of aiResponse.immediate_actions.slice(0, 5)) {
      if (action.priority >= 8) {
        try {
          await base44.functions.invoke('executeMDMAction', {
            device_id: action.device_id,
            action_type: action.action_type
          });
          executedActions.push(action);
        } catch (error) {
          console.error(`Failed to execute action on ${action.device_id}:`, error);
        }
      }
    }

    // Create audit log
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      event_type: 'security_orchestration_executed',
      severity: 'warning',
      description: `Security orchestration executed ${executedActions.length} actions`,
      user_id: 'system',
      action_performed: 'orchestration',
      timestamp: new Date().toISOString(),
      blockchain_hash: crypto.randomUUID(),
      metadata: {
        actions_executed: executedActions.length,
        devices_affected: executedActions.map(a => a.device_id)
      },
      success: true
    });

    return Response.json({
      success: true,
      actions_executed: executedActions.length,
      immediate_actions: aiResponse.immediate_actions,
      suggested_rules: aiResponse.suggested_orchestration_rules,
      risk_assessment: aiResponse.overall_risk_assessment,
      recommendations: aiResponse.recommendations
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});