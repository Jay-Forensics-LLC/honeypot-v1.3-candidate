import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import * as OTPAuth from 'npm:otpauth@9.1.4';
import { recordMfaVerified } from './helpers/stepUp.ts';

/**
 * Verify MFA Code
 * SECURE: Requires authentication
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // EXPLICIT AUTHENTICATION CHECK
        const user = await base44.auth.me();
        
        if (!user || !user.email) {
            await base44.asServiceRole.entities.AuditLog.create({
                event_type: 'unauthenticated_mfa_verification',
                severity: 'warning',
                description: 'Unauthenticated attempt to verify MFA code',
                user_id: 'anonymous',
                timestamp: new Date().toISOString(),
                success: false,
                metadata: {
                    ip_address: req.headers.get('x-forwarded-for') || 'unknown',
                    user_agent: req.headers.get('user-agent') || 'unknown'
                }
            });
            
            return Response.json({
                error: 'Unauthorized',
                message: 'Authentication required to verify MFA code'
            }, { status: 401 });
        }
        
        const { user_email, code, secret, method, backup_codes } = await req.json();

        // Verify the requesting user matches the target email
        if (user_email !== user.email && user.role !== 'admin') {
            await base44.asServiceRole.entities.AuditLog.create({
                event_type: 'unauthorized_mfa_verification',
                severity: 'warning',
                description: 'User attempted to verify MFA code for different email',
                user_id: user.email,
                timestamp: new Date().toISOString(),
                success: false,
                metadata: {
                    requested_email: user_email,
                    actual_email: user.email
                }
            });
            
            return Response.json({
                error: 'Forbidden',
                message: 'Cannot verify MFA code for another user'
            }, { status: 403 });
        }

        if (!user_email || !code || !method) {
            return Response.json({
                error: 'Missing required fields',
                message: 'user_email, code, and method are required'
            }, { status: 400 });
        }

        // Verify backup code
        if (method === 'backup_code') {
            if (!backup_codes || backup_codes.length === 0) {
                return Response.json({
                    valid: false,
                    error: 'No backup codes available'
                });
            }

            const encoder = new TextEncoder();
            const data = encoder.encode(code);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const codeHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            const matchIndex = backup_codes.findIndex(hash => hash === codeHash);
            
            if (matchIndex === -1) {
                await base44.asServiceRole.entities.AuditLog.create({
                    event_type: 'mfa_verification_failed',
                    severity: 'warning',
                    description: 'Invalid backup code attempted',
                    user_id: user_email,
                    timestamp: new Date().toISOString(),
                    success: false,
                    metadata: {
                        method: 'backup_code',
                        authenticated_user: user.email
                    }
                });
                
                return Response.json({
                    valid: false,
                    error: 'Invalid backup code'
                });
            }

            const remainingCodes = backup_codes.filter((_, i) => i !== matchIndex);
            
            // Record MFA session for step-up auth
            await base44.asServiceRole.entities.MFASession.create({
                user_email,
                verified_at: new Date().toISOString(),
                method: 'backup_code'
            });
            
            // Record step-up timestamp
            await recordMfaVerified(base44, user);

            await base44.asServiceRole.entities.AuditLog.create({
                event_type: 'mfa_verified_backup_code',
                severity: 'info',
                description: 'MFA verified using backup code',
                user_id: user_email,
                timestamp: new Date().toISOString(),
                success: true,
                metadata: {
                    codes_remaining: remainingCodes.length,
                    authenticated_user: user.email
                }
            });

            return Response.json({
                valid: true,
                remaining_codes: remainingCodes,
                codes_left: remainingCodes.length
            });
        }

        // Verify TOTP code
        if (method === 'totp') {
            if (!secret) {
                return Response.json({
                    valid: false,
                    error: 'Missing TOTP secret'
                });
            }

            try {
                const totp = new OTPAuth.TOTP({
                    issuer: 'Sentinel Forensics',
                    label: user_email,
                    algorithm: 'SHA1',
                    digits: 6,
                    period: 30,
                    secret: OTPAuth.Secret.fromBase32(secret)
                });

                const delta = totp.validate({
                    token: code,
                    window: 1
                });

                if (delta !== null) {
                    // Record MFA session for step-up auth
                    await base44.asServiceRole.entities.MFASession.create({
                        user_email,
                        verified_at: new Date().toISOString(),
                        method: 'totp'
                    });
                    
                    // Record step-up timestamp
                    await recordMfaVerified(base44, user);
                    
                    await base44.asServiceRole.entities.AuditLog.create({
                        event_type: 'mfa_verified_totp',
                        severity: 'info',
                        description: 'MFA verified using TOTP',
                        user_id: user_email,
                        timestamp: new Date().toISOString(),
                        success: true,
                        metadata: {
                            method: 'totp',
                            authenticated_user: user.email
                        }
                    });
                    
                    return Response.json({
                        valid: true,
                        method: 'totp'
                    });
                } else {
                    await base44.asServiceRole.entities.AuditLog.create({
                        event_type: 'mfa_verification_failed',
                        severity: 'warning',
                        description: 'Invalid TOTP code attempted',
                        user_id: user_email,
                        timestamp: new Date().toISOString(),
                        success: false,
                        metadata: {
                            method: 'totp',
                            authenticated_user: user.email
                        }
                    });
                    
                    return Response.json({
                        valid: false,
                        error: 'Invalid TOTP code'
                    });
                }
            } catch (error) {
                console.error('TOTP verification error:', error);
                return Response.json({
                    valid: false,
                    error: 'TOTP verification failed'
                });
            }
        }

        // Verify SMS/Email code
        if (method === 'sms' || method === 'email') {
            // Get recent code from MFACode entity
            const codes = await base44.asServiceRole.entities.MFACode.filter({
                user_email,
                method,
                used: false
            }, '-created_at', 1);

            if (!codes || codes.length === 0) {
                return Response.json({
                    valid: false,
                    error: 'No valid code found. Please request a new code.'
                });
            }

            const codeRecord = codes[0];

            // Check if code is expired
            if (new Date(codeRecord.expires_at) < new Date()) {
                return Response.json({
                    valid: false,
                    error: 'Code has expired. Please request a new code.'
                });
            }

            // Check attempt limit
            if (codeRecord.attempts >= 5) {
                return Response.json({
                    valid: false,
                    error: 'Too many attempts. Please request a new code.'
                });
            }

            // Hash the provided code
            const encoder = new TextEncoder();
            const data = encoder.encode(code);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const codeHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            // Update attempts
            await base44.asServiceRole.entities.MFACode.update(codeRecord.id, {
                attempts: codeRecord.attempts + 1
            });

            if (codeRecord.code_hash === codeHash) {
                // Mark code as used
                await base44.asServiceRole.entities.MFACode.update(codeRecord.id, {
                    used: true
                });
                
                // Record MFA session for step-up auth
                await base44.asServiceRole.entities.MFASession.create({
                    user_email,
                    verified_at: new Date().toISOString(),
                    method
                });
                
                // Record step-up timestamp
                await recordMfaVerified(base44, user);

                await base44.asServiceRole.entities.AuditLog.create({
                    event_type: `mfa_verified_${method}`,
                    severity: 'info',
                    description: `MFA verified using ${method}`,
                    user_id: user_email,
                    timestamp: new Date().toISOString(),
                    success: true,
                    metadata: {
                        method,
                        authenticated_user: user.email
                    }
                });

                return Response.json({
                    valid: true,
                    method
                });
            } else {
                await base44.asServiceRole.entities.AuditLog.create({
                    event_type: 'mfa_verification_failed',
                    severity: 'warning',
                    description: `Invalid ${method} code attempted`,
                    user_id: user_email,
                    timestamp: new Date().toISOString(),
                    success: false,
                    metadata: {
                        method,
                        attempts: codeRecord.attempts + 1,
                        authenticated_user: user.email
                    }
                });
                
                return Response.json({
                    valid: false,
                    error: 'Invalid code'
                });
            }
        }

        return Response.json({
            valid: false,
            error: 'Unsupported MFA method'
        });

    } catch (error) {
        console.error('MFA verification error:', error);
        return Response.json({
            error: 'Verification failed',
            message: error.message
        }, { status: 500 });
    }
});