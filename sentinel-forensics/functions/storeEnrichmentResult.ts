import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { crypto } from 'https://deno.land/std@0.224.0/crypto/mod.ts';

/**
 * STORE ENRICHMENT RESULT
 * Persists enrichment result with integrity verification
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { 
      runId,
      indicatorId,
      normalizedJson,
      riskScore,
      confidence,
      tags = [],
      summary,
      traceability,
      rawJsonRef,
      rawJson
    } = await req.json();

    // Validation
    if (!runId || !indicatorId || !normalizedJson || confidence === undefined) {
      return Response.json({ 
        error: 'runId, indicatorId, normalizedJson, and confidence required' 
      }, { status: 400 });
    }

    if (confidence < 0 || confidence > 1) {
      return Response.json({ error: 'confidence must be 0-1' }, { status: 400 });
    }

    // Fetch run to get case_id and provider
    const runs = await base44.asServiceRole.entities.EnrichmentRun.filter({ id: runId });
    if (runs.length === 0) {
      return Response.json({ error: 'Enrichment run not found' }, { status: 404 });
    }
    const run = runs[0];

    // Verify indicator exists
    const indicators = await base44.asServiceRole.entities.Indicator.filter({ id: indicatorId });
    if (indicators.length === 0) {
      return Response.json({ error: 'Indicator not found' }, { status: 404 });
    }
    const indicator = indicators[0];

    // Copy traceability from indicator if not provided
    const finalTraceability = traceability || indicator.derived_from || {
      source_artifact_ids: [],
      source_event_ids: []
    };

    // Compute raw JSON hash if raw data provided
    let rawJsonSha256 = null;
    if (rawJson || rawJsonRef) {
      const rawData = rawJson ? JSON.stringify(rawJson) : '';
      const encoder = new TextEncoder();
      const data = encoder.encode(rawData);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      rawJsonSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Create result
    const result = await base44.asServiceRole.entities.EnrichmentResult.create({
      organization_id: user.organization_id,
      case_id: run.case_id,
      schema_version: '1.0.0',
      prompt_version: run.prompt_version || undefined,
      enrichment_run_id: runId,
      indicator_id: indicatorId,
      provider: run.provider,
      expires_at: run.court_admissible_mode ? undefined : getExpiryDate(),
      raw_json_ref: rawJsonRef || undefined,
      raw_json_sha256: rawJsonSha256 || undefined,
      normalized_json: normalizedJson,
      risk_score: riskScore !== undefined ? riskScore : null,
      confidence,
      tags: [...new Set(tags)],
      summary: summary || '',
      traceability: finalTraceability
    });

    // Update run status if all indicators processed
    // (This is simplified - real implementation would check completion)
    await base44.asServiceRole.entities.EnrichmentRun.update(runId, {
      status: 'success',
      finished_at: new Date().toISOString()
    });

    // Log audit trail
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      action: 'enrichment_result_stored',
      entity_type: 'EnrichmentResult',
      entity_id: result.id,
      user_email: user.email,
      metadata: {
        case_id: run.case_id,
        run_id: runId,
        indicator_id: indicatorId,
        risk_score: riskScore,
        confidence,
        provider: run.provider
      }
    });

    return Response.json({ result });

  } catch (error) {
    console.error('storeEnrichmentResult error:', error);
    return Response.json({ 
      error: 'Result storage failed', 
      details: error.message 
    }, { status: 500 });
  }
});

function getExpiryDate() {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 30); // 30 days TTL
  return expiry.toISOString();
}