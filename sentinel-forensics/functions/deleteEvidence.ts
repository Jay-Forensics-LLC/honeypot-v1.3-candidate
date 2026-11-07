import { enforceRBAC } from './enforceRBAC.js';
import { validateRequest } from './validateInput.ts';

/**
 * Permanent evidence deletion is disabled until a preservation workflow exists.
 * Retain the access and legal-hold checks; never remove evidence or custody data
 * or record a completed deletion for a rejected request.
 */
function reject(status, code, error) {
  return Response.json({ success: false, code, error }, { status });
}

Deno.serve(async (req) => {
  let context;
  try {
    context = await enforceRBAC(req, ['admin']);
  } catch {
    return reject(403, 'FORBIDDEN', 'Authenticated administrator access required');
  }

  const { user: admin, base44 } = context;
  if (typeof admin.organization_id !== 'string' || !admin.organization_id.trim()) {
    return reject(403, 'FORBIDDEN', 'Organization context required');
  }

  let evidence_id;
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        typeof body.evidence_id !== 'string') {
      return reject(400, 'INVALID_INPUT', 'A valid evidence_id is required');
    }
    ({ evidence_id } = validateRequest(body, {
      evidence_id: { required: true, validator: 'uuid' }
    }));
  } catch {
    return reject(400, 'INVALID_INPUT', 'A valid evidence_id is required');
  }

  try {
    const evidence = await base44.asServiceRole.entities.EvidenceV2.get(evidence_id);
    if (!evidence) {
      return reject(404, 'NOT_FOUND', 'Evidence not found');
    }

    if (evidence.organization_id !== admin.organization_id) {
      return reject(403, 'FORBIDDEN', 'Cannot delete evidence from different organization');
    }

    if (evidence.legal_hold) {
      return reject(403, 'LEGAL_HOLD', 'Cannot delete evidence under legal hold');
    }

    return reject(
      403,
      'EVIDENCE_DELETION_DISABLED',
      'Permanent evidence deletion is disabled to preserve evidence and custody history'
    );
  } catch {
    console.error('Evidence deletion request could not be checked');
    return reject(500, 'INTERNAL_ERROR', 'Evidence deletion request could not be checked');
  }
});
