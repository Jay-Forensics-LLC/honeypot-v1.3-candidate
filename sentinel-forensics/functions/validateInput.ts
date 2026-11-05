/**
 * PRODUCTION: Input Validation Utilities
 * Shared validation for all backend functions
 */

export const validators = {
  email: (email) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(email)) {
      throw new Error('Invalid email format');
    }
    return email.toLowerCase().trim();
  },

  url: (url) => {
    try {
      new URL(url);
      return url;
    } catch {
      throw new Error('Invalid URL format');
    }
  },

  uuid: (id) => {
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!regex.test(id)) {
      throw new Error('Invalid UUID format');
    }
    return id;
  },

  alphanumeric: (str, maxLength = 100) => {
    const cleaned = str.replace(/[^a-zA-Z0-9_-]/g, '');
    if (cleaned.length > maxLength) {
      throw new Error(`String exceeds maximum length of ${maxLength}`);
    }
    return cleaned;
  },

  ipAddress: (ip) => {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}$/i;
    
    if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) {
      throw new Error('Invalid IP address format');
    }
    return ip;
  },

  positiveInteger: (num) => {
    const parsed = parseInt(num);
    if (isNaN(parsed) || parsed < 0) {
      throw new Error('Must be a positive integer');
    }
    return parsed;
  },

  enumValue: (value, allowedValues) => {
    if (!allowedValues.includes(value)) {
      throw new Error(`Value must be one of: ${allowedValues.join(', ')}`);
    }
    return value;
  },

  sanitizeString: (str, maxLength = 1000) => {
    if (typeof str !== 'string') {
      throw new Error('Input must be a string');
    }
    // Remove null bytes and control characters
    const cleaned = str.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
    if (cleaned.length > maxLength) {
      return cleaned.substring(0, maxLength);
    }
    return cleaned;
  }
};

export function validateRequest(data, schema) {
  const validated = {};
  
  for (const [key, rules] of Object.entries(schema)) {
    const value = data[key];
    
    // Check required
    if (rules.required && (value === undefined || value === null || value === '')) {
      throw new Error(`${key} is required`);
    }
    
    // Skip validation if value is not provided and not required
    if (value === undefined || value === null) {
      continue;
    }
    
    // Apply validator
    if (rules.validator && validators[rules.validator]) {
      validated[key] = validators[rules.validator](value, rules.maxLength);
    } else {
      validated[key] = value;
    }
  }
  
  return validated;
}