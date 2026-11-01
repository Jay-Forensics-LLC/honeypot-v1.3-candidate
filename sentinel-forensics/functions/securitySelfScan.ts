import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const findings = [];

    // Check 1: Weak passwords (users without strong password policy)
    const users = await base44.asServiceRole.entities.User.list();
    const usersWithoutMFA = users.filter(u => !u.mfa_enabled);
    if (usersWithoutMFA.length > 0) {
      findings.push({
        category: 'authentication',
        severity: 'high',
        finding: `${usersWithoutMFA.length} users without MFA enabled`,
        recommendation: 'Enforce MFA for all users'
      });
    }

    // Check 2: Inactive sessions
    const sessions = await base44.asServiceRole.entities.SessionToken.filter({
      revoked: false,
      last_activity: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }
    });
    if (sessions.length > 0) {
      findings.push({
        category: 'session_management',
        severity: 'medium',
        finding: `${sessions.length} stale sessions (inactive > 24h)`,
        recommendation: 'Auto-revoke inactive sessions'
      });
    }

    // Check 3: Unresolved critical security events
    const criticalEvents = await base44.asServiceRole.entities.SecurityEvent.filter({
      severity: 'critical',
      resolved: false,
      timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() }
    });
    if (criticalEvents.length > 0) {
      findings.push({
        category: 'incident_response',
        severity: 'critical',
        finding: `${criticalEvents.length} unresolved critical security events`,
        recommendation: 'Review and resolve critical events immediately'
      });
    }

    // Check 4: Evidence without verification
    const unverifiedEvidence = await base44.asServiceRole.entities.Evidence.filter({
      is_verified: false
    });
    if (unverifiedEvidence.length > 0) {
      findings.push({
        category: 'evidence_integrity',
        severity: 'high',
        finding: `${unverifiedEvidence.length} evidence items not verified`,
        recommendation: 'Verify all evidence for chain of custody'
      });
    }

    // Check 5: Cases without assigned investigator
    const unassignedCases = await base44.asServiceRole.entities.Case.filter({
      status: { $in: ['open', 'active'] },
      assigned_investigator: null
    });
    if (unassignedCases.length > 0) {
      findings.push({
        category: 'case_management',
        severity: 'medium',
        finding: `${unassignedCases.length} active cases without assigned investigator`,
        recommendation: 'Assign investigators to all active cases'
      });
    }

    // Calculate security score
    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const highCount = findings.filter(f => f.severity === 'high').length;
    const mediumCount = findings.filter(f => f.severity === 'medium').length;
    
    const securityScore = Math.max(0, 100 - (criticalCount * 30 + highCount * 15 + mediumCount * 5));

    // Create scan record
    await base44.asServiceRole.entities.AuditLog.create({
      event_type: 'security_self_scan',
      severity: criticalCount > 0 ? 'critical' : highCount > 0 ? 'warning' : 'info',
      description: `Security self-scan completed: ${findings.length} findings`,
      user_id: user.email,
      timestamp: new Date().toISOString(),
      success: true,
      metadata: {
        findings_count: findings.length,
        security_score: securityScore,
        categories: {
          critical: criticalCount,
          high: highCount,
          medium: mediumCount
        }
      }
    });

    return Response.json({
      security_score: securityScore,
      findings,
      scan_timestamp: new Date().toISOString(),
      scanned_by: user.email,
      summary: {
        total_findings: findings.length,
        critical: criticalCount,
        high: highCount,
        medium: mediumCount
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});