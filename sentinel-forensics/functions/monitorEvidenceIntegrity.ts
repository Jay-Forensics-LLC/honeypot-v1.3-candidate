import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Evidence Integrity Drift Detection
 * Periodically re-verifies evidence hashes to detect tampering or corruption
 * 
 * Modes:
 * - single: Check one evidence item
 * - batch: Check all evidence in a case
 * - all: Check all evidence in org (admin only)
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { mode, evidence_id, case_id, limit = 100 } = await req.json();

    // Validate mode
    if (!['single', 'batch', 'all'].includes(mode)) {
      return Response.json({ error: 'Invalid mode' }, { status: 400 });
    }

    // Admin-only for 'all' mode
    if (mode === 'all' && user.role !== 'admin') {
      return Response.json({ error: 'Admin access required for full scan' }, { status: 403 });
    }

    // Fetch evidence to check
    let evidenceItems = [];

    if (mode === 'single') {
      if (!evidence_id) {
        return Response.json({ error: 'evidence_id required for single mode' }, { status: 400 });
      }
      const items = await base44.entities.EvidenceV2.filter({ id: evidence_id });
      evidenceItems = items;
    } else if (mode === 'batch') {
      if (!case_id) {
        return Response.json({ error: 'case_id required for batch mode' }, { status: 400 });
      }
      evidenceItems = await base44.entities.EvidenceV2.filter({ case_id }, '-created_date', limit);
    } else if (mode === 'all') {
      // Admin scanning all org evidence
      evidenceItems = await base44.asServiceRole.entities.EvidenceV2.filter(
        { organization_id: user.organization_id },
        '-created_date',
        limit
      );
    }

    if (!evidenceItems || evidenceItems.length === 0) {
      return Response.json({ 
        success: true,
        checked: 0,
        passed: 0,
        failed: 0,
        errors: 0,
        results: []
      });
    }

    const results = [];
    let passed = 0;
    let failed = 0;
    let errors = 0;

    // Check each evidence item
    for (const evidence of evidenceItems) {
      const checkTimestamp = new Date().toISOString();
      let status = 'pass';
      let driftDetected = false;
      let alertSent = false;
      let computedHash = null;
      let errorMessage = null;
      let fileAccessible = true;
      let fileSizeBytes = null;

      try {
        // Only check if evidence has a file URL
        if (!evidence.file_url) {
          status = 'error';
          errorMessage = 'No file URL present';
          fileAccessible = false;
          errors++;
        } else {
          // Fetch the file and compute hash
          const fileResponse = await fetch(evidence.file_url);
          
          if (!fileResponse.ok) {
            status = 'error';
            errorMessage = `File not accessible: ${fileResponse.status}`;
            fileAccessible = false;
            errors++;
          } else {
            const fileBuffer = await fileResponse.arrayBuffer();
            fileSizeBytes = fileBuffer.byteLength;

            // Compute SHA-256 hash
            const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            // Compare with original
            const originalHash = evidence.sha256_hash || evidence.file_hash_sha256;
            
            if (!originalHash) {
              status = 'error';
              errorMessage = 'No original hash to compare';
              errors++;
            } else if (computedHash !== originalHash) {
              status = 'fail';
              driftDetected = true;
              failed++;
              
              // Record notification success only after an explicit acknowledgment.
              // An unconfirmed attempt may still have created a notification.
              try {
                const notificationResponse = await base44.asServiceRole.functions.invoke('sendNotification', {
                  userEmail: evidence.collected_by || user.email,
                  title: '⚠️ Evidence Integrity Drift Detected',
                  message: `Evidence "${evidence.title}" (${evidence.id}) has a hash mismatch. Potential tampering or corruption detected.`,
                  severity: 'high',
                  type: 'security_alert'
                });
                const notification = notificationResponse?.data;
                alertSent = Number.isInteger(notificationResponse?.status) &&
                  notificationResponse.status >= 200 && notificationResponse.status < 300 &&
                  notification?.success === true &&
                  typeof notification.notificationId === 'string' &&
                  notification.notificationId.trim().length > 0;
                if (!alertSent) console.error('Integrity drift notification was not confirmed');
              } catch {
                console.error('Integrity drift notification was not confirmed');
              }

            } else {
              status = 'pass';
              passed++;
            }
          }
        }
      } catch (error) {
        status = 'error';
        errorMessage = error.message;
        errors++;
      }

      // Create immutable check record
      const checkRecord = await base44.asServiceRole.entities.EvidenceIntegrityCheck.create({
        organization_id: user.organization_id,
        evidence_id: evidence.id,
        check_type: mode === 'single' ? 'manual' : 'scheduled',
        original_hash: evidence.sha256_hash || evidence.file_hash_sha256 || 'unknown',
        computed_hash: computedHash || 'N/A',
        status,
        drift_detected: driftDetected,
        error_message: errorMessage,
        checked_by: user.email,
        check_timestamp: checkTimestamp,
        file_accessible: fileAccessible,
        file_size_bytes: fileSizeBytes,
        alert_sent: alertSent
      });

      results.push({
        evidence_id: evidence.id,
        evidence_title: evidence.title,
        status,
        drift_detected: driftDetected,
        check_id: checkRecord.id
      });
    }

    // Create audit log
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      event_type: 'integrity_check_completed',
      severity: failed > 0 ? 'critical' : 'info',
      description: `Integrity check completed: ${passed} passed, ${failed} failed, ${errors} errors`,
      user_id: user.email,
      success: true,
      metadata: {
        mode,
        total_checked: evidenceItems.length,
        passed,
        failed,
        errors,
        case_id,
        evidence_id
      },
      timestamp: new Date().toISOString()
    });

    return Response.json({
      success: true,
      checked: evidenceItems.length,
      passed,
      failed,
      errors,
      drift_detected_count: failed,
      results
    });

  } catch (error) {
    console.error('Integrity monitoring error:', error);
    return Response.json({
      error: 'Integrity check failed',
      message: error.message
    }, { status: 500 });
  }
});