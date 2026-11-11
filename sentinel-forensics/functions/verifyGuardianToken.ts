import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const { token, case_id } = await req.json();

        if (!token || !case_id) {
            return Response.json({ valid: false, reason: 'Missing parameters' });
        }

        // Verify token exists and is valid
        const tokens = await base44.asServiceRole.entities.GuardianAccessToken.filter({ 
            token_hash: token,
            case_id,
            revoked: false
        });

        if (tokens.length === 0) {
            return Response.json({ valid: false, reason: 'Invalid token' });
        }

        const tokenRecord = tokens[0];

        // Check expiry
        if (new Date(tokenRecord.expires_at) < new Date()) {
            return Response.json({ valid: false, reason: 'Token expired' });
        }

        // Log access
        await base44.asServiceRole.entities.AuditLog.create({
            event_type: 'guardian_access',
            severity: 'info',
            description: `Guardian accessed case ${case_id}`,
            user_id: tokenRecord.created_by,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: { case_id, token_id: tokenRecord.id }
        });

        return Response.json({ valid: true });

    } catch (error) {
        return Response.json({ valid: false, reason: error.message });
    }
});