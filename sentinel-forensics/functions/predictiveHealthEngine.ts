import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Predictive Health Engine
 * 
 * Rules + trend-based predictive analytics for device health.
 * Deterministic, explainable, no ML dependencies (v1).
 * 
 * SCORING LOGIC:
 * - Base health score: 100
 * - Deduct points for each risk factor
 * - Risk factors weighted by severity
 * - Trend analysis (7d/14d windows) for degradation detection
 */

function calculateHealthScore(metrics, recentMetrics) {
  let score = 100;
  const factors = [];
  
  if (!metrics || metrics.length === 0) {
    return { score: 50, factors: ['Insufficient data'], confidence: 'LOW' };
  }
  
  const latest = metrics[0];
  
  // Disk usage (critical if >90%, warning if >75%)
  if (latest.disk_usage_pct >= 90) {
    score -= 25;
    factors.push('Critical disk usage (>90%)');
  } else if (latest.disk_usage_pct >= 75) {
    score -= 10;
    factors.push('High disk usage (>75%)');
  }
  
  // SMART status (critical if FAILED/WARNING)
  if (latest.disk_smart_status === 'FAILED') {
    score -= 40;
    factors.push('Disk SMART failure detected');
  } else if (latest.disk_smart_status === 'WARNING') {
    score -= 20;
    factors.push('Disk SMART warning');
  }
  
  // Reallocated sectors (sign of disk failure)
  if (latest.disk_reallocated_sectors > 50) {
    score -= 30;
    factors.push(`High reallocated sectors (${latest.disk_reallocated_sectors})`);
  } else if (latest.disk_reallocated_sectors > 10) {
    score -= 15;
    factors.push(`Reallocated sectors detected (${latest.disk_reallocated_sectors})`);
  }
  
  // Memory pressure (sustained high usage)
  if (latest.mem_pressure >= 90) {
    score -= 15;
    factors.push('Critical memory pressure (>90%)');
  } else if (latest.mem_pressure >= 75) {
    score -= 7;
    factors.push('High memory pressure (>75%)');
  }
  
  // CPU load (sustained high load)
  if (latest.cpu_load_avg >= 85) {
    score -= 10;
    factors.push('High CPU load (>85%)');
  }
  
  // Temperature (overheating risk)
  if (latest.temperature_celsius >= 85) {
    score -= 20;
    factors.push(`Overheating detected (${latest.temperature_celsius}°C)`);
  } else if (latest.temperature_celsius >= 75) {
    score -= 10;
    factors.push(`High temperature (${latest.temperature_celsius}°C)`);
  }
  
  // Battery health (laptops only)
  if (latest.battery_health_pct !== null && latest.battery_health_pct < 50) {
    score -= 15;
    factors.push(`Battery degraded (${latest.battery_health_pct}%)`);
  }
  
  // Crashes and reboots (instability)
  if (latest.crash_count_24h >= 3) {
    score -= 20;
    factors.push(`Frequent crashes (${latest.crash_count_24h} in 24h)`);
  } else if (latest.crash_count_24h > 0) {
    score -= 5;
    factors.push(`System crashes detected (${latest.crash_count_24h})`);
  }
  
  if (latest.reboot_count_24h >= 5) {
    score -= 15;
    factors.push(`Excessive reboots (${latest.reboot_count_24h} in 24h)`);
  }
  
  // Heartbeat gaps (monitoring gap = risk)
  if (latest.agent_heartbeat_gap_minutes > 120) {
    score -= 25;
    factors.push('Agent offline (>2 hours)');
  } else if (latest.agent_heartbeat_gap_minutes > 30) {
    score -= 10;
    factors.push('Agent heartbeat delayed');
  }
  
  // Trend analysis (degradation detection)
  if (recentMetrics && recentMetrics.length >= 3) {
    const diskTrend = calculateTrend(recentMetrics.map(m => m.disk_usage_pct));
    if (diskTrend > 5) {
      score -= 10;
      factors.push('Disk usage increasing rapidly');
    }
    
    const memTrend = calculateTrend(recentMetrics.map(m => m.mem_pressure));
    if (memTrend > 10) {
      score -= 8;
      factors.push('Memory pressure trending up');
    }
  }
  
  // Confidence based on data completeness
  const dataPoints = Object.keys(latest).filter(k => latest[k] !== null && latest[k] !== undefined).length;
  let confidence = 'MEDIUM';
  if (dataPoints < 5) confidence = 'LOW';
  if (dataPoints > 10 && metrics.length >= 7) confidence = 'HIGH';
  
  return { 
    score: Math.max(0, score), 
    factors: factors.length > 0 ? factors : ['No issues detected'],
    confidence
  };
}

