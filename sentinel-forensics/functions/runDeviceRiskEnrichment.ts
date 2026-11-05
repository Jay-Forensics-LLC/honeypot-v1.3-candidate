import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * RUN DEVICE RISK ENRICHMENT
 * Enriches device fingerprints and stores via EnrichmentRun/Result framework
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
      timeRange = null,
      courtAdmissibleMode = false
    } = await req.json();

    if (!caseId) {
      return Response.json({ error: 'caseId required' }, { status: 400 });
    }

    // Create enrichment run
    const { data: runData } = await base44.functions.invoke('createEnrichmentRun', {
      caseId,
      runType: 'batch_enrichment',
      provider: 'internal',
      inputIndicatorIds: [],
      parametersJson: { timeRange },
      courtAdmissibleMode,
      promptVersion: '1.0.0'
    });

    const run = runData.run;

    // Derive fingerprints
    const { data: fpData } = await base44.functions.invoke('deriveDeviceFingerprintFromEvents', {
      caseId,
      timeRange
    });

    const fingerprints = fpData.fingerprints;

    // Store each fingerprint as an enrichment result
    const results = [];
    for (const fp of fingerprints) {
      // Create a synthetic indicator for this device fingerprint
      const indicator = await base44.asServiceRole.entities.Indicator.create({
        organization_id: user.organization_id,
        case_id: caseId,
        schema_version: '1.0.0',
        indicator_type: 'custom',
        value: `device_${fp.fingerprint_id.substring(0, 16)}`,
        labels: ['device_fingerprint'],
        derived_from: fp.traceability
      });

      // Store enrichment result
      const { data: resultData } = await base44.functions.invoke('storeEnrichmentResult', {
        runId: run.id,
        indicatorId: indicator.id,
        normalizedJson: {
          fingerprintId: fp.fingerprint_id,
          userAgent: fp.user_agent,
          signals: fp.derived_signals,
          riskScore: fp.risk_score,
          tags: fp.tags
        },
        riskScore: fp.risk_score,
        confidence: fp.confidence,
        tags: fp.tags,
        summary: `Device fingerprint: ${fp.tags.join(', ') || 'Normal'}`,
        traceability: fp.traceability
      });

      results.push(resultData.result);
    }

    return Response.json({
      run,
      fingerprints,
      results,
      stats: fpData.stats
    });

  } catch (error) {
    console.error('runDeviceRiskEnrichment error:', error);
    return Response.json({ 
      error: 'Device risk enrichment failed', 
      details: error.message 
    }, { status: 500 });
  }
});