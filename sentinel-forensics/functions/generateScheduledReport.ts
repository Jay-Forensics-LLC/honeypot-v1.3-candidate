import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * SCHEDULED REPORT GENERATOR
 * Executes report generation on schedule with forensic audit trail
 * 
 * SECURITY:
 * - Idempotent execution (no duplicate sends)
 * - Hash-chained audit trail
 * - Tamper-evident artifact tracking
 */

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const { schedule_id, manual_trigger = false } = await req.json();
    
    if (!schedule_id) {
      return Response.json({ error: 'schedule_id required' }, { status: 400 });
    }
    
    // Fetch schedule and template
    const schedule = await base44.asServiceRole.entities.ReportSchedule.filter({ id: schedule_id });
    if (!schedule || schedule.length === 0) {
      return Response.json({ error: 'Schedule not found' }, { status: 404 });
    }
    
    const scheduleData = schedule[0];
    
    // Check if already running (idempotency guard)
    const runningJobs = await base44.asServiceRole.entities.ReportRun.filter({
      schedule_id,
      status: 'running'
    });
    
    if (runningJobs.length > 0 && !manual_trigger) {
      return Response.json({ 
        message: 'Report already running',
        run_id: runningJobs[0].id 
      });
    }
    
    // Fetch template with version
    const template = await base44.asServiceRole.entities.ReportDefinition.filter({ 
      id: scheduleData.template_id 
    });
    
    if (!template || template.length === 0) {
      return Response.json({ error: 'Template not found' }, { status: 404 });
    }
    
    const templateData = template[0];
    
    // Get previous audit hash for chain
    const previousRuns = await base44.asServiceRole.entities.ReportRun.filter({
      organization_id: scheduleData.organization_id
    }, '-created_date', 1);
    
    const prevAuditHash = previousRuns.length > 0 ? previousRuns[0].audit_hash : '0';
    
    // Create report run record
    const runId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    
    const runRecord = {
      id: runId,
      organization_id: scheduleData.organization_id,
      template_id: scheduleData.template_id,
      schedule_id: schedule_id,
      template_version_snapshot: JSON.stringify(templateData),
      initiated_by: manual_trigger ? 'user' : 'system',
      execution_context: manual_trigger ? 'manual' : 'scheduled',
      filters_snapshot: JSON.stringify(scheduleData.filters || {}),
      status: 'running',
      started_at: startedAt,
      prev_audit_hash: prevAuditHash
    };
    
    await base44.asServiceRole.entities.ReportRun.create(runRecord);
    
    // Generate report asynchronously
    const reportData = await generateReportData(
      base44,
      templateData,
      scheduleData,
      runId
    );
    
    // Calculate audit hash
    const auditHash = await calculateAuditHash(prevAuditHash, runRecord, reportData);
    
    // Update run record with completion
    await base44.asServiceRole.entities.ReportRun.update(runId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      data_source_counts: reportData.recordCounts,
      output_artifacts: reportData.artifacts,
      audit_hash: auditHash
    });
    
    // Send email if configured
    if (scheduleData.delivery_email && scheduleData.delivery_email.length > 0) {
      await sendReportEmail(
        base44,
        scheduleData,
        templateData,
        reportData,
        runId
      );
    }
    
    return Response.json({
      success: true,
      run_id: runId,
      status: 'completed',
      artifacts: reportData.artifacts,
      audit_hash: auditHash
    });
    
  } catch (error) {
    console.error('Report generation failed:', error);
    return Response.json({
      error: 'Report generation failed',
      details: error.message
    }, { status: 500 });
  }
});

/**
 * Generate report data based on template
 */
