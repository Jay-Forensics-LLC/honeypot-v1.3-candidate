import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { jsPDF } from 'npm:jspdf@2.5.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !user.organization_id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { report_name, report_data, format } = await req.json();

    if (!report_name || !report_data || !format) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let fileContent, contentType, fileName;

    if (format === 'csv') {
      // Generate CSV
      fileContent = generateCSV(report_data);
      contentType = 'text/csv';
      fileName = `${report_name}_${Date.now()}.csv`;
    } else if (format === 'json') {
      // Generate JSON
      fileContent = JSON.stringify(report_data, null, 2);
      contentType = 'application/json';
      fileName = `${report_name}_${Date.now()}.json`;
    } else if (format === 'pdf') {
      // Generate PDF
      const pdfBytes = await generatePDF(report_name, report_data);
      fileContent = pdfBytes;
      contentType = 'application/pdf';
      fileName = `${report_name}_${Date.now()}.pdf`;
    } else {
      return Response.json({ error: 'Invalid format' }, { status: 400 });
    }

    // Upload to storage
    const blob = format === 'pdf' 
      ? new Blob([fileContent], { type: contentType })
      : new Blob([fileContent], { type: contentType });

    const file = new File([blob], fileName, { type: contentType });
    
    const uploadResult = await base44.integrations.Core.UploadFile({ file });

    // Calculate hash for integrity
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fileContent));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Create report record
    await base44.asServiceRole.entities.CustomReport.create({
      organization_id: user.organization_id,
      report_name,
      report_type: 'custom',
      generated_by: user.email,
      generated_date: new Date().toISOString(),
      export_format: format,
      file_url: uploadResult.file_url,
      report_hash: hashHex
    });

    // Audit log
    await base44.asServiceRole.entities.SentinelAuditLog.create({
      organization_id: user.organization_id,
      user_email: user.email,
      action: 'report_exported',
      resource_type: 'CustomReport',
      timestamp: new Date().toISOString(),
      hmac_signature: hashHex,
      severity: 'info',
      details: {
        report_name,
        format,
        file_url: uploadResult.file_url
      }
    });

    return Response.json({
      success: true,
      file_url: uploadResult.file_url,
      report_hash: hashHex,
      format
    });

  } catch (error) {
    console.error('Export failed:', error);
    return Response.json({ 
      error: error.message,
      details: error.stack 
    }, { status: 500 });
  }
});

function generateCSV(data) {
  if (!data || typeof data !== 'object') {
    return 'No data available';
  }

  let csv = '';

  // Handle array of objects
  if (Array.isArray(data)) {
    if (data.length === 0) return 'No data';
    
    const headers = Object.keys(data[0]);
    csv += headers.join(',') + '\n';
    
    data.forEach(row => {
      const values = headers.map(header => {
        const value = row[header];
        if (value === null || value === undefined) return '';
        return typeof value === 'string' && value.includes(',') 
          ? `"${value}"` 
          : value;
      });
      csv += values.join(',') + '\n';
    });
  } else {
    // Handle single object
    csv = 'Key,Value\n';
    Object.entries(data).forEach(([key, value]) => {
      csv += `${key},${value}\n`;
    });
  }

  return csv;
}

async function generatePDF(reportName, data) {
  const doc = new jsPDF();
  
  // Title
  doc.setFontSize(20);
  doc.text(reportName, 20, 20);
  
  // Metadata
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 30);
  doc.text('Sentinel Forensics - Secure Report', 20, 35);
  
  // Content
  doc.setFontSize(12);
  let y = 50;

  if (Array.isArray(data)) {
    data.forEach((item, idx) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(`${idx + 1}. ${JSON.stringify(item)}`, 20, y);
      y += 10;
    });
  } else if (typeof data === 'object') {
    Object.entries(data).forEach(([key, value]) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(`${key}: ${value}`, 20, y);
      y += 10;
    });
  }

  return doc.output('arraybuffer');
}