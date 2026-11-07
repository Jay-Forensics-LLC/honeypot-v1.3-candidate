import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * RFC-3161 Timestamp Service Integration
 * Obtains trusted timestamp for evidence
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { evidence_id } = await req.json();

        if (!evidence_id) {
            return Response.json({ error: 'evidence_id required' }, { status: 400 });
        }

        // Fetch evidence
        const evidenceRecords = await base44.entities.EvidenceV2.filter({ id: evidence_id });
        if (evidenceRecords.length === 0) {
            return Response.json({ error: 'Evidence not found' }, { status: 404 });
        }

        const evidence = evidenceRecords[0];
        const hash = evidence.file_hash_sha256;

        if (!hash) {
            return Response.json({ error: 'Evidence has no hash' }, { status: 400 });
        }

        // For MVP: Create self-signed timestamp (in production, use real TSA like DigiCert)
        const timestamp = new Date().toISOString();
        const timestampData = {
            hash,
            timestamp,
            authority: 'Sentinel-Internal-TSA'
        };

        // Generate timestamp token (simplified - in production use real RFC-3161)
        const encoder = new TextEncoder();
        const tokenData = encoder.encode(JSON.stringify(timestampData));
        const tokenHash = await crypto.subtle.digest('SHA-256', tokenData);
        const tokenHashArray = Array.from(new Uint8Array(tokenHash));
        const token = tokenHashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Store timestamp receipt
        await base44.entities.TimestampReceipt.create({
            evidence_id,
            timestamp_authority: 'Sentinel-Internal-TSA',
            timestamp_token: token,
            hash_algorithm: 'SHA-256',
            original_hash: hash,
            timestamp_date: timestamp,
            tsa_certificate: 'SELF_SIGNED_MVP',
            verified: true,
            verification_date: timestamp
        });

        // Update evidence
        await base44.entities.EvidenceV2.update(evidence_id, {
            verification_timestamp: timestamp
        });

        // Audit log
        await base44.entities.AuditLog.create({
            event_type: 'evidence_timestamped',
            severity: 'info',
            description: 'Evidence timestamp obtained',
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: { evidence_id, hash, timestamp }
        });

        return Response.json({
            success: true,
            timestamp,
            token,
            authority: 'Sentinel-Internal-TSA'
        });

    } catch (error) {
        console.error('Timestamp error:', error);
        return Response.json({
            error: 'Timestamp failed',
            message: error.message
        }, { status: 500 });
    }
});