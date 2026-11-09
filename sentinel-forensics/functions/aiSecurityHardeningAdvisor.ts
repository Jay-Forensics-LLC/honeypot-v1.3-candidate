import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * AI-POWERED SECURITY HARDENING ADVISOR
 * Generates tailored security hardening recommendations for each device
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { device_id } = await req.json();

    if (!device_id) {
      return Response.json({ error: 'device_id required' }, { status: 400 });
    }

    // Fetch device data
    const devices = await base44.entities.Device.filter({
      organization_id: user.organization_id,
      device_id: device_id
    });

    if (!devices || devices.length === 0) {
      return Response.json({ error: 'Device not found' }, { status: 404 });
    }

    const device = devices[0];

    // Build hardening prompt
    const prompt = `You are a forensic security hardening expert. Generate tailored security hardening recommendations for this device.

Device Context:
- Platform: ${device.platform}
- OS: ${device.device_info?.os_version || 'Unknown'}
- Role: ${device.display_name}
- Environment: Forensic investigation platform
- Capabilities: ${device.capabilities?.join(', ') || 'None'}

Current Security State:
- Disk Encrypted: ${device.security_profile?.disk_encrypted || false}
- Firewall Enabled: ${device.security_profile?.firewall_enabled || false}
- OS Patched: ${device.security_profile?.os_patched || false}
- Antimalware Running: ${device.security_profile?.antimalware_running || false}
- Secure Boot: ${device.security_profile?.secure_boot_enabled || false}
- VPN Connected: ${device.security_profile?.vpn_connected || false}

Threat Context:
- Anomaly Score: ${device.anomaly_score || 0}/100
- Active Threats: ${device.active_threats?.length || 0}
- Known Vulnerabilities: ${device.security_profile?.known_vulnerabilities?.length || 0}
- Associated Threat Actors: ${JSON.stringify(device.security_profile?.associated_threat_actors || [])}

Recent Security Events:
${JSON.stringify(device.recent_anomalies || [])}

Installed Software (sample):
${device.installed_software?.slice(0, 15).map(s => `- ${s.name} ${s.version} by ${s.vendor}`).join('\n') || 'None listed'}

Generate comprehensive hardening recommendations:
1. immediate_actions: Critical actions to take right now (prioritized)
2. configuration_hardening: System and security configuration improvements
3. software_recommendations: Software to install, update, or remove
4. monitoring_enhancements: Monitoring and detection improvements
5. policy_recommendations: Security policies to enforce
6. forensic_readiness: Steps to improve forensic investigation readiness
7. implementation_roadmap: Phased implementation plan with priorities

Consider: APT defense, zero-click threats, evidence integrity, chain of custody, and forensic best practices.
Tailor recommendations to the ${device.platform} platform specifically.`;

    // Call AI for hardening recommendations
    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt: prompt,
      response_json_schema: {
        type: "object",
        properties: {
          immediate_actions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                action: { type: "string" },
                priority: { type: "string", enum: ["critical", "high", "medium"] },
                rationale: { type: "string" },
                steps: { type: "array", items: { type: "string" } },
                estimated_time: { type: "string" }
              }
            }
          },
          configuration_hardening: {
            type: "array",
            items: {
              type: "object",
              properties: {
                category: { type: "string" },
                setting: { type: "string" },
                current_value: { type: "string" },
                recommended_value: { type: "string" },
                impact: { type: "string" },
                risk_if_not_applied: { type: "string" }
              }
            }
          },
          software_recommendations: {
            type: "object",
            properties: {
              install: { type: "array", items: { type: "string" } },
              update: { type: "array", items: { type: "string" } },
              remove: { type: "array", items: { type: "string" } },
              configure: { type: "array", items: { type: "string" } }
            }
          },
          monitoring_enhancements: {
            type: "array",
            items: {
              type: "object",
              properties: {
                enhancement: { type: "string" },
                description: { type: "string" },
                tools: { type: "array", items: { type: "string" } }
              }
            }
          },
          policy_recommendations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                policy: { type: "string" },
                enforcement_method: { type: "string" },
                compliance_standard: { type: "string" }
              }
            }
          },
          forensic_readiness: {
            type: "array",
            items: {
              type: "object",
              properties: {
                measure: { type: "string" },
                purpose: { type: "string" },
                implementation: { type: "string" }
              }
            }
          },
          implementation_roadmap: {
            type: "object",
            properties: {
              phase_1_immediate: { type: "array", items: { type: "string" } },
              phase_2_short_term: { type: "array", items: { type: "string" } },
              phase_3_ongoing: { type: "array", items: { type: "string" } }
            }
          },
          summary: { type: "string" },
          overall_hardening_score: { type: "number" }
        }
      }
    });

    // Store recommendations
    await base44.entities.Device.update(device.id, {
      last_hardening_analysis: new Date().toISOString(),
      hardening_recommendations: aiResponse
    });

    return Response.json({
      device_id: device_id,
      recommendations: aiResponse,
      analyzed_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('AI hardening advisor error:', error);
    return Response.json({ 
      error: 'Hardening analysis failed', 
      details: error.message 
    }, { status: 500 });
  }
});