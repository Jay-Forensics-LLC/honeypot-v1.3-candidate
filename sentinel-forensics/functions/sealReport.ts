/**
 * PHASE 7: Report Sealing (Evidence-Grade Hardening)
 * 
 * Seals a report run, preventing further edits and adding signature-ready metadata.
 * RBAC: Admin-only operation.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ 
        error: 'Forbidden: Admin access required to seal reports' 
      }, { status: 403 });
    }
    
    const { report_run_id } = await req.json();
    
    if (!report_run_id) {
      return Response.json({ error: 'Missing report_run_id' }, { status: 400 });
    }
    
    const reportRun = await base44.entities.ReportRun.get(report_run_id);
    
    if (!reportRun) {
      return Response.json({ error: 'Report not found' }, { status: 404 });
    }
    
    if (reportRun.sealed) {
      return Response.json({ error: 'Report already sealed' }, { status: 400 });
    }
    
    if (reportRun.status !== 'completed') {
      return Response.json({ 
        error: 'Can only seal completed reports' 
      }, { status: 400 });
    }
    
    // Seal the report
    const sealedReport = await base44.asServiceRole.entities.ReportRun.update(report_run_id, {
      sealed: true,
      sealed_at: new Date().toISOString(),
      sealed_by: user.email
    });
    
    // Audit log
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id || 'default',
      event_type: 'report_sealed',
      severity: 'warning',
      description: `Report ${reportRun.report_number} sealed`,
      user_id: user.email,
      resource_type: 'ReportRun',
      resource_id: report_run_id,
      case_id: reportRun.case_id,
      action_performed: 'seal',
      metadata: {
        report_number: reportRun.report_number
      },
      success: true,
      blockchain_hash: '',
      timestamp: new Date().toISOString()
    });
    
    return Response.json({ 
      success: true,
      report: sealedReport
    });
    
  } catch (error) {
    console.error('Report sealing failed:', error);
    return Response.json({ 
      error: error.message || 'Failed to seal report' 
    }, { status: 500 });
  }
});