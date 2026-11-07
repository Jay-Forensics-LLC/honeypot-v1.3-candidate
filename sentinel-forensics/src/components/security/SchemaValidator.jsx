import { InputSanitizer } from './InputSanitizer';

/**
 * Schema Validation Engine
 * Validates all data against entity schemas before database operations
 */

export const SchemaValidator = {
  /**
   * Validate data against JSON schema
   */
  validate: (data, schema) => {
    const errors = [];

    if (!schema || !schema.properties) {
      return { valid: true, errors: [], sanitizedData: data };
    }

    const sanitizedData = { ...data };

    // Check required fields
    if (schema.required && Array.isArray(schema.required)) {
      schema.required.forEach(field => {
        if (!(field in data) || data[field] === null || data[field] === undefined || data[field] === '') {
          errors.push(`Required field missing: ${field}`);
        }
      });
    }

    // Validate each property
    Object.entries(schema.properties).forEach(([key, propSchema]) => {
      if (!(key in data)) return;

      const value = data[key];

      // Type validation
      if (propSchema.type) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        
        if (propSchema.type === 'string' && actualType !== 'string') {
          errors.push(`Field ${key}: expected string, got ${actualType}`);
        } else if (propSchema.type === 'number' && actualType !== 'number') {
          errors.push(`Field ${key}: expected number, got ${actualType}`);
        } else if (propSchema.type === 'boolean' && actualType !== 'boolean') {
          errors.push(`Field ${key}: expected boolean, got ${actualType}`);
        } else if (propSchema.type === 'array' && !Array.isArray(value)) {
          errors.push(`Field ${key}: expected array, got ${actualType}`);
        } else if (propSchema.type === 'object' && (actualType !== 'object' || Array.isArray(value))) {
          errors.push(`Field ${key}: expected object, got ${actualType}`);
        }
      }

      // Enum validation
      if (propSchema.enum && Array.isArray(propSchema.enum)) {
        if (!propSchema.enum.includes(value)) {
          errors.push(`Field ${key}: value must be one of [${propSchema.enum.join(', ')}]`);
        }
      }

      // String validations
      if (propSchema.type === 'string' && typeof value === 'string') {
        // Max length
        if (propSchema.maxLength && value.length > propSchema.maxLength) {
          errors.push(`Field ${key}: exceeds maximum length of ${propSchema.maxLength}`);
        }

        // Min length
        if (propSchema.minLength && value.length < propSchema.minLength) {
          errors.push(`Field ${key}: below minimum length of ${propSchema.minLength}`);
        }

        // Pattern/regex
        if (propSchema.pattern) {
          const regex = new RegExp(propSchema.pattern);
          if (!regex.test(value)) {
            errors.push(`Field ${key}: does not match required pattern`);
          }
        }

        // Format validation
        if (propSchema.format) {
          if (!validateFormat(value, propSchema.format)) {
            errors.push(`Field ${key}: invalid ${propSchema.format} format`);
          }
        }

        // Sanitize string
        sanitizedData[key] = InputSanitizer.sanitizeString(value, propSchema.maxLength || 10000);
      }

      // Number validations
      if (propSchema.type === 'number' && typeof value === 'number') {
        if (propSchema.minimum !== undefined && value < propSchema.minimum) {
          errors.push(`Field ${key}: below minimum value of ${propSchema.minimum}`);
        }

        if (propSchema.maximum !== undefined && value > propSchema.maximum) {
          errors.push(`Field ${key}: exceeds maximum value of ${propSchema.maximum}`);
        }
      }

      // Array validations
      if (propSchema.type === 'array' && Array.isArray(value)) {
        if (propSchema.minItems && value.length < propSchema.minItems) {
          errors.push(`Field ${key}: requires at least ${propSchema.minItems} items`);
        }

        if (propSchema.maxItems && value.length > propSchema.maxItems) {
          errors.push(`Field ${key}: exceeds maximum of ${propSchema.maxItems} items`);
        }

        // Validate array items
        if (propSchema.items && propSchema.items.type === 'string') {
          sanitizedData[key] = value.map(item => 
            InputSanitizer.sanitizeString(String(item), 1000)
          );
        }
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      sanitizedData
    };
  },

  /**
   * Validate format (date, email, url, etc.)
   */
  validateFormat: (value, format) => {
    switch (format) {
      case 'date':
        return !isNaN(new Date(value).getTime());
      case 'date-time':
        return !isNaN(new Date(value).getTime()) && value.includes('T');
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      case 'uri':
      case 'url':
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }
      case 'ipv4':
        return /^(\d{1,3}\.){3}\d{1,3}$/.test(value);
      case 'uuid':
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
      default:
        return true;
    }
  }
};

// Standalone format validator
function validateFormat(value, format) {
  return SchemaValidator.validateFormat(value, format);
}

export default SchemaValidator;