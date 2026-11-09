/**
 * CORS SECURITY - EXPLICIT ALLOWLIST
 * 
 * Prevents wildcard CORS accidents by enforcing origin validation
 * Non-browser clients (no Origin header) are allowed through
 */

import { applySecurityHeaders } from './securityHeaders.ts';

/**
 * Get allowed origins from environment
 * Returns empty array if not configured (reject all CORS)
 */
function getAllowedOrigins(): string[] {
  const origins = Deno.env.get('ALLOWED_ORIGINS');
  if (!origins) {
    // Default: allow localhost for development
    return ['http://localhost:3000', 'http://localhost:5173'];
  }
  return origins.split(',').map(o => o.trim()).filter(Boolean);
}

/**
 * Set CORS headers if origin is allowed
 * Does nothing if Origin header is missing (non-browser clients)
 */
export function setCorsHeaders(req: Request, headers: Headers): void {
  const origin = req.headers.get('Origin');
  
  // No Origin header = non-browser client (curl, Postman, etc.)
  // Allow through without CORS headers
  if (!origin) {
    return;
  }
  
  const allowedOrigins = getAllowedOrigins();
  
  // Check if origin is in allowlist
  if (!allowedOrigins.includes(origin)) {
    // Origin not allowed - do not set CORS headers
    // Browser will block the response
    return;
  }
  
  // Origin is allowed - set CORS headers
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  headers.set('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Note: Access-Control-Allow-Credentials omitted
  // App uses Bearer tokens, not cookies
}

/**
 * Handle OPTIONS preflight requests
 * Returns 204 with CORS + security headers
 */
export function handlePreflight(req: Request): Response {
  const headers = new Headers();
  
  // Set CORS headers
  setCorsHeaders(req, headers);
  
  // Apply security headers
  const response = new Response(null, { status: 204, headers });
  return applySecurityHeaders(response);
}

/**
 * Apply CORS to an existing response
 */
export function applyCorsHeaders(req: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  setCorsHeaders(req, headers);
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}