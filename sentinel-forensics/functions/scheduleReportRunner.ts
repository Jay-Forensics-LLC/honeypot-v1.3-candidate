/**
 * PHASE 3: Scheduled Report Runner
 * 
 * Executes scheduled reports with concurrency controls, retry logic, and audit trail.
 * ADMIN-ONLY: Should be invoked by scheduled tasks or admin users only.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    // RBAC: Admin-only for manual execution
    if (user && user.role !== 'admin') {
      return Response.json({ 
        error: 'Forbidden: Admin access required' 
      }, { status: 403 });
    }
    
    const { schedule_id } = await req.json();
    
    if (!schedule_id) {
      return Response.json({ error: 'Missing schedule_id' }, { status: 400 });
    }
    
    // Fetch schedule
    const schedule = await base44.asServiceRole.entities.ReportSchedule.get(schedule_id);
    
    if (!schedule || !schedule.is_active) {
      return Response.json({ error: 'Schedule not found or inactive' }, { status: 404 });
    }
    
    // Concurrency control: check for running reports
    if (schedule.concurrency_control?.prevent_overlap) {
      const runningReports = await base44.asServiceRole.entities.ReportRun.filter({
        organization_id: schedule.organization_id,
        status: 'generating'
      });
      
      const concurrentCount = runningReports.filter(r => 
        r.template_id === schedule.template_id &&
        (schedule.case_id ? r.case_id === schedule.case_id : true)
      ).length;
      
      const maxConcurrent = schedule.concurrency_control?.max_concurrent_runs || 1;
      
      if (concurrentCount >= maxConcurrent) {
        console.log(`Concurrency limit reached (${concurrentCount}/${maxConcurrent})`);
        return Response.json({ 
          skipped: true,
          reason: 'Concurrency limit reached'
        });
      }
    }
    
    // Generate report via existing function
    const reportResponse = await base44.asServiceRole.functions.invoke('generateReport', {
      case_id: schedule.case_id,
      template_id: schedule.template_id,
      report_title: `${schedule.schedule_name} - ${new Date().toISOString()}`
    });
    
    if (!reportResponse.success) {
      throw new Error(reportResponse.error || 'Report generation failed');
    }
    
    // Distribute if policy is set
    if (schedule.policy_id) {
      await base44.asServiceRole.functions.invoke('distributeReport', {
        report_run_id: reportResponse.report.id,
        policy_id: schedule.policy_id
      });
    }
    
    // Update schedule metadata
    await base44.asServiceRole.entities.ReportSchedule.update(schedule_id, {
      last_run_at: new Date().toISOString(),
      run_count: (schedule.run_count || 0) + 1
    });
    
    // Audit log
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: schedule.organization_id,
      event_type: 'scheduled_report_executed',
      severity: 'info',
      description: `Scheduled report executed: ${schedule.schedule_name}`,
      user_id: user?.email || 'system',
      resource_type: 'ReportSchedule',
      resource_id: schedule_id,
      case_id: schedule.case_id,
      action_performed: 'execute',
      metadata: {
        report_run_id: reportResponse.report.id,
        distributed: !!schedule.policy_id
      },
      success: true,
      blockchain_hash: '',
      timestamp: new Date().toISOString()
    });
    
    return Response.json({ 
      success: true,
      report_run_id: reportResponse.report.id,
      distributed: !!schedule.policy_id
    });
    
  } catch (error) {
    console.error('Scheduled report execution failed:', error);
    return Response.json({ 
      error: error.message || 'Failed to execute scheduled report' 
    }, { status: 500 });
  }
});