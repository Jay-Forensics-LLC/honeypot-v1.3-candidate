import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const organizationId = user.organization_id;
    if (typeof organizationId !== 'string' || !organizationId.trim()) {
      return Response.json({ error: 'Organization context required' }, { status: 403 });
    }

    const { apiKeyId } = await req.json();

    if (typeof apiKeyId !== 'string' || !apiKeyId.trim()) {
      return Response.json({ error: 'Missing or invalid apiKeyId' }, { status: 400 });
    }

    // Select an exact key within the authenticated administrator's organization.
    const oldKeys = await base44.asServiceRole.entities.ApiKey.filter({
      id: apiKeyId,
      organization_id: organizationId
    });
    if (!Array.isArray(oldKeys) || oldKeys.length !== 1 ||
        oldKeys[0]?.id !== apiKeyId || oldKeys[0]?.organization_id !== organizationId) {
      return Response.json({ error: 'API key not found' }, { status: 404 });
    }
    const oldKey = oldKeys[0];

    // Revoke old key
    await base44.asServiceRole.entities.ApiKey.update(apiKeyId, {
      status: 'revoked'
    });

    // Generate new secret key
    const keyBytes = new Uint8Array(32);
    crypto.getRandomValues(keyBytes);
    const keyBase64 = btoa(String.fromCharCode(...keyBytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    const secretKey = `sfk_live_${keyBase64}`;

    const keyPrefix = secretKey.substring(0, 20);

    // Compute SHA-256 hash
    const encoder = new TextEncoder();
    const data = encoder.encode(secretKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const keyHashSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Create new API key with same config
    const newKey = await base44.asServiceRole.entities.ApiKey.create({
      organization_id: organizationId,
      case_id: oldKey.case_id,
      schema_version: '1.0.0',
      name: oldKey.name + ' (rotated)',
      key_prefix: keyPrefix,
      key_hash_sha256: keyHashSha256,
      status: 'active',
      scopes: oldKey.scopes,
      rate_limit: oldKey.rate_limit,
      ip_allowlist: oldKey.ip_allowlist,
      expires_at: oldKey.expires_at,
      created_by_user_id: user.id,
      notes: oldKey.notes
    });

    // Initialize rate limit state for new key
    await base44.asServiceRole.entities.ApiKeyRateLimitState.create({
      organization_id: organizationId,
      api_key_id: newKey.id,
      schema_version: '1.0.0',
      bucket: {
        capacity: oldKey.rate_limit.burst,
        tokens: oldKey.rate_limit.burst,
        refill_per_sec: oldKey.rate_limit.requests_per_minute / 60,
        last_refill_at: new Date().toISOString()
      }
    });

    return Response.json({
      oldKeyId: oldKey.id,
      newApiKeyId: newKey.id,
      name: newKey.name,
      keyPrefix: newKey.key_prefix,
      scopes: newKey.scopes,
      rateLimit: newKey.rate_limit,
      expiresAt: newKey.expires_at,
      secretKey // ONLY TIME THIS IS RETURNED
    });

  } catch (error) {
    console.error('Rotate API key failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});