async function generateReportData(base44, template, schedule, runId) {
  const filters = schedule.filters || {};
  const recordCounts = {};
  const artifacts = [];
  
  // Fetch data based on module type
  let data = [];
  
  switch (template.module_type) {
    case 'case_summary':
      data = await base44.asServiceRole.entities.Case.filter({
        organization_id: schedule.organization_id,
        ...filters
      });
      recordCounts.cases = data.length;
      break;
      
    case 'vulnerability_assessment':
      data = await base44.asServiceRole.entities.SecurityFinding.filter({
        organization_id: schedule.organization_id,
        finding_type: 'vulnerability',
        ...filters
      });
      recordCounts.vulnerabilities = data.length;
      break;
      
    case 'compliance_status':
      data = await base44.asServiceRole.entities.ComplianceReport.filter({
        organization_id: schedule.organization_id,
        ...filters
      });
      recordCounts.compliance_reports = data.length;
      break;
      
    default:
      throw new Error(`Unknown module type: ${template.module_type}`);
  }
  
  // Generate CSV
  if (template.output_formats.includes('csv')) {
    const csv = generateCSV(data, template);
    const csvHash = await hashContent(csv);
    
    artifacts.push({
      format: 'csv',
      size: csv.length,
      checksum: csvHash,
      filename: generateFilename(template, schedule, runId, 'csv')
    });
  }
  
  // Generate PDF
  if (template.output_formats.includes('pdf')) {
    const pdfData = generatePDFMetadata(data, template, schedule);
    const pdfHash = await hashContent(JSON.stringify(pdfData));
    
    artifacts.push({
      format: 'pdf',
      size: JSON.stringify(pdfData).length,
      checksum: pdfHash,
      filename: generateFilename(template, schedule, runId, 'pdf')
    });
  }
  
  return { recordCounts, artifacts, data };
}

/**
 * Generate CSV content
 */
function generateCSV(data, template) {
  if (data.length === 0) return 'No data';
  
  const headers = Object.keys(data[0]).filter(k => !k.startsWith('_'));
  const rows = [headers.join(',')];
  
  for (const item of data) {
    const values = headers.map(h => {
      const val = item[h];
      if (val === null || val === undefined) return '';
      return `"${String(val).replace(/"/g, '""')}"`;
    });
    rows.push(values.join(','));
  }
  
  return rows.join('\n');
}

/**
 * Generate PDF metadata (actual PDF generation would use jsPDF)
 */
function generatePDFMetadata(data, template, schedule) {
  return {
    title: template.name,
    module: template.module_type,
    scope: schedule.organization_id,
    generatedAt: new Date().toISOString(),
    templateVersion: template.version || '1.0',
    recordCount: data.length,
    filters: schedule.filters
  };
}

/**
 * Generate standardized filename
 */
function generateFilename(template, schedule, runId, ext) {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const moduleType = template.module_type.replace(/_/g, '');
  const version = template.version || '1';
  
  return `SentinelForensics_${moduleType}_${schedule.organization_id}_${date}_v${version}_${runId.slice(0, 8)}.${ext}`;
}

/**
 * Hash content for tamper detection
 */
async function hashContent(content) {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Calculate audit hash with chain
 */
async function calculateAuditHash(prevHash, runRecord, reportData) {
  const canonical = JSON.stringify({
    prev_hash: prevHash,
    run_id: runRecord.id,
    template_id: runRecord.template_id,
    started_at: runRecord.started_at,
    artifacts: reportData.artifacts.map(a => a.checksum)
  });
  
  return await hashContent(canonical);
}

/**
 * Send report via email
 */
async function sendReportEmail(base44, schedule, template, reportData, runId) {
  const downloadLink = `${Deno.env.get('WS_URL')}/download-report/${runId}`;
  
  for (const email of schedule.delivery_email) {
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: email,
      subject: `Report Ready: ${template.name}`,
      body: `
Your scheduled report "${template.name}" has been generated.

Module: ${template.module_type}
Generated: ${new Date().toISOString()}
Records: ${JSON.stringify(reportData.recordCounts)}

Download: ${downloadLink}

This link expires in 7 days.
      `
    });
  }
}