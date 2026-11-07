/**
 * SANITIZE LOGGING
 * Prevents PII leakage in logs
 */

const SENSITIVE_KEYS = [
  'password', 'token', 'secret', 'api_key', 'apiKey',
  'stripe_secret', 'webhook_secret', 'private_key',
  'email', 'phone', 'ssn', 'credit_card', 'cvv',
  'address', 'ip_address', 'session_id'
];

export function sanitizeForLog(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sanitized = Array.isArray(obj) ? [] : {};
  
  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    
    if (SENSITIVE_KEYS.some(s => keyLower.includes(s))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLog(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

export function safeLog(level, message, data) {
  const sanitized = data ? sanitizeForLog(data) : undefined;
  
  if (level === 'error') {
    console.error(message, sanitized);
  } else if (level === 'warn') {
    console.warn(message, sanitized);
  } else {
    console.log(message, sanitized);
  }
}