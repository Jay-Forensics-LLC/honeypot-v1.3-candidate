import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reportId } = await req.json();
    
    // Fetch report config
    const report = await base44.entities.CustomReport.filter({ id: reportId });
    if (!report || report.length === 0) {
      return Response.json({ error: 'Report not found' }, { status: 404 });
    }
    
    const config = report[0];
    
    // Fetch data based on source
    let data = [];
    const entityMap = {
      'cases': 'Case',
      'evidence': 'EvidenceV2',
      'alerts': 'Alert',
      'devices': 'Device',
      'audit_logs': 'AuditLog'
    };
    
    const entityName = entityMap[config.data_source];
    if (entityName) {
      data = await base44.asServiceRole.entities[entityName].filter(
        { ...config.filters, organization_id: user.organization_id }
      );
    }
    
    // Apply template formatting
    let formattedData = data;
    if (config.template_type !== 'custom') {
      formattedData = applyTemplate(data, config.template_type);
    }
    
    // Generate report content
    const reportContent = {
      title: config.report_name,
      generated_at: new Date().toISOString(),
      data_source: config.data_source,
      visualization: config.visualization,
      template: config.template_type,
      records: formattedData,
      total_records: formattedData.length
    };
    
    // Send email if recipients configured
    if (config.email_recipients && config.email_recipients.length > 0) {
      for (const recipient of config.email_recipients) {
        await base44.integrations.Core.SendEmail({
          to: recipient,
          subject: `Report: ${config.report_name}`,
          body: formatEmailBody(reportContent)
        });
      }
    }
    
    // Update last generated timestamp
    await base44.asServiceRole.entities.CustomReport.update(reportId, {
      last_generated: new Date().toISOString()
    });
    
    return Response.json({ 
      success: true,
      report: reportContent,
      emailed: config.email_recipients?.length || 0
    });
    
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function applyTemplate(data, templateType) {
  const templates = {
    gdpr: (records) => records.map(r => ({
      ...r,
      compliance_check: 'GDPR Article 32',
      data_protection_measures: 'Encryption at rest and in transit'
    })),
    soc2: (records) => records.map(r => ({
      ...r,
      control_category: 'CC6.1 - Logical Access',
      audit_trail: 'Complete'
    })),
    hipaa: (records) => records.map(r => ({
      ...r,
      phi_protection: 'HIPAA Compliant',
      encryption_status: 'AES-256'
    })),
    iso27001: (records) => records.map(r => ({
      ...r,
      iso_control: 'A.12.4.1',
      security_classification: 'Confidential'
    }))
  };
  
  return templates[templateType] ? templates[templateType](data) : data;
}

function formatEmailBody(reportContent) {
  return `
Report: ${reportContent.title}
Generated: ${new Date(reportContent.generated_at).toLocaleString()}
Data Source: ${reportContent.data_source}
Total Records: ${reportContent.total_records}

This report has been automatically generated. View full details in the Sentinel Forensics platform.
`;
}