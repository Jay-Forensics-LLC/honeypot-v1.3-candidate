/**
 * PHASE 6: Server-Side HMAC-Signed Audit Event Creation
 * 
 * All audit logs MUST be created via this endpoint to ensure:
 * - Server-generated timestamps (tamper-proof)
 * - HMAC signatures for integrity verification
 * - Organization scoping enforced
 * - No client-side forgery possible
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { requireAuth, requireOrg, safeJson, sanitizeError } from './helpers/security.js';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await requireAuth(base44);
    const orgId = requireOrg(user);
    
    const {
      action,
      resource_type,
      resource_id,
      severity = 'info',
      details = {},
      case_id,
      success = true
    } = await safeJson(req);
    
    // Validate required fields
    if (!action) {
      return Response.json({ 
        error: 'Validation Error',
        detail: 'action is required'
      }, { status: 400 });
    }
    
    // Server-generated timestamp (tamper-proof)
    const timestamp = new Date().toISOString();
    
    // Canonical payload for HMAC
    const canonicalPayload = {
      organization_id: orgId,
      action,
      resource_type: resource_type || null,
      resource_id: resource_id || null,
      actor_email: user.email,
      actor_role: user.role,
      timestamp,
      severity,
      success
    };
    
    // Generate HMAC signature
    const signingKey = Deno.env.get('SERVER_SIGNING_KEY');
    if (!signingKey) {
      console.error('[AUDIT] SERVER_SIGNING_KEY not configured');
      return Response.json({ 
        error: 'Configuration Error',
        detail: 'Audit signing not configured'
      }, { status: 500 });
    }
    
    const encoder = new TextEncoder();
    const keyData = encoder.encode(signingKey);
    const messageData = encoder.encode(JSON.stringify(canonicalPayload));
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const signatureHex = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Create SHA-256 hash of payload for integrity chain
    const payloadHash = await crypto.subtle.digest('SHA-256', messageData);
    const payloadHashHex = Array.from(new Uint8Array(payloadHash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Store in SentinelAuditLog (canonical audit entity)
    const auditRecord = await base44.asServiceRole.entities.SecurityAuditLog.create({
      organization_id: orgId,
      event_type: action,
      severity,
      description: `${action} on ${resource_type || 'system'}`,
      actor_email: user.email,
      success,
      metadata: {
        resource_type,
        resource_id,
        case_id,
        details,
        actor_role: user.role,
        hmac_signature: signatureHex,
        payload_hash: payloadHashHex,
        signed_at: timestamp
      },
      entity_type: resource_type,
      entity_id: resource_id,
      timestamp_utc: timestamp
    });
    
    return Response.json({
      audit_id: auditRecord.id,
      timestamp,
      signature: signatureHex,
      message: 'Audit event recorded'
    });
    
  } catch (error) {
    if (error instanceof Response) return error;
    
    console.error('[AUDIT-CREATE] Error:', error);
    return Response.json(sanitizeError(error), { status: 500 });
  }
});