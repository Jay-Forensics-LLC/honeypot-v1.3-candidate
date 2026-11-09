/**
 * PHASE 6: Forensic Image Upload (E01, DD)
 * Resumable upload with server-side hashing
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { requireAuth, requireOrg, requirePermission, safeJson, sanitizeError } from './helpers/security.js';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await requireAuth(base44);
    const orgId = requireOrg(user);
    
    await requirePermission(base44, user, 'evidence.upload');
    
    const { action, case_id, filename, evidence_type, size_bytes, upload_session_id, file_url } = await safeJson(req);
    
    if (!action) {
      return Response.json({ error: 'action is required' }, { status: 400 });
    }
    
    // INIT
    if (action === 'init') {
      if (!filename || !evidence_type || !size_bytes) {
        return Response.json({ 
          error: 'filename, evidence_type, and size_bytes required' 
        }, { status: 400 });
      }
      
      // Validate evidence type
      const validTypes = ['forensic_image_e01', 'forensic_image_dd'];
      if (!validTypes.includes(evidence_type)) {
        return Response.json({ 
          error: 'Invalid evidence_type. Must be forensic_image_e01 or forensic_image_dd' 
        }, { status: 400 });
      }
      
      // Size limit check (e.g., 50GB)
      const maxSize = 50 * 1024 * 1024 * 1024;
      if (size_bytes > maxSize) {
        return Response.json({ 
          error: 'File too large. Maximum 50GB.' 
        }, { status: 400 });
      }
      
      // Create upload session (placeholder - actual resumable impl would use multipart)
      const sessionId = crypto.randomUUID();
      
      // Audit
      await base44.asServiceRole.entities.SecurityAuditLog.create({
        organization_id: orgId,
        event_type: 'forensic_image.upload.initiated',
        severity: 'info',
        description: `Forensic image upload started: ${filename}`,
        actor_email: user.email,
        timestamp_utc: new Date().toISOString(),
        metadata: {
          case_id,
          filename,
          evidence_type,
          size_bytes,
          session_id: sessionId
        }
      });
      
      return Response.json({
        upload_session_id: sessionId,
        message: 'Upload session created'
      });
    }
    
    // COMPLETE
    if (action === 'complete') {
      if (!upload_session_id || !file_url) {
        return Response.json({ 
          error: 'upload_session_id and file_url required' 
        }, { status: 400 });
      }
      
      // Fetch file and compute hashes (in production, stream from storage)
      const fileResponse = await fetch(file_url);
      if (!fileResponse.ok) {
        return Response.json({ error: 'Failed to fetch uploaded file' }, { status: 500 });
      }
      
      const fileBytes = await fileResponse.arrayBuffer();
      
      // Compute SHA-256
      const hashBuffer = await crypto.subtle.digest('SHA-256', fileBytes);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      // Create evidence record
      const evidence = await base44.asServiceRole.entities.EvidenceV2.create({
        organization_id: orgId,
        case_id: case_id || null,
        artifact_type: evidence_type || 'forensic_image',
        artifact_name: filename || 'forensic_image',
        file_url,
        file_size: fileBytes.byteLength,
        sha256_hash: sha256,
        metadata: {
          upload_session_id,
          status: 'uploaded',
          acquisition_metadata: {}
        }
      });
      
      // Queue metadata extraction job
      await base44.asServiceRole.entities.EvidenceAnalysisJob.create({
        organization_id: orgId,
        evidence_id: evidence.id,
        job_type: 'metadata_extract',
        status: 'queued',
        created_by: user.email
      });
      
      // Audit
      await base44.asServiceRole.entities.SecurityAuditLog.create({
        organization_id: orgId,
        event_type: 'forensic_image.upload.completed',
        severity: 'info',
        description: `Forensic image upload completed: ${filename}`,
        actor_email: user.email,
        timestamp_utc: new Date().toISOString(),
        metadata: {
          evidence_id: evidence.id,
          sha256,
          size_bytes: fileBytes.byteLength
        }
      });
      
      return Response.json({
        evidence_id: evidence.id,
        sha256,
        message: 'Upload completed and queued for analysis'
      });
    }
    
    return Response.json({ error: 'Invalid action' }, { status: 400 });
    
  } catch (error) {
    if (error instanceof Response) return error;
    
    console.error('[FORENSIC-IMAGE] Error:', error);
    return Response.json(sanitizeError(error), { status: 500 });
  }
});