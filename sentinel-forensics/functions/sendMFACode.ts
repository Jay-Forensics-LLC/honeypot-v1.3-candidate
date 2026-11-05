/**
 * Send MFA Code via SMS (Twilio) or Email
 * Generates a 6-digit code and sends it securely
 * SECURE: Requires authentication
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { json, errorJson } from './helpers/http.ts';
import { checkRateLimit, makeRateLimitKey } from './helpers/rateLimit.ts';
import { getRequestId, logError, addRequestIdHeader } from './helpers/telemetry.ts';
import { readJsonLimited } from './helpers/body.ts';
import { handlePreflight, applyCorsHeaders } from './helpers/cors.ts';

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
const TWILIO_FROM_NUMBER = Deno.env.get('TWILIO_FROM_NUMBER');

async function sendSMS(to: string, message: string): Promise<boolean> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    throw new Error('SMS_NOT_CONFIGURED');
  }

  try {
    const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        To: to,
        From: TWILIO_FROM_NUMBER,
        Body: message
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[MFA] Twilio API error:', errorData);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[MFA] SMS send failed:', error);
    return false;
  }
}

async function hashCode(code: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(code);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handlePreflight(req);
  }
  
  const requestId = getRequestId(req);
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user?.email) {
      return addRequestIdHeader(errorJson(401, 'Authentication required'), requestId);
    }
    
    // Parse JSON with size limits (4KB max for MFA requests)
    const body = await readJsonLimited(req, 4_000);
    const { user_email, method, phone_number } = body;
    
    if (!method || !['email', 'sms'].includes(method)) {
      return errorJson(400, 'Invalid method');
    }
    
    const targetEmail = user_email || user.email;
    
    // Verify requesting user matches target (or is admin)
    if (targetEmail !== user.email && user.role !== 'admin') {
      return errorJson(403, 'Forbidden');
    }
    
    // Rate limiting: 3 sends / 10 minutes per user + IP check
    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    
    // Per-user limit
    const userRateCheck = await checkRateLimit(base44, {
      scope: 'mfa_send_user',
      maxAttempts: 3,
      windowMinutes: 10,
      identifier: targetEmail,
      organizationId: user.organization_id
    });
    
    if (userRateCheck.limited) {
      return errorJson(429, 'Too many requests');
    }
    
    // Per-IP limit (additional protection)
    const ipRateCheck = await checkRateLimit(base44, {
      scope: 'mfa_send_ip',
      maxAttempts: 10,
      windowMinutes: 10,
      identifier: clientIp
    });
    
    if (ipRateCheck.limited) {
      return errorJson(429, 'Too many requests');
    }
    
    if (method === 'sms') {
      if (!phone_number || !/^\+[1-9]\d{1,14}$/.test(phone_number)) {
        return errorJson(400, 'Valid phone number required for SMS');
      }
      
      // Check if SMS is configured
      if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
        return errorJson(503, 'SMS MFA not configured');
      }
    }
    
    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = await hashCode(code);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    
    // Store code
    await base44.asServiceRole.entities.MFACode.create({
      user_email: targetEmail,
      code_hash: codeHash,
      method,
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString(),
      used: false,
      attempts: 0
    });
    
    // Send code
    if (method === 'sms' && phone_number) {
      const message = `Your Sentinel Forensics verification code is: ${code}. Valid for 5 minutes.`;
      
      try {
        const sent = await sendSMS(phone_number, message);
        
        if (!sent) {
          return errorJson(500, 'Failed to send SMS');
        }
      } catch (error) {
        if (error.message === 'SMS_NOT_CONFIGURED') {
          return errorJson(503, 'SMS MFA not configured');
        }
        return errorJson(500, 'Failed to send SMS');
      }
    } else {
      // Email delivery
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: targetEmail,
        subject: 'Sentinel Forensics - Verification Code',
        body: `Your verification code is: ${code}\n\nThis code expires in 5 minutes.\n\nIf you didn't request this, secure your account immediately.`
      });
    }
    
    // Audit log (no code in logs!)
    await base44.asServiceRole.entities.AuditLog.create({
      event_type: 'mfa_code_sent',
      severity: 'info',
      description: `MFA code sent via ${method}`,
      user_id: targetEmail,
      timestamp: new Date().toISOString(),
      success: true,
      metadata: { method, authenticated_by: user.email }
    });
    
    const response = addRequestIdHeader(
      json({
        ok: true,
        method,
        expires_at: expiresAt.toISOString()
      }),
      requestId
    );
    return applyCorsHeaders(req, response);
    
  } catch (error) {
    if (error instanceof Response) {
      const withHeaders = addRequestIdHeader(error, requestId);
      return applyCorsHeaders(req, withHeaders);
    }
    logError({ 
      requestId, 
      route: 'sendMFACode', 
      userId: user?.email,
      orgId: user?.organization_id 
    }, error);
    const response = addRequestIdHeader(errorJson(500, 'Failed to send MFA code'), requestId);
    return applyCorsHeaders(req, response);
  }
});