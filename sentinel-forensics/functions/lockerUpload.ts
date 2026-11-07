import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Evidence Locker Upload
 * Stores encrypted artifacts with metadata
 * 
 * SECURITY: Server only stores ciphertext
 * Never receives passphrase or plaintext
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Parse multipart form data
        const formData = await req.formData();
        const ciphertextFile = formData.get('ciphertext');
        const metadataJson = formData.get('metadata');
        const saltBase64 = formData.get('salt');
        const ivBase64 = formData.get('iv');
        const plaintextHash = formData.get('plaintext_hash');

        if (!ciphertextFile || !metadataJson || !saltBase64 || !ivBase64 || !plaintextHash) {
            return Response.json({
                error: 'Missing required fields',
                required: ['ciphertext', 'metadata', 'salt', 'iv', 'plaintext_hash']
            }, { status: 400 });
        }

        const metadata = JSON.parse(metadataJson);

        // Upload ciphertext to storage
        const ciphertextBlob = new Blob([await ciphertextFile.arrayBuffer()]);
        const uploadResult = await base44.integrations.Core.UploadFile({
            file: ciphertextBlob
        });

        const fileUrl = uploadResult.file_url;

        // Compute hash of ciphertext for integrity
        const ciphertextArrayBuffer = await ciphertextFile.arrayBuffer();
        const ciphertextHashBuffer = await crypto.subtle.digest('SHA-256', ciphertextArrayBuffer);
        const ciphertextHashArray = Array.from(new Uint8Array(ciphertextHashBuffer));
        const ciphertextHash = ciphertextHashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Get previous artifact for hash chaining
        const previousArtifacts = await base44.entities.EncryptedArtifact.filter(
            { user_email: user.email },
            '-created_date',
            1
        );

        const prevHash = previousArtifacts.length > 0 ? previousArtifacts[0].manifest_hash : null;

        // Create manifest
        const manifest = {
            filename: metadata.filename,
            original_size: metadata.size,
            original_type: metadata.type,
            encrypted_size: ciphertextFile.size,
            tags: metadata.tags || [],
            notes: metadata.notes || '',
            plaintext_hash: plaintextHash,
            ciphertext_hash: ciphertextHash,
            prev_hash: prevHash,
            uploaded_at: new Date().toISOString()
        };

        // Compute manifest hash
        const manifestString = JSON.stringify(manifest, Object.keys(manifest).sort());
        const manifestHashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(manifestString));
        const manifestHashArray = Array.from(new Uint8Array(manifestHashBuffer));
        const manifestHash = manifestHashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Store artifact record
        const artifact = await base44.entities.EncryptedArtifact.create({
            user_email: user.email,
            file_url: fileUrl,
            salt_base64: saltBase64,
            iv_base64: ivBase64,
            manifest: manifest,
            manifest_hash: manifestHash,
            tags: metadata.tags || [],
            plaintext_hash: plaintextHash,
            ciphertext_hash: ciphertextHash,
            prev_hash: prevHash,
            filename: metadata.filename,
            original_size: metadata.size,
            encrypted_size: ciphertextFile.size,
            upload_timestamp: new Date().toISOString()
        });

        // Create audit log
        await base44.entities.AuditLog.create({
            event_type: 'evidence_locker_upload',
            severity: 'info',
            description: `Encrypted artifact uploaded: ${metadata.filename}`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                artifact_id: artifact.id,
                filename: metadata.filename,
                size: ciphertextFile.size,
                tags: metadata.tags
            }
        });

        return Response.json({
            success: true,
            artifact_id: artifact.id,
            manifest_hash: manifestHash,
            ciphertext_hash: ciphertextHash
        });

    } catch (error) {
        console.error('Locker upload error:', error);
        return Response.json({
            error: 'Upload failed',
            message: error.message
        }, { status: 500 });
    }
});