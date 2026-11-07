import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * AI-POWERED DEVICE ANOMALY & MISCONFIGURATION DETECTOR
 * Automatically detects security misconfigurations and behavioral anomalies
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

    // Build detection prompt
    const prompt = `You are a forensic security analyst. Detect anomalies and security misconfigurations on this device.

Device Profile:
- Platform: ${device.platform}
- OS: ${device.device_info?.os_version || 'Unknown'}
- Status: ${device.status}
- Last Check-in: ${device.last_check_in}

Security Posture:
- Disk Encrypted: ${device.security_profile?.disk_encrypted || false}
- Firewall: ${device.security_profile?.firewall_enabled || false}
- OS Patched: ${device.security_profile?.os_patched || false}
- Antimalware: ${device.security_profile?.antimalware_running || false}
- Secure Boot: ${device.security_profile?.secure_boot_enabled || false}
- VPN Connected: ${device.security_profile?.vpn_connected || false}

Behavior Metrics:
- Login Anomaly: ${device.behavior_metrics?.login_anomaly || false}
- Network Anomaly: ${device.behavior_metrics?.network_anomaly || false}
- Process Anomaly: ${device.behavior_metrics?.process_anomaly || false}
- File Access Anomaly: ${device.behavior_metrics?.file_access_anomaly || false}

Network Metrics:
- Bandwidth Usage: ${device.network_metrics?.bandwidth_usage || 0}
- Active Connections: ${device.network_metrics?.active_connections || 0}
- Suspicious Connections: ${device.network_metrics?.suspicious_connections || 0}

Anomaly Score: ${device.anomaly_score || 0}/100
Recent Anomalies: ${JSON.stringify(device.recent_anomalies || [])}
Known Vulnerabilities: ${device.security_profile?.known_vulnerabilities?.length || 0}
Associated Threat Actors: ${JSON.stringify(device.security_profile?.associated_threat_actors || [])}

Installed Software: ${device.installed_software?.length || 0} applications
${device.installed_software?.slice(0, 10).map(s => `- ${s.name} (${s.version})`).join('\n') || ''}

Detect and classify:
1. security_misconfigurations: Critical security settings that are disabled/incorrect
2. behavioral_anomalies: Unusual patterns that deviate from normal behavior
3. configuration_risks: Risky configurations that don't violate policy but increase attack surface
4. compliance_violations: Settings that violate security compliance standards
5. severity: Overall severity (low/medium/high/critical)
6. attack_vectors: Potential attack vectors enabled by these issues

Be specific about what's wrong and why it matters for forensic integrity.`;

    // Call AI for anomaly detection
    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt: prompt,
      response_json_schema: {
        type: "object",
        properties: {
          security_misconfigurations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                issue: { type: "string" },
                severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
                description: { type: "string" },
                impact: { type: "string" },
                remediation: { type: "string" }
              }
            }
          },
          behavioral_anomalies: {
            type: "array",
            items: {
              type: "object",
              properties: {
                anomaly_type: { type: "string" },
                severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
                description: { type: "string" },
                indicators: { type: "array", items: { type: "string" } },
                potential_cause: { type: "string" }
              }
            }
          },
          configuration_risks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                risk: { type: "string" },
                description: { type: "string" },
                mitigation: { type: "string" }
              }
            }
          },
          compliance_violations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                standard: { type: "string" },
                violation: { type: "string" },
                requirement: { type: "string" }
              }
            }
          },
          severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
          attack_vectors: { type: "array", items: { type: "string" } },
          summary: { type: "string" }
        }
      }
    });

    // Store detection results
    await base44.entities.Device.update(device.id, {
      last_anomaly_scan: new Date().toISOString(),
      anomaly_detection_data: aiResponse
    });

    return Response.json({
      device_id: device_id,
      detection: aiResponse,
      analyzed_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('AI anomaly detection error:', error);
    return Response.json({ 
      error: 'Anomaly detection failed', 
      details: error.message 
    }, { status: 500 });
  }
});