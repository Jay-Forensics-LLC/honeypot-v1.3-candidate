import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { enforceRBAC } from './enforceRBAC.js';
import { validators, validateRequest } from './validateInput.js';

/**
 * Phase 2: UEBA - User Behavior Baseline Builder
 * Analyzes historical user activity to establish normal behavior patterns
 */
Deno.serve(async (req) => {
  try {
    const { user, base44 } = await enforceRBAC(req, ['admin']);

    const body = await req.json();
    const validated = validateRequest(body, {
      user_email: { required: true, validator: 'email' },
      analysis_days: { required: false, validator: 'positiveInteger' }
    });
    const { user_email, analysis_days = 30 } = validated;

    // Fetch user's audit logs
    const cutoffDate = new Date(Date.now() - analysis_days * 24 * 60 * 60 * 1000).toISOString();
    
    const auditLogs = await base44.entities.AuditLog.filter({
      organization_id: user.organization_id,
      user_id: user_email,
      timestamp: { $gte: cutoffDate }
    }, '-timestamp', 5000);

    if (auditLogs.length < 10) {
      return Response.json({
        success: false,
        message: 'Insufficient data to build baseline',
        logs_analyzed: auditLogs.length
      });
    }

    // Analyze patterns
    const hourDistribution = new Array(24).fill(0);
    const dayDistribution = new Array(7).fill(0);
    const actionFrequency = {};
    const locationSet = new Set();

    auditLogs.forEach(log => {
      const logDate = new Date(log.timestamp);
      hourDistribution[logDate.getHours()]++;
      dayDistribution[logDate.getDay()]++;
      
      actionFrequency[log.action_performed] = (actionFrequency[log.action_performed] || 0) + 1;
      
      if (log.metadata?.location) {
        locationSet.add(log.metadata.location);
      }
    });

    // Calculate most common hours (top 3)
    const typicalHours = hourDistribution
      .map((count, hour) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(h => h.hour);

    // Calculate baseline metrics
    const baseline = {
      avg_actions_per_day: auditLogs.length / analysis_days,
      typical_hours: typicalHours,
      typical_days: dayDistribution.map((count, day) => ({ day, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map(d => d.day),
      common_actions: Object.entries(actionFrequency)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([action, count]) => ({ action, count })),
      known_locations: Array.from(locationSet),
      session_duration_avg: 120 // minutes (placeholder)
    };

    // Create/Update BehaviorProfile entity
    const existingProfiles = await base44.entities.BehaviorProfile.filter({
      user_id: user_email
    });

    const profileData = {
      user_id: user_email,
      baseline_behavior: baseline,
      current_risk_score: 0,
      last_analysis: new Date().toISOString(),
      anomaly_predictions: [],
      behavior_changes: []
    };

    let profile;
    if (existingProfiles.length > 0) {
      profile = await base44.asServiceRole.entities.BehaviorProfile.update(
        existingProfiles[0].id,
        profileData
      );
    } else {
      profile = await base44.asServiceRole.entities.BehaviorProfile.create(profileData);
    }

    // Audit log
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      event_type: 'ueba_baseline_created',
      severity: 'info',
      description: `Behavior baseline created for ${user_email}`,
      user_id: user.email,
      action_performed: 'build_baseline',
      timestamp: new Date().toISOString(),
      blockchain_hash: crypto.randomUUID(),
      metadata: {
        target_user: user_email,
        logs_analyzed: auditLogs.length,
        analysis_days
      },
      success: true
    });

    return Response.json({
      success: true,
      profile_id: profile.id,
      baseline,
      logs_analyzed: auditLogs.length
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});