import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { crypto } from 'https://deno.land/std@0.224.0/crypto/mod.ts';
import { createErrorResponse, ErrorCodes, AppError } from './errorHandler.js';
import { validateRequest } from './validateInput.js';

/**
 * Verify Evidence Integrity - BACKEND ONLY
 * Hash verification is backend-controlled for security
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const validated = validateRequest(body, {
      evidence_id: { required: true, validator: 'uuid' }
    });
    const { evidence_id } = validated;

    const evidence = await base44.asServiceRole.entities.EvidenceV2.get(evidence_id);
    if (!evidence) {
      throw new AppError('Evidence not found', ErrorCodes.NOT_FOUND.code, 404);
    }

    const caseRecord = await base44.entities.Case.get(evidence.case_id);
    if (!caseRecord) {
      throw new AppError('Associated case not found', ErrorCodes.NOT_FOUND.code, 404);
    }

    const hasAccess = 
      caseRecord.created_by === user.email ||
      caseRecord.assigned_investigator === user.email ||
      caseRecord.team_members?.includes(user.email) ||
      user.role === 'admin';

    if (!hasAccess) {
      throw new AppError('Access denied to this evidence', ErrorCodes.FORBIDDEN.code, 403);
    }

    // Issue #018: Download file from secure storage
    const signedUrlResponse = await base44.integrations.Core.CreateFileSignedUrl({
      file_uri: evidence.file_url,
      expires_in: 300
    });

    const signed_url = signedUrlResponse.signed_url;

    // Download file
    const fileResponse = await fetch(signed_url);
    const fileBytes = new Uint8Array(await fileResponse.arrayBuffer());

    // Issue #023: Calculate current hash
    const hashBuffer = await crypto.subtle.digest('SHA-256', fileBytes);
    const currentHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Compare with stored hash
    const integrity_verified = currentHash === evidence.file_hash_sha256;

    // Update evidence using service role
    await base44.asServiceRole.entities.EvidenceV2.update(evidence_id, {
      is_verified: integrity_verified,
      verification_timestamp: new Date().toISOString(),
      verified_by: user.email
    });

    // Add chain-of-custody entry
    await base44.functions.invoke('addChainOfCustodyEntry', {
      evidence_id: evidence_id,
      action: 'verified',
      notes: integrity_verified 
        ? `Integrity verified by ${user.full_name}` 
        : `INTEGRITY MISMATCH detected by ${user.full_name}`
    });

    // Create audit log
    await base44.functions.invoke('createAuditLog', {
      event_type: integrity_verified ? 'evidence_verified' : 'evidence_integrity_failed',
      severity: integrity_verified ? 'info' : 'critical',
      description: integrity_verified 
        ? 'Evidence integrity verified' 
        : 'EVIDENCE INTEGRITY VERIFICATION FAILED',
      resource_type: 'Evidence',
      resource_id: evidence_id,
      case_id: evidence.case_id,
      evidence_id: evidence_id,
      action_performed: 'verify_integrity',
      fields_changed: ['is_verified', 'verification_timestamp', 'verified_by'],
      metadata: {
        verified_by: user.email,
        stored_hash: evidence.file_hash_sha256,
        current_hash: currentHash,
        match: integrity_verified
      }
    });

    // Issue #023: Create critical alert if integrity failed
    if (!integrity_verified) {
      await base44.asServiceRole.entities.Alert.create({
        alert_type: 'system_compromise',
        severity: 'critical',
        title: 'Evidence Integrity Verification Failed',
        description: `Evidence "${evidence.title}" failed integrity check. Possible tampering detected.`,
        source: 'integrity_verifier',
        status: 'new',
        threat_score: 100,
        created_by: 'system',
        metadata: {
          evidence_id: evidence_id,
          case_id: evidence.case_id,
          stored_hash: evidence.file_hash_sha256,
          current_hash: currentHash
        }
      });
    }

    return Response.json({ 
      success: true,
      integrity_verified: integrity_verified,
      stored_hash: evidence.file_hash_sha256,
      current_hash: currentHash,
      message: integrity_verified 
        ? 'Evidence integrity verified successfully' 
        : 'INTEGRITY VERIFICATION FAILED - Evidence may be compromised'
    });

  } catch (error) {
    console.error('Evidence verification failed:', error);
    return createErrorResponse(error);
  }
});