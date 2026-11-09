import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { device_id, processes, network_connections, file_activities } = await req.json();

    // Behavioral analysis scoring
    let threatScore = 0;
    const suspiciousProcesses = [];
    const indicators = [];

    // Analyze processes for suspicious behavior
    if (processes) {
      for (const proc of processes) {
        let riskLevel = 'low';
        const behaviors = [];

        // Check for injection techniques
        if (proc.path?.includes('AppData\\Roaming') || proc.path?.includes('Temp')) {
          threatScore += 15;
          behaviors.push('Running from suspicious directory');
          riskLevel = 'high';
        }

        // Check for obfuscation
        if (proc.name?.match(/^[a-f0-9]{8,}\.exe$/i)) {
          threatScore += 20;
          behaviors.push('Randomly named executable');
          riskLevel = 'critical';
        }

        // Check for privilege escalation attempts
        if (proc.privileges?.includes('SYSTEM') && !proc.isSigned) {
          threatScore += 25;
          behaviors.push('Unsigned process with SYSTEM privileges');
          riskLevel = 'critical';
        }

        // Memory injection indicators
        if (proc.memoryRegions?.some(r => r.protection === 'RWX')) {
          threatScore += 30;
          behaviors.push('Executable memory regions (code injection)');
          riskLevel = 'critical';
        }

        if (behaviors.length > 0) {
          suspiciousProcesses.push({
            name: proc.name,
            pid: proc.pid,
            path: proc.path,
            hash: proc.hash,
            behavior: behaviors.join(', '),
            risk_level: riskLevel
          });
        }
      }
    }

    // Analyze network behavior
    if (network_connections) {
      const suspiciousConnections = network_connections.filter(c => 
        c.remotePort === 4444 || c.remotePort === 8080 || c.protocol === 'IRC'
      );
      if (suspiciousConnections.length > 0) {
        threatScore += 20;
        indicators.push(`${suspiciousConnections.length} suspicious network connections`);
      }
    }

    // Analyze file activity
    if (file_activities) {
      const rapidFileChanges = file_activities.filter(f => 
        f.action === 'encrypted' || f.extension === '.locked'
      );
      if (rapidFileChanges.length > 10) {
        threatScore += 40;
        indicators.push('Ransomware-like file encryption detected');
      }
    }

    threatScore = Math.min(threatScore, 100);
    const threatDetected = threatScore >= 50;

    // Auto-isolate if critical threat
    let autoIsolated = false;
    let isolationReason = null;

    if (threatScore >= 80) {
      await base44.entities.Device.update(device_id, {
        status: 'isolated',
        isolation_reason: 'Automated isolation due to critical threat detection'
      });
      autoIsolated = true;
      isolationReason = 'Critical threat score reached';
    }

    // Create analysis record
    const analysis = await base44.entities.EndpointBehaviorAnalysis.create({
      organization_id: user.organization_id,
      device_id,
      analysis_type: 'process_behavior',
      threat_detected: threatDetected,
      threat_score: threatScore,
      suspicious_processes: suspiciousProcesses,
      indicators,
      recommended_actions: threatDetected ? [
        'Isolate endpoint immediately',
        'Capture memory dump',
        'Terminate suspicious processes',
        'Initiate forensic investigation'
      ] : ['Continue monitoring'],
      auto_isolated: autoIsolated,
      isolation_reason: isolationReason
    });

    // Create alert if threat detected
    if (threatDetected) {
      await base44.entities.Alert.create({
        organization_id: user.organization_id,
        alert_type: 'malware_detected',
        severity: threatScore >= 80 ? 'critical' : 'high',
        title: `Suspicious Behavior Detected on Device ${device_id}`,
        description: `Threat score: ${threatScore}. ${indicators.join('. ')}`,
        source: 'Endpoint Behavioral Analysis',
        detection_timestamp: new Date().toISOString(),
        status: 'new',
        threat_score: threatScore,
        affected_systems: [device_id]
      });
    }

    return Response.json({
      success: true,
      analysis,
      threat_detected: threatDetected,
      threat_score: threatScore,
      auto_isolated: autoIsolated
    });

  } catch (error) {
    console.error('Endpoint analysis error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});