/**
 * AI CONTENT ANALYZER
 * 
 * Client-side utility for pre-screening AI inputs/outputs
 * before sending to the full backend detection engine.
 * 
 * SECURITY: This is defense-in-depth. The backend is the authority.
 */

// Quick patterns for client-side pre-screening (subset of backend patterns)
const QUICK_THREAT_PATTERNS = [
  // Prompt injection
  { pattern: /ignore\s+(all\s+)?(previous|prior)\s+(instructions?|prompts?)/i, type: 'prompt_injection', severity: 'high' },
  { pattern: /you\s+are\s+now\s+(a|an)\s+/i, type: 'prompt_injection', severity: 'medium' },
  { pattern: /\[system\]/i, type: 'prompt_injection', severity: 'high' },
  { pattern: /<\|im_start\|>/i, type: 'prompt_injection', severity: 'critical' },
  
  // Jailbreak
  { pattern: /\bDAN\b/, type: 'jailbreak', severity: 'high' },
  { pattern: /jailbreak/i, type: 'jailbreak', severity: 'high' },
  { pattern: /bypass\s+(safety|filter)/i, type: 'jailbreak', severity: 'high' },
  
  // Data exfiltration
  { pattern: /dump\s+(the\s+)?database/i, type: 'exfiltration', severity: 'critical' },
  { pattern: /list\s+all\s+(passwords|secrets|api\s*keys)/i, type: 'exfiltration', severity: 'critical' },
  
  // Malicious output
  { pattern: /<script[\s>]/i, type: 'xss', severity: 'critical' },
  { pattern: /javascript:/i, type: 'xss', severity: 'high' },
  { pattern: /eval\s*\(/i, type: 'code_injection', severity: 'high' }
];

/**
 * Quick client-side threat check
 * @param {string} content - Content to analyze
 * @returns {{ detected: boolean, threats: Array, maxSeverity: string }}
 */
export function quickThreatCheck(content) {
  if (!content || typeof content !== 'string') {
    return { detected: false, threats: [], maxSeverity: 'info' };
  }
  
  const threats = [];
  const severityOrder = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
  let maxSeverity = 'info';
  
  for (const { pattern, type, severity } of QUICK_THREAT_PATTERNS) {
    if (pattern.test(content)) {
      threats.push({ type, severity, pattern: pattern.source.substring(0, 50) });
      if (severityOrder[severity] > severityOrder[maxSeverity]) {
        maxSeverity = severity;
      }
    }
  }
  
  // Length check
  if (content.length > 50000) {
    threats.push({ type: 'length_attack', severity: 'medium', pattern: 'excessive_length' });
    if (severityOrder['medium'] > severityOrder[maxSeverity]) {
      maxSeverity = 'medium';
    }
  }
  
  return {
    detected: threats.length > 0,
    threats,
    maxSeverity
  };
}

/**
 * Sanitize content before display
 * @param {string} content - Content to sanitize
 * @returns {string}
 */
export function sanitizeForDisplay(content) {
  if (!content) return '';
  
  return content
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '');
}

/**
 * Hash content using Web Crypto API
 * @param {string} content - Content to hash
 * @returns {Promise<string>}
 */
export async function hashContent(content) {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create threat event context
 * @returns {Object}
 */
export function createThreatContext() {
  return {
    session_id: sessionStorage.getItem('session_id') || crypto.randomUUID(),
    user_agent: navigator.userAgent,
    request_id: crypto.randomUUID(),
    timestamp: new Date().toISOString()
  };
}

export default {
  quickThreatCheck,
  sanitizeForDisplay,
  hashContent,
  createThreatContext
};