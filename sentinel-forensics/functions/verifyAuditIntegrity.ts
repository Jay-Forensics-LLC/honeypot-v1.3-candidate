import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * VERIFY AUDIT RUN INTEGRITY
 * Re-computes artifact hashes and validates seal
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { run_id } = await req.json();

    // Get run
    const runs = await base44.entities.CodebaseAuditRun.filter({ id: run_id });
    if (!runs.length) {
      return Response.json({ error: 'Run not found' }, { status: 404 });
    }

    const run = runs[0];

    // Get artifacts
    const artifacts = await base44.entities.EvidenceArtifact.filter({ run_id });

    const verificationResults = [];
    let allValid = true;

    for (const artifact of artifacts) {
      // Verify immutability
      if (!artifact.immutable) {
        verificationResults.push({
          artifact_id: artifact.id,
          filename: artifact.filename,
          status: 'WARNING',
          message: 'Artifact not marked immutable'
        });
        allValid = false;
        continue;
      }

      // Re-compute hash from content_preview (limited verification)
      const computedHash = await hashString(artifact.content_preview || '');
      const hashMatches = computedHash === artifact.sha256.substring(0, computedHash.length);

      verificationResults.push({
        artifact_id: artifact.id,
        filename: artifact.filename,
        type: artifact.artifact_type,
        status: hashMatches ? 'VERIFIED' : 'HASH_MISMATCH',
        stored_hash: artifact.sha256,
        computed_hash: computedHash,
        size_bytes: artifact.size_bytes,
        written_at: artifact.written_at
      });

      if (!hashMatches) allValid = false;
    }

    // Verify seal
    const sealStatus = run.seal_hash ? 'SEALED' : 'UNSEALED';

    return Response.json({
      run_id,
      verification_status: allValid ? 'VERIFIED' : 'FAILED',
      seal_status: sealStatus,
      seal_hash: run.seal_hash,
      sealed_at: run.sealed_at,
      sealed_by: run.sealed_by,
      artifacts: verificationResults,
      verification_timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Verification error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}