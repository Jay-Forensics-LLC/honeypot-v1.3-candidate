/**
 * Runtime input validation to prevent bad data from crashing the app
 * Validates API responses, user inputs, and coerces types safely
 */

export const ValidationUtils = {
  /**
   * Validate and coerce string
   */
  validateString: (value, options = {}) => {
    const { defaultValue = '', maxLength = 10000, minLength = 0 } = options;
    
    if (value === null || value === undefined) return defaultValue;
    
    const str = String(value);
    if (str.length < minLength || str.length > maxLength) return defaultValue;
    
    return str;
  },

  /**
   * Validate and coerce number
   */
  validateNumber: (value, options = {}) => {
    const { defaultValue = 0, min = -Infinity, max = Infinity } = options;
    
    const num = Number(value);
    if (isNaN(num)) return defaultValue;
    if (num < min || num > max) return defaultValue;
    
    return num;
  },

  /**
   * Validate enum value
   */
  validateEnum: (value, allowedValues = [], defaultValue = null) => {
    if (!value) return defaultValue;
    const str = String(value).toLowerCase();
    
    const normalizedAllowed = allowedValues.map(v => String(v).toLowerCase());
    return normalizedAllowed.includes(str) ? value : defaultValue;
  },

  /**
   * Validate email format
   */
  validateEmail: (value, defaultValue = '') => {
    if (!value) return defaultValue;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(String(value)) ? String(value) : defaultValue;
  },

  /**
   * Validate URL format
   */
  validateURL: (value, defaultValue = '') => {
    if (!value) return defaultValue;
    try {
      new URL(String(value));
      return String(value);
    } catch {
      return defaultValue;
    }
  },

  /**
   * Validate date
   */
  validateDate: (value, defaultValue = null) => {
    if (!value) return defaultValue;
    try {
      const date = new Date(value);
      return isNaN(date.getTime()) ? defaultValue : date.toISOString();
    } catch {
      return defaultValue;
    }
  },

  /**
   * Validate array
   */
  validateArray: (value, options = {}) => {
    const { defaultValue = [], maxLength = 1000, itemValidator = null } = options;
    
    if (!Array.isArray(value)) return defaultValue;
    if (value.length > maxLength) return defaultValue;
    
    if (itemValidator) {
      return value.map(item => itemValidator(item)).filter(item => item !== null);
    }
    
    return value;
  },

  /**
   * Validate object schema
   */
  validateObject: (obj, schema = {}, options = {}) => {
    const { strict = false } = options;
    
    if (!obj || typeof obj !== 'object') return {};
    
    const validated = {};
    
    for (const [key, validator] of Object.entries(schema)) {
      if (key in obj) {
        validated[key] = validator(obj[key]);
      } else if (!strict) {
        validated[key] = validator(undefined);
      }
    }
    
    return validated;
  },

  /**
   * Sanitize HTML to prevent XSS
   */
  sanitizeHTML: (html, defaultValue = '') => {
    if (!html) return defaultValue;
    
    // Basic XSS prevention - strip script tags and event handlers
    const str = String(html);
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/javascript:/gi, '');
  },

  /**
   * Validate and limit clipboard input
   */
  sanitizeClipboard: (text, maxLength = 10000) => {
    if (!text) return '';
    const str = String(text);
    return str.slice(0, maxLength).trim();
  },

  /**
   * Validate API response shape
   */
  validateAPIResponse: (response, expectedShape = {}) => {
    if (!response || typeof response !== 'object') {
      return { valid: false, errors: ['Invalid response format'] };
    }

    const errors = [];
    const validated = {};

    for (const [key, type] of Object.entries(expectedShape)) {
      if (!(key in response)) {
        errors.push(`Missing required field: ${key}`);
        continue;
      }

      const value = response[key];
      const actualType = Array.isArray(value) ? 'array' : typeof value;

      if (actualType !== type) {
        errors.push(`Field ${key} expected ${type}, got ${actualType}`);
      } else {
        validated[key] = value;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      data: validated
    };
  },

  /**
   * Coerce severity enum safely
   */
  coerceSeverity: (value) => {
    return ValidationUtils.validateEnum(
      value,
      ['info', 'low', 'medium', 'high', 'critical'],
      'medium'
    );
  },

  /**
   * Coerce status enum safely
   */
  coerceStatus: (value) => {
    return ValidationUtils.validateEnum(
      value,
      ['new', 'investigating', 'confirmed', 'resolved', 'false_positive'],
      'new'
    );
  }
};

export default ValidationUtils;