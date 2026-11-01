import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { withRateLimit, applySecurityHeaders } from './securityMiddleware.js';

// Security: DoS protection
const MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024; // 100MB

/**
 * Sanitize filename: remove path separators, control chars, prevent traversal
 */
function sanitizeFilename(filename: string): { safe: string; suspicious: boolean } {
  const original = filename;
  
  // Remove path traversal attempts
  let safe = filename.replace(/\.\.\//g, '').replace(/\.\.\\/g, '');
  
  // Remove path separators
  safe = safe.replace(/[\/\\]/g, '_');
  
  // Remove control characters and dangerous chars
  safe = safe.replace(/[\x00-\x1F\x7F<>:"|?*]/g, '');
  
  // Limit length
  if (safe.length > 255) {
    safe = safe.substring(0, 255);
  }
  
  // If empty after sanitization, use fallback
  if (!safe || safe.trim() === '') {
    safe = `evidence_${Date.now()}`;
  }
  
  const suspicious = safe !== original;
  return { safe, suspicious };
}

/**
 * SECURE EVIDENCE UPLOAD
 * Rate-limited, CSP-protected evidence upload endpoint
 */

Deno.serve(async (req) => {
  try {
    return await withRateLimit(req, async (base44, user) => {
      // DoS protection: check Content-Length if present
      const contentLength = req.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > MAX_UPLOAD_SIZE_BYTES) {
        // Audit: upload rejected for size
        await base44.entities.AuditLog.create({
          organization_id: user.organization_id,
          user_email: user.email,
          action: 'evidence_upload_rejected',
          resource_type: 'evidence',
          severity: 'warning',
          details: {
            reason: 'file_too_large',
            content_length: parseInt(contentLength, 10),
            max_allowed: MAX_UPLOAD_SIZE_BYTES
          }
        });
        
        return Response.json({ error: 'File too large' }, { status: 413 });
      }

      const formData = await req.formData();
      const file = formData.get('file');
      const caseId = formData.get('case_id');
      const description = formData.get('description');
      
      if (!file) {
        return Response.json({ error: 'No file provided' }, { status: 400 });
      }

      // DoS protection: enforce hard cap on file size
      if (file.size > MAX_UPLOAD_SIZE_BYTES) {
        // Audit: upload rejected for size
        await base44.entities.AuditLog.create({
          organization_id: user.organization_id,
          user_email: user.email,
          action: 'evidence_upload_rejected',
          resource_type: 'evidence',
          severity: 'warning',
          details: {
            reason: 'file_too_large',
            file_size: file.size,
            max_allowed: MAX_UPLOAD_SIZE_BYTES,
            file_name: file.name
          }
        });
        
        return Response.json({ error: 'File too large' }, { status: 413 });
      }

      // Sanitize filename
      const { safe: sanitizedFilename, suspicious: filenameSuspicious } = sanitizeFilename(file.name);
      
      // Audit: suspicious filename detected
      if (filenameSuspicious) {
        await base44.entities.AuditLog.create({
          organization_id: user.organization_id,
          user_email: user.email,
          action: 'suspicious_filename_detected',
          resource_type: 'evidence',
          severity: 'warning',
          details: {
            original_filename: file.name,
            sanitized_filename: sanitizedFilename,
            case_id: caseId
          }
        });
      }
      
      // Upload file to Base44 storage
      const uploadResult = await base44.integrations.Core.UploadFile({ file });
      
      if (!uploadResult.file_url) {
        return Response.json({ error: 'File upload failed' }, { status: 500 });
      }
      
      // Calculate file hash for integrity
      const arrayBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      // Create evidence record
      const evidence = await base44.entities.EvidenceV2.create({
        organization_id: user.organization_id,
        case_id: caseId,
        file_name: sanitizedFilename,
        file_url: uploadResult.file_url,
        file_hash: hashHex,
        file_size: file.size,
        description: description || '',
        evidence_type: 'file',
        integrity_verified: true
      });
      
      // Log to audit trail
      await base44.entities.AuditLog.create({
        organization_id: user.organization_id,
        user_email: user.email,
        action: 'evidence_uploaded',
        resource_type: 'evidence',
        resource_id: evidence.id,
        severity: 'info',
        details: {
          file_name: sanitizedFilename,
          original_file_name: file.name,
          file_size: file.size,
          case_id: caseId
        }
      });
      
      const response = Response.json({ 
        success: true, 
        evidence 
      });
      
      return applySecurityHeaders(response);
      
    }, { limit: 50, windowMs: 60000 }); // 50 uploads per minute
    
  } catch (error) {
    console.error('Evidence upload error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});