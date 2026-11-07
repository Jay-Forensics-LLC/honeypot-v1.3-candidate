import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { jsPDF } from 'npm:jspdf@2.5.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { reportId } = await req.json();

        if (!reportId) {
            return Response.json({ error: 'reportId is required' }, { status: 400 });
        }

        // ✅ CRITICAL: Validate user has access to report FIRST (RLS check)
        const userReports = await base44.entities.Report.filter({ id: reportId });
        
        if (!userReports || userReports.length === 0) {
            await base44.entities.AuditLog.create({
                event_type: 'unauthorized_pdf_access',
                severity: 'warning',
                description: `User attempted to generate PDF for inaccessible report`,
                user_id: user.email,
                timestamp: new Date().toISOString(),
                success: false,
                metadata: { report_id: reportId, reason: 'rls_denied' }
            });
            
            return Response.json({ 
                error: 'Forbidden',
                message: 'You do not have access to this report'
            }, { status: 403 });
        }

        const report = userReports[0];

        // Validate access to associated case
        const userCases = await base44.entities.Case.filter({ id: report.case_id });
        const caseData = userCases[0];

        if (!caseData) {
            return Response.json({ 
                error: 'Forbidden',
                message: 'You do not have access to the associated case'
            }, { status: 403 });
        }

        // Now safe to proceed with PDF generation
        const doc = new jsPDF();
        let yPos = 20;

        // Header
        doc.setFillColor(139, 0, 0);
        doc.rect(0, 0, 210, 30, 'F');
        
        doc.setFontSize(24);
        doc.setTextColor(255, 255, 255);
        doc.setFont(undefined, 'bold');
        doc.text('SENTINEL FORENSICS', 105, 15, { align: 'center' });
        
        doc.setFontSize(12);
        doc.setFont(undefined, 'normal');
        doc.text('Military-Grade Digital Forensics Platform', 105, 22, { align: 'center' });

        yPos = 40;

        // Report metadata
        doc.setDrawColor(139, 0, 0);
        doc.setLineWidth(0.5);
        doc.rect(15, yPos, 180, 35);

        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'bold');
        doc.text('Report Number:', 20, yPos + 8);
        doc.text('Case Number:', 20, yPos + 15);
        doc.text('Generated:', 20, yPos + 22);
        doc.text('Approved By:', 20, yPos + 29);

        doc.setFont(undefined, 'normal');
        doc.text(report.report_number, 60, yPos + 8);
        doc.text(caseData?.case_number || 'N/A', 60, yPos + 15);
        doc.text(new Date(report.generated_date).toLocaleDateString(), 60, yPos + 22);
        doc.text(report.approved_by, 60, yPos + 29);

        yPos += 45;

        // Title
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(139, 0, 0);
        doc.text(report.title || 'Forensic Analysis Report', 20, yPos);
        yPos += 10;

        // Description
        if (caseData?.description) {
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.setFont(undefined, 'italic');
            const descLines = doc.splitTextToSize(caseData.description, 170);
            doc.text(descLines, 20, yPos);
            yPos += (descLines.length * 5) + 5;
        }

        doc.setDrawColor(139, 0, 0);
        doc.setLineWidth(0.3);
        doc.line(20, yPos, 190, yPos);
        yPos += 10;

        // Findings
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(139, 0, 0);
        doc.text('FINDINGS & ANALYSIS', 20, yPos);
        yPos += 10;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(0, 0, 0);
        
        const findings = report.findings || 'No findings available';
        const findingsLines = doc.splitTextToSize(findings, 170);
        
        for (const line of findingsLines) {
            if (yPos > 270) {
                doc.addPage();
                yPos = 20;
            }
            doc.text(line, 20, yPos);
            yPos += 5;
        }

        // Evidence references
        if (report.evidence_references && report.evidence_references.length > 0) {
            if (yPos > 250) {
                doc.addPage();
                yPos = 20;
            }
            
            yPos += 10;
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(139, 0, 0);
            doc.text('EVIDENCE REFERENCES', 20, yPos);
            yPos += 7;

            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(0, 0, 0);
            report.evidence_references.forEach(ref => {
                if (yPos > 280) {
                    doc.addPage();
                    yPos = 20;
                }
                doc.text(`• ${ref}`, 25, yPos);
                yPos += 5;
            });
        }

        // Footer
        const pageCount = doc.internal.getNumberOfPages();
        const reportHash = await hashString(JSON.stringify(report));
        
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            
            doc.setFillColor(240, 240, 240);
            doc.rect(0, 277, 210, 20, 'F');
            
            doc.setFontSize(7);
            doc.setTextColor(60, 60, 60);
            doc.setFont(undefined, 'italic');
            doc.text(
                `Sentinel Forensics - Confidential Report - Page ${i} of ${pageCount}`,
                105,
                285,
                { align: 'center' }
            );
            doc.text(
                `Digital Signature: ${reportHash.substring(0, 32)}`,
                105,
                290,
                { align: 'center' }
            );
            doc.text(
                `Generated: ${new Date().toISOString()}`,
                105,
                294,
                { align: 'center' }
            );
        }

        const pdfBytes = doc.output('arraybuffer');
        const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
        const file = new File([pdfBlob], `${report.report_number}.pdf`, { type: 'application/pdf' });
        
        const { file_url } = await base44.integrations.Core.UploadFile({ file });

        // Use service role for update (user already validated)
        await base44.asServiceRole.entities.Report.update(reportId, {
            file_url,
            digital_signature: reportHash
        });

        await base44.asServiceRole.entities.AuditLog.create({
            event_type: 'report_pdf_generated',
            severity: 'info',
            description: `PDF report generated for ${report.report_number}`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                report_id: reportId,
                report_number: report.report_number,
                file_url,
                digital_signature: reportHash
            }
        });

        return new Response(pdfBytes, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${report.report_number}.pdf"`
            }
        });

    } catch (error) {
        console.error('PDF generation error:', error);
        return Response.json({
            error: 'Failed to generate PDF',
            message: error.message
        }, { status: 500 });
    }
});

async function hashString(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}