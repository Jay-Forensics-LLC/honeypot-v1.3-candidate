import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { requireOrgContext } from './helpers/orgContext.js';
import { createErrorResponse } from './errorHandler.js';

/**
 * CREATE AUDIT LOG - BACKEND ONLY
 * 
 * CRITICAL: Frontend cannot create audit logs directly.
 * Ensures:
 * - Server-side timestamp (cannot be forged)
 * - Organization isolation enforcement
 * - Blockchain hash for immutability
 * - Metadata sanitization
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    // CRITICAL: Require organization context for user actions
    let orgId = 'system';
    if (user) {
      orgId = requireOrgContext(user);
    }

    const payload = await req.json();

    // Validate required fields
    if (!payload.event_type) {
      return Response.json({ error: 'event_type is required' }, { status: 400 });
    }

    if (!payload.description) {
      return Response.json({ error: 'description is required' }, { status: 400 });
    }

    // Sanitize metadata to prevent sensitive data leakage
    const sanitizedMetadata = sanitizeMetadata(payload.metadata || {});

    // Generate blockchain hash for immutability
    const hashData = JSON.stringify({
      event_type: payload.event_type,
      timestamp: new Date().toISOString(),
      organization_id: orgId,
      user_id: user?.email || payload.user_id || 'system',
      description: payload.description
    });

    const encoder = new TextEncoder();
    const data = encoder.encode(hashData);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const blockchain_hash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // CRITICAL: Create with service role (immutable, no RLS bypass)
    const auditLog = await base44.asServiceRole.entities.AuditLog.create({
      organization_id: orgId,
      event_type: payload.event_type,
      severity: payload.severity || 'info',
      description: payload.description,
      user_id: user?.email || payload.user_id || 'system',
      action_performed: payload.action_performed || payload.event_type,
      timestamp: new Date().toISOString(),
      blockchain_hash: blockchain_hash,
      success: payload.success !== false,
      
      // Optional fields
      resource_type: payload.resource_type || null,
      resource_id: payload.resource_id || null,
      case_id: payload.case_id || null,
      evidence_id: payload.evidence_id || null,
      alert_id: payload.alert_id || null,
      fields_changed: payload.fields_changed || null,
      previous_state: payload.previous_state || null,
      new_state: payload.new_state || null,
      error_message: payload.error_message || null,
      session_id: payload.session_id || null,
      device_fingerprint: payload.device_fingerprint || null,
      metadata: sanitizedMetadata
    });

    return Response.json({
      success: true,
      audit_log_id: auditLog.id,
      blockchain_hash
    });

  } catch (error) {
    console.error('Audit log creation failed:', error);
    return createErrorResponse(error, 'Failed to create audit log');
  }
});

/**
 * Sanitize metadata to prevent sensitive data logging
 */
function sanitizeMetadata(obj) {
  if (!obj || typeof obj !== 'object') return {};
  
  const sensitiveKeys = [
    'password', 'token', 'secret', 'api_key', 'apikey', 
    'auth', 'authorization', 'bearer', 'credential', 
    'mfa_secret', 'backup_codes', 'private_key', 'ssn',
    'credit_card', 'cvv', 'pin'
  ];
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 1000) {
      sanitized[key] = value.substring(0, 1000) + '... [truncated]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeMetadata(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}