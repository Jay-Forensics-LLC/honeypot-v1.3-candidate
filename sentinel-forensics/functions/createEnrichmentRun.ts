import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { crypto } from 'https://deno.land/std@0.224.0/crypto/mod.ts';

/**
 * CREATE ENRICHMENT RUN
 * Initiates an enrichment operation with fingerprinting
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { 
      caseId, 
      runType, 
      provider, 
      inputIndicatorIds, 
      parametersJson = {},
      courtAdmissibleMode = false,
      promptVersion
    } = await req.json();

    // Validation
    if (!caseId || !runType || !provider || !inputIndicatorIds || inputIndicatorIds.length === 0) {
      return Response.json({ 
        error: 'caseId, runType, provider, and inputIndicatorIds required' 
      }, { status: 400 });
    }

    // Verify case access
    const caseData = await base44.asServiceRole.entities.Case.filter({ 
      id: caseId,
      organization_id: user.organization_id 
    });

    if (caseData.length === 0) {
      return Response.json({ error: 'Case not found or access denied' }, { status: 404 });
    }

    // Compute run fingerprint
    const fingerprintData = JSON.stringify({
      inputIndicatorIds: inputIndicatorIds.sort(),
      parametersJson,
      provider,
      runType
    });
    
    const encoder = new TextEncoder();
    const data = encoder.encode(fingerprintData);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const runFingerprint = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Create enrichment run
    const run = await base44.asServiceRole.entities.EnrichmentRun.create({
      organization_id: user.organization_id,
      case_id: caseId,
      schema_version: '1.0.0',
      prompt_version: promptVersion || undefined,
      run_type: runType,
      status: 'queued',
      provider,
      started_at: new Date().toISOString(),
      parameters_json: parametersJson,
      input_indicator_ids: inputIndicatorIds,
      court_admissible_mode: courtAdmissibleMode,
      run_fingerprint: runFingerprint
    });

    // Log audit trail
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      action: 'enrichment_run_created',
      entity_type: 'EnrichmentRun',
      entity_id: run.id,
      user_email: user.email,
      metadata: {
        case_id: caseId,
        run_type: runType,
        provider,
        indicator_count: inputIndicatorIds.length,
        court_admissible_mode: courtAdmissibleMode
      }
    });

    return Response.json({ 
      run,
      message: 'Enrichment run created. Call provider-specific enrichment function next.'
    });

  } catch (error) {
    console.error('createEnrichmentRun error:', error);
    return Response.json({ 
      error: 'Run creation failed', 
      details: error.message 
    }, { status: 500 });
  }
});