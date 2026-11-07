/**
 * Security utilities for XSS prevention and data sanitization
 */

export const SecurityUtils = {
  /**
   * Sanitize HTML to prevent XSS attacks
   */
  sanitizeHTML: (html) => {
    if (!html) return '';
    
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
  },

  /**
   * Escape HTML entities
   */
  escapeHTML: (text) => {
    if (!text) return '';
    
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    
    return String(text).replace(/[&<>"']/g, (m) => map[m]);
  },

  /**
   * Validate and sanitize URL
   */
  sanitizeURL: (url) => {
    if (!url) return '';
    
    try {
      const parsed = new URL(url);
      // Only allow http and https protocols
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return '';
      }
      return parsed.href;
    } catch {
      return '';
    }
  },

  /**
   * Sanitize filename for safe storage
   */
  sanitizeFilename: (filename) => {
    if (!filename) return 'unnamed';
    
    return String(filename)
      .replace(/[^a-z0-9.-]/gi, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 255);
  },

  /**
   * Check if string contains suspicious patterns
   */
  containsSuspiciousPatterns: (text) => {
    if (!text) return false;
    
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /eval\(/i,
      /expression\(/i
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(String(text)));
  },

  /**
   * Generate secure random string
   */
  generateSecureToken: (length = 32) => {
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  },

  /**
   * Validate email format
   */
  isValidEmail: (email) => {
    if (!email) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(String(email));
  },

  /**
   * Validate IP address
   */
  isValidIP: (ip) => {
    if (!ip) return false;
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(String(ip))) return false;
    
    const parts = String(ip).split('.');
    return parts.every(part => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  },

  /**
   * Redact sensitive data
   */
  redactSensitive: (text) => {
    if (!text) return '';
    
    let redacted = String(text);
    
    // Redact email addresses
    redacted = redacted.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]');
    
    // Redact phone numbers
    redacted = redacted.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE_REDACTED]');
    
    // Redact credit card numbers
    redacted = redacted.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD_REDACTED]');
    
    return redacted;
  }
};

export default SecurityUtils;