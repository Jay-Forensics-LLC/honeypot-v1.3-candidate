import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { requireOrgContext, validateOrgAccess } from './helpers/orgContext.js';
import { createHash } from "https://deno.land/std@0.177.0/node/crypto.ts";

/**
 * SECURE EVIDENCE UPDATE (Backend Only)
 * 
 * CRITICAL: Evidence updates must go through backend validation.
 * Prevents:
 * - Cross-tenant access
 * - Unauthorized modifications
 * - Chain of custody breaks
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgId = requireOrgContext(user);

    const {
      evidence_id,
      updates
    } = await req.json();

    if (!evidence_id || !updates) {
      return Response.json({ 
        error: 'evidence_id and updates are required' 
      }, { status: 400 });
    }

    // Fetch and validate evidence access
    const evidenceRecords = await base44.entities.EvidenceV2.filter({ id: evidence_id });
    
    if (!evidenceRecords.length) {
      return Response.json({ error: 'Evidence not found' }, { status: 404 });
    }

    const evidence = evidenceRecords[0];
    validateOrgAccess(user, evidence);

    // Block certain immutable fields
    const blockedFields = ['id', 'created_date', 'organization_id', 'file_hash', 'collected_by'];
    const sanitizedUpdates = { ...updates };
    blockedFields.forEach(field => delete sanitizedUpdates[field]);

    // Calculate new hash if file changed
    if (sanitizedUpdates.file_url && sanitizedUpdates.file_url !== evidence.file_url) {
      try {
        const response = await fetch(sanitizedUpdates.file_url);
        const arrayBuffer = await response.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        sanitizedUpdates.file_hash = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
      } catch (error) {
        console.warn('Failed to recalculate hash:', error);
      }
    }

    // Update evidence
    const updated = await base44.asServiceRole.entities.EvidenceV2.update(
      evidence_id,
      {
        ...sanitizedUpdates,
        updated_date: new Date().toISOString()
      }
    );

    // Create chain of custody entry
    const previousHash = evidence.file_hash || 'none';
    const newHash = sanitizedUpdates.file_hash || previousHash;

    await base44.asServiceRole.entities.ChainOfCustodyLog.create({
      organization_id: orgId,
      evidence_id: evidence_id,
      action: 'updated',
      actor_email: user.email,
      timestamp: new Date().toISOString(),
      evidence_hash: newHash,
      previous_hash: previousHash,
      record_hash: createHash('sha256')
        .update(JSON.stringify({ 
          evidence_id, 
          action: 'updated', 
          actor: user.email, 
          changes: Object.keys(sanitizedUpdates) 
        }))
        .digest('hex'),
      metadata: {
        fields_updated: Object.keys(sanitizedUpdates)
      }
    });

    // Audit log
    await base44.functions.invoke('createAuditLog', {
      event_type: 'evidence_updated',
      severity: 'info',
      description: `Evidence updated: ${evidence.title}`,
      action_performed: 'update',
      resource_type: 'evidence',
      resource_id: evidence_id,
      metadata: { fields: Object.keys(sanitizedUpdates) },
      success: true
    });

    return Response.json({ 
      success: true, 
      evidence: updated 
    });

  } catch (error) {
    console.error('[SecureEvidenceUpdate] Error:', error);

    try {
      await base44.functions.invoke('createAuditLog', {
        event_type: 'evidence_update_failed',
        severity: 'error',
        description: `Failed to update evidence: ${error.message}`,
        action_performed: 'update',
        resource_type: 'evidence',
        success: false
      });
    } catch {}

    return Response.json({
      error: error.message || 'Failed to update evidence'
    }, { status: 500 });
  }
});