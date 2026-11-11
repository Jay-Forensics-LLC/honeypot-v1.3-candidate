import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { checkRateLimit, makeRateLimitKey } from './helpers/rateLimit.ts';
import { z } from 'npm:zod@3.24.1';
import { getRequestId, logError, addRequestIdHeader } from './helpers/telemetry.ts';
import { readJsonLimited } from './helpers/body.ts';
import { handlePreflight, applyCorsHeaders } from './helpers/cors.ts';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;
const SUSPICIOUS_THRESHOLD_SCORE = 70;

// Strict input validation schema
const LoginValidationSchema = z.object({
    user_email: z.string().email('Invalid email').max(254, 'Email too long'),
    success: z.boolean(),
    failure_reason: z.string().max(256).optional(),
    ip_address: z.string().max(45).optional(), // IPv6 max length
    user_agent: z.string().max(512).optional(),
    device_fingerprint: z.string().max(256).optional()
});

/**
 * Login Validation & Security Monitoring
 * Tracks failed attempts, enforces lockouts, detects suspicious activity
 */
Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return handlePreflight(req);
    }
    
    const requestId = getRequestId(req);
    let body;
    
    // Parse JSON with size limits (8KB max for login requests)
    try {
        body = await readJsonLimited(req, 8_000);
    } catch (error) {
        if (error instanceof Response) {
            return addRequestIdHeader(error, requestId);
        }
        logError({ requestId, route: 'validateLogin' }, error);
        return addRequestIdHeader(
            Response.json({ error: 'Invalid input' }, { status: 400 }),
            requestId
        );
    }

    try {
        const base44 = createClientFromRequest(req);
        
        // Strict input validation
        const validation = LoginValidationSchema.safeParse(body);
        if (!validation.success) {
            return Response.json({ error: 'Invalid input' }, { status: 400 });
        }

        const { user_email, success, failure_reason, ip_address, user_agent, device_fingerprint } = validation.data;

        // Rate limiting: 10 attempts / 10 minutes per IP+email
        const rateLimitKey = makeRateLimitKey(ip_address || 'unknown', user_email);
        const rateCheck = await checkRateLimit(base44, {
            scope: 'login_validation',
            maxAttempts: 10,
            windowMinutes: 10,
            identifier: rateLimitKey
        });

        if (rateCheck.limited) {
            return Response.json({ 
                error: 'Too many requests' 
            }, { status: 429 });
        }

        // Calculate risk score
        let riskScore = 0;
        let isSuspicious = false;

        // Get user's previous login attempts
        const recentAttempts = await base44.asServiceRole.entities.LoginAttempt.filter(
            { user_email },
            '-timestamp',
            50
        );

        // Check for rapid failed attempts
        const recentFails = recentAttempts
            .filter(a => !a.success && new Date(a.timestamp) > new Date(Date.now() - 10 * 60 * 1000));
        
        if (recentFails.length >= 3) {
            riskScore += 40;
            isSuspicious = true;
        }

        // Check for new IP/location
        const knownIPs = [...new Set(recentAttempts.filter(a => a.success).map(a => a.ip_address))];
        if (!knownIPs.includes(ip_address)) {
            riskScore += 20;
        }

        // Check for new device
        const knownDevices = [...new Set(recentAttempts.filter(a => a.success).map(a => a.device_fingerprint))];
        if (device_fingerprint && !knownDevices.includes(device_fingerprint)) {
            riskScore += 15;
        }

        // MFA failure pattern
        if (failure_reason === 'mfa_failed') {
            riskScore += 25;
            isSuspicious = true;
        }

        // Create login attempt record
        const attempt = await base44.asServiceRole.entities.LoginAttempt.create({
            user_email,
            success,
            failure_reason: failure_reason || null,
            ip_address,
            user_agent,
            device_fingerprint,
            is_suspicious: isSuspicious || riskScore >= SUSPICIOUS_THRESHOLD_SCORE,
            risk_score: riskScore,
            timestamp: new Date().toISOString(),
            alert_sent: false
        });

        // Handle failed login
        if (!success) {
            // Get user record and increment failed attempts
            const users = await base44.asServiceRole.entities.User.filter({ email: user_email });
            const userRecord = users[0];

            if (userRecord) {
                const failedAttempts = (userRecord.failed_login_attempts || 0) + 1;
                const updates = { failed_login_attempts: failedAttempts };

                // Lock account if threshold exceeded
                if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
                    const lockoutUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
                    updates.account_locked_until = lockoutUntil.toISOString();

                    // Send alert email
                    try {
                        await base44.integrations.Core.SendEmail({
                            to: user_email,
                            subject: '🔒 Account Locked - Sentinel Forensics',
                            body: `Your account has been locked due to ${MAX_FAILED_ATTEMPTS} failed login attempts.\n\nLocked until: ${lockoutUntil.toLocaleString()}\n\nIf this wasn't you, contact your administrator immediately.\n\nIP: ${ip_address}\nTime: ${new Date().toLocaleString()}`
                        });
                    } catch (emailError) {
                        console.error('Failed to send lockout email:', emailError);
                    }

                    // Update attempt record
                    await base44.asServiceRole.entities.LoginAttempt.update(attempt.id, {
                        alert_sent: true
                    });
                }

                await base44.asServiceRole.entities.User.update(userRecord.id, updates);
            }

            // Audit log
            await base44.asServiceRole.entities.AuditLog.create({
                event_type: 'login_failed',
                severity: isSuspicious ? 'warning' : 'info',
                description: `Failed login attempt for ${user_email}`,
                user_id: user_email,
                timestamp: new Date().toISOString(),
                success: false,
                metadata: {
                    failure_reason,
                    ip_address,
                    risk_score: riskScore,
                    is_suspicious: isSuspicious
                }
            });

            // CRITICAL: Do not leak account existence - generic response
            return Response.json({
                success: false,
                risk_score: riskScore
            });
        }

        // Handle successful login
        const users = await base44.asServiceRole.entities.User.filter({ email: user_email });
        const userRecord = users[0];

        if (userRecord) {
            // Reset failed attempts and update last login
            await base44.asServiceRole.entities.User.update(userRecord.id, {
                failed_login_attempts: 0,
                account_locked_until: null,
                last_login: new Date().toISOString(),
                last_login_ip: ip_address
            });

            // Check if MFA is required but not enabled for admins
            if (userRecord.role === 'admin' && !userRecord.mfa_enabled) {
                return Response.json({
                    success: true,
                    mfa_setup_required: true,
                    message: 'Admin accounts require MFA. Please set up MFA to continue.'
                });
            }

            // Alert on suspicious but successful login
            if (isSuspicious || riskScore >= SUSPICIOUS_THRESHOLD_SCORE) {
                try {
                    await base44.integrations.Core.SendEmail({
                        to: user_email,
                        subject: '🔔 New Login Detected - Sentinel Forensics',
                        body: `A login to your account was detected from a new location or device.\n\nTime: ${new Date().toLocaleString()}\nIP: ${ip_address}\nLocation: Unknown\nDevice: ${user_agent}\n\nIf this wasn't you, secure your account immediately and contact support.`
                    });

                    await base44.asServiceRole.entities.LoginAttempt.update(attempt.id, {
                        alert_sent: true
                    });
                } catch (emailError) {
                    console.error('Failed to send login alert:', emailError);
                }
            }
        }

        // Audit log
        await base44.asServiceRole.entities.AuditLog.create({
            event_type: 'login_successful',
            severity: 'info',
            description: `Successful login for ${user_email}`,
            user_id: user_email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                ip_address,
                risk_score: riskScore,
                is_suspicious: isSuspicious
            }
        });

        const response = addRequestIdHeader(
            Response.json({
                success: true,
                risk_score: riskScore,
                suspicious: isSuspicious
            }),
            requestId
        );
        return applyCorsHeaders(req, response);

        } catch (error) {
            logError({ 
                requestId, 
                route: 'validateLogin', 
                userId: body?.user_email 
            }, error);
            const response = addRequestIdHeader(
                Response.json({ 
                    error: 'Validation failed'
                }, { status: 500 }),
                requestId
            );
            return applyCorsHeaders(req, response);
        }
        });