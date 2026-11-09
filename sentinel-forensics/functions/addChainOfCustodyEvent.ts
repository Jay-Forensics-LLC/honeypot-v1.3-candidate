import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { requireOrgContext } from './helpers/orgContext.js';

/**
 * ADD CHAIN OF CUSTODY EVENT
 * Immutable logging of evidence handling
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    const orgId = requireOrgContext(user);

    const { evidence_id, action, metadata } = await req.json();

    if (!evidence_id || !action) {
      return Response.json({ error: 'evidence_id and action required' }, { status: 400 });
    }

    // Fetch current evidence to get hash
    const evidenceItems = await base44.asServiceRole.entities.EvidenceV2.filter({ 
      id: evidence_id,
      organization_id: orgId 
    });
    
    if (evidenceItems.length === 0) {
      return Response.json({ error: 'Evidence not found' }, { status: 404 });
    }

    const evidence = evidenceItems[0];

    // Get previous chain entry for hash chaining
    const previousLogs = await base44.asServiceRole.entities.ChainOfCustodyLog.filter({ 
      evidence_id: evidence_id,
      organization_id: orgId 
    }, '-timestamp', 1);

    const previousHash = previousLogs.length > 0 ? previousLogs[0].record_hash : null;

    // Generate record hash
    const recordData = JSON.stringify({
      evidence_id,
      action,
      actor: user.email,
      timestamp: new Date().toISOString(),
      evidence_hash: evidence.file_hash,
      previous_hash: previousHash
    });

    const encoder = new TextEncoder();
    const data = encoder.encode(recordData);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const recordHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Create custody log
    const custodyLog = await base44.asServiceRole.entities.ChainOfCustodyLog.create({
      organization_id: orgId,
      evidence_id: evidence_id,
      action: action,
      actor_email: user.email,
      timestamp: new Date().toISOString(),
      evidence_hash: evidence.file_hash || 'NONE',
      previous_hash: previousHash,
      record_hash: recordHash,
      metadata: metadata || {}
    });

    return Response.json({
      success: true,
      custody_log_id: custodyLog.id,
      record_hash: recordHash
    });

  } catch (error) {
    console.error('Chain of custody event error:', error);
    return Response.json({ 
      error: 'Failed to add custody event', 
      details: error.message 
    }, { status: 500 });
  }
});