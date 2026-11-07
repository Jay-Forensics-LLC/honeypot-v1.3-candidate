import { errorJson } from './helpers/http.ts';
import { getRequestId, logError, addRequestIdHeader } from './helpers/telemetry.ts';
import { handlePreflight, applyCorsHeaders } from './helpers/cors.ts';
import { requireUser, requireOrgContext, requirePermission } from './helpers/auth.ts';

/**
 * Risky file extensions requiring explicit user acknowledgement
 * Executable, script, and web content that could auto-execute malware
 */
const RISKY_EXTENSIONS = [
    '.html', '.htm', '.js', '.vbs', '.vbe', '.ps1', '.psm1', 
    '.hta', '.exe', '.dll', '.scr', '.jar', '.bat', '.cmd',
    '.com', '.msi', '.app', '.deb', '.rpm', '.apk'
];

/**
 * Check if filename has a risky extension
 */
function isRiskyFile(filename: string): boolean {
    const lower = filename.toLowerCase();
    return RISKY_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/**
 * Sanitize filename for Content-Disposition header
 * Removes CRLF, path separators, control chars
 */
function sanitizeDownloadFilename(filename: string | undefined, fallbackId: string): string {
    if (!filename) {
        return `evidence_${fallbackId}.bin`;
    }
    
    // Remove CRLF injection attempts
    let safe = filename.replace(/[\r\n]/g, '');
    
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
        return `evidence_${fallbackId}.bin`;
    }
    
    return safe;
}

/**
 * SECURE EVIDENCE FILE DOWNLOAD
 * 
 * Provides authenticated access to evidence files with audit logging
 * Forces download (never inline rendering) with security headers
 */

Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return handlePreflight(req);
    }
    
    const requestId = getRequestId(req);

    try {
        const { base44, user } = await requireUser(req);
        requireOrgContext(user);

        // RBAC: Require evidence:download permission
        requirePermission(user, 'evidence:download');

        const url = new URL(req.url);
        const ackParam = url.searchParams.get('ack');

        const { file_id } = await req.json();

        if (!file_id) {
            return Response.json({ error: 'file_id required' }, { status: 400 });
        }

        const files = await base44.asServiceRole.entities.EvidenceFile.filter({ file_id });

        if (files.length === 0) {
            return Response.json({ error: 'File not found' }, { status: 404 });
        }

        const file = files[0];

        // Check access permissions
        const hasAccess = 
            file.uploaded_by_user_id === user.email ||
            file.access_level === 'organization' ||
            user.role === 'admin';

        if (!hasAccess) {
            await base44.asServiceRole.entities.AuditLog.create({
                event_type: 'evidence_download_denied',
                severity: 'warning',
                description: `Unauthorized download attempt for file ${file.filename_original}`,
                user_id: user.email,
                timestamp: new Date().toISOString(),
                success: false,
                metadata: { file_id: file.file_id }
            });

            return Response.json({ error: 'Access denied' }, { status: 403 });
            }

            // Check if file is risky and requires acknowledgement
            const isRisky = isRiskyFile(file.filename_original);

            if (isRisky && ackParam !== '1') {
            // Audit: risky download blocked
            await base44.asServiceRole.entities.AuditLog.create({
                event_type: 'risky_evidence_download_blocked',
                severity: 'warning',
                description: `Risky file download blocked (no ack): ${file.filename_original}`,
                user_id: user.email,
                timestamp: new Date().toISOString(),
                success: false,
                metadata: {
                    file_id: file.file_id,
                    filename: file.filename_original,
                    reason: 'missing_acknowledgement'
                }
            });

            return Response.json({
                error: 'Download requires acknowledgement',
                risky_file: true,
                filename: file.filename_original,
                message: 'This file type may contain executable code. Add ?ack=1 to URL to confirm download.'
            }, { status: 409 });
            }

            // Audit: risky download allowed with ack
            if (isRisky && ackParam === '1') {
            await base44.asServiceRole.entities.AuditLog.create({
                event_type: 'risky_evidence_download_acknowledged',
                severity: 'info',
                description: `Risky file download acknowledged: ${file.filename_original}`,
                user_id: user.email,
                timestamp: new Date().toISOString(),
                success: true,
                metadata: {
                    file_id: file.file_id,
                    filename: file.filename_original,
                    acknowledged: true
                }
            });
            }

            // Update download stats
        await base44.asServiceRole.entities.EvidenceFile.update(file.id, {
            download_count: (file.download_count || 0) + 1,
            last_downloaded_at: new Date().toISOString()
        });

        // Log download
        await base44.asServiceRole.entities.AuditLog.create({
            event_type: 'evidence_file_downloaded',
            severity: 'info',
            description: `File downloaded: ${file.filename_original}`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                file_id: file.file_id,
                filename: file.filename_original,
                size: file.size_bytes
            }
        });

        // Fetch file from storage and proxy with secure headers
        const fileResponse = await fetch(file.storage_url);
        
        if (!fileResponse.ok) {
            return errorJson(500, 'File retrieval failed');
        }

        const fileBlob = await fileResponse.blob();
        
        // Sanitize filename for Content-Disposition
        const safeFilename = sanitizeDownloadFilename(file.filename_original, file.file_id);

        // Force download with secure headers
        const headers = new Headers({
            // CRITICAL: Force attachment download (never inline)
            'Content-Disposition': `attachment; filename="${safeFilename}"`,
            // CRITICAL: Prevent MIME sniffing attacks
            'X-Content-Type-Options': 'nosniff',
            // Use generic binary type (untrusted MIME)
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(file.size_bytes),
            'X-Request-Id': requestId
        });

        const response = new Response(fileBlob, {
            status: 200,
            headers
        });
        return applyCorsHeaders(req, response);

        } catch (error) {
            logError({ 
                requestId, 
                route: 'downloadEvidenceFile', 
                userId: user?.email,
                orgId: user?.organization_id 
            }, error);
            const response = addRequestIdHeader(errorJson(500, 'Download failed'), requestId);
            return applyCorsHeaders(req, response);
        }
        });