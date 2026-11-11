/**
 * TELEMETRY & REQUEST CORRELATION
 * 
 * Provides request tracing and structured error logging for audit trails
 * and incident response.
 */

/**
 * Extract or generate request ID for correlation
 * Priority: X-Request-Id header → generate UUID
 */
export function getRequestId(req: Request): string {
  const headerValue = req.headers.get('X-Request-Id');
  
  if (headerValue) {
    // Sanitize: max 64 chars, alphanumeric + hyphens only
    const sanitized = headerValue.slice(0, 64).replace(/[^a-zA-Z0-9-]/g, '');
    if (sanitized.length > 0) {
      return sanitized;
    }
  }
  
  // Generate new UUID
  return crypto.randomUUID();
}

/**
 * Structured error logging with request correlation
 * Safe for production: redacts secrets, tokens, and PII
 */
export function logError(
  context: {
    requestId: string;
    route: string;
    userId?: string;
    orgId?: string;
  },
  err: unknown
): void {
  const timestamp = new Date().toISOString();
  
  // Extract safe error details
  let errorType = 'UnknownError';
  let errorMessage = 'An error occurred';
  let statusCode: number | undefined;
  
  if (err instanceof Error) {
    errorType = err.constructor.name;
    errorMessage = err.message;
  } else if (err instanceof Response) {
    errorType = 'ResponseError';
    statusCode = err.status;
    errorMessage = err.statusText || `HTTP ${err.status}`;
  } else if (typeof err === 'string') {
    errorMessage = err;
  }
  
  // Redact sensitive patterns from error messages
  const redactedMessage = redactSensitiveData(errorMessage);
  
  // Structured JSON log (single line for log aggregation)
  console.error(JSON.stringify({
    timestamp,
    level: 'ERROR',
    requestId: context.requestId,
    route: context.route,
    userId: context.userId,
    organizationId: context.orgId,
    errorType,
    errorMessage: redactedMessage,
    statusCode
  }));
}

/**
 * Redact sensitive data patterns from strings
 * Protects: MFA codes, tokens, passwords, keys, emails (partial)
 */
function redactSensitiveData(message: string): string {
  if (typeof message !== 'string') return message;
  
  return message
    // MFA codes (6 digits)
    .replace(/\b\d{6}\b/g, '[REDACTED_MFA_CODE]')
    // JWT tokens
    .replace(/eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, '[REDACTED_TOKEN]')
    // Bearer tokens
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
    // API keys (common patterns)
    .replace(/[a-z0-9]{32,}/gi, '[REDACTED_KEY]')
    // Passwords in query strings or JSON
    .replace(/(password|pwd|pass|secret|token|key)[:=]\s*["']?[^"'\s,}&]+/gi, '$1=[REDACTED]')
    // Email addresses (partial redaction)
    .replace(/([a-z0-9._%+-]+)@([a-z0-9.-]+\.[a-z]{2,})/gi, (match, user, domain) => {
      const redactedUser = user.length > 2 ? `${user[0]}***${user[user.length - 1]}` : '***';
      return `${redactedUser}@${domain}`;
    });
}

/**
 * Add request ID to response headers
 */
export function addRequestIdHeader(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Request-Id', requestId);
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}