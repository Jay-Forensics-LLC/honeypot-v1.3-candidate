/**
 * PHASE 6: Evidence Analysis - Start Job
 * Queues async analysis jobs for evidence
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { requireAuth, requireOrg, requirePermission, safeJson, sanitizeError } from './helpers/security.js';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await requireAuth(base44);
    const orgId = requireOrg(user);
    
    // Permission check
    await requirePermission(base44, user, 'evidence.analyze');
    
    const { evidence_id, job_types } = await safeJson(req);
    
    if (!evidence_id || !Array.isArray(job_types) || job_types.length === 0) {
      return Response.json({ 
        error: 'evidence_id and job_types[] are required' 
      }, { status: 400 });
    }
    
    // Verify evidence exists and is in org
    const evidence = await base44.asServiceRole.entities.EvidenceV2.filter({
      organization_id: orgId,
      id: evidence_id
    });
    
    if (evidence.length === 0) {
      return Response.json({ error: 'Evidence not found' }, { status: 404 });
    }
    
    // Validate job types
    const validTypes = ['metadata_extract', 'anomaly_detect', 'summarize', 'ioc_correlate', 'image_ingest'];
    for (const jt of job_types) {
      if (!validTypes.includes(jt)) {
        return Response.json({ 
          error: `Invalid job_type: ${jt}` 
        }, { status: 400 });
      }
    }
    
    // Create jobs
    const jobs = [];
    const now = new Date().toISOString();
    
    for (const jobType of job_types) {
      const job = await base44.asServiceRole.entities.EvidenceAnalysisJob.create({
        organization_id: orgId,
        evidence_id,
        job_type: jobType,
        status: 'queued',
        created_by: user.email
      });
      jobs.push(job);
    }
    
    // Audit
    await base44.asServiceRole.entities.SecurityAuditLog.create({
      organization_id: orgId,
      event_type: 'evidence.analysis.started',
      severity: 'info',
      description: `Evidence analysis jobs queued for ${evidence_id}`,
      actor_email: user.email,
      timestamp_utc: now,
      metadata: {
        evidence_id,
        job_types,
        job_ids: jobs.map(j => j.id)
      }
    });
    
    return Response.json({
      message: 'Analysis jobs queued',
      job_ids: jobs.map(j => j.id)
    });
    
  } catch (error) {
    if (error instanceof Response) return error;
    
    console.error('[EVIDENCE-ANALYZE] Error:', error);
    return Response.json(sanitizeError(error), { status: 500 });
  }
});