import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';
import { getTrustedClientIp, isClientIpAllowed } from './helpers/apiKeyIp.ts';

/**
 * CRITICAL: API Key Authentication & Authorization Middleware
 * 
 * Usage: Call this function at the start of any API endpoint
 * Returns: { authorized: boolean, apiKey, error }
 */

export async function verifyApiKeyAndAuthorize(req, requiredScope, connectionInfo = undefined) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  const clientIp = getTrustedClientIp(req, connectionInfo);
  const logRequestUsage = (...args) => logUsage(...args, clientIp);
  let apiKey = null;
  let authResult = 'invalid_key';
  let rateLimitAction = 'allowed';
  let statusCode = 200;
  let errorMessage = null;

  try {
    // Parse Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      authResult = 'invalid_key';
      statusCode = 401;
      errorMessage = 'Missing or invalid Authorization header';
      await logRequestUsage(null, req, requestId, authResult, rateLimitAction, statusCode, Date.now() - startTime, errorMessage, null);
      return { authorized: false, error: 'Unauthorized' };
    }

    const secretKey = authHeader.substring(7); // Remove "Bearer "
    const keyPrefix = secretKey.substring(0, 20);

    // Compute SHA-256 hash
    const encoder = new TextEncoder();
    const data = encoder.encode(secretKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const keyHashSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Find API key by hash
    const base44 = createClientFromRequest(req);
    const keys = await base44.asServiceRole.entities.ApiKey.filter({
      key_hash_sha256: keyHashSha256
    });

    if (keys.length === 0) {
      authResult = 'invalid_key';
      statusCode = 401;
      errorMessage = 'Invalid API key';
      await logRequestUsage(null, req, requestId, authResult, rateLimitAction, statusCode, Date.now() - startTime, errorMessage, requiredScope);
      return { authorized: false, error: 'Invalid API key' };
    }

    apiKey = keys[0];

    // Check status
    if (apiKey.status === 'revoked') {
      authResult = 'revoked';
      statusCode = 401;
      errorMessage = 'API key has been revoked';
      await logRequestUsage(apiKey, req, requestId, authResult, rateLimitAction, statusCode, Date.now() - startTime, errorMessage, requiredScope);
      return { authorized: false, error: 'API key revoked' };
    }

    if (apiKey.status === 'disabled') {
      authResult = 'disabled';
      statusCode = 401;
      errorMessage = 'API key is disabled';
      await logRequestUsage(apiKey, req, requestId, authResult, rateLimitAction, statusCode, Date.now() - startTime, errorMessage, requiredScope);
      return { authorized: false, error: 'API key disabled' };
    }

    // Check expiration
    if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
      authResult = 'expired';
      statusCode = 401;
      errorMessage = 'API key has expired';
      await logRequestUsage(apiKey, req, requestId, authResult, rateLimitAction, statusCode, Date.now() - startTime, errorMessage, requiredScope);
      return { authorized: false, error: 'API key expired' };
    }

    // Check IP allowlist
    if (!isClientIpAllowed(clientIp, apiKey.ip_allowlist)) {
      authResult = 'ip_denied';
      statusCode = 403;
      errorMessage = 'IP not in allowlist';
      await logRequestUsage(apiKey, req, requestId, authResult, rateLimitAction, statusCode, Date.now() - startTime, errorMessage, requiredScope);
      return { authorized: false, error: 'IP not allowed' };
    }

    // Check scope
    if (requiredScope && !apiKey.scopes.includes(requiredScope)) {
      authResult = 'scope_denied';
      statusCode = 403;
      errorMessage = `Missing required scope: ${requiredScope}`;
      await logRequestUsage(apiKey, req, requestId, authResult, rateLimitAction, statusCode, Date.now() - startTime, errorMessage, requiredScope);
      return { authorized: false, error: 'Insufficient scope' };
    }

    // Rate limiting (token bucket)
    const rateLimitResult = await checkRateLimit(apiKey, base44);
    if (!rateLimitResult.allowed) {
      if (rateLimitResult.unavailable) {
        authResult = 'rate_limit_unavailable';
        rateLimitAction = 'unavailable';
        statusCode = 503;
        errorMessage = 'Rate limit service unavailable';
        await logRequestUsage(apiKey, req, requestId, authResult, rateLimitAction, statusCode, Date.now() - startTime, errorMessage, requiredScope);
        return { authorized: false, error: 'Service unavailable', status: 503 };
      }

      authResult = 'ok'; // Auth was OK, but rate limited
      rateLimitAction = 'throttled';
      statusCode = 429;
      errorMessage = 'Rate limit exceeded';
      await logRequestUsage(apiKey, req, requestId, authResult, rateLimitAction, statusCode, Date.now() - startTime, errorMessage, requiredScope);
      return { authorized: false, error: 'Rate limit exceeded', status: 429 };
    }

    // Success
    authResult = 'ok';
    await logRequestUsage(apiKey, req, requestId, authResult, rateLimitAction, statusCode, Date.now() - startTime, null, requiredScope);

    // Update last_used_at
    await base44.asServiceRole.entities.ApiKey.update(apiKey.id, {
      last_used_at: new Date().toISOString()
    });

    return { authorized: true, apiKey };

  } catch (error) {
    console.error('API key verification failed:', error);
    statusCode = 500;
    errorMessage = error.message;
    await logRequestUsage(apiKey, req, requestId, authResult, rateLimitAction, statusCode, Date.now() - startTime, errorMessage, requiredScope);
    return { authorized: false, error: 'Internal error' };
  }
}

