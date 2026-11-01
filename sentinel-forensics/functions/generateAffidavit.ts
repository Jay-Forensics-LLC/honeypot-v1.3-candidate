import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { jsPDF } from 'npm:jspdf@2.5.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { case_id, affidavit_data } = await req.json();

        const caseData = await base44.asServiceRole.entities.Case.get(case_id);

        const doc = new jsPDF();
        
        // Header
        doc.setFontSize(14);
        doc.text('AFFIDAVIT', 105, 20, { align: 'center' });
        
        doc.setFontSize(10);
        doc.text(`${affidavit_data.jurisdiction || 'Jurisdiction'}`, 105, 30, { align: 'center' });
        doc.text(`Case No. ${caseData.case_number}`, 105, 37, { align: 'center' });
        
        // Affiant Info
        let y = 55;
        doc.setFontSize(11);
        doc.text(`STATE OF FLORIDA`, 20, y);
        y += 7;
        doc.text(`COUNTY OF MIAMI-DADE`, 20, y);
        y += 15;

        doc.text(`I, ${affidavit_data.affiant_name}, ${affidavit_data.affiant_badge || ''},`, 20, y);
        y += 7;
        doc.text(`of the ${affidavit_data.agency || 'Agency'}, being duly sworn, depose and state:`, 20, y);
        y += 15;

        // Facts
        doc.setFontSize(10);
        const factsLines = doc.splitTextToSize(affidavit_data.facts || '', 170);
        doc.text(factsLines, 20, y);
        y += factsLines.length * 7 + 15;

        // Exhibits
        if (affidavit_data.exhibit_references) {
            if (y > 240) {
                doc.addPage();
                y = 20;
            }
            
            doc.setFontSize(11);
            doc.text('EXHIBITS:', 20, y);
            y += 10;
            
            doc.setFontSize(10);
            const exhibitLines = doc.splitTextToSize(affidavit_data.exhibit_references, 170);
            doc.text(exhibitLines, 20, y);
            y += exhibitLines.length * 7 + 15;
        }

        // Signature Block
        if (y > 220) {
            doc.addPage();
            y = 20;
        }

        doc.text(`Further affiant sayeth not.`, 20, y);
        y += 20;

        doc.text(`_____________________________`, 20, y);
        y += 7;
        doc.text(affidavit_data.affiant_name, 20, y);
        y += 7;
        doc.text(affidavit_data.affiant_title || '', 20, y);
        y += 15;

        doc.text(`Sworn to and subscribed before me this _____ day of ____________, 20___`, 20, y);
        y += 15;

        doc.text(`_____________________________`, 20, y);
        y += 7;
        doc.text(`Notary Public`, 20, y);

        const pdfBytes = doc.output('arraybuffer');

        return new Response(pdfBytes, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename=affidavit-${caseData.case_number}.pdf`
            }
        });

    } catch (error) {
        console.error('Affidavit generation error:', error);
        return Response.json({
            error: 'Affidavit generation failed',
            message: error.message
        }, { status: 500 });
    }
});