import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Manage Report Review Workflow
 * Supports attorney/counsel review and locking of final reports
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, ...params } = await req.json();

    switch (action) {
      case 'request_review': {
        const { reportRunId, reviewer, deadline, notes } = params;

        // Verify run exists and user has access
        const runs = await base44.entities.ReportRun.filter({ id: reportRunId });
        const run = runs[0];

        if (!run) {
          return Response.json({ error: 'Report run not found' }, { status: 404 });
        }

        // Check current state
        if (run.review_state !== 'draft') {
          return Response.json({ 
            error: `Cannot request review - report is already ${run.review_state}` 
          }, { status: 400 });
        }

        // Create review request
        const request = await base44.entities.ReportReviewRequest.create({
          organization_id: user.organization_id,
          report_run_id: reportRunId,
          requested_by: user.email,
          reviewer,
          state: 'pending',
          deadline: deadline || null,
          request_notes: notes || '',
          requested_at: new Date().toISOString()
        });

        // Update run state
        await base44.entities.ReportRun.update(reportRunId, {
          review_state: 'under_review'
        });

        // Send email notification to reviewer
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            from_name: 'Sentinel-Forensics Review System',
            to: reviewer,
            subject: 'Report Review Requested',
            body: `A report review has been requested by ${user.email}.\n\nRun ID: ${reportRunId}\nDeadline: ${deadline ? new Date(deadline).toLocaleString() : 'None'}\nNotes: ${notes || 'None'}\n\nPlease log in to review.`
          });
        } catch (emailError) {
          console.error('Email notification failed:', emailError);
        }

        // Audit log
        await base44.asServiceRole.entities.AuditLog.create({
          organization_id: user.organization_id,
          event_type: 'REPORT_REVIEW_REQUESTED',
          severity: 'info',
          description: `Report review requested for run ${reportRunId}`,
          user_id: user.email,
          success: true,
          metadata: {
            report_run_id: reportRunId,
            reviewer,
            request_id: request.id
          }
        });

        return Response.json({ request, success: true });
      }

      case 'submit_decision': {
        const { reviewRequestId, decision, comments } = params;

        // Get review request
        const requests = await base44.entities.ReportReviewRequest.filter({ id: reviewRequestId });
        const request = requests[0];

        if (!request) {
          return Response.json({ error: 'Review request not found' }, { status: 404 });
        }

        // Verify user is the assigned reviewer or admin
        if (request.reviewer !== user.email && user.role !== 'admin') {
          return Response.json({ error: 'Forbidden - not assigned reviewer' }, { status: 403 });
        }

        // Validate rejection has comments
        if (decision === 'rejected' && !comments?.trim()) {
          return Response.json({ error: 'Comments required for rejection' }, { status: 400 });
        }

        // Create decision record
        const reviewDecision = await base44.asServiceRole.entities.ReportReviewDecision.create({
          organization_id: user.organization_id,
          review_request_id: reviewRequestId,
          decision,
          comments: comments || '',
          decided_by: user.email,
          decided_at: new Date().toISOString(),
          reviewer_role: user.role
        });

        // Update review request
        await base44.entities.ReportReviewRequest.update(reviewRequestId, {
          state: decision,
          reviewed_at: new Date().toISOString()
        });

        // Update report run state
        const newState = decision === 'approved' ? 'approved' : 'rejected';
        await base44.entities.ReportRun.update(request.report_run_id, {
          review_state: newState
        });

        // Audit log
        await base44.asServiceRole.entities.AuditLog.create({
          organization_id: user.organization_id,
          event_type: decision === 'approved' ? 'REPORT_REVIEW_APPROVED' : 'REPORT_REVIEW_REJECTED',
          severity: 'info',
          description: `Report review ${decision}: run ${request.report_run_id}`,
          user_id: user.email,
          success: true,
          metadata: {
            report_run_id: request.report_run_id,
            review_request_id: reviewRequestId,
            decision_id: reviewDecision.id,
            has_comments: !!comments
          }
        });

        // Notify requester
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            from_name: 'Sentinel-Forensics Review System',
            to: request.requested_by,
            subject: `Report Review ${decision === 'approved' ? 'Approved' : 'Rejected'}`,
            body: `Your report review has been ${decision} by ${user.email}.\n\nRun ID: ${request.report_run_id}\nComments: ${comments || 'None'}\n\nView in-app for details.`
          });
        } catch (emailError) {
          console.error('Email notification failed:', emailError);
        }

        return Response.json({ decision: reviewDecision, success: true });
      }

      case 'lock_final': {
        const { reportRunId } = params;

        // Get run
        const runs = await base44.entities.ReportRun.filter({ id: reportRunId });
        const run = runs[0];

        if (!run) {
          return Response.json({ error: 'Report run not found' }, { status: 404 });
        }

        // Verify approved state
        if (run.review_state !== 'approved') {
          return Response.json({ 
            error: `Cannot lock - report must be approved first (current state: ${run.review_state})` 
          }, { status: 400 });
        }

        // Verify user is admin or attorney
        if (user.role !== 'admin') {
          return Response.json({ error: 'Forbidden - admin role required to lock reports' }, { status: 403 });
        }

        // Generate evidence snapshot hash
        const snapshotData = JSON.stringify(run.evidence_snapshot);
        const snapshotHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(snapshotData));
        const snapshotHashHex = Array.from(new Uint8Array(snapshotHash))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');

        // Lock the report
        await base44.entities.ReportRun.update(reportRunId, {
          review_state: 'locked_final',
          is_locked_final: true,
          finalized_at: new Date().toISOString(),
          finalized_by: user.email,
          evidence_snapshot: {
            ...run.evidence_snapshot,
            snapshot_hash: snapshotHashHex
          }
        });

        // Audit log
        await base44.asServiceRole.entities.AuditLog.create({
          organization_id: user.organization_id,
          event_type: 'REPORT_LOCKED_FINAL',
          severity: 'warning',
          description: `Report locked as final: run ${reportRunId}`,
          user_id: user.email,
          success: true,
          metadata: {
            report_run_id: reportRunId,
            evidence_snapshot_hash: snapshotHashHex,
            evidence_count: run.evidence_snapshot?.evidence_count
          }
        });

        return Response.json({ success: true, locked: true });
      }

      case 'list_pending_reviews': {
        // Get all pending reviews where user is reviewer
        const requests = await base44.entities.ReportReviewRequest.filter({
          reviewer: user.email,
          state: 'pending'
        });

        // Get associated runs
        const runIds = requests.map(r => r.report_run_id);
        const runs = await base44.entities.ReportRun.filter({});
        const relevantRuns = runs.filter(r => runIds.includes(r.id));

        // Get definitions
        const defIds = relevantRuns.map(r => r.definition_id);
        const definitions = await base44.entities.ReportDefinition.filter({});
        const relevantDefs = definitions.filter(d => defIds.includes(d.id));

        // Get cases
        const caseIds = relevantDefs.map(d => d.case_id);
        const cases = await base44.entities.Case.filter({});
        const relevantCases = cases.filter(c => caseIds.includes(c.id));

        // Enrich requests
        const enriched = requests.map(req => {
          const run = relevantRuns.find(r => r.id === req.report_run_id);
          const def = relevantDefs.find(d => d.id === run?.definition_id);
          const caseData = relevantCases.find(c => c.id === def?.case_id);

          return {
            ...req,
            run,
            definition: def,
            case: caseData
          };
        });

        return Response.json({ reviews: enriched });
      }

      default:
        return Response.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Report review management error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});