import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { user_email, ip_address } = await req.json();

    // Check recent failed login attempts
    const recentAttempts = await base44.asServiceRole.entities.SecurityEvent.filter({
      event_type: 'failed_login',
      user_email,
      timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000).toISOString() }
    });

    const failedCount = recentAttempts.length;

    // Check if account is locked
    const user = await base44.asServiceRole.entities.User.filter({ email: user_email });
    const userData = user[0];

    if (userData?.account_locked_until) {
      const lockoutEnd = new Date(userData.account_locked_until);
      if (lockoutEnd > new Date()) {
        return Response.json({
          locked: true,
          locked_until: userData.account_locked_until,
          reason: 'Too many failed login attempts',
          attempts_remaining: 0
        });
      }
    }

    // If too many failed attempts, lock account
    if (failedCount >= MAX_FAILED_ATTEMPTS) {
      const lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
      
      await base44.asServiceRole.entities.User.update(userData.id, {
        account_locked_until: lockUntil,
        failed_login_attempts: failedCount
      });

      // Log lockout event
      await base44.asServiceRole.entities.SecurityEvent.create({
        event_type: 'account_lockout',
        severity: 'critical',
        user_email,
        ip_address,
        details: {
          failed_attempts: failedCount,
          locked_until: lockUntil
        },
        timestamp: new Date().toISOString(),
        risk_score: 95
      });

      // Send alert email
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: user_email,
          subject: 'Account Locked - Sentinel Forensics',
          body: `Your account has been locked due to ${failedCount} failed login attempts. It will be unlocked automatically in 15 minutes. If this wasn't you, please contact support immediately.`
        });
      } catch (emailError) {
        console.error('Failed to send lockout email:', emailError);
      }

      return Response.json({
        locked: true,
        locked_until: lockUntil,
        reason: 'Too many failed login attempts',
        attempts_remaining: 0
      });
    }

    return Response.json({
      locked: false,
      attempts_remaining: MAX_FAILED_ATTEMPTS - failedCount,
      failed_attempts: failedCount
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});