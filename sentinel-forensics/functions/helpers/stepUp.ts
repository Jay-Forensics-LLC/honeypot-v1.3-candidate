/**
 * Step-Up Authentication Helper
 * 
 * Enforces recent MFA verification for high-risk operations.
 * Prevents session hijacking by requiring fresh MFA proof.
 */

import { errorJson } from './http.ts';

/**
 * Record successful MFA verification timestamp
 * 
 * @param base44 - Base44 SDK client
 * @param user - Authenticated user
 */
export async function recordMfaVerified(base44: any, user: any): Promise<void> {
  try {
    // Store verification timestamp in MFASession
    // This creates a fresh session or updates existing one
    await base44.asServiceRole.entities.MFASession.create({
      user_email: user.email,
      verified_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h expiry
      session_type: 'step_up',
      metadata: {
        user_agent: user.user_agent || 'unknown',
        verification_method: 'mfa'
      }
    });
  } catch (error) {
    console.error('[STEP-UP] Failed to record MFA verification:', error);
    // Non-fatal: don't block user flow if session storage fails
  }
}

/**
 * Require recent MFA verification
 * 
 * @param base44 - Base44 SDK client
 * @param user - Authenticated user
 * @param maxAgeMinutes - Maximum age of MFA verification (default 15 min)
 * @returns null if MFA is recent, Response if verification required
 * 
 * Usage:
 * ```ts
 * const mfaCheck = await requireRecentMfa(base44, user);
 * if (mfaCheck) return mfaCheck; // Return 403 response
 * ```
 */
export async function requireRecentMfa(
  base44: any,
  user: any,
  maxAgeMinutes: number = 15
): Promise<Response | null> {
  try {
    // Query recent MFA sessions for this user
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();
    
    const recentSessions = await base44.asServiceRole.entities.MFASession.filter({
      user_email: user.email,
      session_type: 'step_up',
      verified_at: { $gte: cutoff }
    });
    
    // If no recent MFA verification found
    if (!recentSessions || recentSessions.length === 0) {
      // Audit: step-up auth required but not satisfied
      await base44.asServiceRole.entities.SentinelAuditLog.create({
        organization_id: user.organization_id || 'system',
        user_email: user.email,
        action: 'step_up_auth_required',
        resource_type: 'Authentication',
        timestamp: new Date().toISOString(),
        hmac_signature: 'placeholder',
        severity: 'warning',
        details: {
          reason: 'mfa_verification_expired',
          max_age_minutes: maxAgeMinutes
        }
      });
      
      return errorJson(403, 'Recent MFA verification required');
    }
    
    // MFA is fresh, allow operation
    return null;
    
  } catch (error) {
    console.error('[STEP-UP] Error checking MFA verification:', error);
    // Fail-secure: require MFA on error
    return errorJson(403, 'MFA verification check failed');
  }
}