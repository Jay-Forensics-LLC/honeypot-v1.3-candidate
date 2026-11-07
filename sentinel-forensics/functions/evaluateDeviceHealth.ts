import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Evaluate Device Health (Scheduled Job)
 * 
 * Runs predictive health engine on all devices, generates alerts,
 * and creates recommendations based on inventory.
 * 
 * ALERT LOGIC:
 * - Suppress duplicates within cooldown window (24h)
 * - Escalate CRITICAL alerts if unresolved after 6h
 * - Generate recommendations for HIGH/CRITICAL risk
 * 
 * RECOMMENDATION LOGIC:
 * - MAINTENANCE: software/config issues (disk cleanup, memory leaks, patches)
 * - REPLACE: hardware failure indicators (SMART, sustained crashes, battery)
 * - MONITOR: trending degradation, not yet critical
 */

async function generateAlert(base44, orgId, device, severity, reason, factors, recommendedAction) {
  const alertId = `ALERT-${device.device_id}-${Date.now()}`;
  const now = new Date();
  const cooldownUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h cooldown
  
  // Check for existing open alerts within cooldown
  const existingAlerts = await base44.asServiceRole.entities.DeviceHealthAlert.filter({
    organization_id: orgId,
    device_id: device.device_id,
    status: 'OPEN',
    cooldown_until: { $gte: now.toISOString() }
  });
  
  if (existingAlerts.length > 0) {
    console.log(`Suppressing duplicate alert for ${device.device_id} (cooldown active)`);
    return null;
  }
  
  // Create alert
  const alert = await base44.asServiceRole.entities.DeviceHealthAlert.create({
    organization_id: orgId,
    alert_id: alertId,
    device_id: device.device_id,
    severity,
    reason,
    contributing_factors: factors,
    recommended_action: recommendedAction,
    status: 'OPEN',
    cooldown_until: cooldownUntil.toISOString()
  });
  
  return alert;
}

