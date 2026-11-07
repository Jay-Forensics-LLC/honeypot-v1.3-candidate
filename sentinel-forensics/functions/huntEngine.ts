import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Threat Hunting Engine - Phase 1
 * 
 * Autonomously identifies latent threats via correlation and anomaly detection.
 * No-alert threat detection: finds suspicious patterns even when no alert fired.
 * 
 * Categories:
 * 1. Unpatched / High-risk Exposure
 * 2. New/Rare Network Exposure
 * 3. Behavioral Drift / Device Health Anomalies
 * 4. Lateral Movement Indicators
 * 5. Shadow IT / Unauthorized Devices
 * 6. Threat Intel Weak-Signal Matches
 * 7. Misconfiguration Risk
 */

function calculateRiskScore(factors) {
  let score = 0;
  const weights = {
    criticality: 25,
    exposure: 20,
    threat_relevance: 20,
    anomaly_magnitude: 20,
    corroboration: 15
  };
  
  Object.entries(factors).forEach(([key, value]) => {
    if (weights[key]) {
      score += value * weights[key];
    }
  });
  
  return Math.min(100, Math.round(score));
}

async function detectUnpatchedExposure(base44, orgId, devices) {
  const findings = [];
  
  for (const device of devices) {
    // Check for critical health issues + high risk
    if (device.health_score < 40 && device.risk_band === 'CRITICAL') {
      const factors = {
        criticality: 1.0,
        exposure: device.ip_public ? 0.9 : 0.5,
        threat_relevance: 0.8,
        anomaly_magnitude: (100 - device.health_score) / 100,
        corroboration: 0.7
      };
      
      const riskScore = calculateRiskScore(factors);
      
      findings.push({
        title: `Critical device health degradation: ${device.hostname}`,
        category: 'unpatched_exposure',
        severity: 'critical',
        confidence: 0.85,
        risk_score: riskScore,
        primary_entity_type: 'device',
        primary_entity_id: device.device_id,
        hypothesis: `Device ${device.hostname} shows critical health degradation (score: ${device.health_score}) with indicators suggesting unpatched vulnerabilities or hardware failure. This device may be exploitable.`,
        recommended_next_steps: [
          'Review top risk factors from device health assessment',
          'Check patch status and pending updates',
          'Verify SMART status and hardware integrity',
          'Scan for known vulnerabilities (CVEs)',
          'Isolate if evidence of compromise'
        ],
        suggested_containment_actions: [
          'Increase monitoring level',
          'Quarantine device pending investigation',
          'Create high-priority maintenance ticket'
        ],
        supporting_signals: device.top_risk_factors || [],
        explainability: {
          rationale: 'Critical health score combined with multiple risk factors indicates high exploitation risk',
          source_factors: ['device_health', 'risk_assessment'],
          weights: factors
        },
        blast_radius: {
          count: 1,
          entity_refs: [device.device_id]
        }
      });
    }
  }
  
  return findings;
}

async function detectNetworkExposure(base44, orgId, devices) {
  const findings = [];
  
  for (const device of devices) {
    // Internet-exposed devices with vulnerabilities
    if (device.ip_public && device.risk_score > 60) {
      const factors = {
        criticality: 0.8,
        exposure: 1.0,
        threat_relevance: 0.7,
        anomaly_magnitude: device.risk_score / 100,
        corroboration: 0.6
      };
      
      const riskScore = calculateRiskScore(factors);
      
      findings.push({
        title: `Internet-exposed device with vulnerabilities: ${device.hostname}`,
        category: 'network_exposure',
        severity: device.risk_score > 80 ? 'high' : 'medium',
        confidence: 0.9,
        risk_score: riskScore,
        primary_entity_type: 'device',
        primary_entity_id: device.device_id,
        hypothesis: `Device ${device.hostname} is internet-exposed (IP: ${device.ip_public}) with elevated risk score (${device.risk_score}). May be vulnerable to external attacks.`,
        recommended_next_steps: [
          'Verify if internet exposure is intentional',
          'Check firewall rules and network ACLs',
          'Scan exposed ports and services',
          'Review recent network activity',
          'Validate security patches'
        ],
        suggested_containment_actions: [
          'Restrict external access',
          'Enable geo-blocking if applicable',
          'Increase monitoring level'
        ],
        supporting_signals: [
          `Public IP: ${device.ip_public}`,
          `Risk score: ${device.risk_score}`
        ],
        explainability: {
          rationale: 'Public exposure combined with security vulnerabilities creates attack surface',
          source_factors: ['network_exposure', 'risk_assessment'],
          weights: factors
        },
        blast_radius: {
          count: 1,
          entity_refs: [device.device_id]
        }
      });
    }
  }
  
  return findings;
}

