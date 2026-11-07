import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { device_id } = await req.json();

    // Fetch device
    const devices = await base44.entities.Device.filter({
      id: device_id,
      organization_id: user.organization_id
    });

    const device = devices[0];
    if (!device) {
      return Response.json({ error: 'Device not found' }, { status: 404 });
    }

    // Fetch threat intelligence for this device
    const threatActorIds = device.security_profile?.associated_threat_actors || [];
    const threatActors = threatActorIds.length > 0 
      ? await base44.entities.APTGroup.filter({
          id: { $in: threatActorIds }
        })
      : [];

    // Build vulnerability context
    const osInfo = device.device_info?.os_version || 'Unknown';
    const platform = device.platform;
    const installedSoftware = device.device_info?.installed_software || [];
    const knownVulns = device.security_profile?.known_vulnerabilities || [];

    // Get threat intelligence context
    const threatContext = threatActors.map(ta => ({
      name: ta.group_name,
      ttps: ta.ttps,
      malware: ta.malware_families
    }));

    // Call AI for vulnerability analysis and prioritization
    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt: `Analyze this device for security vulnerabilities and prioritize remediation.

Device Profile:
- Platform: ${platform}
- OS: ${osInfo}
- Known Vulnerabilities: ${JSON.stringify(knownVulns)}
- Installed Software: ${JSON.stringify(installedSoftware.slice(0, 10))}

Threat Intelligence:
${threatActorIds.length > 0 ? `Associated Threat Actors: ${JSON.stringify(threatContext)}` : 'No known threat actors associated'}

Tasks:
1. Identify critical vulnerabilities based on platform and OS
2. Prioritize vulnerabilities considering:
   - Exploitability (CVSS score, active exploits)
   - Device criticality
   - Threat actor TTPs (if applicable)
3. Suggest specific remediation actions
4. Recommend patch priority

Focus on actionable, specific vulnerabilities relevant to ${platform}.`,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {
          critical_vulnerabilities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                cve_id: { type: "string" },
                name: { type: "string" },
                severity: { type: "string" },
                cvss_score: { type: "number" },
                exploitability: { type: "string" },
                remediation: { type: "string" },
                priority: { type: "number" }
              }
            }
          },
          recommended_actions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                action: { type: "string" },
                urgency: { type: "string" },
                estimated_time: { type: "string" }
              }
            }
          },
          overall_risk_score: {
            type: "number",
            description: "0-100 risk score"
          },
          next_scan_recommended: {
            type: "string",
            description: "When to perform next scan"
          }
        }
      }
    });

    // Update device with vulnerability analysis
    await base44.asServiceRole.entities.Device.update(device_id, {
      security_profile: {
        ...device.security_profile,
        known_vulnerabilities: aiResponse.critical_vulnerabilities,
        vulnerability_risk_score: aiResponse.overall_risk_score,
        last_vulnerability_scan: new Date().toISOString()
      }
    });

    // Create audit log
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      event_type: 'device_vulnerability_scan',
      severity: 'info',
      description: `Vulnerability analysis completed for device ${device.display_name}`,
      user_id: user.email,
      resource_type: 'Device',
      resource_id: device_id,
      action_performed: 'vulnerability_scan',
      timestamp: new Date().toISOString(),
      blockchain_hash: crypto.randomUUID(),
      metadata: {
        vulnerabilities_found: aiResponse.critical_vulnerabilities.length,
        risk_score: aiResponse.overall_risk_score
      },
      success: true
    });

    return Response.json({
      success: true,
      vulnerabilities: aiResponse.critical_vulnerabilities,
      recommended_actions: aiResponse.recommended_actions,
      risk_score: aiResponse.overall_risk_score,
      next_scan: aiResponse.next_scan_recommended
    });

  } catch (error) {
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});