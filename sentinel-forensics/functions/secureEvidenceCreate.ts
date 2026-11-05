import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { requireOrgContext, validateOrgAccess } from './helpers/orgContext.js';
import { createHash } from "https://deno.land/std@0.177.0/node/crypto.ts";

/**
 * SECURE EVIDENCE CREATE (Backend Only)
 * 
 * CRITICAL: Frontend cannot create evidence directly.
 * Ensures:
 * - Organization isolation
 * - Hash calculation for integrity
 * - Chain of custody logging
 * - Permission validation
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
      case_id,
      title,
      description,
      type,
      file_url,
      file_size,
      metadata = {}
    } = await req.json();

    // Validate required fields
    if (!title || !type) {
      return Response.json({ 
        error: 'title and type are required' 
      }, { status: 400 });
    }

    // Validate case access if case_id provided
    if (case_id) {
      const caseRecord = await base44.entities.Case.filter({ id: case_id });
      if (!caseRecord.length || caseRecord[0].organization_id !== orgId) {
        return Response.json({ error: 'Case not found or access denied' }, { status: 403 });
      }
    }

    // Calculate file hash if file_url provided
    let fileHash = null;
    if (file_url) {
      try {
        const response = await fetch(file_url);
        const arrayBuffer = await response.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        fileHash = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
      } catch (error) {
        console.warn('Failed to calculate hash:', error);
      }
    }

    // Create evidence with service role
    const evidence = await base44.asServiceRole.entities.EvidenceV2.create({
      organization_id: orgId,
      case_id,
      title,
      description,
      type,
      file_url,
      file_size,
      file_hash: fileHash,
      status: 'active',
      collected_by: user.email,
      collected_date: new Date().toISOString(),
      metadata
    });

    // Create chain of custody entry
    await base44.asServiceRole.entities.ChainOfCustodyLog.create({
      organization_id: orgId,
      evidence_id: evidence.id,
      action: 'created',
      actor_email: user.email,
      timestamp: new Date().toISOString(),
      evidence_hash: fileHash || 'pending',
      record_hash: createHash('sha256')
        .update(JSON.stringify({ evidence_id: evidence.id, action: 'created', actor: user.email }))
        .digest('hex')
    });

    // Create audit log
    await base44.functions.invoke('createAuditLog', {
      event_type: 'evidence_created',
      severity: 'info',
      description: `Evidence created: ${title}`,
      action_performed: 'create',
      resource_type: 'evidence',
      resource_id: evidence.id,
      metadata: { evidence_type: type, has_file: !!file_url },
      success: true
    });

    return Response.json({ 
      success: true, 
      evidence 
    });

  } catch (error) {
    console.error('[SecureEvidenceCreate] Error:', error);
    
    // Log failure
    try {
      await base44.functions.invoke('createAuditLog', {
        event_type: 'evidence_create_failed',
        severity: 'error',
        description: `Failed to create evidence: ${error.message}`,
        action_performed: 'create',
        resource_type: 'evidence',
        success: false
      });
    } catch {}

    return Response.json({
      error: error.message || 'Failed to create evidence'
    }, { status: 500 });
  }
});