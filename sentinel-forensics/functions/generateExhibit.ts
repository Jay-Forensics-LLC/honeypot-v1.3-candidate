import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { jsPDF } from 'npm:jspdf@2.5.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { case_id, options, signer } = await req.json();

        const caseData = await base44.asServiceRole.entities.Case.get(case_id);
        const evidence = await base44.asServiceRole.entities.EvidenceV2.filter({ case_id });
        
        // Filter for image evidence only
        const images = evidence.filter(e => 
            e.evidence_type === 'screenshot' || 
            e.file_url?.match(/\.(jpg|jpeg|png|gif)$/i)
        );

        const doc = new jsPDF();
        
        // Cover Page
        doc.setFontSize(24);
        doc.text('LEGAL EXHIBIT', 105, 40, { align: 'center' });
        
        doc.setFontSize(14);
        doc.text(`Case: ${caseData.case_number}`, 105, 60, { align: 'center' });
        doc.text(`${caseData.title}`, 105, 70, { align: 'center' });
        
        doc.setFontSize(10);
        doc.text(`Total Exhibits: ${images.length}`, 105, 90, { align: 'center' });
        doc.text(`Generated: ${new Date().toLocaleString()}`, 105, 100, { align: 'center' });

        // Image Pages
        for (let i = 0; i < images.length; i++) {
            const img = images[i];
            doc.addPage();
            
            // Caption
            doc.setFontSize(12);
            doc.text(`Exhibit ${i + 1}`, 20, 20);
            doc.setFontSize(10);
            doc.text(img.title, 20, 28);
            
            // Metadata
            let y = 38;
            if (options.include_timestamps) {
                doc.text(`Collected: ${new Date(img.collection_timestamp || img.created_date).toLocaleString()}`, 20, y);
                y += 7;
            }
            
            if (options.include_gps && img.metadata?.gps_coordinates) {
                const gps = img.metadata.gps_coordinates;
                doc.text(`GPS: ${gps.latitude}, ${gps.longitude}`, 20, y);
                y += 7;
            }
            
            if (options.include_hashes && img.file_hash_sha256) {
                doc.setFontSize(8);
                doc.text(`SHA-256: ${img.file_hash_sha256}`, 20, y);
                y += 7;
            }

            // Note: In production, would fetch and embed image here
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text('[Image would be embedded here]', 20, y + 20);
            doc.text(`File URL: ${img.file_url}`, 20, y + 27);
            doc.setTextColor(0);
        }

        // Signature Block
        if (options.signature_block && signer) {
            doc.addPage();
            doc.setFontSize(12);
            doc.text('CERTIFICATION', 20, 20);
            
            doc.setFontSize(10);
            doc.text(`I, ${signer.name}, ${signer.title}, hereby certify that the foregoing`, 20, 40);
            doc.text(`exhibits are true and accurate representations of digital evidence collected`, 20, 47);
            doc.text(`in the course of this investigation.`, 20, 54);
            
            doc.text(`_________________________`, 20, 80);
            doc.text(`Signature`, 20, 87);
            
            doc.text(`Date: ${new Date(signer.date).toLocaleDateString()}`, 20, 100);
        }

        const pdfBytes = doc.output('arraybuffer');

        return new Response(pdfBytes, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename=exhibit-${caseData.case_number}.pdf`
            }
        });

    } catch (error) {
        console.error('Exhibit generation error:', error);
        return Response.json({
            error: 'Exhibit generation failed',
            message: error.message
        }, { status: 500 });
    }
});