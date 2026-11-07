/**
 * Input Sanitization Utility
 * Prevents XSS, SQL injection, and command injection attacks
 * SECURITY PATCH: Enhanced XSS protection with HTML entity encoding
 */

export const InputSanitizer = {
  /**
   * Sanitize string input - comprehensive XSS protection
   */
  sanitizeString: (input, maxLength = 1000) => {
    if (!input || typeof input !== 'string') return '';
    
    // First decode any HTML entities to prevent double-encoding bypasses
    const decoded = input
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/');
    
    // Encode all HTML special characters
    const encoded = decoded
      .slice(0, maxLength)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;')
      .trim();
    
    return encoded;
  },

  /**
   * Sanitize email - validate format
   */
  sanitizeEmail: (email) => {
    if (!email || typeof email !== 'string') return '';
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const cleaned = email.toLowerCase().trim();
    
    return emailRegex.test(cleaned) ? cleaned : '';
  },

  /**
   * Sanitize URL - validate and prevent javascript: protocols
   */
  sanitizeURL: (url) => {
    if (!url || typeof url !== 'string') return '';
    
    const cleaned = url.trim();
    
    // Block dangerous protocols
    if (/^(javascript|data|vbscript):/i.test(cleaned)) {
      return '';
    }
    
    // Ensure HTTPS for external links
    if (cleaned.startsWith('http://')) {
      return cleaned.replace('http://', 'https://');
    }
    
    return cleaned;
  },

  /**
   * Sanitize filename - remove path traversal
   */
  sanitizeFilename: (filename) => {
    if (!filename || typeof filename !== 'string') return '';
    
    return filename
      .replace(/[/\\]/g, '') // Remove path separators
      .replace(/\.\./g, '') // Remove parent directory references
      .replace(/[<>:"|?*]/g, '') // Remove illegal filename chars
      .trim();
  },

  /**
   * Sanitize number input
   */
  sanitizeNumber: (input, min, max) => {
    const num = parseFloat(input);
    if (isNaN(num)) return min || 0;
    
    if (min !== undefined && num < min) return min;
    if (max !== undefined && num > max) return max;
    
    return num;
  },

  /**
   * Sanitize JSON input - prevent prototype pollution
   */
  sanitizeJSON: (jsonString) => {
    try {
      const parsed = JSON.parse(jsonString);
      
      // Remove __proto__, constructor, prototype keys
      const clean = (obj) => {
        if (typeof obj !== 'object' || obj === null) return obj;
        
        const cleaned = Array.isArray(obj) ? [] : {};
        
        for (const key in obj) {
          if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
          cleaned[key] = clean(obj[key]);
        }
        
        return cleaned;
      };
      
      return clean(parsed);
    } catch {
      return null;
    }
  },

  /**
   * Sanitize command input - prevent shell injection
   */
  sanitizeCommand: (cmd) => {
    if (!cmd || typeof cmd !== 'string') return '';
    
    // Remove shell metacharacters
    return cmd
      .replace(/[;&|`$(){}[\]<>]/g, '')
      .trim();
  }
};