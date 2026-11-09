import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * AI-POWERED DEVICE HEALTH PREDICTOR
 * Analyzes device metrics to predict potential failures and health degradation
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

    // Build analysis prompt
    const prompt = `You are a forensic device health analyst. Analyze this device and predict potential failures.

Device Information:
- Platform: ${device.platform}
- OS Version: ${device.device_info?.os_version || 'Unknown'}
- Last Seen: ${device.last_seen_at}
- Status: ${device.status}
- CPU: ${device.device_info?.cpu_model} (${device.device_info?.cpu_cores} cores)
- Memory: ${device.device_info?.memory_total_gb}GB
- Disk: ${device.device_info?.disk_total_gb}GB

Current Metrics:
- CPU Usage: ${device.system_metrics?.cpu_usage || 0}%
- Memory Usage: ${device.system_metrics?.memory_usage || 0}%
- Disk Usage: ${device.system_metrics?.disk_usage || 0}%
- Active Processes: ${device.system_metrics?.active_processes || 0}

Security Profile:
- Disk Encrypted: ${device.security_profile?.disk_encrypted || false}
- Firewall Enabled: ${device.security_profile?.firewall_enabled || false}
- OS Patched: ${device.security_profile?.os_patched || false}
- Antimalware Running: ${device.security_profile?.antimalware_running || false}

Anomaly Score: ${device.anomaly_score || 0}/100
Recent Anomalies: ${JSON.stringify(device.recent_anomalies || [])}

Active Threats: ${device.active_threats?.length || 0}
Compliance Status: ${device.compliance_status || 'unknown'}

Provide a health prediction analysis with:
1. health_score: Overall health score (0-100, where 100 is perfect health)
2. failure_risk: Risk level (low/medium/high/critical)
3. predicted_failures: Array of potential failure scenarios with probability and timeframe
4. degradation_indicators: Signs of hardware/software degradation
5. maintenance_priority: Priority level (low/medium/high/urgent)
6. recommended_actions: Immediate and preventive actions

Consider: resource exhaustion, hardware wear, security vulnerabilities, update staleness, anomaly patterns.`;

    // Call AI for health prediction
    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt: prompt,
      response_json_schema: {
        type: "object",
        properties: {
          health_score: { type: "number" },
          failure_risk: { type: "string", enum: ["low", "medium", "high", "critical"] },
          predicted_failures: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string" },
                probability: { type: "number" },
                timeframe: { type: "string" },
                impact: { type: "string" },
                indicators: { type: "array", items: { type: "string" } }
              }
            }
          },
          degradation_indicators: {
            type: "array",
            items: { type: "string" }
          },
          maintenance_priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          recommended_actions: {
            type: "object",
            properties: {
              immediate: { type: "array", items: { type: "string" } },
              preventive: { type: "array", items: { type: "string" } }
            }
          },
          summary: { type: "string" }
        }
      }
    });

    // Store prediction in device record
    await base44.entities.Device.update(device.id, {
      last_health_prediction: new Date().toISOString(),
      health_prediction_data: aiResponse
    });

    return Response.json({
      device_id: device_id,
      prediction: aiResponse,
      analyzed_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('AI health prediction error:', error);
    return Response.json({ 
      error: 'Health prediction failed', 
      details: error.message 
    }, { status: 500 });
  }
});