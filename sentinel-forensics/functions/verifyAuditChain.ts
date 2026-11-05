import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Audit Chain Verification Endpoint
 * Verifies the cryptographic integrity of audit log hash chain
 * Returns verification status, root hash, and any integrity violations
 */

async function sha256(data) {
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function canonicalizeEntry(entry) {
    // Create canonical representation for hashing
    // Exclude hash fields themselves from the hash calculation
    const canonical = {
        id: entry.id,
        event_type: entry.event_type || '',
        severity: entry.severity || 'info',
        description: entry.description || '',
        user_id: entry.user_id || '',
        timestamp: entry.timestamp || entry.created_date,
        success: entry.success === undefined ? true : entry.success,
        metadata: entry.metadata || {}
    };
    
    // Sort keys for deterministic JSON
    return JSON.stringify(canonical, Object.keys(canonical).sort());
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Admin only
        if (user.role !== 'admin') {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { limit = 1000 } = await req.json();

        // Fetch audit logs
        const logs = await base44.asServiceRole.entities.AuditLog.list('-timestamp', limit);

        if (logs.length === 0) {
            return Response.json({
                ok: true,
                message: 'No audit logs to verify',
                count: 0
            });
        }

        // Genesis hash (64 zeros)
        const GENESIS_HASH = '0'.repeat(64);
        
        let prevHash = GENESIS_HASH;
        let count = 0;
        let firstBadId = null;
        let reason = null;

        // Sort logs by timestamp to ensure correct order
        const sortedLogs = [...logs].sort((a, b) => {
            const timeA = new Date(a.timestamp || a.created_date).getTime();
            const timeB = new Date(b.timestamp || b.created_date).getTime();
            return timeA - timeB;
        });

        for (const entry of sortedLogs) {
            count++;
            
            // Compute expected hash
            const canonical = canonicalizeEntry(entry);
            const preHash = await sha256(canonical);
            const expectedHash = await sha256(prevHash + preHash);
            
            // Check if stored hash matches expected
            const storedHash = entry.blockchain_hash || entry.integrity_hash;
            
            if (storedHash && storedHash !== expectedHash) {
                firstBadId = entry.id;
                reason = `Hash mismatch: expected ${expectedHash.substring(0, 16)}..., got ${storedHash.substring(0, 16)}...`;
                break;
            }
            
            // Update prevHash for next iteration
            prevHash = expectedHash;
        }

        if (firstBadId) {
            // Verification failed - log security incident
            await base44.asServiceRole.entities.AuditLog.create({
                event_type: 'audit_chain_integrity_failure',
                severity: 'critical',
                description: 'Audit log chain integrity compromised',
                user_id: user.email,
                timestamp: new Date().toISOString(),
                success: false,
                metadata: {
                    first_bad_id: firstBadId,
                    reason,
                    verified_count: count - 1
                }
            });

            return Response.json({
                ok: false,
                firstBadId,
                reason,
                count: count - 1
            });
        }

        // Verification successful
        const rootHash = prevHash;
        
        await base44.asServiceRole.entities.AuditLog.create({
            event_type: 'audit_chain_verified',
            severity: 'info',
            description: 'Audit log chain integrity verified',
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                root_hash: rootHash,
                logs_verified: count
            }
        });

        return Response.json({
            ok: true,
            rootHash,
            count,
            message: 'Audit chain integrity verified successfully'
        });

    } catch (error) {
        console.error('Audit verification error:', error);
        return Response.json({
            error: 'Verification failed',
            message: error.message
        }, { status: 500 });
    }
});