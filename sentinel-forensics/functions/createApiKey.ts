import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { 
      caseId, 
      name, 
      scopes, 
      rateLimit, 
      expiresAt, 
      ipAllowlist, 
      notes 
    } = await req.json();

    if (!name || !scopes || scopes.length === 0) {
      return Response.json({ error: 'Missing required fields: name, scopes' }, { status: 400 });
    }

    if (!rateLimit || !rateLimit.requests_per_minute || !rateLimit.burst) {
      return Response.json({ error: 'Missing rate limit configuration' }, { status: 400 });
    }

    // Generate high-entropy secret key
    const keyBytes = new Uint8Array(32);
    crypto.getRandomValues(keyBytes);
    const keyBase64 = btoa(String.fromCharCode(...keyBytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    const secretKey = `sfk_live_${keyBase64}`;

    // Compute key prefix (first 14 chars for identification)
    const keyPrefix = secretKey.substring(0, 20);

    // Compute SHA-256 hash
    const encoder = new TextEncoder();
    const data = encoder.encode(secretKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const keyHashSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Create API key record
    const apiKey = await base44.asServiceRole.entities.ApiKey.create({
      organization_id: user.organization_id,
      case_id: caseId || null,
      schema_version: '1.0.0',
      name,
      key_prefix: keyPrefix,
      key_hash_sha256: keyHashSha256,
      status: 'active',
      scopes,
      rate_limit: {
        requests_per_minute: rateLimit.requests_per_minute,
        burst: rateLimit.burst
      },
      ip_allowlist: ipAllowlist || null,
      expires_at: expiresAt || null,
      created_by_user_id: user.id,
      notes: notes || null
    });

    // Initialize rate limit state
    await base44.asServiceRole.entities.ApiKeyRateLimitState.create({
      organization_id: user.organization_id,
      api_key_id: apiKey.id,
      schema_version: '1.0.0',
      bucket: {
        capacity: rateLimit.burst,
        tokens: rateLimit.burst,
        refill_per_sec: rateLimit.requests_per_minute / 60,
        last_refill_at: new Date().toISOString()
      }
    });

    // CRITICAL: Return secret key ONLY once
    return Response.json({
      apiKeyId: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.key_prefix,
      scopes: apiKey.scopes,
      rateLimit: apiKey.rate_limit,
      expiresAt: apiKey.expires_at,
      secretKey // ONLY TIME THIS IS RETURNED
    });

  } catch (error) {
    console.error('Create API key failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});