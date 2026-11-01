/**
 * Agent Download Links
 * Returns stable object storage URLs for agent binaries
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { requireAuth, sanitizeError } from './helpers/security.ts';

// CRITICAL: Update these after uploading to R2/S3
const AGENT_METADATA = {
  windows: {
    url: 'https://pub-YOUR_R2_BUCKET.r2.dev/sentinel-agent-windows.exe',
    version: '1.0.0',
    sha256: 'PLACEHOLDER_HASH_UPDATE_AFTER_UPLOAD',
    sizeBytes: 5242880, // 5MB - update after upload
    updatedAt: '2026-01-21T00:00:00Z'
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    await requireAuth(base44);
    
    // Return download metadata
    return Response.json({
      downloads: AGENT_METADATA,
      message: 'Agent download links',
      note: 'Verify SHA-256 hash after download for integrity'
    });
    
  } catch (error) {
    if (error instanceof Response) return error;
    
    console.error('[AGENT-DOWNLOADS] Error:', error);
    return Response.json(sanitizeError(error), { status: 500 });
  }
});