/**
 * PHASE 4: XSS Protection Layer
 * Comprehensive XSS prevention utilities
 */

export class XSSProtection {
  // HTML entity encoding
  static encodeHTML(str) {
    if (!str) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;'
    };
    return String(str).replace(/[&<>"'/]/g, (s) => map[s]);
  }

  // Decode HTML entities
  static decodeHTML(str) {
    if (!str) return '';
    const txt = document.createElement('textarea');
    txt.innerHTML = str;
    return txt.value;
  }

  // Strip all HTML tags
  static stripHTML(str) {
    if (!str) return '';
    return String(str).replace(/<[^>]*>/g, '');
  }

  // Sanitize for attribute context
  static sanitizeAttribute(str) {
    if (!str) return '';
    return String(str)
      .replace(/[<>"'`=/]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '');
  }

  // Sanitize for URL context
  static sanitizeURL(url) {
    if (!url) return '';
    const cleaned = String(url).trim();
    
    // Block dangerous protocols
    const dangerousProtocols = [
      'javascript:',
      'data:',
      'vbscript:',
      'file:',
      'about:'
    ];
    
    if (dangerousProtocols.some(proto => cleaned.toLowerCase().startsWith(proto))) {
      return '';
    }
    
    return cleaned;
  }

  // Sanitize for JSON context
  static sanitizeJSON(obj) {
    if (!obj) return null;
    
    const clean = (value) => {
      if (value === null || value === undefined) return value;
      
      if (typeof value === 'string') {
        return this.encodeHTML(value);
      }
      
      if (Array.isArray(value)) {
        return value.map(clean);
      }
      
      if (typeof value === 'object') {
        const cleaned = {};
        for (const key in value) {
          // Skip dangerous keys
          if (['__proto__', 'constructor', 'prototype'].includes(key)) {
            continue;
          }
          cleaned[key] = clean(value[key]);
        }
        return cleaned;
      }
      
      return value;
    };
    
    return clean(obj);
  }

  // Content Security Policy helper
  static getCSPDirectives() {
    return {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'https:'],
      'font-src': ["'self'", 'data:'],
      'connect-src': ["'self'", 'https:'],
      'frame-ancestors': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"]
    };
  }

  // Validate user input against XSS patterns
  static detectXSS(input) {
    if (!input) return { safe: true };
    
    const xssPatterns = [
      /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
      /<iframe[\s\S]*?>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<embed[\s\S]*?>/gi,
      /<object[\s\S]*?>/gi,
      /eval\s*\(/gi,
      /expression\s*\(/gi
    ];
    
    for (const pattern of xssPatterns) {
      if (pattern.test(input)) {
        return {
          safe: false,
          reason: `Potential XSS detected: ${pattern.toString()}`
        };
      }
    }
    
    return { safe: true };
  }
}

// React component for safe HTML rendering
export function SafeHTML({ html, className }) {
  const sanitized = XSSProtection.encodeHTML(html);
  return React.createElement('div', {
    className,
    dangerouslySetInnerHTML: { __html: sanitized }
  });
}

export default XSSProtection;