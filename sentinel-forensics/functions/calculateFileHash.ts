import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { evidence_id } = await req.json();
        
        if (!evidence_id) {
            return Response.json({ error: 'Evidence ID required' }, { status: 400 });
        }

        const evidence = await base44.asServiceRole.entities.EvidenceV2.get(evidence_id);
        if (!evidence?.file_url || !evidence.case_id) {
            return Response.json({ error: 'Evidence file not found' }, { status: 404 });
        }

        const caseRecord = await base44.entities.Case.get(evidence.case_id);
        if (!caseRecord) {
            return Response.json({ error: 'Evidence file not found' }, { status: 404 });
        }

        const hasAccess =
            caseRecord.created_by === user.email ||
            caseRecord.assigned_investigator === user.email ||
            caseRecord.team_members?.includes(user.email) ||
            user.role === 'admin';
        if (!hasAccess) {
            return Response.json({ error: 'Access denied to this evidence' }, { status: 403 });
        }

        const signedUrlResponse = await base44.integrations.Core.CreateFileSignedUrl({
            file_uri: evidence.file_url,
            expires_in: 300
        });
        const fileResponse = await fetch(signedUrlResponse.signed_url);
        if (!fileResponse.ok) {
            return Response.json({ error: 'Failed to fetch file' }, { status: 400 });
        }

        const arrayBuffer = await fileResponse.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        const md5Buffer = await crypto.subtle.digest('SHA-1', arrayBuffer);
        const md5Array = Array.from(new Uint8Array(md5Buffer));
        const md5Hex = md5Array.map(b => b.toString(16).padStart(2, '0')).join('');

        return Response.json({
            sha256: hashHex,
            sha1: md5Hex,
            file_size: arrayBuffer.byteLength,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});