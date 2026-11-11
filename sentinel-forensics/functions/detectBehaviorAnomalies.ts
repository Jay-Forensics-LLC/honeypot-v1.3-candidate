import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { enforceRBAC } from './enforceRBAC.js';
import { validateRequest } from './validateInput.js';

/**
 * Phase 2: UEBA - Real-time Anomaly Detection
 * Compares current user activity against established baseline
 */
Deno.serve(async (req) => {
  try {
    const { user, base44 } = await enforceRBAC(req, ['admin', 'analyst']);

    const body = await req.json();
    const validated = validateRequest(body, {
      user_email: { required: true, validator: 'email' }
    });
    const { user_email } = validated;

    // Fetch user's baseline
    const profiles = await base44.entities.BehaviorProfile.filter({
      user_id: user_email
    });

    if (profiles.length === 0) {
      return Response.json({
        success: false,
        message: 'No baseline found. Run buildUserBehaviorBaseline first.'
      });
    }

    const profile = profiles[0];
    const baseline = profile.baseline_behavior;

    // Fetch recent activity (last 24 hours)
    const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentLogs = await base44.entities.AuditLog.filter({
      organization_id: user.organization_id,
      user_id: user_email,
      timestamp: { $gte: recentCutoff }
    }, '-timestamp', 1000);

    // Anomaly detection
    const anomalies = [];
    let riskScore = 0;

    // Check 1: Unusual time-of-day activity
    const currentHour = new Date().getHours();
    const recentHours = new Set(recentLogs.map(log => new Date(log.timestamp).getHours()));
    const unusualHours = [...recentHours].filter(h => !baseline.typical_hours.includes(h));
    
    if (unusualHours.length > 0) {
      anomalies.push({
        type: 'unusual_time',
        severity: 'medium',
        description: `Activity detected at unusual hours: ${unusualHours.join(', ')}`,
        risk_contribution: 15
      });
      riskScore += 15;
    }

    // Check 2: Excessive activity volume
    const recentActionCount = recentLogs.length;
    const expectedDailyActions = baseline.avg_actions_per_day;
    
    if (recentActionCount > expectedDailyActions * 2) {
      anomalies.push({
        type: 'activity_spike',
        severity: 'high',
        description: `Activity volume ${Math.round(recentActionCount / expectedDailyActions * 100)}% above baseline`,
        risk_contribution: 25
      });
      riskScore += 25;
    }

    // Check 3: New/unusual actions
    const recentActions = new Set(recentLogs.map(log => log.action_performed));
    const knownActions = new Set(baseline.common_actions.map(a => a.action));
    const newActions = [...recentActions].filter(a => !knownActions.has(a));

    if (newActions.length > 0) {
      anomalies.push({
        type: 'unusual_actions',
        severity: 'medium',
        description: `New action types: ${newActions.join(', ')}`,
        risk_contribution: 20
      });
      riskScore += 20;
    }

    // Check 4: Failed actions
    const failedActions = recentLogs.filter(log => log.success === false);
    if (failedActions.length > 5) {
      anomalies.push({
        type: 'repeated_failures',
        severity: 'high',
        description: `${failedActions.length} failed actions detected`,
        risk_contribution: 30
      });
      riskScore += 30;
    }

    // Update profile with current risk score
    await base44.asServiceRole.entities.BehaviorProfile.update(profile.id, {
      current_risk_score: Math.min(riskScore, 100),
      behavior_changes: [
        ...profile.behavior_changes.slice(-9), // Keep last 10
        {
          change_type: anomalies.length > 0 ? 'anomaly_detected' : 'normal_activity',
          severity: riskScore >= 50 ? 'high' : riskScore >= 25 ? 'medium' : 'low',
          detected_at: new Date().toISOString(),
          details: anomalies.map(a => a.description).join('; ')
        }
      ]
    });

    // Create alert if high risk
    if (riskScore >= 50) {
      await base44.asServiceRole.entities.Alert.create({
        organization_id: user.organization_id,
        alert_type: 'unauthorized_access',
        severity: riskScore >= 70 ? 'critical' : 'high',
        title: `Insider Threat Risk: ${user_email}`,
        description: `UEBA detected ${anomalies.length} behavioral anomalies with risk score ${riskScore}`,
        source: 'ueba_engine',
        detection_timestamp: new Date().toISOString(),
        status: 'new',
        threat_score: riskScore,
        affected_systems: [user_email],
        recommended_actions: [
          'Review user activity logs',
          'Verify user identity',
          'Consider temporary access restriction'
        ]
      });
    }

    return Response.json({
      success: true,
      user_email,
      risk_score: Math.min(riskScore, 100),
      anomalies_detected: anomalies.length,
      anomalies
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});