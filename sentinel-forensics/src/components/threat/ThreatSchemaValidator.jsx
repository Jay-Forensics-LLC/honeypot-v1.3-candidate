/**
 * THREAT DATA SCHEMA VALIDATOR
 * Validates threat intelligence data against schemas
 */

const threatSchemas = {
  ip: {
    type: 'object',
    required: ['ip', 'sources', 'timestamp'],
    properties: {
      ip: { type: 'string', pattern: /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/ },
      sources: { type: 'object' },
      timestamp: { type: 'number' },
      threatScore: { type: 'number', min: 0, max: 100 }
    }
  },
  domain: {
    type: 'object',
    required: ['domain', 'sources', 'timestamp'],
    properties: {
      domain: { type: 'string' },
      sources: { type: 'object' },
      timestamp: { type: 'number' },
      threatScore: { type: 'number', min: 0, max: 100 }
    }
  },
  source: {
    type: 'object',
    properties: {
      provider: { type: 'string' },
      malicious: { type: 'boolean' },
      score: { type: 'number' },
      error: { type: 'string' }
    }
  }
};

/**
 * Validate threat data
 */
export function validateThreatData(data, schemaType = 'ip') {
  const schema = threatSchemas[schemaType];
  if (!schema) {
    throw new Error(`Unknown schema type: ${schemaType}`);
  }

  const errors = [];

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in data)) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  // Validate properties
  if (schema.properties) {
    for (const [field, rules] of Object.entries(schema.properties)) {
      if (field in data) {
        const value = data[field];
        
        // Type check
        if (rules.type && typeof value !== rules.type) {
          errors.push(`Invalid type for ${field}: expected ${rules.type}, got ${typeof value}`);
        }

        // Pattern check
        if (rules.pattern && !rules.pattern.test(value)) {
          errors.push(`Invalid format for ${field}`);
        }

        // Range check
        if (rules.min !== undefined && value < rules.min) {
          errors.push(`${field} below minimum: ${rules.min}`);
        }
        if (rules.max !== undefined && value > rules.max) {
          errors.push(`${field} above maximum: ${rules.max}`);
        }
      }
    }
  }

  // Validate sources
  if (data.sources && typeof data.sources === 'object') {
    for (const [provider, sourceData] of Object.entries(data.sources)) {
      const sourceErrors = validateSource(sourceData);
      errors.push(...sourceErrors.map(e => `${provider}: ${e}`));
    }
  }

  if (errors.length > 0) {
    console.warn('Validation errors:', errors);
    data._validationErrors = errors;
  }

  return {
    ...data,
    _validated: true,
    _validationErrors: errors
  };
}

/**
 * Validate source data
 */
function validateSource(source) {
  const errors = [];
  const schema = threatSchemas.source;

  for (const [field, rules] of Object.entries(schema.properties)) {
    if (field in source) {
      const value = source[field];
      
      if (rules.type && typeof value !== rules.type) {
        errors.push(`Invalid type for ${field}`);
      }
    }
  }

  return errors;
}

/**
 * Sanitize threat data
 */
export function sanitizeThreatData(data) {
  const sanitized = { ...data };

  // Remove sensitive fields
  delete sanitized._internal;
  delete sanitized.apiKey;

  // Truncate long strings
  const truncateLength = 1000;
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === 'string' && value.length > truncateLength) {
      sanitized[key] = value.substring(0, truncateLength) + '...';
    }
  }

  return sanitized;
}