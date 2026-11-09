import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * SUPPRESSION GOVERNANCE V2
 * Suppressions stored as separate records (findings remain immutable)
 * Regulated profiles require admin approval
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { finding_id, reason, action = 'suppress', duration_days } = await req.json();

    if (!finding_id) {
      return Response.json({ error: 'finding_id required' }, { status: 400 });
    }

    const findings = await base44.entities.CodebaseAuditFinding.filter({ id: finding_id });
    if (!findings.length) {
      return Response.json({ error: 'Finding not found' }, { status: 404 });
    }

    const finding = findings[0];

    // Get run to check profile
    const runs = await base44.entities.CodebaseAuditRun.filter({ id: finding.run_id });
    const run = runs[0];
    const isRegulated = run?.audit_profile === 'REGULATED';
    const requiresApproval = isRegulated && user.role !== 'admin';

    if (action === 'suppress') {
      if (!reason) {
        return Response.json({ error: 'reason required' }, { status: 400 });
      }

      // Check existing suppression
      const existing = await base44.entities.CodebaseAuditSuppressionRecord.filter({
        organization_id: user.organization_id,
        finding_fingerprint: finding.fingerprint
      });

      const expiresAt = duration_days 
        ? new Date(Date.now() + duration_days * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const reviewRequired = isRegulated 
        ? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
        : null;

      if (existing.length) {
        await base44.entities.CodebaseAuditSuppressionRecord.update(existing[0].id, {
          suppressed: true,
          reason,
          suppressed_by_user_id: user.id,
          suppressed_at: new Date().toISOString(),
          expires_at: expiresAt,
          review_required_after: reviewRequired,
          last_seen_in_run_id: finding.run_id,
          approval_required: requiresApproval,
          approved_by_user_id: requiresApproval ? null : user.id,
          approved_at: requiresApproval ? null : new Date().toISOString()
        });
      } else {
        await base44.entities.CodebaseAuditSuppressionRecord.create({
          organization_id: user.organization_id,
          finding_fingerprint: finding.fingerprint,
          suppression_key: `${finding.rule_id}:${finding.file_path}:${finding.line_start || 'global'}`,
          suppressed: true,
          reason,
          suppressed_by_user_id: user.id,
          suppressed_at: new Date().toISOString(),
          expires_at: expiresAt,
          review_required_after: reviewRequired,
          last_seen_in_run_id: finding.run_id,
          approval_required: requiresApproval,
          approved_by_user_id: requiresApproval ? null : user.id,
          approved_at: requiresApproval ? null : new Date().toISOString()
        });
      }

      return Response.json({ 
        success: true, 
        requires_approval: requiresApproval,
        message: requiresApproval ? 'Suppression pending admin approval' : 'Finding suppressed'
      });

    } else if (action === 'unsuppress') {
      const existing = await base44.entities.CodebaseAuditSuppressionRecord.filter({
        organization_id: user.organization_id,
        finding_fingerprint: finding.fingerprint
      });

      if (existing.length) {
        await base44.entities.CodebaseAuditSuppressionRecord.update(existing[0].id, {
          suppressed: false
        });
      }

      return Response.json({ success: true });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Suppress finding error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});