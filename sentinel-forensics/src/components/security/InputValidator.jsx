/**
 * Input Validation Utilities
 * Strict validation for all user inputs
 */

export const InputValidator = {
  // Email validation
  validateEmail: (email) => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!email || !emailRegex.test(email)) {
      return { valid: false, error: 'Invalid email format' };
    }
    return { valid: true };
  },

  // Password strength validation
  validatePassword: (password) => {
    const errors = [];
    
    if (!password || password.length < 12) {
      errors.push('Password must be at least 12 characters');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain uppercase letters');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain lowercase letters');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain numbers');
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain special characters');
    }
    
    // Check for common passwords
    const commonPasswords = ['password123', 'admin123', 'qwerty123'];
    if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
      errors.push('Password is too common');
    }

    return errors.length === 0 
      ? { valid: true } 
      : { valid: false, errors };
  },

  // Sanitize input to prevent XSS
  sanitizeInput: (input) => {
    if (!input) return '';
    return String(input)
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '')
      .trim();
  },

  // SQL injection prevention
  sanitizeSQL: (input) => {
    if (!input) return '';
    return String(input)
      .replace(/['";\\]/g, '')
      .replace(/--/g, '')
      .replace(/\/\*/g, '')
      .trim();
  },

  // Validate IP address
  validateIP: (ip) => {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::([0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4})$/;
    
    if (!ip || (!ipv4Regex.test(ip) && !ipv6Regex.test(ip))) {
      return { valid: false, error: 'Invalid IP address' };
    }
    return { valid: true };
  },

  // Validate URL
  validateURL: (url) => {
    try {
      new URL(url);
      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }
  },

  // Validate file upload
  validateFileUpload: (file, options = {}) => {
    const {
      maxSizeMB = 100,
      allowedTypes = ['image/*', 'application/pdf', 'text/*', 'application/json']
    } = options;

    if (!file) {
      return { valid: false, error: 'No file provided' };
    }

    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > maxSizeMB) {
      return { valid: false, error: `File size exceeds ${maxSizeMB}MB limit` };
    }

    const isAllowedType = allowedTypes.some(allowed => {
      if (allowed.endsWith('/*')) {
        const category = allowed.split('/')[0];
        return file.type.startsWith(category + '/');
      }
      return file.type === allowed;
    });

    if (!isAllowedType) {
      return { valid: false, error: 'File type not allowed' };
    }

    return { valid: true };
  },

  // Validate numeric input
  validateNumber: (value, min, max) => {
    const num = Number(value);
    if (isNaN(num)) {
      return { valid: false, error: 'Invalid number' };
    }
    if (min !== undefined && num < min) {
      return { valid: false, error: `Value must be at least ${min}` };
    }
    if (max !== undefined && num > max) {
      return { valid: false, error: `Value must be at most ${max}` };
    }
    return { valid: true };
  },

  // Validate date
  validateDate: (dateString) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return { valid: false, error: 'Invalid date' };
    }
    return { valid: true };
  },

  // Rate limiting check
  checkRateLimit: (key, limit = 10, windowMs = 60000) => {
    const now = Date.now();
    const storageKey = `ratelimit_${key}`;
    
    try {
      const stored = localStorage.getItem(storageKey);
      const data = stored ? JSON.parse(stored) : { count: 0, resetAt: now + windowMs };
      
      if (now > data.resetAt) {
        data.count = 1;
        data.resetAt = now + windowMs;
      } else {
        data.count++;
      }
      
      localStorage.setItem(storageKey, JSON.stringify(data));
      
      if (data.count > limit) {
        return { allowed: false, retryAfter: Math.ceil((data.resetAt - now) / 1000) };
      }
      
      return { allowed: true, remaining: limit - data.count };
    } catch {
      return { allowed: true };
    }
  }
};

export default InputValidator;