import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

/**
 * PHASE 7: Secure Audit Log Creation (Backend Only)
 * 
 * CRITICAL: Audit logs MUST be created via this function only.
 * Direct client writes to SentinelAuditLog are FORBIDDEN.
 * 
 * This ensures:
 * - HMAC signatures are server-generated (client cannot forge)
 * - Timestamps are server-controlled (client cannot backdate)
 * - RLS enforcement on server-side
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!user.organization_id) {
      return Response.json({ 
        error: 'Organization membership required' 
      }, { status: 403 });
    }

    const { 
      action, 
      resource_type, 
      resource_id, 
      severity, 
      details 
    } = await req.json();

    if (!action || !resource_type) {
      return Response.json({ 
        error: 'action and resource_type required' 
      }, { status: 400 });
    }

    // PHASE 7: Server-controlled timestamp (cannot be manipulated by client)
    const timestamp = new Date().toISOString();

    // PHASE 7: Generate HMAC signature for tamper detection
    const signingKey = Deno.env.get('SERVER_SIGNING_KEY');
    if (!signingKey) {
      throw new Error('SERVER_SIGNING_KEY not configured');
    }

    const payload = JSON.stringify({
      organization_id: user.organization_id,
      user_email: user.email,
      action,
      resource_type,
      resource_id,
      timestamp
    });

    const hmacSignature = createHmac('sha256', signingKey)
      .update(payload)
      .digest('hex');

    // Create audit log with server-side validation
    const auditLog = await base44.asServiceRole.entities.SentinelAuditLog.create({
      organization_id: user.organization_id,
      user_email: user.email,
      action,
      resource_type,
      resource_id: resource_id || null,
      timestamp,
      hmac_signature: hmacSignature,
      verified: true,
      severity: severity || 'info',
      details: details || {}
    });

    return Response.json({
      success: true,
      audit_log_id: auditLog.id
    });

  } catch (error) {
    console.error('Audit log creation error:', error);
    return Response.json({
      error: error.message || 'Failed to create audit log'
    }, { status: 500 });
  }
});