async function generateRecommendation(base44, orgId, device, factors) {
  const recommendationId = `REC-${device.device_id}-${Date.now()}`;
  
  // Determine recommendation type based on factors
  let recommendationType = 'MONITOR';
  let actions = [];
  let partsRequired = [];
  let justification = '';
  let confidence = 'MEDIUM';
  
  const hasSMARTFailure = factors.some(f => f.includes('SMART failure') || f.includes('SMART warning'));
  const hasFrequentCrashes = factors.some(f => f.includes('Frequent crashes'));
  const hasBatteryIssue = factors.some(f => f.includes('Battery degraded'));
  const hasDiskSpace = factors.some(f => f.includes('disk usage'));
  const hasMemoryPressure = factors.some(f => f.includes('memory pressure'));
  const hasOverheating = factors.some(f => f.includes('Overheating') || f.includes('High temperature'));
  
  // REPLACE logic
  if (hasSMARTFailure || (hasFrequentCrashes && device.crash_count_24h >= 5)) {
    recommendationType = 'REPLACE';
    confidence = 'HIGH';
    justification = 'Hardware failure indicators detected. Replacement recommended to prevent data loss.';
    
    if (hasSMARTFailure) {
      actions.push('Back up all critical data immediately');
      actions.push('Schedule device replacement');
      actions.push('Provision replacement from inventory');
    }
    
    if (hasFrequentCrashes) {
      actions.push('Capture crash logs for analysis');
      actions.push('Prepare device for decommissioning');
    }
    
    // Find matching inventory
    const inventory = await base44.asServiceRole.entities.Inventory.filter({
      organization_id: orgId,
      category: device.os_family === 'Windows' || device.os_family === 'macOS' ? 'laptop' : 'server'
    });
    
    if (inventory.length > 0) {
      const available = inventory.filter(i => i.qty_available > 0)[0];
      if (available) {
        partsRequired.push({
          sku: available.sku,
          qty_available: available.qty_available,
          lead_time_days: 0
        });
      } else {
        const outOfStock = inventory[0];
        partsRequired.push({
          sku: outOfStock.sku,
          qty_available: 0,
          lead_time_days: outOfStock.lead_time_days || 7
        });
      }
    }
  }
  // MAINTENANCE logic
  else if (hasDiskSpace || hasMemoryPressure || hasOverheating || hasBatteryIssue) {
    recommendationType = 'MAINTENANCE';
    confidence = 'HIGH';
    justification = 'Software/configuration issues detected. Maintenance can resolve without replacement.';
    
    if (hasDiskSpace) {
      actions.push('Run disk cleanup utility');
      actions.push('Identify and remove large unused files');
      actions.push('Consider storage expansion if business-critical');
    }
    
    if (hasMemoryPressure) {
      actions.push('Identify memory-intensive processes');
      actions.push('Check for memory leaks in applications');
      actions.push('Consider RAM upgrade if persistent');
    }
    
    if (hasOverheating) {
      actions.push('Clean dust from vents and fans');
      actions.push('Verify thermal paste condition');
      actions.push('Check ambient temperature and airflow');
    }
    
    if (hasBatteryIssue) {
      actions.push('Calibrate battery');
      actions.push('Check for battery-intensive background processes');
      actions.push('Consider battery replacement if <50% health');
      
      const batteryInventory = await base44.asServiceRole.entities.Inventory.filter({
        organization_id: orgId,
        category: 'battery'
      });
      
      if (batteryInventory.length > 0) {
        partsRequired.push({
          sku: batteryInventory[0].sku,
          qty_available: batteryInventory[0].qty_available,
          lead_time_days: batteryInventory[0].lead_time_days || 3
        });
      }
    }
  }
  // MONITOR logic (degrading but not critical yet)
  else {
    recommendationType = 'MONITOR';
    justification = 'Degradation trends detected. Continue monitoring; no immediate action required.';
    actions.push('Monitor health metrics daily');
    actions.push('Schedule follow-up evaluation in 7 days');
  }
  
  const recommendation = await base44.asServiceRole.entities.DeviceHealthRecommendation.create({
    organization_id: orgId,
    recommendation_id: recommendationId,
    device_id: device.device_id,
    recommendation_type: recommendationType,
    actions,
    parts_required: partsRequired,
    estimated_impact: recommendationType === 'REPLACE' ? 'Eliminates failure risk' : 'Reduces risk by 30-50%',
    justification,
    confidence,
    created_at: new Date().toISOString(),
    status: 'PENDING'
  });
  
  return recommendation;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all devices for organization
    const devices = await base44.asServiceRole.entities.Device.filter({
      organization_id: user.organization_id
    });

    const results = {
      devices_evaluated: 0,
      alerts_generated: 0,
      recommendations_generated: 0,
      errors: []
    };

    // Evaluate each device
    for (const device of devices) {
      try {
        // Run predictive health engine
        const healthResult = await base44.functions.invoke('predictiveHealthEngine', {
          device_id: device.device_id
        });
        
        if (healthResult.error) {
          results.errors.push({ device_id: device.device_id, error: healthResult.error });
          continue;
        }
        
        results.devices_evaluated++;
        
        // Generate alerts for HIGH/CRITICAL risk
        if (healthResult.risk_band === 'CRITICAL' || healthResult.risk_band === 'HIGH') {
          const alert = await generateAlert(
            base44,
            user.organization_id,
            device,
            healthResult.risk_band,
            `Device health degraded: ${healthResult.risk_band} risk`,
            healthResult.top_risk_factors,
            'Review device health details and follow recommendations'
          );
          
          if (alert) {
            results.alerts_generated++;
          }
        }
        
        // Generate recommendations for HIGH/CRITICAL risk
        if (healthResult.risk_band === 'CRITICAL' || healthResult.risk_band === 'HIGH') {
          const recommendation = await generateRecommendation(
            base44,
            user.organization_id,
            device,
            healthResult.top_risk_factors
          );
          
          if (recommendation) {
            results.recommendations_generated++;
          }
        }
        
      } catch (deviceError) {
        results.errors.push({ device_id: device.device_id, error: deviceError.message });
      }
    }
    
    // Escalate CRITICAL alerts that have been open for >6 hours
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const criticalAlerts = await base44.asServiceRole.entities.DeviceHealthAlert.filter({
      organization_id: user.organization_id,
      severity: 'CRITICAL',
      status: 'OPEN',
      created_date: { $lte: sixHoursAgo },
      escalated: false
    });
    
    for (const alert of criticalAlerts) {
      await base44.asServiceRole.entities.DeviceHealthAlert.update(alert.id, {
        escalated: true,
        escalated_at: new Date().toISOString()
      });
      
      // TODO: Trigger email/SMS notification (requires email provider)
    }

    return Response.json({
      success: true,
      ...results,
      evaluated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Device health evaluation error:', error);
    return Response.json({ 
      error: 'Evaluation failed',
      details: error.message 
    }, { status: 500 });
  }
});