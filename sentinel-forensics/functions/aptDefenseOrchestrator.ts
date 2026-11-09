import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !user.organization_id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { auto_execute = false } = await req.json().catch(() => ({}));

    // PHASE 1: Gather current security state from all relevant entities
    console.log('📊 Gathering security data...');
    
    const [alerts, devices, threats, evidence, networkLogs] = await Promise.all([
      base44.entities.Alert.filter({ organization_id: user.organization_id }, '-detection_timestamp', 50).catch(() => []),
      base44.entities.Device.filter({ organization_id: user.organization_id }, '-created_date', 100).catch(() => []),
      base44.entities.ThreatDetection.filter({ organization_id: user.organization_id }, '-detection_timestamp', 50).catch(() => []),
      base44.entities.EvidenceV2.filter({ organization_id: user.organization_id }, '-collection_timestamp', 50).catch(() => []),
      base44.entities.NetworkLog.list('-timestamp', 100).catch(() => [])
    ]);

    // Build comprehensive security context
    const securityContext = {
      timestamp: new Date().toISOString(),
      organization_id: user.organization_id,
      alerts: {
        total: alerts.length,
        critical: alerts.filter(a => a.severity === 'critical').length,
        high: alerts.filter(a => a.severity === 'high').length,
        recent_types: alerts.slice(0, 10).map(a => ({ type: a.alert_type, severity: a.severity, timestamp: a.detection_timestamp }))
      },
      devices: {
        total: devices.length,
        compromised: devices.filter(d => d.risk_score > 80).length,
        suspicious: devices.filter(d => d.risk_score > 50 && d.risk_score <= 80).length
      },
      threats: {
        total: threats.length,
        active: threats.filter(t => t.status === 'active').length,
        severity_breakdown: {
          critical: threats.filter(t => t.severity === 'critical').length,
          high: threats.filter(t => t.severity === 'high').length
        }
      },
      evidence: {
        total: evidence.length,
        unverified: evidence.filter(e => !e.is_verified).length
      },
      network: {
        suspicious_connections: networkLogs.filter(l => l.is_suspicious).length,
        high_threat_score: networkLogs.filter(l => l.threat_score > 70).length
      }
    };

    // PHASE 2: Construct comprehensive AI prompt
    const aiPrompt = `You are Sentinel Forensics AI, an expert in cybersecurity, APT defense, and zero-click exploit mitigation. Analyze the current security state and provide actionable recommendations.

**CURRENT SECURITY STATE:**

**Alerts Summary:**
- Total Active Alerts: ${securityContext.alerts.total}
- Critical Alerts: ${securityContext.alerts.critical}
- High Severity Alerts: ${securityContext.alerts.high}
- Recent Alert Types: ${JSON.stringify(securityContext.alerts.recent_types)}

**Device Inventory:**
- Total Devices: ${securityContext.devices.total}
- Compromised (Risk Score > 80): ${securityContext.devices.compromised}
- Suspicious (Risk Score 50-80): ${securityContext.devices.suspicious}

**Threat Intelligence:**
- Total Threats: ${securityContext.threats.total}
- Active Threats: ${securityContext.threats.active}
- Critical Threats: ${securityContext.threats.severity_breakdown.critical}
- High Severity Threats: ${securityContext.threats.severity_breakdown.high}

**Evidence Status:**
- Total Evidence Items: ${securityContext.evidence.total}
- Unverified Evidence: ${securityContext.evidence.unverified}

**Network Activity:**
- Suspicious Network Connections: ${securityContext.network.suspicious_connections}
- High Threat Score Connections: ${securityContext.network.high_threat_score}

**YOUR MISSION:**

Analyze this security data and provide comprehensive recommendations across 20 APT defense categories:

1. **Mobile Threat Defense**: Assess mobile device risk
2. **Zero-Trust Microsegmentation**: Recommend network policy adjustments
3. **EDR Behavioral Analytics**: Identify process/file anomalies
4. **UBA/UEBA**: Flag user behavior deviations
5. **OS/App Hardening**: Prioritize vulnerability patching
6. **Supply Chain Security**: Assess SBOM risks
7. **Deception Technologies**: Honeypot engagement analysis
8. **Forensic Imaging**: Trigger automated collection if needed
9. **Threat Intelligence**: Correlate external IOCs
10. **Application Sandboxing**: Detect bypass attempts
11. **Secure Gateway**: Scan messaging platforms
12. **Network Traffic Analysis**: Identify C2 beaconing
13. **Vulnerability Management**: Re-prioritize patching
14. **Hardware Security**: Monitor trusted boot status
15. **Anti-Phishing**: Detect spearphishing attempts
16. **Immutable Infrastructure**: Detect configuration drift
17. **Dynamic Analysis**: Sandbox suspicious payloads
18. **Adaptive IAM/MFA**: Trigger additional authentication
19. **SOAR Playbooks**: Auto-execute incident response
20. **Red Team Findings**: Address identified gaps

For each category, provide specific, actionable recommendations. Focus on the highest-priority items that would provide immediate defensive value against APTs and zero-click exploits.

Calculate an overall threat score (0-100) where:
- 0-30: Low risk, normal operations
- 31-60: Elevated risk, increased monitoring
- 61-85: High risk, immediate action required
- 86-100: Critical risk, emergency response activated`;

    console.log('🤖 Invoking AI analysis...');

    // PHASE 3: Invoke AI for comprehensive analysis
    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt: aiPrompt,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {
          overall_threat_posture_assessment: { type: "string" },
          threat_score: { type: "number" },
          critical_alerts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                type: { type: "string" },
                severity: { type: "string" },
                description: { type: "string" },
                recommended_action: { type: "string" }
              }
            }
          },
          system_actions_recommended: {
            type: "array",
            items: {
              type: "object",
              properties: {
                action_type: { type: "string" },
                target: { type: "string" },
                parameters: { type: "object" },
                justification: { type: "string" }
              }
            }
          },
          updated_configurations_or_rules: {
            type: "array",
            items: {
              type: "object",
              properties: {
                component: { type: "string" },
                change_description: { type: "string" },
                new_config: { type: "object" }
              }
            }
          }
        }
      }
    });

    console.log('✅ AI analysis complete');

    // Add status to recommended actions
    const actionsWithStatus = (aiResponse.system_actions_recommended || []).map(action => ({
      ...action,
      status: auto_execute ? 'approved' : 'pending',
      executed_at: null,
      execution_result: null
    }));

    // PHASE 4: Store analysis results
    const analysisRecord = await base44.asServiceRole.entities.APTDefenseAnalysis.create({
      organization_id: user.organization_id,
      analysis_timestamp: new Date().toISOString(),
      overall_threat_posture: aiResponse.overall_threat_posture_assessment || 'Analysis completed',
      threat_score: aiResponse.threat_score || 0,
      critical_alerts: aiResponse.critical_alerts || [],
      system_actions_recommended: actionsWithStatus,
      updated_configurations: aiResponse.updated_configurations_or_rules || [],
      data_sources_analyzed: {
        alerts_count: alerts.length,
        devices_count: devices.length,
        threats_count: threats.length,
        evidence_count: evidence.length,
        network_logs_count: networkLogs.length
      },
      automation_status: auto_execute ? 'auto_approved' : 'manual_review',
      next_analysis_scheduled: new Date(Date.now() + 3600000).toISOString() // 1 hour from now
    });

    // PHASE 5: Auto-execute approved actions if enabled
    let executionResults = [];
    if (auto_execute && actionsWithStatus.length > 0) {
      console.log('⚡ Auto-executing approved actions...');
      
      for (const action of actionsWithStatus) {
        try {
          // Route to appropriate execution handler based on action_type
          const result = await executeAction(base44, action, user.organization_id);
          executionResults.push({ action_type: action.action_type, status: 'success', result });
        } catch (error) {
          console.error(`Failed to execute ${action.action_type}:`, error);
          executionResults.push({ action_type: action.action_type, status: 'failed', error: error.message });
        }
      }
    }

    return Response.json({
      success: true,
      analysis_id: analysisRecord.id,
      threat_score: aiResponse.threat_score || 0,
      overall_assessment: aiResponse.overall_threat_posture_assessment,
      critical_alerts: aiResponse.critical_alerts?.length || 0,
      actions_recommended: actionsWithStatus.length,
      actions_executed: executionResults.length,
      execution_results: executionResults,
      data_sources_analyzed: securityContext
    });

  } catch (error) {
    console.error('APT Defense Orchestrator Error:', error);
    return Response.json({ 
      error: 'Analysis failed', 
      details: error.message 
    }, { status: 500 });
  }
});

