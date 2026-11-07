import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { jsPDF } from 'npm:jspdf@2.5.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { case_id } = await req.json();
        
        if (!case_id) {
            return Response.json({ error: 'Case ID required' }, { status: 400 });
        }

        const caseData = await base44.asServiceRole.entities.Case.get(case_id);
        const evidence = await base44.asServiceRole.entities.Evidence.filter({ case_id });
        const alerts = await base44.asServiceRole.entities.Alert.filter({ assigned_case_id: case_id });

        const doc = new jsPDF();
        
        doc.setFontSize(24);
        doc.text('FORENSIC INVESTIGATION REPORT', 20, 20);
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 30);
        doc.text(`Investigator: ${user.full_name}`, 20, 35);
        doc.text(`Organization: ${user.organization || 'N/A'}`, 20, 40);
        
        doc.setDrawColor(0, 100, 200);
        doc.line(20, 45, 190, 45);
        
        doc.setFontSize(16);
        doc.setTextColor(0);
        doc.text('CASE INFORMATION', 20, 55);
        
        doc.setFontSize(11);
        doc.text(`Case Number: ${caseData.case_number}`, 20, 65);
        doc.text(`Title: ${caseData.title}`, 20, 72);
        doc.text(`Status: ${caseData.status.toUpperCase()}`, 20, 79);
        doc.text(`Priority: ${caseData.priority.toUpperCase()}`, 20, 86);
        doc.text(`Type: ${caseData.case_type.replace(/_/g, ' ').toUpperCase()}`, 20, 93);
        
        if (caseData.description) {
            doc.setFontSize(10);
            const descLines = doc.splitTextToSize(caseData.description, 170);
            doc.text('Description:', 20, 103);
            doc.text(descLines, 20, 110);
        }
        
        let yPos = 130;
        
        doc.setFontSize(16);
        doc.text('EVIDENCE SUMMARY', 20, yPos);
        yPos += 10;
        
        doc.setFontSize(10);
        doc.text(`Total Evidence Items: ${evidence.length}`, 20, yPos);
        yPos += 10;
        
        evidence.slice(0, 10).forEach((item, idx) => {
            if (yPos > 270) {
                doc.addPage();
                yPos = 20;
            }
            
            doc.setFontSize(11);
            doc.text(`${idx + 1}. ${item.title}`, 25, yPos);
            yPos += 6;
            doc.setFontSize(9);
            doc.setTextColor(80);
            doc.text(`Evidence #: ${item.evidence_number} | Type: ${item.evidence_type}`, 30, yPos);
            yPos += 6;
            if (item.file_hash) {
                doc.text(`Hash: ${item.file_hash.substring(0, 60)}...`, 30, yPos);
                yPos += 6;
            }
            doc.setTextColor(0);
            yPos += 4;
        });
        
        if (alerts.length > 0) {
            if (yPos > 240) {
                doc.addPage();
                yPos = 20;
            }
            
            yPos += 10;
            doc.setFontSize(16);
            doc.text('SECURITY ALERTS', 20, yPos);
            yPos += 10;
            
            doc.setFontSize(10);
            doc.text(`Total Alerts: ${alerts.length}`, 20, yPos);
            yPos += 10;
            
            alerts.slice(0, 10).forEach((alert, idx) => {
                if (yPos > 270) {
                    doc.addPage();
                    yPos = 20;
                }
                
                doc.setFontSize(11);
                doc.text(`${idx + 1}. ${alert.title}`, 25, yPos);
                yPos += 6;
                doc.setFontSize(9);
                doc.setTextColor(80);
                doc.text(`Severity: ${alert.severity.toUpperCase()} | Status: ${alert.status}`, 30, yPos);
                yPos += 6;
                doc.setTextColor(0);
                yPos += 4;
            });
        }
        
        doc.addPage();
        doc.setFontSize(16);
        doc.text('CHAIN OF CUSTODY', 20, 20);
        doc.setFontSize(10);
        doc.text('All evidence has been collected and handled in accordance with', 20, 35);
        doc.text('forensic standards to maintain legal admissibility.', 20, 42);
        
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`Report ID: ${crypto.randomUUID()}`, 20, 280);
        doc.text('This report is confidential and intended for authorized personnel only.', 20, 285);

        const pdfBytes = doc.output('arraybuffer');

        return new Response(pdfBytes, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename=forensic-report-${caseData.case_number}.pdf`
            }
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});