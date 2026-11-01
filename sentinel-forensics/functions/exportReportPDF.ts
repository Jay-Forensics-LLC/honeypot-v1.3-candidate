import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@2.5.2';

/**
 * EXPORT REPORT TO PDF
 * Renders structured report content to PDF with consistent formatting
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { reportId } = await req.json();

        if (!reportId) {
            return Response.json({ error: 'Missing reportId' }, { status: 400 });
        }

        // Fetch report
        const reports = await base44.entities.Report.filter({
            id: reportId,
            organization_id: user.organization_id
        });

        const report = reports[0];
        if (!report) {
            return Response.json({ error: 'Report not found' }, { status: 404 });
        }

        // Generate PDF
        const pdf = await generatePDF(report);
        const pdfBytes = pdf.output('arraybuffer');

        // Upload to storage
        const filename = `${report.report_number}_v${report.version}.pdf`;
        const formData = new FormData();
        formData.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), filename);

        const uploadResult = await base44.integrations.Core.UploadFile({
            file: new Blob([pdfBytes], { type: 'application/pdf' })
        });

        // Update report with file URL
        await base44.asServiceRole.entities.Report.update(reportId, {
            file_url: uploadResult.file_url
        });

        // Audit log
        await base44.asServiceRole.entities.AuditLog.create({
            event_type: 'report_exported',
            severity: 'info',
            description: `Report exported to PDF: ${report.report_number}`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                report_id: reportId,
                filename
            }
        });

        return Response.json({
            success: true,
            file_url: uploadResult.file_url,
            filename
        });

    } catch (error) {
        console.error('PDF export error:', error);
        return Response.json({
            error: 'Failed to export PDF',
            message: error.message
        }, { status: 500 });
    }
});

/**
 * GENERATE PDF FROM REPORT CONTENT
 */
async function generatePDF(report) {
    const doc = new jsPDF();
    let y = 20;
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const maxWidth = doc.internal.pageSize.getWidth() - (margin * 2);

    // Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(report.title, margin, y);
    y += 10;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Report Number: ${report.report_number}`, margin, y);
    y += 6;
    doc.text(`Generated: ${new Date(report.generated_date).toLocaleString()}`, margin, y);
    y += 6;
    doc.text(`Version: ${report.version} | Status: ${report.status.toUpperCase()}`, margin, y);
    y += 12;

    // Separator line
    doc.setDrawColor(200);
    doc.line(margin, y, doc.internal.pageSize.getWidth() - margin, y);
    y += 10;

    // Content sections
    if (report.content && report.content.sections) {
        for (const section of report.content.sections) {
            // Check page break
            if (y > pageHeight - 40) {
                doc.addPage();
                y = 20;
            }

            // Section title
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text(section.title, margin, y);
            y += 8;

            // Section paragraphs
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            
            for (const para of section.paragraphs || []) {
                // Split text to fit width
                const lines = doc.splitTextToSize(para.text, maxWidth);
                
                for (const line of lines) {
                    if (y > pageHeight - 20) {
                        doc.addPage();
                        y = 20;
                    }
                    doc.text(line, margin, y);
                    y += 6;
                }

                // Citations (if present)
                if (para.citations && para.citations.length > 0) {
                    doc.setFontSize(8);
                    doc.setTextColor(100);
                    const citationText = `[Citations: ${para.citations.join(', ')}]`;
                    doc.text(citationText, margin + 5, y);
                    y += 5;
                    doc.setTextColor(0);
                    doc.setFontSize(10);
                }

                y += 4; // Paragraph spacing
            }

            y += 6; // Section spacing
        }
    }

    // Footer on each page
    const totalPages = doc.internal.pages.length - 1;
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(
            `Page ${i} of ${totalPages} | ${report.report_number} | CONFIDENTIAL`,
            margin,
            pageHeight - 10
        );
    }

    return doc;
}