// Helper function to route and execute specific actions
async function executeAction(base44, action, organizationId) {
  const { action_type, target, parameters } = action;

  switch (action_type) {
    case 'isolate_device':
      // Create a containment action for the device
      return await base44.asServiceRole.entities.ContainmentAction.create({
        organization_id: organizationId,
        action_type: 'network_isolation',
        target_entity: 'device',
        target_id: target,
        status: 'executed',
        executed_at: new Date().toISOString(),
        automated: true
      });

    case 'trigger_forensic_capture':
      // Create a forensic image request
      return await base44.asServiceRole.entities.ForensicImage.create({
        organization_id: organizationId,
        device_id: target,
        image_type: 'memory_dump',
        acquisition_method: 'remote',
        metadata: { triggered_by: 'apt_defense_ai', ...parameters }
      });

    case 'update_firewall_rule':
      // Log the configuration change
      return await base44.asServiceRole.entities.SentinelAuditLog.create({
        organization_id: organizationId,
        action: 'firewall_rule_updated',
        entity_type: 'firewall',
        entity_id: target,
        details: { rule_change: parameters, automated: true }
      });

    case 'escalate_alert':
      // Create a high-priority notification
      return await base44.asServiceRole.entities.Notification.create({
        organization_id: organizationId,
        user_email: 'admin@sentinel.local', // Would be dynamic in production
        type: 'alert_critical',
        severity: 'critical',
        title: 'APT Defense: Critical Alert Escalation',
        message: `AI has escalated alert: ${target}. ${parameters.reason || 'Immediate review required.'}`,
        metadata: { source: 'apt_defense_ai', ...parameters }
      });

    case 'quarantine_evidence':
      // Mark evidence for isolation
      return await base44.asServiceRole.entities.EvidenceV2.update(target, {
        legal_hold: true,
        metadata: { ...parameters, quarantined_by: 'apt_defense_ai' }
      });

    default:
      // Log unhandled action type
      console.warn(`Unhandled action type: ${action_type}`);
      return { status: 'not_implemented', action_type };
  }
}