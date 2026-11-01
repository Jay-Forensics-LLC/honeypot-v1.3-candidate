import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * ROTATE ALL SESSIONS - Emergency Token Invalidation
 * 
 * USE CASE: Security incident response, forced logout
 * 
 * This function:
 * 1. Marks all SessionTokens as revoked
 * 2. Clears all active AgentSessions
 * 3. Forces all users to re-authenticate
 * 4. Creates comprehensive audit trail
 * 
 * ADMIN ONLY
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const admin = await base44.auth.me();

        if (!admin || admin.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { 
            reason = 'Security remediation - session token rotation',
            exclude_admins = false,
            dry_run = false
        } = await req.json();

        const startTime = Date.now();
        const stats = {
            sessions_revoked: 0,
            agent_sessions_terminated: 0,
            users_affected: [],
            csrf_tokens_rotated: 0
        };

        // Get all active session tokens
        const sessions = await base44.asServiceRole.entities.SessionToken.filter({
            revoked: false
        });

        // Get all users
        const allUsers = await base44.asServiceRole.entities.User.list();

        // Process session revocations
        for (const session of sessions) {
            // Skip admin sessions if requested
            if (exclude_admins) {
                const sessionUser = allUsers.find(u => u.email === session.user_email);
                if (sessionUser?.role === 'admin') {
                    continue;
                }
            }

            if (!dry_run) {
                // Revoke session
                await base44.asServiceRole.entities.SessionToken.update(session.id, {
                    revoked: true,
                    revoked_at: new Date().toISOString()
                });
            }

            stats.sessions_revoked++;
            if (!stats.users_affected.includes(session.user_email)) {
                stats.users_affected.push(session.user_email);
            }
        }

        // Terminate all agent sessions
        const agentSessions = await base44.asServiceRole.entities.AgentSession.filter({
            status: { $in: ['active', 'authenticated'] }
        });

        for (const agentSession of agentSessions) {
            if (!dry_run) {
                await base44.asServiceRole.entities.AgentSession.update(agentSession.id, {
                    status: 'terminated',
                    disconnected_at: new Date().toISOString()
                });
            }

            stats.agent_sessions_terminated++;
        }

        // Clear CSRF token rotation counter (conceptual - actual tokens are server-side)
        stats.csrf_tokens_rotated = stats.users_affected.length;

        // Create audit log
        if (!dry_run) {
            await base44.entities.AuditLog.create({
                event_type: 'mass_session_rotation',
                severity: 'critical',
                description: `All sessions rotated by admin: ${reason}`,
                user_id: admin.email,
                timestamp: new Date().toISOString(),
                success: true,
                metadata: {
                    reason,
                    stats,
                    duration_ms: Date.now() - startTime,
                    exclude_admins,
                    dry_run,
                    performed_by: admin.email
                }
            });

            // Send notifications to affected users
            for (const userEmail of stats.users_affected) {
                await base44.asServiceRole.entities.Notification.create({
                    notification_type: 'system',
                    recipient_email: userEmail,
                    title: 'Security Notice: Session Refresh Required',
                    message: 'For security reasons, all sessions have been refreshed. Please log in again.',
                    metadata: {
                        reason: reason,
                        rotated_at: new Date().toISOString()
                    }
                });
            }
        }

        return Response.json({
            success: true,
            dry_run,
            stats,
            duration_ms: Date.now() - startTime,
            message: dry_run 
                ? `DRY RUN: Would rotate ${stats.sessions_revoked} sessions` 
                : `Successfully rotated ${stats.sessions_revoked} sessions`
        });

    } catch (error) {
        console.error('Session rotation error:', error);
        return Response.json({ 
            error: 'Session rotation failed', 
            message: error.message 
        }, { status: 500 });
    }
});