/**
 * PHASE 4: Comprehensive Form Validation
 * Reusable validation rules and form state management
 */

export class FormValidator {
  constructor(rules = {}) {
    this.rules = rules;
    this.errors = {};
  }

  // Validate single field
  validateField(name, value) {
    const rule = this.rules[name];
    if (!rule) return { valid: true };

    const errors = [];

    // Required validation
    if (rule.required && (!value || String(value).trim() === '')) {
      errors.push(`${rule.label || name} is required`);
    }

    // Min length validation
    if (rule.minLength && String(value).length < rule.minLength) {
      errors.push(`${rule.label || name} must be at least ${rule.minLength} characters`);
    }

    // Max length validation
    if (rule.maxLength && String(value).length > rule.maxLength) {
      errors.push(`${rule.label || name} must be at most ${rule.maxLength} characters`);
    }

    // Pattern validation
    if (rule.pattern && !rule.pattern.test(value)) {
      errors.push(rule.patternMessage || `${rule.label || name} format is invalid`);
    }

    // Custom validation
    if (rule.validate && typeof rule.validate === 'function') {
      const customError = rule.validate(value);
      if (customError) {
        errors.push(customError);
      }
    }

    // Min/Max for numbers
    if (rule.min !== undefined) {
      const num = Number(value);
      if (!isNaN(num) && num < rule.min) {
        errors.push(`${rule.label || name} must be at least ${rule.min}`);
      }
    }

    if (rule.max !== undefined) {
      const num = Number(value);
      if (!isNaN(num) && num > rule.max) {
        errors.push(`${rule.label || name} must be at most ${rule.max}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Validate all fields
  validateForm(data) {
    const allErrors = {};
    let isValid = true;

    for (const [name, rule] of Object.entries(this.rules)) {
      const result = this.validateField(name, data[name]);
      if (!result.valid) {
        allErrors[name] = result.errors;
        isValid = false;
      }
    }

    this.errors = allErrors;
    return {
      valid: isValid,
      errors: allErrors
    };
  }

  // Get errors for a field
  getFieldErrors(name) {
    return this.errors[name] || [];
  }

  // Check if field has errors
  hasFieldError(name) {
    return this.errors[name] && this.errors[name].length > 0;
  }

  // Clear all errors
  clearErrors() {
    this.errors = {};
  }

  // Clear specific field error
  clearFieldError(name) {
    delete this.errors[name];
  }
}

// Common validation rules
export const ValidationRules = {
  email: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    patternMessage: 'Invalid email format'
  },

  phone: {
    pattern: /^\+?[1-9]\d{1,14}$/,
    patternMessage: 'Invalid phone number'
  },

  url: {
    validate: (value) => {
      try {
        new URL(value);
        return null;
      } catch {
        return 'Invalid URL';
      }
    }
  },

  ipv4: {
    pattern: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
    patternMessage: 'Invalid IPv4 address'
  },

  alphanumeric: {
    pattern: /^[a-zA-Z0-9]+$/,
    patternMessage: 'Only letters and numbers allowed'
  },

  noSpecialChars: {
    pattern: /^[a-zA-Z0-9\s]+$/,
    patternMessage: 'Special characters not allowed'
  },

  strongPassword: {
    minLength: 12,
    validate: (value) => {
      const hasUpper = /[A-Z]/.test(value);
      const hasLower = /[a-z]/.test(value);
      const hasNumber = /[0-9]/.test(value);
      const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(value);

      if (!hasUpper || !hasLower || !hasNumber || !hasSpecial) {
        return 'Password must contain uppercase, lowercase, number, and special character';
      }
      return null;
    }
  }
};

// React hook for form validation
export function useFormValidation(rules) {
  const [validator] = React.useState(() => new FormValidator(rules));
  const [errors, setErrors] = React.useState({});

  const validateField = React.useCallback((name, value) => {
    const result = validator.validateField(name, value);
    setErrors(prev => ({
      ...prev,
      [name]: result.errors
    }));
    return result.valid;
  }, [validator]);

  const validateForm = React.useCallback((data) => {
    const result = validator.validateForm(data);
    setErrors(result.errors);
    return result.valid;
  }, [validator]);

  const clearErrors = React.useCallback(() => {
    validator.clearErrors();
    setErrors({});
  }, [validator]);

  const clearFieldError = React.useCallback((name) => {
    validator.clearFieldError(name);
    setErrors(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, [validator]);

  return {
    errors,
    validateField,
    validateForm,
    clearErrors,
    clearFieldError,
    hasError: (name) => errors[name] && errors[name].length > 0
  };
}

export default FormValidator;