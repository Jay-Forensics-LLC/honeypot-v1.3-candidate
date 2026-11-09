/**
 * Security Headers Middleware
 * Applies hardened HTTP security headers to all responses
 */

export function applySecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  
  // Content Security Policy - strict defaults
  headers.set('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data:; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none'"
  );
  
  // Prevent clickjacking
  headers.set('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  headers.set('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection (legacy browsers)
  headers.set('X-XSS-Protection', '1; mode=block');
  
  // Strict Transport Security (HSTS) - force HTTPS
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  
  // Referrer policy - minimal information leakage
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions policy - disable unnecessary features
  headers.set('Permissions-Policy', 
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
  );
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export function secureJsonResponse(data: any, status = 200): Response {
  const response = Response.json(data, { status });
  return applySecurityHeaders(response);
}