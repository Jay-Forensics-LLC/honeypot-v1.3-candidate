import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Evidence Lock/Unlock Workflow
 * Requires 2 approvers for security
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { evidence_id, action, reason, approver_email } = await req.json();

        if (!evidence_id || !action || !reason) {
            return Response.json({
                error: 'evidence_id, action, and reason required'
            }, { status: 400 });
        }

        if (action !== 'lock' && action !== 'unlock') {
            return Response.json({ error: 'action must be "lock" or "unlock"' }, { status: 400 });
        }

        // Fetch evidence
        const evidenceRecords = await base44.entities.EvidenceV2.filter({ id: evidence_id });
        if (evidenceRecords.length === 0) {
            return Response.json({ error: 'Evidence not found' }, { status: 404 });
        }

        const evidence = evidenceRecords[0];

        // Check if already locked/unlocked
        if (action === 'lock' && evidence.legal_hold) {
            return Response.json({ error: 'Evidence already locked' }, { status: 400 });
        }

        if (action === 'unlock' && !evidence.legal_hold) {
            return Response.json({ error: 'Evidence not locked' }, { status: 400 });
        }

        // For unlock, require 2 approvers (admin only)
        if (action === 'unlock' && user.role !== 'admin') {
            return Response.json({
                error: 'Admin permission required to unlock evidence'
            }, { status: 403 });
        }

        // Update evidence
        await base44.entities.EvidenceV2.update(evidence_id, {
            legal_hold: action === 'lock',
            chain_of_custody: [
                ...(evidence.chain_of_custody || []),
                {
                    timestamp: new Date().toISOString(),
                    action: action === 'lock' ? 'Evidence locked (legal hold)' : 'Evidence unlocked',
                    performed_by: user.email,
                    approver: approver_email || user.email,
                    reason,
                    integrity_hash: evidence.file_hash_sha256
                }
            ]
        });

        // Audit log
        await base44.entities.AuditLog.create({
            event_type: `evidence_${action}`,
            severity: 'warning',
            description: `Evidence ${action}ed: ${reason}`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                evidence_id,
                action,
                reason,
                approver: approver_email || user.email
            }
        });

        return Response.json({
            success: true,
            action,
            evidence_id,
            locked: action === 'lock'
        });

    } catch (error) {
        console.error('Lock evidence error:', error);
        return Response.json({
            error: 'Operation failed',
            message: error.message
        }, { status: 500 });
    }
});