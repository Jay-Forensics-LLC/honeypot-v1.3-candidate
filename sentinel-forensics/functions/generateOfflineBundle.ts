import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import JSZip from 'npm:jszip@3.10.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { case_id, include_options } = await req.json();

        if (!case_id) {
            return Response.json({ error: 'case_id required' }, { status: 400 });
        }

        const caseData = await base44.asServiceRole.entities.Case.get(case_id);
        const evidence = await base44.asServiceRole.entities.EvidenceV2.filter({ case_id });

        const zip = new JSZip();

        // HTML Report
        if (include_options?.html_report) {
            const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Case ${caseData.case_number} - Offline Bundle</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 900px; margin: 0 auto; background: white; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 3px solid #E02424; padding-bottom: 10px; }
        .section { margin: 30px 0; }
        .evidence { background: #f9f9f9; padding: 15px; margin: 10px 0; border-left: 4px solid #E02424; }
        .hash { font-family: monospace; font-size: 11px; background: #e0e0e0; padding: 5px; word-break: break-all; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Forensic Case Report: ${caseData.case_number}</h1>
        <p><strong>Title:</strong> ${caseData.title}</p>
        <p><strong>Status:</strong> ${caseData.status}</p>
        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        
        <div class="section">
            <h2>Description</h2>
            <p>${caseData.description || 'N/A'}</p>
        </div>

        <div class="section">
            <h2>Evidence (${evidence.length} items)</h2>
            ${evidence.map((e, idx) => `
                <div class="evidence">
                    <h3>${idx + 1}. ${e.title}</h3>
                    <p><strong>Evidence #:</strong> ${e.evidence_number}</p>
                    <p><strong>Type:</strong> ${e.evidence_type}</p>
                    <p><strong>Collected:</strong> ${new Date(e.collection_timestamp || e.created_date).toLocaleString()}</p>
                    <p>${e.description || ''}</p>
                    ${e.file_hash_sha256 ? `<p class="hash"><strong>SHA-256:</strong> ${e.file_hash_sha256}</p>` : ''}
                </div>
            `).join('')}
        </div>

        <div class="section">
            <p style="font-size: 11px; color: #666;">
                This bundle is self-contained and can be viewed offline. All evidence hashes are included for integrity verification.
            </p>
        </div>
    </div>
</body>
</html>`;
            zip.file('report.html', html);
        }

        // JSON Data
        if (include_options?.json_data) {
            zip.file('case_data.json', JSON.stringify({
                case: caseData,
                evidence,
                generated_at: new Date().toISOString(),
                bundle_version: '1.0'
            }, null, 2));
        }

        // Hashes Manifest
        if (include_options?.hashes_manifest) {
            const manifest = evidence.map(e => ({
                evidence_number: e.evidence_number,
                title: e.title,
                sha256: e.file_hash_sha256,
                md5: e.file_hash_md5,
                collected: e.collection_timestamp
            }));
            
            zip.file('HASHES.txt', 
                'SHA-256 HASHES MANIFEST\n' +
                '======================\n\n' +
                manifest.map(m => `${m.sha256}  ${m.evidence_number} - ${m.title}`).join('\n')
            );
        }

        // Chain of Custody
        if (include_options?.chain_of_custody) {
            const custody = evidence.map(e => ({
                evidence: e.evidence_number,
                chain: e.chain_of_custody || []
            }));
            
            zip.file('chain_of_custody.json', JSON.stringify(custody, null, 2));
        }

        const zipBlob = await zip.generateAsync({ type: 'arraybuffer' });

        // Upload ZIP to storage
        const zipFile = new File([zipBlob], `case-${caseData.case_number}-bundle.zip`, { type: 'application/zip' });
        const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file: zipFile });

        await base44.asServiceRole.entities.AuditLog.create({
            event_type: 'offline_bundle_generated',
            severity: 'info',
            description: `Offline bundle generated for case ${caseData.case_number}`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: { case_id, bundle_url: file_url }
        });

        return Response.json({
            success: true,
            bundle_url: file_url,
            size_bytes: zipBlob.byteLength,
            contents: Object.keys(include_options).filter(k => include_options[k])
        });

    } catch (error) {
        console.error('Bundle generation error:', error);
        return Response.json({
            error: 'Bundle generation failed',
            message: error.message
        }, { status: 500 });
    }
});