import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
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
      authResult = 'ok'; // Auth was OK, but rate limited
      rateLimitAction = 'throttled';
      statusCode = 429;
      errorMessage = 'Rate limit exceeded';
      await logRequestUsage(apiKey, req, requestId, authResult, rateLimitAction, statusCode, Date.now() - startTime, errorMessage, requiredScope);
      return { authorized: false, error: 'Rate limit exceeded' };
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
    // Get current bucket state
    const states = await base44.asServiceRole.entities.ApiKeyRateLimitState.filter({
      api_key_id: apiKey.id
    });

    if (states.length === 0) {
      return { allowed: true }; // No state = allow
    }

    const state = states[0];
    const now = new Date();
    const lastRefill = new Date(state.bucket.last_refill_at);
    const secondsSinceRefill = (now - lastRefill) / 1000;

    // Refill tokens
    const refillAmount = secondsSinceRefill * state.bucket.refill_per_sec;
    const newTokens = Math.min(state.bucket.capacity, state.bucket.tokens + refillAmount);

    // Check if enough tokens
    if (newTokens < 1) {
      return { allowed: false };
    }

    // Consume 1 token
    await base44.asServiceRole.entities.ApiKeyRateLimitState.update(state.id, {
      bucket: {
        ...state.bucket,
        tokens: newTokens - 1,
        last_refill_at: now.toISOString()
      }
    });

    return { allowed: true };

  } catch (error) {
    console.error('Rate limit check failed:', error);
    return { allowed: true }; // Fail open
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
