import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * EVIDENCE MUTATION GUARD
 * Ensures all evidence mutations create chain-of-custody records
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { evidence_id, mutation_type, updates } = await req.json();

    if (!evidence_id || !mutation_type) {
      return Response.json({ 
        error: 'evidence_id and mutation_type required' 
      }, { status: 400 });
    }

    // Fetch current evidence
    const evidence = await base44.entities.EvidenceV2.filter({
      id: evidence_id,
      organization_id: user.organization_id
    });

    if (!evidence || evidence.length === 0) {
      return Response.json({ error: 'Evidence not found' }, { status: 404 });
    }

    const currentEvidence = evidence[0];

    // Get latest chain record
    const latestChain = await base44.entities.ChainOfCustodyLog.filter({
      evidence_id: evidence_id,
      organization_id: user.organization_id
    }, '-created_date', 1);

    const previousHash = latestChain.length > 0 ? latestChain[0].record_hash : null;

    // Calculate new evidence hash (if file changed)
    let newHash = currentEvidence.file_hash;
    if (updates?.file_url) {
      // File changed, calculate new hash
      newHash = await calculateFileHash(updates.file_url);
    }

    // Create chain-of-custody record
    const timestamp = new Date().toISOString();
    const recordData = {
      evidence_id,
      action: mutation_type,
      actor_email: user.email,
      timestamp,
      evidence_hash: newHash,
      previous_hash: previousHash,
      organization_id: user.organization_id
    };

    // Calculate record hash
    const recordHash = await calculateRecordHash(recordData);
    recordData.record_hash = recordHash;

    // Store chain record
    const chainRecord = await base44.asServiceRole.entities.ChainOfCustodyLog.create(recordData);

    // Perform the mutation
    const updatedEvidence = await base44.asServiceRole.entities.EvidenceV2.update(
      evidence_id,
      {
        ...updates,
        file_hash: newHash,
        last_verified: timestamp
      }
    );

    // Create tamper-evident audit log
    await fetch(new URL('/tamperEvidentAudit', req.url).toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.get('Authorization')
      },
      body: JSON.stringify({
        action: `evidence_${mutation_type}`,
        resource_type: 'evidence',
        resource_id: evidence_id,
        details: {
          mutation_type,
          previous_hash: previousHash,
          new_hash: recordHash,
          chain_record_id: chainRecord.id
        }
      })
    });

    return Response.json({
      success: true,
      evidence: updatedEvidence,
      chain_record_id: chainRecord.id,
      record_hash: recordHash
    });

  } catch (error) {
    console.error('Evidence mutation guard error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/**
 * Calculate file hash from URL
 */
async function calculateFileHash(fileUrl) {
  try {
    const response = await fetch(fileUrl);
    const arrayBuffer = await response.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.error('Hash calculation error:', error);
    return null;
  }
}

/**
 * Calculate record hash
 */
async function calculateRecordHash(recordData) {
  const dataString = JSON.stringify({
    evidence_id: recordData.evidence_id,
    action: recordData.action,
    actor_email: recordData.actor_email,
    timestamp: recordData.timestamp,
    evidence_hash: recordData.evidence_hash,
    previous_hash: recordData.previous_hash
  });

  const encoder = new TextEncoder();
  const data = encoder.encode(dataString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}