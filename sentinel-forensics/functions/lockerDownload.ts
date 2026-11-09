import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Evidence Locker Download
 * Returns encrypted artifact with decryption parameters
 * 
 * SECURITY: Returns ciphertext + salt/IV
 * Client must provide passphrase to decrypt
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const url = new URL(req.url);
        const artifactId = url.searchParams.get('id');

        if (!artifactId) {
            return Response.json({ error: 'artifact id required' }, { status: 400 });
        }

        // Fetch artifact (user-scoped, RLS enforced)
        const artifacts = await base44.entities.EncryptedArtifact.filter({
            id: artifactId,
            user_email: user.email
        });

        if (artifacts.length === 0) {
            return Response.json({ error: 'Artifact not found or access denied' }, { status: 404 });
        }

        const artifact = artifacts[0];

        // Fetch ciphertext from storage
        const ciphertextResponse = await fetch(artifact.file_url);
        if (!ciphertextResponse.ok) {
            throw new Error('Failed to fetch ciphertext from storage');
        }

        const ciphertext = await ciphertextResponse.arrayBuffer();

        // Create audit log
        await base44.entities.AuditLog.create({
            event_type: 'evidence_locker_download',
            severity: 'info',
            description: `Downloaded encrypted artifact: ${artifact.filename}`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                artifact_id: artifact.id,
                filename: artifact.filename
            }
        });

        // Return encrypted data + decryption parameters
        return Response.json({
            success: true,
            artifact: {
                id: artifact.id,
                filename: artifact.filename,
                original_type: artifact.manifest.original_type,
                ciphertext_base64: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
                salt_base64: artifact.salt_base64,
                iv_base64: artifact.iv_base64,
                manifest: artifact.manifest,
                ciphertext_hash: artifact.ciphertext_hash
            }
        });

    } catch (error) {
        console.error('Locker download error:', error);
        return Response.json({
            error: 'Download failed',
            message: error.message
        }, { status: 500 });
    }
});