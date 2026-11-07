import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * AI-POWERED SECURITY POSTURE ANALYSIS
 * Detects baseline deviations, analyzes misconfiguration impact, provides prioritized remediation
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !user.organization_id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { device_id } = await req.json();

    if (!device_id) {
      return Response.json({ error: 'device_id required' }, { status: 400 });
    }

    // Fetch device
    const devices = await base44.entities.Device.filter({
      organization_id: user.organization_id,
      device_id: device_id
    });

    if (!devices || devices.length === 0) {
      return Response.json({ error: 'Device not found' }, { status: 404 });
    }

    const device = devices[0];

    // Fetch security baseline for comparison
    const baselines = await base44.entities.SecurityBaseline.filter({
      organization_id: user.organization_id,
      platform: device.platform
    }, '-created_date', 1);

    const baseline = baselines?.[0];

    const prompt = `You are a forensic security posture analyst. Analyze this device against security baselines and identify critical gaps.

Device: ${device.device_id}
Platform: ${device.platform}
OS: ${device.device_info?.os_version || 'Unknown'}
Status: ${device.status}

CURRENT SECURITY POSTURE:
- Disk Encrypted: ${device.security_profile?.disk_encrypted || false}
- Firewall Enabled: ${device.security_profile?.firewall_enabled || false}
- OS Patched: ${device.security_profile?.os_patched || false}
- Antimalware Running: ${device.security_profile?.antimalware_running || false}
- Secure Boot: ${device.security_profile?.secure_boot_enabled || false}
- VPN Connected: ${device.security_profile?.vpn_connected || false}

SECURITY BASELINE (${device.platform}):
${baseline ? JSON.stringify(baseline.requirements, null, 2) : 'No baseline defined - use industry standards'}

VULNERABILITIES:
- Known CVEs: ${device.security_profile?.known_vulnerabilities?.length || 0}
- Associated Threat Actors: ${device.security_profile?.associated_threat_actors?.join(', ') || 'None'}

BEHAVIORAL INDICATORS:
- Anomaly Score: ${device.anomaly_score || 0}/100
- Login Anomaly: ${device.behavior_metrics?.login_anomaly || false}
- Network Anomaly: ${device.behavior_metrics?.network_anomaly || false}
- Process Anomaly: ${device.behavior_metrics?.process_anomaly || false}

COMPLIANCE:
- Compliance Status: ${device.compliance_status || 'unknown'}

Analyze security posture:
1. baseline_deviations: Specific deviations from security baseline with severity
2. misconfiguration_impact: Impact analysis for each misconfiguration (forensic integrity, attack surface, compliance)
3. risk_score: Overall security risk score (0-100, where 100 is highest risk)
4. attack_scenarios: Potential attack scenarios enabled by current posture
5. prioritized_remediation: Remediation steps prioritized by risk reduction and ease of implementation
6. compliance_gaps: Specific compliance standard violations
7. forensic_integrity_risk: Risk to evidence integrity and chain of custody

Consider: CIS benchmarks, NIST standards, forensic best practices, APT defense requirements.`;

    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt: prompt,
      response_json_schema: {
        type: "object",
        properties: {
          baseline_deviations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                control: { type: "string" },
                baseline_value: { type: "string" },
                current_value: { type: "string" },
                deviation_severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
                description: { type: "string" },
                cis_reference: { type: "string" }
              }
            }
          },
          misconfiguration_impact: {
            type: "array",
            items: {
              type: "object",
              properties: {
                misconfiguration: { type: "string" },
                forensic_integrity_impact: { type: "string" },
                attack_surface_impact: { type: "string" },
                compliance_impact: { type: "string" },
                exploitability: { type: "string", enum: ["low", "medium", "high", "critical"] },
                business_impact: { type: "string" }
              }
            }
          },
          risk_score: { type: "number" },
          attack_scenarios: {
            type: "array",
            items: {
              type: "object",
              properties: {
                scenario: { type: "string" },
                likelihood: { type: "string", enum: ["low", "medium", "high", "very_high"] },
                impact: { type: "string", enum: ["low", "medium", "high", "critical"] },
                enabled_by: { type: "array", items: { type: "string" } },
                mitigation: { type: "string" }
              }
            }
          },
          prioritized_remediation: {
            type: "array",
            items: {
              type: "object",
              properties: {
                step: { type: "string" },
                priority: { type: "number" },
                risk_reduction: { type: "string" },
                implementation_difficulty: { type: "string", enum: ["easy", "medium", "hard", "complex"] },
                estimated_time: { type: "string" },
                commands: { type: "array", items: { type: "string" } },
                validation: { type: "string" },
                rollback_plan: { type: "string" }
              }
            }
          },
          compliance_gaps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                standard: { type: "string" },
                requirement: { type: "string" },
                current_state: { type: "string" },
                required_state: { type: "string" },
                remediation: { type: "string" }
              }
            }
          },
          forensic_integrity_risk: {
            type: "object",
            properties: {
              risk_level: { type: "string", enum: ["low", "medium", "high", "critical"] },
              specific_risks: { type: "array", items: { type: "string" } },
              chain_of_custody_impact: { type: "string" },
              evidence_tampering_risk: { type: "string" }
            }
          },
          summary: { type: "string" }
        }
      }
    });

    // Update device with analysis
    await base44.entities.Device.update(device.id, {
      last_posture_analysis: new Date().toISOString(),
      posture_analysis_data: aiResponse,
      security_risk_score: aiResponse.risk_score
    });

    // Audit log
    await base44.asServiceRole.functions.invoke('createSecureAuditLog', {
      event_type: 'ai_security_posture_analysis',
      severity: aiResponse.risk_score > 70 ? 'high' : aiResponse.risk_score > 40 ? 'medium' : 'info',
      description: `Security posture analysis for device ${device.device_id}: risk score ${aiResponse.risk_score}`,
      metadata: {
        device_id: device.id,
        device_name: device.display_name,
        risk_score: aiResponse.risk_score,
        deviations_count: aiResponse.baseline_deviations?.length || 0,
        critical_deviations: aiResponse.baseline_deviations?.filter(d => d.deviation_severity === 'critical').length || 0
      }
    });

    return Response.json({
      device_id: device_id,
      analysis: aiResponse,
      analyzed_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('AI security posture analysis error:', error);
    return Response.json({ 
      error: 'Security posture analysis failed', 
      details: error.message 
    }, { status: 500 });
  }
});