async function detectBehavioralDrift(base44, orgId, devices) {
  const findings = [];
  
  for (const device of devices) {
    // Devices with degrading health trends
    if (device.health_score > 30 && device.health_score < 70 && 
        device.predicted_failure_window && device.predicted_failure_window.includes('7')) {
      const factors = {
        criticality: 0.7,
        exposure: 0.5,
        threat_relevance: 0.6,
        anomaly_magnitude: 0.7,
        corroboration: 0.8
      };
      
      const riskScore = calculateRiskScore(factors);
      
      findings.push({
        title: `Behavioral drift detected: ${device.hostname}`,
        category: 'behavioral_drift',
        severity: 'medium',
        confidence: 0.75,
        risk_score: riskScore,
        primary_entity_type: 'device',
        primary_entity_id: device.device_id,
        hypothesis: `Device ${device.hostname} shows degrading health patterns (score: ${device.health_score}) with predicted failure window of ${device.predicted_failure_window}. May indicate malware, resource exhaustion, or hardware failure.`,
        recommended_next_steps: [
          'Review recent software installations',
          'Check for suspicious processes',
          'Analyze resource usage trends',
          'Verify no malware present',
          'Schedule maintenance if hardware-related'
        ],
        suggested_containment_actions: [
          'Increase monitoring level',
          'Create maintenance ticket'
        ],
        supporting_signals: device.top_risk_factors || [],
        explainability: {
          rationale: 'Degrading health score with short failure window suggests active issue requiring investigation',
          source_factors: ['device_health', 'predictive_analytics'],
          weights: factors
        },
        blast_radius: {
          count: 1,
          entity_refs: [device.device_id]
        }
      });
    }
  }
  
  return findings;
}

