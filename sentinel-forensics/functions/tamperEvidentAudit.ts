import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * TAMPER-EVIDENT AUDIT LOG
 * HMAC-sealed audit entries for security orchestration and defense actions
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { action, resource_type, resource_id, details } = payload;

    if (!action || !resource_type) {
      return Response.json({ 
        error: 'action and resource_type required' 
      }, { status: 400 });
    }

    // Get signing key from environment
    const signingKey = Deno.env.get('SERVER_SIGNING_KEY');
    if (!signingKey) {
      throw new Error('SERVER_SIGNING_KEY not configured');
    }

    // Create audit entry data
    const timestamp = new Date().toISOString();
    const auditData = {
      organization_id: user.organization_id,
      user_email: user.email,
      action,
      resource_type,
      resource_id: resource_id || null,
      timestamp,
      details: details || {}
    };

    // Generate HMAC signature
    const signature = await generateHMAC(auditData, signingKey);

    // Store tamper-evident audit log
    const auditLog = await base44.asServiceRole.entities.SentinelAuditLog.create({
      ...auditData,
      hmac_signature: signature,
      verified: true,
      severity: determineSeverity(action)
    });

    // Also create standard audit log for backwards compatibility
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      user_email: user.email,
      action,
      resource_type,
      resource_id,
      severity: determineSeverity(action),
      details: {
        ...details,
        tamper_evident: true,
        signature: signature.substring(0, 16) + '...'
      }
    });

    return Response.json({
      success: true,
      audit_id: auditLog.id,
      signature: signature.substring(0, 32) + '...',
      timestamp
    });

  } catch (error) {
    console.error('Tamper-evident audit error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/**
 * Generate HMAC signature for audit data
 */
async function generateHMAC(data, key) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const messageData = encoder.encode(JSON.stringify(data));

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const signatureArray = Array.from(new Uint8Array(signature));
  return signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Determine severity based on action type
 */
function determineSeverity(action) {
  const criticalActions = [
    'evidence_deleted',
    'evidence_modified',
    'chain_broken',
    'security_breach',
    'apt_defense_triggered',
    'zero_click_detected'
  ];

  const highActions = [
    'vulnerability_detected',
    'threat_ingested',
    'defense_action_executed',
    'containment_triggered'
  ];

  if (criticalActions.some(a => action.includes(a))) {
    return 'critical';
  }
  if (highActions.some(a => action.includes(a))) {
    return 'high';
  }
  return 'info';
}