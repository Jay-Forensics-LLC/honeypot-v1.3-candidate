import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * AI Alert Triage Engine
 * Automatically categorizes, prioritizes, and assigns alerts
 * with investigation recommendations
 */

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

    // Fetch alert details
    const alerts = await base44.entities.Alert.filter({ id: alert_id });
    const alert = alerts[0];

    if (!alert) {
      return Response.json({ error: 'Alert not found' }, { status: 404 });
    }

    // Fetch related context
    const [recentAlerts, users, automationRules] = await Promise.all([
      base44.entities.Alert.filter(
        { 
          organization_id: user.organization_id,
          alert_type: alert.alert_type 
        },
        '-detection_timestamp',
        10
      ),
      base44.asServiceRole.entities.User.list(),
      base44.entities.AutomationRule.filter({ 
        organization_id: user.organization_id,
        enabled: true 
      })
    ]);

    // Build AI context
    const context = {
      alert: {
        type: alert.alert_type,
        severity: alert.severity,
        title: alert.title,
        description: alert.description,
        source: alert.source,
        threat_score: alert.threat_score,
        affected_systems: alert.affected_systems,
        recommended_actions: alert.recommended_actions
      },
      historical: {
        similar_alerts_count: recentAlerts.length,
        recent_severity_trend: recentAlerts.map(a => a.severity)
      },
      team: {
        available_users: users.map(u => ({ 
          email: u.email, 
          role: u.role,
          full_name: u.full_name 
        })),
        automation_rules: automationRules.map(r => ({
          name: r.rule_name,
          type: r.rule_type,
          conditions: r.trigger_conditions
        }))
      }
    };

    // Call AI for comprehensive triage
    const triageResult = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a cybersecurity alert triage specialist. Analyze this alert and provide comprehensive triage:

ALERT DETAILS:
${JSON.stringify(context.alert, null, 2)}

HISTORICAL CONTEXT:
- Similar alerts in last 24h: ${context.historical.similar_alerts_count}
- Recent severity trend: ${context.historical.recent_severity_trend.join(', ')}

TEAM RESOURCES:
${context.team.available_users.length} team members available
${context.team.automation_rules.length} automation rules configured

PROVIDE:
1. Severity Assessment (critical/high/medium/low) with justification
2. Alert Category (apt_activity/insider_threat/malware/phishing/network_anomaly/data_breach/denial_of_service)
3. Confidence Score (0-100) in your assessment
4. Immediate Investigation Steps (prioritized list, 3-5 items)
5. Recommended Assignee (email from available users, or "security_team" if unclear)
6. Estimated Time to Investigate (in minutes)
7. Potential False Positive Indicators (list any red flags)
8. Related IOCs to Check (specific indicators)
9. Recommended Automation Rule (suggest if this should trigger automation)`,
      response_json_schema: {
        type: "object",
        properties: {
          severity_assessment: {
            type: "object",
            properties: {
              level: { type: "string", enum: ["critical", "high", "medium", "low"] },
              justification: { type: "string" }
            }
          },
          category: { 
            type: "string",
            enum: ["apt_activity", "insider_threat", "malware", "phishing", "network_anomaly", "data_breach", "denial_of_service", "unknown"]
          },
          confidence_score: { type: "number" },
          investigation_steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                priority: { type: "number" },
                action: { type: "string" },
                rationale: { type: "string" }
              }
            }
          },
          recommended_assignee: { type: "string" },
          estimated_time_minutes: { type: "number" },
          false_positive_indicators: {
            type: "array",
            items: { type: "string" }
          },
          related_iocs: {
            type: "array",
            items: { type: "string" }
          },
          automation_recommendation: { type: "string" }
        }
      }
    });

    // Update alert with triage results
    const updatedAlert = await base44.asServiceRole.entities.Alert.update(alert_id, {
      severity: triageResult.severity_assessment.level,
      recommended_actions: triageResult.investigation_steps.map(s => s.action),
      threat_score: triageResult.confidence_score,
      status: triageResult.confidence_score > 80 ? 'confirmed' : 'investigating'
    });

    // Auto-assign if confidence is high
    let assignmentResult = null;
    if (triageResult.confidence_score > 75 && triageResult.recommended_assignee !== 'security_team') {
      const assignee = users.find(u => u.email === triageResult.recommended_assignee);
      if (assignee) {
        // Send notification
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: assignee.email,
          subject: `[ALERT] ${alert.title} - Assigned to You`,
          body: `Alert ${alert_id} has been automatically assigned to you based on AI triage.

Severity: ${triageResult.severity_assessment.level}
Category: ${triageResult.category}
Confidence: ${triageResult.confidence_score}%

Immediate Actions:
${triageResult.investigation_steps.slice(0, 3).map((s, i) => `${i + 1}. ${s.action}`).join('\n')}

Estimated Time: ${triageResult.estimated_time_minutes} minutes

View alert: ${Deno.env.get('APP_URL')}/AlertManagement?alert=${alert_id}`
        });

        assignmentResult = { assigned_to: assignee.email, notified: true };
      }
    }

    // Create audit log
    await base44.asServiceRole.functions.invoke('createAuditLog', {
      event_type: 'alert_triaged',
      severity: 'info',
      description: `Alert ${alert_id} automatically triaged by AI`,
      resource_type: 'Alert',
      resource_id: alert_id,
      metadata: {
        category: triageResult.category,
        confidence: triageResult.confidence_score,
        severity: triageResult.severity_assessment.level,
        auto_assigned: !!assignmentResult
      }
    });

    return Response.json({
      success: true,
      alert_id,
      triage: triageResult,
      assignment: assignmentResult,
      updated_alert: updatedAlert
    });

  } catch (error) {
    console.error('AI Alert Triage Error:', error);
    return Response.json({ 
      error: 'Triage failed', 
      details: error.message 
    }, { status: 500 });
  }
});