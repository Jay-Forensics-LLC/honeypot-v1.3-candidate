/**
 * HTTP Response Helpers
 * Provides consistent JSON responses with security headers for Deno functions
 */

/**
 * Sets security headers on a Headers object
 * @param headers - Headers object to modify
 * @param options - Configuration options
 */
export function setSecurityHeaders(
  headers: Headers,
  options?: { 
    cacheControl?: string;
    csp?: string;
    hsts?: boolean;
  }
): void {
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Cache-Control', options?.cacheControl || 'no-store');
  
  // HSTS: Enforce HTTPS (default: enabled)
  if (options?.hsts !== false) {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  // CSP: Only set if explicitly provided
  if (options?.csp) {
    headers.set('Content-Security-Policy', options.csp);
  }
}

/**
 * Creates a JSON response with optional security headers
 * @param data - Data to serialize as JSON
 * @param init - Response options (status, headers, etc.)
 * @returns Response with JSON content type and security headers
 */
export function json(
  data: unknown,
  init?: ResponseInit & { 
    securityHeaders?: boolean;
    security?: {
      cacheControl?: string;
      csp?: string;
      hsts?: boolean;
    };
  }
): Response {
  const { securityHeaders = true, security, ...responseInit } = init || {};
  
  const headers = new Headers(responseInit.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  
  if (securityHeaders !== false) {
    setSecurityHeaders(headers, security);
  }
  
  return new Response(JSON.stringify(data), {
    ...responseInit,
    headers
  });
}

/**
 * Creates a sanitized error response (no stack traces or internal details)
 * @param status - HTTP status code
 * @param publicMessage - User-safe error message
 * @param init - Additional response options
 * @returns Response with error JSON and security headers
 */
export function errorJson(
  status: number,
  publicMessage: string,
  init?: ResponseInit & { 
    security?: {
      cacheControl?: string;
      csp?: string;
      hsts?: boolean;
    };
  }
): Response {
  return json(
    { error: publicMessage },
    { ...init, status }
  );
}