function calculateTrend(values) {
  if (!values || values.length < 2) return 0;
  const n = values.length;
  const xSum = values.reduce((sum, _, i) => sum + i, 0);
  const ySum = values.reduce((sum, v) => sum + v, 0);
  const xxSum = values.reduce((sum, _, i) => sum + i * i, 0);
  const xySum = values.reduce((sum, v, i) => sum + i * v, 0);
  const slope = (n * xySum - xSum * ySum) / (n * xxSum - xSum * xSum);
  return slope || 0;
}

function calculateFailureRisk(healthScore, factors) {
  // Risk inversely proportional to health score
  let risk = (100 - healthScore) / 100;
  
  // Amplify risk for critical indicators
  const criticalFactors = factors.filter(f => 
    f.includes('SMART failure') || 
    f.includes('Frequent crashes') || 
    f.includes('Overheating')
  ).length;
  
  risk += criticalFactors * 0.15;
  
  return Math.min(1, risk);
}

function determineRiskBand(failureRisk) {
  if (failureRisk >= 0.75) return 'CRITICAL';
  if (failureRisk >= 0.5) return 'HIGH';
  if (failureRisk >= 0.25) return 'MEDIUM';
  return 'LOW';
}

function predictFailureWindow(failureRisk, factors) {
  const hasCritical = factors.some(f => 
    f.includes('SMART failure') || 
    f.includes('Frequent crashes')
  );
  
  if (hasCritical) return '1-3 days';
  if (failureRisk >= 0.75) return '3-7 days';
  if (failureRisk >= 0.5) return '7-14 days';
  if (failureRisk >= 0.25) return '14-30 days';
  return '>30 days';
}

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

    // Fetch recent metrics (last 14 data points)
    const metrics = await base44.asServiceRole.entities.DeviceHealthMetric.filter(
      { 
        organization_id: user.organization_id,
        device_id 
      },
      '-metric_timestamp',
      14
    );

    if (metrics.length === 0) {
      return Response.json({
        health_score: 50,
        failure_risk: 0.5,
        risk_band: 'MEDIUM',
        predicted_failure_window: 'Insufficient data',
        top_risk_factors: ['No metrics available'],
        confidence: 'LOW'
      });
    }

    // Calculate health score and factors
    const { score, factors, confidence } = calculateHealthScore(metrics, metrics.slice(0, 7));
    
    // Calculate failure risk
    const failureRisk = calculateFailureRisk(score, factors);
    
    // Determine risk band
    const riskBand = determineRiskBand(failureRisk);
    
    // Predict failure window
    const failureWindow = predictFailureWindow(failureRisk, factors);
    
    // Update device with derived fields
    await base44.asServiceRole.entities.Device.update(device_id, {
      health_score: Math.round(score),
      failure_risk: Math.round(failureRisk * 100) / 100,
      risk_band: riskBand,
      predicted_failure_window: failureWindow,
      health_evaluated_at: new Date().toISOString(),
      health_confidence: confidence,
      top_risk_factors: factors.slice(0, 5)
    });

    return Response.json({
      device_id,
      health_score: Math.round(score),
      failure_risk: Math.round(failureRisk * 100) / 100,
      risk_band: riskBand,
      predicted_failure_window: failureWindow,
      top_risk_factors: factors,
      confidence
    });

  } catch (error) {
    console.error('Predictive health engine error:', error);
    return Response.json({ 
      error: 'Health evaluation failed',
      details: error.message 
    }, { status: 500 });
  }
});