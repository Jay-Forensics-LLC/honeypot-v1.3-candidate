import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Add Chain of Custody Entry - BACKEND ONLY
 * Fixes Issue #021: Chain-of-custody is append-only
 * 
 * Adds new entry to evidence chain_of_custody array
 * Creates audit log entry
 * Updates chain_root Merkle hash
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { evidence_id, action, notes } = await req.json();

    if (!evidence_id || !action) {
      return Response.json({ 
        error: 'Missing required fields: evidence_id, action' 
      }, { status: 400 });
    }

    // Validate action
    const validActions = [
      'accessed',
      'downloaded',
      'analyzed',
      'verified',
      'transferred',
      'archived',
      'legal_hold_applied',
      'legal_hold_removed'
    ];

    if (!validActions.includes(action)) {
      return Response.json({ 
        error: `Invalid action. Must be one of: ${validActions.join(', ')}` 
      }, { status: 400 });
    }

    // Get evidence record
    const evidence = await base44.asServiceRole.entities.EvidenceV2.get(evidence_id);
    
    if (!evidence) {
      return Response.json({ error: 'Evidence not found' }, { status: 404 });
    }

    // Verify user has access to the case
    const caseRecord = await base44.entities.Case.get(evidence.case_id);
    
    if (!caseRecord) {
      return Response.json({ error: 'Associated case not found' }, { status: 404 });
    }

    // Issue #044, #045: Verify case access
    const hasAccess = 
      caseRecord.created_by === user.email ||
      caseRecord.assigned_investigator === user.email ||
      caseRecord.team_members?.includes(user.email) ||
      user.role === 'admin';

    if (!hasAccess) {
      return Response.json({ 
        error: 'You do not have access to this evidence' 
      }, { status: 403 });
    }

    // Create audit log entry
    const auditLogResponse = await base44.functions.invoke('createAuditLog', {
      event_type: `evidence_${action}`,
      severity: 'info',
      description: `Evidence ${action}: ${evidence.title}`,
      resource_type: 'Evidence',
      resource_id: evidence_id,
      case_id: evidence.case_id,
      evidence_id: evidence_id,
      action_performed: action,
      metadata: {
        performed_by: user.email,
        notes: notes || ''
      }
    });

    const audit_log_id = auditLogResponse.id;

    // Issue #021: Create new chain-of-custody entry
    const newEntry = {
      timestamp: new Date().toISOString(),
      action: action,
      performed_by: user.email,
      integrity_hash: evidence.file_hash_sha256,
      audit_log_id: audit_log_id,
      location: evidence.archive_location || 'secure_storage',
      notes: notes || ''
    };

    // Append to existing chain
    const updatedChain = [
      ...(evidence.chain_of_custody || []),
      newEntry
    ];

    // Calculate new Merkle root
    const chain_root = await calculateMerkleRoot(updatedChain);

    // Update evidence using service role
    await base44.asServiceRole.entities.EvidenceV2.update(evidence_id, {
      chain_of_custody: updatedChain,
      chain_root: chain_root
    });

    return Response.json({ 
      success: true,
      chain_entry: newEntry,
      chain_length: updatedChain.length,
      message: 'Chain of custody entry added successfully'
    });

  } catch (error) {
    console.error('Chain of custody update failed:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});

/**
 * Calculate Merkle root hash for chain integrity
 */
async function calculateMerkleRoot(chain) {
  if (!chain || chain.length === 0) {
    return '';
  }

  // Simple hash of all entries
  const chainString = JSON.stringify(chain);
  const encoder = new TextEncoder();
  const data = encoder.encode(chainString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}