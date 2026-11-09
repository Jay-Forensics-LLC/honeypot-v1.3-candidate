import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * USER BEHAVIOR ANALYTICS
 * Analyzes user activity patterns to detect anomalies
 * Baselines normal behavior and flags deviations
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !user.organization_id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { target_user_email, days_to_analyze = 7 } = await req.json();

    // Analyze all users in org if no target specified
    const usersToAnalyze = target_user_email 
      ? [target_user_email]
      : await getUsersInOrg(base44, user.organization_id);

    const results = [];

    for (const userEmail of usersToAnalyze) {
      const analysis = await analyzeUserActivity(base44, user.organization_id, userEmail, days_to_analyze);
      results.push(analysis);

      // Store analysis result
      await base44.asServiceRole.entities.UserBehaviorAnalytics.create(analysis);
    }

    return Response.json({
      success: true,
      analyzed_users: results.length,
      results: results,
      high_risk_users: results.filter(r => r.risk_score >= 70).length,
      suspicious_users: results.filter(r => r.status === 'suspicious' || r.status === 'critical').length
    });

  } catch (error) {
    console.error('UBA analysis failed:', error);
    return Response.json({ 
      error: error.message,
      details: error.stack 
    }, { status: 500 });
  }
});

async function getUsersInOrg(base44, orgId) {
  try {
    // Get audit logs to find active users
    const recentLogs = await base44.asServiceRole.entities.SentinelAuditLog.filter(
      { organization_id: orgId },
      '-timestamp',
      100
    );

    const uniqueUsers = [...new Set(recentLogs.map(log => log.user_email))];
    return uniqueUsers.filter(Boolean);
  } catch (error) {
    console.warn('Failed to get org users:', error);
    return [];
  }
}

async function analyzeUserActivity(base44, orgId, userEmail, daysBack) {
  const now = new Date();
  const startDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));

  // Gather user activity data
  const [auditLogs, evidenceAccess, caseAccess] = await Promise.all([
    base44.asServiceRole.entities.SentinelAuditLog.filter(
      { 
        organization_id: orgId,
        user_email: userEmail,
        timestamp: { $gte: startDate.toISOString() }
      },
      '-timestamp',
      1000
    ).catch(() => []),
    
    base44.asServiceRole.entities.EvidenceV2.filter(
      { 
        organization_id: orgId,
        created_by: userEmail,
        created_date: { $gte: startDate.toISOString() }
      },
      '-created_date',
      500
    ).catch(() => []),
    
    base44.asServiceRole.entities.Case.filter(
      { 
        organization_id: orgId,
        assigned_to: userEmail,
        created_date: { $gte: startDate.toISOString() }
      },
      '-created_date',
      500
    ).catch(() => [])
  ]);

  // Calculate baseline metrics
  const baseline = calculateBaseline(auditLogs, evidenceAccess, caseAccess);

  // Detect anomalies
  const anomalies = detectAnomalies(auditLogs, evidenceAccess, caseAccess, baseline);

  // Calculate risk score
  const riskScore = calculateRiskScore(anomalies);

  return {
    organization_id: orgId,
    user_email: userEmail,
    analysis_period_start: startDate.toISOString(),
    analysis_period_end: now.toISOString(),
    baseline_metrics: baseline,
    anomalies_detected: anomalies,
    risk_score: riskScore,
    status: riskScore >= 70 ? 'critical' : riskScore >= 40 ? 'suspicious' : 'normal',
    requires_investigation: riskScore >= 60
  };
}

function calculateBaseline(auditLogs, evidenceAccess, caseAccess) {
  const loginTimes = auditLogs
    .filter(log => log.action === 'login')
    .map(log => new Date(log.timestamp).getHours());

  const avgLoginTime = loginTimes.length > 0
    ? Math.round(loginTimes.reduce((a, b) => a + b, 0) / loginTimes.length)
    : 9; // Default 9 AM

  // Session duration estimation (time between login and last action)
  const sessionDurations = [];
  let lastLoginTime = null;
  for (const log of auditLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))) {
    if (log.action === 'login') {
      lastLoginTime = new Date(log.timestamp);
    } else if (lastLoginTime) {
      const duration = (new Date(log.timestamp) - lastLoginTime) / 60000; // minutes
      if (duration < 480) { // Less than 8 hours
        sessionDurations.push(duration);
      }
    }
  }

  const avgSessionDuration = sessionDurations.length > 0
    ? Math.round(sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length)
    : 120; // Default 2 hours

  // Access patterns
  const actions = auditLogs.map(log => log.action);
  const actionCounts = {};
  actions.forEach(action => {
    actionCounts[action] = (actionCounts[action] || 0) + 1;
  });
  const typicalActions = Object.entries(actionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([action]) => action);

  // Locations (from metadata if available)
  const locations = auditLogs
    .map(log => log.details?.ip_address || log.details?.location)
    .filter(Boolean);
  const uniqueLocations = [...new Set(locations)];

  // Devices
  const devices = auditLogs
    .map(log => log.details?.device_id || log.details?.user_agent)
    .filter(Boolean);
  const uniqueDevices = [...new Set(devices)];

  return {
    avg_login_time: `${avgLoginTime}:00`,
    avg_session_duration_minutes: avgSessionDuration,
    typical_access_patterns: typicalActions,
    typical_locations: uniqueLocations.slice(0, 5),
    typical_devices: uniqueDevices.slice(0, 3),
    avg_evidence_accessed_per_day: Math.round(evidenceAccess.length / 7),
    avg_cases_accessed_per_day: Math.round(caseAccess.length / 7)
  };
}

