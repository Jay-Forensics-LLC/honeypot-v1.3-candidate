import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Evidence Locker List
 * Retrieves user's encrypted artifacts with pagination
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const url = new URL(req.url);
        const type = url.searchParams.get('type') || 'all';
        const since = url.searchParams.get('since');
        const limit = parseInt(url.searchParams.get('limit') || '50');
        const tags = url.searchParams.get('tags')?.split(',').filter(Boolean) || [];

        // Build filter
        const filter = { user_email: user.email };

        if (since) {
            filter.upload_timestamp = { $gt: since };
        }

        if (tags.length > 0) {
            filter.tags = { $contains: tags[0] }; // Filter by first tag
        }

        // Fetch artifacts (user-scoped, RLS enforced)
        const artifacts = await base44.entities.EncryptedArtifact.filter(
            filter,
            '-upload_timestamp',
            limit
        );

        // Return metadata only (no decryption keys)
        const response = artifacts.map(artifact => ({
            id: artifact.id,
            filename: artifact.filename,
            original_size: artifact.original_size,
            encrypted_size: artifact.encrypted_size,
            tags: artifact.tags,
            plaintext_hash: artifact.plaintext_hash,
            ciphertext_hash: artifact.ciphertext_hash,
            manifest_hash: artifact.manifest_hash,
            prev_hash: artifact.prev_hash,
            upload_timestamp: artifact.upload_timestamp,
            created_date: artifact.created_date
        }));

        return Response.json({
            success: true,
            artifacts: response,
            count: response.length
        });

    } catch (error) {
        console.error('Locker list error:', error);
        return Response.json({
            error: 'List failed',
            message: error.message
        }, { status: 500 });
    }
});