async function detectLateralMovement(base44, orgId, devices, alerts) {
  const findings = [];
  
  // Group devices by risk band and time window
  const recentHighRisk = devices.filter(d => 
    (d.risk_band === 'HIGH' || d.risk_band === 'CRITICAL') &&
    d.health_evaluated_at &&
    new Date(d.health_evaluated_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
  );
  
  if (recentHighRisk.length >= 3) {
    const factors = {
      criticality: 0.9,
      exposure: 0.7,
      threat_relevance: 0.8,
      anomaly_magnitude: 0.8,
      corroboration: 1.0
    };
    
    const riskScore = calculateRiskScore(factors);
    
    findings.push({
      title: `Potential lateral movement: ${recentHighRisk.length} devices flagged`,
      category: 'lateral_movement',
      severity: 'high',
      confidence: 0.7,
      risk_score: riskScore,
      primary_entity_type: 'network',
      primary_entity_id: 'network-cluster',
      hypothesis: `${recentHighRisk.length} devices simultaneously showing high/critical risk within 24h window. May indicate coordinated attack or lateral movement.`,
      recommended_next_steps: [
        'Correlate device locations and network segments',
        'Check for common compromised credentials',
        'Review inter-device communications',
        'Analyze attack timeline',
        'Check for common IOCs across devices'
      ],
      suggested_containment_actions: [
        'Isolate affected segment',
        'Force credential resets',
        'Increase monitoring across network'
      ],
      supporting_signals: recentHighRisk.map(d => d.hostname),
      explainability: {
        rationale: 'Multiple devices flagged simultaneously suggests coordinated threat activity',
        source_factors: ['device_health', 'temporal_correlation'],
        weights: factors
      },
      blast_radius: {
        count: recentHighRisk.length,
        entity_refs: recentHighRisk.map(d => d.device_id)
      }
    });
  }
  
  return findings;
}

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { scope = 'organization' } = await req.json().catch(() => ({}));
    
    // Create hunt run
    const runId = `HUNT-${Date.now()}`;
    const huntRun = await base44.asServiceRole.entities.HuntRun.create({
      organization_id: user.organization_id,
      run_id: runId,
      created_by: user.email,
      scope,
      status: 'running'
    });

    // Fetch security data
    const [devices, alerts, threats] = await Promise.all([
      base44.asServiceRole.entities.Device.filter({ organization_id: user.organization_id }).catch(() => []),
      base44.asServiceRole.entities.Alert.filter({ organization_id: user.organization_id }, '-detection_timestamp', 100).catch(() => []),
      base44.asServiceRole.entities.ThreatDetection.filter({ organization_id: user.organization_id }, '-detected_at', 50).catch(() => [])
    ]);

    // Run hunt categories
    const [
      unpatchedFindings,
      exposureFindings,
      driftFindings,
      lateralFindings
    ] = await Promise.all([
      detectUnpatchedExposure(base44, user.organization_id, devices),
      detectNetworkExposure(base44, user.organization_id, devices),
      detectBehavioralDrift(base44, user.organization_id, devices),
      detectLateralMovement(base44, user.organization_id, devices, alerts)
    ]);

    const allFindings = [
      ...unpatchedFindings,
      ...exposureFindings,
      ...driftFindings,
      ...lateralFindings
    ];

    // Store findings and evidence
    for (const finding of allFindings) {
      const findingId = `FND-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await base44.asServiceRole.entities.HuntFinding.create({
        organization_id: user.organization_id,
        finding_id: findingId,
        hunt_run_id: runId,
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        ...finding
      });

      // Link device health alerts as evidence for critical findings
      if (finding.severity === 'critical' && finding.primary_entity_id) {
        const deviceAlerts = await base44.asServiceRole.entities.DeviceHealthAlert
          .filter({ device_id: finding.primary_entity_id })
          .catch(() => []);
        
        for (const alert of deviceAlerts.slice(0, 3)) {
          await base44.asServiceRole.entities.HuntEvidence.create({
            organization_id: user.organization_id,
            evidence_id: `EVD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            finding_id: findingId,
            type: 'device_health',
            source_id: alert.id,
            timestamp: alert.created_date,
            summary: alert.reason,
            score_contribution: 25
          });
        }
      }
    }

    // Update hunt run
    const duration = Date.now() - startTime;
    await base44.asServiceRole.entities.HuntRun.update(huntRun.id, {
      status: 'completed',
      duration_ms: duration,
      findings_count: allFindings.length,
      inputs_snapshot: {
        alerts_count: alerts.length,
        devices_count: devices.length,
        threats_count: threats.length,
        data_hash: `${devices.length}-${alerts.length}-${Date.now()}`
      }
    });

    return Response.json({
      success: true,
      run_id: runId,
      findings_count: allFindings.length,
      duration_ms: duration,
      categories: {
        unpatched_exposure: unpatchedFindings.length,
        network_exposure: exposureFindings.length,
        behavioral_drift: driftFindings.length,
        lateral_movement: lateralFindings.length
      }
    });

  } catch (error) {
    console.error('Hunt engine error:', error);
    return Response.json({ 
      error: 'Hunt failed',
      details: error.message 
    }, { status: 500 });
  }
});