async function checkRateLimit(apiKey, base44) {
  try {
    const entity = base44.asServiceRole.entities.ApiKeyRateLimitState;

    // Never fall back to a non-atomic read/write.
    if (typeof entity?.updateMany !== 'function') {
      return { allowed: false, unavailable: true };
    }

    // Bounded retries for concurrent conditional-update conflicts.
    for (let attempt = 0; attempt < 3; attempt++) {
      const states = await entity.filter({
        api_key_id: apiKey.id
      });

      if (!Array.isArray(states) || states.length !== 1) {
        return { allowed: false, unavailable: true };
      }

      const state = states[0];
      const bucket = state?.bucket;

      if (
        !state?.id ||
        !bucket ||
        !Number.isFinite(bucket.capacity) ||
        bucket.capacity <= 0 ||
        !Number.isFinite(bucket.tokens) ||
        bucket.tokens < 0 ||
        bucket.tokens > bucket.capacity ||
        !Number.isFinite(bucket.refill_per_sec) ||
        bucket.refill_per_sec < 0 ||
        typeof bucket.last_refill_at !== 'string'
      ) {
        return { allowed: false, unavailable: true };
      }

      const lastRefill = Date.parse(bucket.last_refill_at);
      const now = new Date();

      // Do not rewind refill timestamps when clocks disagree.
      if (!Number.isFinite(lastRefill) || lastRefill > now.getTime()) {
        return { allowed: false, unavailable: true };
      }

      const elapsed = Math.max(
        0,
        (now.getTime() - lastRefill) / 1000
      );

      const available = Math.min(
        bucket.capacity,
        bucket.tokens + elapsed * bucket.refill_per_sec
      );

      if (available < 1) {
        return { allowed: false };
      }

      // Compare the original balance and timestamp.
      // Only a confirmed matching update authorizes access.
      const result = await entity.updateMany(
        {
          id: state.id,
          api_key_id: apiKey.id,
          'bucket.tokens': bucket.tokens,
          'bucket.last_refill_at': bucket.last_refill_at
        },
        {
          $set: {
            'bucket.tokens': available - 1,
            'bucket.last_refill_at': now.toISOString()
          }
        }
      );

      // The SDK 0.8.30 contract uses success, updated, has_more.
      if (
        result?.success !== true ||
        !Number.isInteger(result.updated) ||
        result.updated < 0 ||
        result.updated > 1 ||
        result.has_more !== false
      ) {
        return { allowed: false, unavailable: true };
      }

      if (result.updated === 1) {
        return { allowed: true };
      }

      // updated === 0: another request may have changed
      // the bucket. Reread state before retrying.
    }

    // Never authorize when contention cannot be resolved.
    return { allowed: false, unavailable: true };

  } catch (error) {
    console.error('Rate limit check failed:', error);
    return { allowed: false, unavailable: true };
  }
}

async function logUsage(apiKey, req, requestId, authResult, rateLimitAction, statusCode, latencyMs, errorMessage, scopeChecked, clientIp) {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    
    await base44.asServiceRole.entities.ApiKeyUsageLog.create({
      organization_id: apiKey?.organization_id || 'unknown',
      case_id: apiKey?.case_id || null,
      schema_version: '1.0.0',
      api_key_id: apiKey?.id || null,
      key_prefix: apiKey?.key_prefix || null,
      request_id: requestId,
      method: req.method,
      path: url.pathname,
      status_code: statusCode,
      latency_ms: latencyMs,
      rate_limit_action: rateLimitAction,
      scope_checked: scopeChecked || null,
      auth_result: authResult,
      client_ip: clientIp || 'unknown',
      user_agent: req.headers.get('user-agent') || null,
      error_message: errorMessage || null
    });
  } catch (error) {
    console.error('Failed to log API usage:', error);
  }
}
