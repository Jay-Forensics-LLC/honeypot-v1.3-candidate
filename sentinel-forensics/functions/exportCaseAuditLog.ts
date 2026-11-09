import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Export Case Audit Log
 * Generates a complete, tamper-evident audit trail export
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { caseId, format } = await req.json();

    // Get case data
    const cases = await base44.entities.Case.filter({ id: caseId });
    const caseData = cases[0];

    if (!caseData) {
      return Response.json({ error: 'Case not found' }, { status: 404 });
    }

    // Get all audit logs for this case
    const allLogs = await base44.entities.AuditLog.filter({
      organization_id: user.organization_id
    });

    const caseLogs = allLogs
      .filter(log => 
        log.metadata?.case_id === caseId || 
        log.description?.includes(caseData.case_number)
      )
      .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

    // Generate export hash
    const exportContent = JSON.stringify(caseLogs);
    const exportHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(exportContent));
    const exportHashHex = Array.from(new Uint8Array(exportHash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const exportData = {
      export_metadata: {
        export_id: crypto.randomUUID(),
        case_id: caseId,
        case_number: caseData.case_number,
        case_title: caseData.title,
        exported_at: new Date().toISOString(),
        exported_by: user.email,
        total_entries: caseLogs.length,
        export_hash: exportHashHex,
        format
      },
      audit_entries: caseLogs.map(log => ({
        id: log.id,
        timestamp: log.timestamp || log.created_date,
        event_type: log.event_type,
        severity: log.severity,
        description: log.description,
        user_id: log.user_id,
        success: log.success,
        metadata: log.metadata,
        hash_chain: {
          previous_hash: log.previous_hash,
          current_hash: log.current_hash
        }
      }))
    };

    // Log the export
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      event_type: 'AUDIT_LOG_EXPORTED',
      severity: 'info',
      description: `Case audit log exported: ${caseData.case_number}`,
      user_id: user.email,
      success: true,
      metadata: {
        case_id: caseId,
        entry_count: caseLogs.length,
        export_format: format,
        export_hash: exportHashHex
      }
    });

    if (format === 'json') {
      return Response.json(exportData);
    }

    if (format === 'csv') {
      const csv = generateCSV(exportData);
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="audit-log-${caseData.case_number}.csv"`
        }
      });
    }

    if (format === 'html') {
      const html = generateHTML(exportData);
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html',
          'Content-Disposition': `attachment; filename="audit-log-${caseData.case_number}.html"`
        }
      });
    }

    return Response.json(exportData);

  } catch (error) {
    console.error('Audit log export error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function generateCSV(exportData) {
  const headers = ['Timestamp', 'Event Type', 'Severity', 'Description', 'User', 'Success', 'Previous Hash', 'Current Hash'];
  const rows = exportData.audit_entries.map(entry => [
    entry.timestamp,
    entry.event_type,
    entry.severity,
    entry.description,
    entry.user_id,
    entry.success ? 'Yes' : 'No',
    entry.hash_chain?.previous_hash || '',
    entry.hash_chain?.current_hash || ''
  ]);

  return [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');
}

function generateHTML(exportData) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Audit Log Export - ${exportData.export_metadata.case_number}</title>
  <style>
    body { font-family: monospace; max-width: 1200px; margin: 20px auto; padding: 20px; background: #0f0f0f; color: #fff; }
    h1 { color: #60a5fa; border-bottom: 2px solid #1e40af; padding-bottom: 10px; }
    .metadata { background: #1e293b; padding: 15px; margin: 20px 0; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #1e40af; color: #fff; padding: 10px; text-align: left; }
    td { padding: 8px; border-bottom: 1px solid #334155; }
    tr:hover { background: #1e293b; }
    .success { color: #22c55e; }
    .error { color: #ef4444; }
    .hash { font-size: 10px; word-break: break-all; color: #94a3b8; }
  </style>
</head>
<body>
  <h1>Audit Log Export: ${exportData.export_metadata.case_number}</h1>
  
  <div class="metadata">
    <p><strong>Case:</strong> ${exportData.export_metadata.case_title}</p>
    <p><strong>Export ID:</strong> ${exportData.export_metadata.export_id}</p>
    <p><strong>Exported:</strong> ${new Date(exportData.export_metadata.exported_at).toLocaleString()}</p>
    <p><strong>By:</strong> ${exportData.export_metadata.exported_by}</p>
    <p><strong>Total Entries:</strong> ${exportData.export_metadata.total_entries}</p>
    <p><strong>Export Hash (SHA-256):</strong> <span class="hash">${exportData.export_metadata.export_hash}</span></p>
  </div>

  <table>
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>Event Type</th>
        <th>Severity</th>
        <th>Description</th>
        <th>User</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${exportData.audit_entries.map(entry => `
        <tr>
          <td>${new Date(entry.timestamp).toLocaleString()}</td>
          <td>${entry.event_type}</td>
          <td>${entry.severity}</td>
          <td>${entry.description}</td>
          <td>${entry.user_id}</td>
          <td class="${entry.success ? 'success' : 'error'}">${entry.success ? '✓' : '✗'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="metadata">
    <p><strong>Integrity Notice:</strong> This audit log is cryptographically chained. Each entry includes a hash of the previous entry, creating a tamper-evident chain. Any modification would break the hash chain.</p>
  </div>
</body>
</html>
  `.trim();
}