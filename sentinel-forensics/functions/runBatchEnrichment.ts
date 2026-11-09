import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * RUN BATCH ENRICHMENT
 * Processes CSV files for bulk indicator enrichment
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId, strictness = 1, courtAdmissibleMode = false } = await req.json();

    if (!jobId) {
      return Response.json({ error: 'jobId required' }, { status: 400 });
    }

    // Fetch job
    const jobs = await base44.asServiceRole.entities.BatchEnrichmentJob.filter({ id: jobId });
    if (jobs.length === 0) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    const job = jobs[0];

    // Update status to running
    await base44.asServiceRole.entities.BatchEnrichmentJob.update(job.id, {
      status: 'running'
    });

    try {
      // Fetch input CSV
      const response = await fetch(job.input_file_ref);
      const csvText = await response.text();
      const lines = csvText.split('\n').filter(line => line.trim());

      const indicators = [];
      const errors = [];

      // Parse CSV and create indicators
      for (const line of lines) {
        const value = line.trim().toLowerCase();
        if (!value) continue;

        try {
          const indicatorType = job.job_type === 'ip_batch' ? 'ip' : 'email';
          
          // Check if indicator already exists
          const existing = await base44.asServiceRole.entities.Indicator.filter({
            case_id: job.case_id,
            indicator_type: indicatorType,
            value: value
          });

          let indicator;
          if (existing.length > 0) {
            indicator = existing[0];
          } else {
            indicator = await base44.asServiceRole.entities.Indicator.create({
              organization_id: job.organization_id,
              case_id: job.case_id,
              schema_version: '1.0.0',
              indicator_type: indicatorType,
              value: value,
              labels: ['batch_import'],
              derived_from: {
                source_artifact_ids: [],
                source_event_ids: []
              }
            });
          }

          indicators.push(indicator);
        } catch (error) {
          errors.push({ value, error: error.message });
        }
      }

      // Run enrichment
      let enrichmentResults;
      if (job.job_type === 'ip_batch') {
        const { data } = await base44.functions.invoke('runIpEnrichment', {
          caseId: job.case_id,
          inputIndicatorIds: indicators.map(i => i.id),
          parametersJson: { strictness },
          courtAdmissibleMode
        });
        enrichmentResults = data.results;
      } else if (job.job_type === 'email_batch') {
        const { data } = await base44.functions.invoke('runEmailEnrichment', {
          caseId: job.case_id,
          inputIndicatorIds: indicators.map(i => i.id),
          parametersJson: { strictness },
          courtAdmissibleMode
        });
        enrichmentResults = data.results;
      }

      // Build output CSV
      const outputHeaders = ['indicator', 'risk_score', 'confidence', 'tags', 'summary'];
      const outputRows = enrichmentResults.map(result => [
        indicators.find(i => i.id === result.indicator_id)?.value || '',
        result.risk_score,
        Math.round(result.confidence * 100),
        result.tags.join(';'),
        result.summary
      ]);

      const outputCsv = [outputHeaders.join(','), ...outputRows.map(r => r.join(','))].join('\n');
      const outputBlob = new Blob([outputCsv], { type: 'text/csv' });
      
      // Upload output file
      const { file_url: outputFileUrl } = await base44.asServiceRole.integrations.Core.UploadFile({
        file: outputBlob
      });

      // Update job
      await base44.asServiceRole.entities.BatchEnrichmentJob.update(job.id, {
        status: 'success',
        output_file_ref: outputFileUrl,
        counts: {
          total: lines.length,
          success: enrichmentResults.length,
          failed: errors.length
        },
        error_sample: errors.length > 0 ? JSON.stringify(errors.slice(0, 5)) : undefined
      });

      return Response.json({
        job,
        processed: enrichmentResults.length,
        errors: errors.length
      });

    } catch (error) {
      await base44.asServiceRole.entities.BatchEnrichmentJob.update(job.id, {
        status: 'failed',
        error_sample: error.message
      });
      throw error;
    }

  } catch (error) {
    console.error('runBatchEnrichment error:', error);
    return Response.json({ 
      error: 'Batch enrichment failed', 
      details: error.message 
    }, { status: 500 });
  }
});