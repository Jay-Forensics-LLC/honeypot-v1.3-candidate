import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * BACKEND ONLY - Record usage metrics
 * Fixes Issue #013: Usage metrics cannot be manipulated by users
 * 
 * Called by other backend functions when:
 * - Evidence uploaded (evidence_mb)
 * - Scan performed (scans_count)
 * - Device enrolled (devices_enrolled)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { metric_type, delta } = await req.json();

    if (!metric_type || typeof delta !== 'number') {
      return Response.json({ 
        error: 'Missing metric_type or delta' 
      }, { status: 400 });
    }

    const validMetrics = ['scans_count', 'evidence_mb', 'devices_enrolled'];
    if (!validMetrics.includes(metric_type)) {
      return Response.json({ 
        error: `Invalid metric_type. Must be: ${validMetrics.join(', ')}` 
      }, { status: 400 });
    }

    // Get current user
    const currentUser = await base44.asServiceRole.entities.User.get(user.id);
    
    const currentMetrics = currentUser.usage_metrics || {
      scans_count: 0,
      evidence_mb: 0,
      devices_enrolled: 0,
      last_reset: new Date().toISOString()
    };

    // Update specific metric
    const newValue = (currentMetrics[metric_type] || 0) + delta;

    // Prevent negative values
    if (newValue < 0) {
      return Response.json({ 
        error: 'Cannot reduce metric below 0' 
      }, { status: 400 });
    }

    const updatedMetrics = {
      ...currentMetrics,
      [metric_type]: newValue
    };

    // Issue #013: Update using service role (users cannot modify directly)
    await base44.asServiceRole.entities.User.update(user.id, {
      usage_metrics: updatedMetrics
    });

    // Check subscription limits
    const limits = getSubscriptionLimits(currentUser.subscription_tier);
    const isOverLimit = newValue > (limits[metric_type] || Infinity);

    if (isOverLimit) {
      // Create alert for over-limit usage
      await base44.asServiceRole.entities.Alert.create({
        alert_type: 'system_compromise',
        severity: 'medium',
        title: 'Subscription Limit Exceeded',
        description: `User has exceeded ${metric_type} limit: ${newValue} / ${limits[metric_type]}`,
        source: 'usage_monitor',
        status: 'new',
        created_by: 'system'
      });
    }

    return Response.json({ 
      success: true,
      metric_type,
      delta,
      new_value: newValue,
      over_limit: isOverLimit
    });

  } catch (error) {
    console.error('Usage recording failed:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});

function getSubscriptionLimits(tier) {
  const limits = {
    free: {
      scans_count: 10,
      evidence_mb: 500,
      devices_enrolled: 1
    },
    plus: {
      scans_count: 100,
      evidence_mb: 5000,
      devices_enrolled: 5
    },
    pro: {
      scans_count: Infinity,
      evidence_mb: Infinity,
      devices_enrolled: Infinity
    }
  };

  return limits[tier] || limits.free;
}