function detectAnomalies(auditLogs, evidenceAccess, caseAccess, baseline) {
  const anomalies = [];
  const now = new Date();

  // Check for unusual login times
  const recentLogins = auditLogs.filter(log => log.action === 'login');
  for (const login of recentLogins) {
    const loginHour = new Date(login.timestamp).getHours();
    const baselineHour = parseInt(baseline.avg_login_time.split(':')[0]);
    
    // Detect after-hours access (10 PM - 6 AM)
    if (loginHour >= 22 || loginHour <= 6) {
      anomalies.push({
        anomaly_type: 'after_hours_access',
        severity: 'medium',
        description: `Login at ${loginHour}:00 (after hours)`,
        detected_at: login.timestamp,
        deviation_score: 60,
        evidence: { login_time: loginHour, baseline_time: baselineHour }
      });
    }
    // Detect unusual time (>3 hours deviation)
    else if (Math.abs(loginHour - baselineHour) > 3) {
      anomalies.push({
        anomaly_type: 'unusual_login_time',
        severity: 'low',
        description: `Login at ${loginHour}:00, typical time is ${baseline.avg_login_time}`,
        detected_at: login.timestamp,
        deviation_score: 40,
        evidence: { login_time: loginHour, baseline_time: baselineHour }
      });
    }
  }

  // Check for excessive data access
  const recentEvidenceAccess = evidenceAccess.filter(e => {
    const createdDate = new Date(e.created_date);
    return (now - createdDate) < (24 * 60 * 60 * 1000); // Last 24 hours
  });

  if (recentEvidenceAccess.length > baseline.avg_evidence_accessed_per_day * 3) {
    anomalies.push({
      anomaly_type: 'excessive_data_access',
      severity: 'high',
      description: `Accessed ${recentEvidenceAccess.length} evidence items (3x normal)`,
      detected_at: now.toISOString(),
      deviation_score: 75,
      evidence: { 
        count: recentEvidenceAccess.length, 
        baseline: baseline.avg_evidence_accessed_per_day 
      }
    });
  }

  // Check for unusual export activity
  const exportActions = auditLogs.filter(log => 
    log.action?.includes('export') || 
    log.action?.includes('download') ||
    log.resource_type === 'evidence' && log.action === 'accessed'
  );

  if (exportActions.length > 20) {
    anomalies.push({
      anomaly_type: 'suspicious_export_activity',
      severity: 'critical',
      description: `High volume of export/download activities: ${exportActions.length}`,
      detected_at: now.toISOString(),
      deviation_score: 85,
      evidence: { export_count: exportActions.length }
    });
  }

  // Check for rapid case switching (potential data harvesting)
  const caseAccessActions = auditLogs.filter(log => 
    log.resource_type === 'Case' && log.action === 'accessed'
  );

  const uniqueCases = new Set(caseAccessActions.map(log => log.resource_id));
  if (uniqueCases.size > 15) {
    anomalies.push({
      anomaly_type: 'rapid_case_switching',
      severity: 'high',
      description: `Accessed ${uniqueCases.size} different cases rapidly`,
      detected_at: now.toISOString(),
      deviation_score: 70,
      evidence: { unique_cases: uniqueCases.size }
    });
  }

  // Check for privilege escalation attempts
  const privilegeActions = auditLogs.filter(log =>
    log.action?.includes('permission') ||
    log.action?.includes('role') ||
    log.action?.includes('admin')
  );

  if (privilegeActions.length > 0) {
    anomalies.push({
      anomaly_type: 'privilege_escalation_attempt',
      severity: 'critical',
      description: `Attempted ${privilegeActions.length} privilege-related actions`,
      detected_at: now.toISOString(),
      deviation_score: 95,
      evidence: { privilege_attempts: privilegeActions.length }
    });
  }

  // Check for unusual location/device
  const recentLocationActions = auditLogs.slice(0, 10);
  const recentLocations = recentLocationActions
    .map(log => log.details?.ip_address)
    .filter(Boolean);
  
  const unusualLocations = recentLocations.filter(loc => 
    !baseline.typical_locations.includes(loc)
  );

  if (unusualLocations.length > 0) {
    anomalies.push({
      anomaly_type: 'unusual_location',
      severity: 'medium',
      description: `Access from ${unusualLocations.length} new location(s)`,
      detected_at: now.toISOString(),
      deviation_score: 55,
      evidence: { new_locations: unusualLocations.slice(0, 3) }
    });
  }

  return anomalies;
}

function calculateRiskScore(anomalies) {
  if (anomalies.length === 0) return 0;

  const severityWeights = {
    low: 10,
    medium: 25,
    high: 50,
    critical: 80
  };

  let totalScore = 0;
  for (const anomaly of anomalies) {
    totalScore += severityWeights[anomaly.severity] || 0;
  }

  // Cap at 100
  return Math.min(100, totalScore);
}