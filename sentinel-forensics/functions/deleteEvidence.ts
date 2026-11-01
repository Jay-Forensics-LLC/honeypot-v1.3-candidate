import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { enforceRBAC } from './enforceRBAC.js';
import { createErrorResponse, ErrorCodes, AppError } from './errorHandler.js';
import { validateRequest } from './validateInput.js';

/**
 * Delete Evidence - ADMIN ONLY with Legal Hold Check
 * Evidence can only be deleted if:
 * - User is admin
 * - Evidence is not under legal hold
 * - Deletion is logged in audit trail
 */
Deno.serve(async (req) => {
  try {
    const { user: admin, base44 } = await enforceRBAC(req, ['admin']);

    const body = await req.json();
    const validated = validateRequest(body, {
      evidence_id: { required: true, validator: 'uuid' }
    });
    const { evidence_id, reason } = { ...validated, reason: body.reason };

    const evidence = await base44.asServiceRole.entities.EvidenceV2.get(evidence_id);
    if (!evidence) {
      throw new AppError('Evidence not found', ErrorCodes.NOT_FOUND.code, 404);
    }

    if (evidence.organization_id !== admin.organization_id) {
      throw new AppError('Cannot delete evidence from different organization', ErrorCodes.FORBIDDEN.code, 403);
    }

    if (evidence.legal_hold) {
      throw new AppError(
        'Cannot delete evidence under legal hold', 
        ErrorCodes.LEGAL_HOLD.code, 
        403,
        { legal_hold_metadata: evidence.legal_hold_metadata }
      );
    }

    // Create audit log BEFORE deletion
    await base44.functions.invoke('createAuditLog', {
      event_type: 'evidence_deleted',
      severity: 'critical',
      description: `Evidence deleted: ${evidence.title}`,
      resource_type: 'Evidence',
      resource_id: evidence_id,
      case_id: evidence.case_id,
      evidence_id: evidence_id,
      action_performed: 'delete',
      metadata: {
        deleted_by: admin.email,
        reason: reason || 'No reason provided',
        evidence_title: evidence.title,
        file_hash: evidence.file_hash_sha256,
        chain_of_custody_length: evidence.chain_of_custody?.length || 0
      }
    });

    // Delete file from storage (optional - may want to archive instead)
    // await base44.integrations.Core.DeletePrivateFile({
    //   file_uri: evidence.file_url
    // });

    // Delete evidence record using service role
    await base44.asServiceRole.entities.EvidenceV2.delete(evidence_id);

    // Update case evidence count
    const caseRecord = await base44.asServiceRole.entities.Case.get(evidence.case_id);
    if (caseRecord) {
      await base44.asServiceRole.entities.Case.update(evidence.case_id, {
        evidence_count: Math.max(0, (caseRecord.evidence_count || 1) - 1)
      });
    }

    return Response.json({ 
      success: true,
      message: 'Evidence deleted successfully'
    });

  } catch (error) {
    console.error('Evidence deletion failed:', error);
    return createErrorResponse(error);
  }
});