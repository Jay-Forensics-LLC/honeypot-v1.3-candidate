import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * AI-POWERED COMPLIANCE ANALYSIS
 * Aggregates compliance across devices/assets and analyzes against industry standards
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !user.organization_id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all devices and assets
    const [devices, assets, vulnerabilities] = await Promise.allSettled([
      base44.entities.Device.filter({ organization_id: user.organization_id }, '-last_seen_at', 500),
      base44.entities.Asset.filter({ organization_id: user.organization_id }, '-created_date', 500),
      base44.entities.VulnerabilityAssessment.filter({ organization_id: user.organization_id }, '-detection_date', 200)
    ]);

    const deviceList = devices.status === 'fulfilled' ? devices.value : [];
    const assetList = assets.status === 'fulfilled' ? assets.value : [];
    const vulnList = vulnerabilities.status === 'fulfilled' ? vulnerabilities.value : [];

    // Calculate baseline metrics
    const totalDevices = deviceList.length;
    const compliantDevices = deviceList.filter(d => d.compliance_status === 'compliant').length;
    const totalAssets = assetList.length;
    const activeAssets = assetList.filter(a => a.status === 'active').length;
    const criticalVulns = vulnList.filter(v => v.severity === 'critical').length;

    const prompt = `You are a forensic compliance analyst. Analyze organizational compliance against industry standards.

DEVICES (${totalDevices}):
${deviceList.slice(0, 30).map(d => `- ${d.device_id}: ${d.platform}, compliance=${d.compliance_status}, encrypted=${d.security_profile?.disk_encrypted}, firewall=${d.security_profile?.firewall_enabled}, patched=${d.security_profile?.os_patched}`).join('\n')}

ASSETS (${totalAssets}):
${assetList.slice(0, 30).map(a => `- ${a.asset_name}: ${a.asset_type}, status=${a.status}, lifecycle=${a.lifecycle_prediction?.current_lifecycle_stage || 'unknown'}`).join('\n')}

VULNERABILITIES (${vulnList.length}):
- Critical: ${criticalVulns}
- High: ${vulnList.filter(v => v.severity === 'high').length}
- APT-targeted: ${vulnList.filter(v => v.apt_relevance?.is_apt_targeted).length}

BASELINE METRICS:
- Device Compliance Rate: ${Math.round((compliantDevices / totalDevices) * 100)}%
- Active Assets: ${activeAssets}/${totalAssets}
- Encryption Coverage: ${deviceList.filter(d => d.security_profile?.disk_encrypted).length}/${totalDevices} devices

Analyze compliance:
1. overall_compliance_score: 0-100 score across all standards
2. standard_compliance: Compliance by standard (NIST, CIS, ISO 27001, GDPR, HIPAA)
3. non_compliant_areas: Specific gaps with severity and impact
4. compliance_by_category: Device security, data protection, access control, logging, etc.
5. risk_assessment: Overall risk level and specific risks
6. remediation_priorities: Prioritized list of fixes with effort estimates
7. compliance_trends: Whether improving or degrading
8. recommendations: Strategic recommendations for compliance improvement

Consider: NIST CSF, CIS Controls, ISO 27001, GDPR, HIPAA, forensic evidence handling standards.`;

    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt: prompt,
      response_json_schema: {
        type: "object",
        properties: {
          overall_compliance_score: { type: "number" },
          standard_compliance: {
            type: "array",
            items: {
              type: "object",
              properties: {
                standard: { type: "string" },
                score: { type: "number" },
                status: { type: "string", enum: ["compliant", "partially_compliant", "non_compliant"] },
                gaps_count: { type: "number" },
                critical_gaps: { type: "number" }
              }
            }
          },
          non_compliant_areas: {
            type: "array",
            items: {
              type: "object",
              properties: {
                area: { type: "string" },
                standard: { type: "string" },
                requirement: { type: "string" },
                current_state: { type: "string" },
                required_state: { type: "string" },
                severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
                impact: { type: "string" },
                affected_count: { type: "number" }
              }
            }
          },
          compliance_by_category: {
            type: "object",
            properties: {
              device_security: { type: "number" },
              data_protection: { type: "number" },
              access_control: { type: "number" },
              logging_auditing: { type: "number" },
              incident_response: { type: "number" },
              forensic_readiness: { type: "number" }
            }
          },
          risk_assessment: {
            type: "object",
            properties: {
              overall_risk: { type: "string", enum: ["low", "medium", "high", "critical"] },
              regulatory_risk: { type: "string" },
              operational_risk: { type: "string" },
              forensic_integrity_risk: { type: "string" },
              specific_risks: { type: "array", items: { type: "string" } }
            }
          },
          remediation_priorities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                priority: { type: "number" },
                action: { type: "string" },
                standard: { type: "string" },
                effort: { type: "string", enum: ["low", "medium", "high"] },
                impact: { type: "string" },
                timeframe: { type: "string" },
                automation_available: { type: "boolean" },
                workflow_link: { type: "string" }
              }
            }
          },
          compliance_trends: {
            type: "object",
            properties: {
              direction: { type: "string", enum: ["improving", "stable", "degrading"] },
              details: { type: "string" }
            }
          },
          recommendations: { type: "array", items: { type: "string" } }
        }
      }
    });

    // Audit log
    await base44.asServiceRole.functions.invoke('createSecureAuditLog', {
      event_type: 'ai_compliance_analysis',
      severity: aiResponse.overall_compliance_score < 60 ? 'high' : 'info',
      description: `Compliance analysis: ${aiResponse.overall_compliance_score}% compliant`,
      metadata: {
        compliance_score: aiResponse.overall_compliance_score,
        devices_analyzed: totalDevices,
        assets_analyzed: totalAssets,
        non_compliant_areas: aiResponse.non_compliant_areas?.length || 0
      }
    });

    return Response.json({
      analysis: aiResponse,
      metrics: {
        total_devices: totalDevices,
        compliant_devices: compliantDevices,
        total_assets: totalAssets,
        active_assets: activeAssets,
        critical_vulnerabilities: criticalVulns
      },
      analyzed_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('AI compliance analysis error:', error);
    return Response.json({ 
      error: 'Compliance analysis failed', 
      details: error.message 
    }, { status: 500 });
  }
});