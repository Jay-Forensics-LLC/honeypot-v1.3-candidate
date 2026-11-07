import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { framework_id } = await req.json();

    // Fetch framework
    const frameworks = await base44.entities.ComplianceFramework.filter({
      id: framework_id,
      organization_id: user.organization_id
    });

    const framework = frameworks[0];
    if (!framework) {
      return Response.json({ error: 'Framework not found' }, { status: 404 });
    }

    // Gather compliance data
    const devices = await base44.entities.Device.filter({
      organization_id: user.organization_id
    });

    const assets = await base44.entities.Asset.filter({
      organization_id: user.organization_id
    });

    const auditLogs = await base44.entities.AuditLog.filter({
      organization_id: user.organization_id
    }, '-timestamp', 100);

    // Calculate device compliance metrics
    const deviceMetrics = {
      total: devices.length,
      compliant: devices.filter(d => d.compliance_status === 'compliant').length,
      non_compliant: devices.filter(d => d.compliance_status === 'non_compliant').length,
      encrypted: devices.filter(d => d.security_profile?.disk_encrypted).length,
      firewall_enabled: devices.filter(d => d.security_profile?.firewall_enabled).length,
      patched: devices.filter(d => d.security_profile?.os_patched).length,
      with_vulnerabilities: devices.filter(d => 
        d.security_profile?.known_vulnerabilities?.length > 0
      ).length
    };

    // Asset metrics
    const assetMetrics = {
      total: assets.length,
      active: assets.filter(a => a.status === 'active').length,
      tracked: assets.filter(a => a.lifecycle_history?.length > 0).length
    };

    // Audit metrics
    const auditMetrics = {
      total: auditLogs.length,
      critical_events: auditLogs.filter(l => l.severity === 'critical').length,
      failed_logins: auditLogs.filter(l => 
        l.event_type === 'user_login' && !l.success
      ).length
    };

    // Call AI for compliance assessment
    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt: `Generate a comprehensive compliance assessment report for ${framework.framework_name} (${framework.framework_type}).

Framework Controls:
${JSON.stringify(framework.controls, null, 2)}

Organization Data:
Device Security:
- Total Devices: ${deviceMetrics.total}
- Compliant: ${deviceMetrics.compliant}
- Non-compliant: ${deviceMetrics.non_compliant}
- Encrypted: ${deviceMetrics.encrypted}
- Firewall Enabled: ${deviceMetrics.firewall_enabled}
- OS Patched: ${deviceMetrics.patched}
- With Known Vulnerabilities: ${deviceMetrics.with_vulnerabilities}

Asset Management:
- Total Assets: ${assetMetrics.total}
- Active Assets: ${assetMetrics.active}
- Assets with Lifecycle Tracking: ${assetMetrics.tracked}

Audit & Logging:
- Total Audit Logs: ${auditMetrics.total}
- Critical Events: ${auditMetrics.critical_events}
- Failed Login Attempts: ${auditMetrics.failed_logins}

Tasks:
1. Assess compliance with each control in the framework
2. Identify gaps and non-compliance issues
3. Calculate overall compliance score (0-100)
4. Provide specific, actionable recommendations
5. Prioritize remediation by risk

Be specific about what is compliant and what needs improvement.`,
      response_json_schema: {
        type: "object",
        properties: {
          overall_score: {
            type: "number",
            description: "0-100 compliance score"
          },
          compliance_status: {
            type: "string",
            enum: ["compliant", "partially_compliant", "non_compliant"]
          },
          control_results: {
            type: "array",
            items: {
              type: "object",
              properties: {
                control_id: { type: "string" },
                control_name: { type: "string" },
                status: { 
                  type: "string",
                  enum: ["pass", "fail", "partial", "not_applicable"]
                },
                score: { type: "number" },
                findings: {
                  type: "array",
                  items: { type: "string" }
                }
              }
            }
          },
          gaps_identified: {
            type: "array",
            items: {
              type: "object",
              properties: {
                gap_description: { type: "string" },
                severity: {
                  type: "string",
                  enum: ["critical", "high", "medium", "low"]
                },
                affected_controls: {
                  type: "array",
                  items: { type: "string" }
                },
                remediation_suggestion: { type: "string" }
              }
            }
          },
          recommendations: {
            type: "array",
            items: { type: "string" }
          },
          summary: {
            type: "string",
            description: "Executive summary"
          }
        }
      }
    });

    // Create compliance report
    const report = await base44.asServiceRole.entities.ComplianceReport.create({
      organization_id: user.organization_id,
      framework_id: framework_id,
      framework_name: framework.framework_name,
      report_date: new Date().toISOString(),
      overall_score: aiResponse.overall_score,
      compliance_status: aiResponse.compliance_status,
      control_results: aiResponse.control_results,
      gaps_identified: aiResponse.gaps_identified,
      recommendations: aiResponse.recommendations,
      summary: aiResponse.summary,
      data_sources: {
        devices_analyzed: deviceMetrics.total,
        assets_analyzed: assetMetrics.total,
        audit_logs_analyzed: auditMetrics.total
      }
    });

    // Create audit log
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      event_type: 'compliance_report_generated',
      severity: 'info',
      description: `Compliance report generated for ${framework.framework_name}`,
      user_id: user.email,
      resource_type: 'ComplianceReport',
      resource_id: report.id,
      action_performed: 'generate_report',
      timestamp: new Date().toISOString(),
      blockchain_hash: crypto.randomUUID(),
      metadata: {
        framework_name: framework.framework_name,
        compliance_score: aiResponse.overall_score,
        gaps_found: aiResponse.gaps_identified.length
      },
      success: true
    });

    return Response.json({
      success: true,
      report_id: report.id,
      overall_score: aiResponse.overall_score,
      compliance_status: aiResponse.compliance_status,
      gaps_count: aiResponse.gaps_identified.length
    });

  } catch (error) {
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});