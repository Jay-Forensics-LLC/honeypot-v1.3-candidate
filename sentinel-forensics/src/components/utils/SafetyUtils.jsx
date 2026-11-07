/**
 * Safety utility functions to prevent null/undefined errors
 * Use these throughout the app for safe data handling
 */

export const SafetyUtils = {
  /**
   * Safely convert any value to string
   */
  safeString: (value, defaultValue = '') => {
    if (value === null || value === undefined) return defaultValue;
    return String(value);
  },

  /**
   * Safely replace text in a string
   */
  safeReplace: (value, searchValue, replaceValue, defaultValue = '') => {
    if (value === null || value === undefined) return defaultValue;
    try {
      return String(value).replace(searchValue, replaceValue);
    } catch {
      return defaultValue;
    }
  },

  /**
   * Safely format enum values (replace underscores with spaces, capitalize)
   */
  formatEnum: (value, defaultValue = 'N/A') => {
    if (value === null || value === undefined) return defaultValue;
    try {
      return String(value).replace(/_/g, ' ').toUpperCase();
    } catch {
      return defaultValue;
    }
  },

  /**
   * Safely format enum values (replace underscores with spaces, title case)
   */
  formatEnumTitle: (value, defaultValue = 'N/A') => {
    if (value === null || value === undefined) return defaultValue;
    try {
      return String(value)
        .replace(/_/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    } catch {
      return defaultValue;
    }
  },

  /**
   * Safely get nested property
   */
  safeGet: (obj, path, defaultValue = null) => {
    try {
      const keys = path.split('.');
      let result = obj;
      for (const key of keys) {
        if (result === null || result === undefined) return defaultValue;
        result = result[key];
      }
      return result === undefined ? defaultValue : result;
    } catch {
      return defaultValue;
    }
  },

  /**
   * Safely format date
   */
  safeDate: (date, defaultValue = 'N/A') => {
    if (!date) return defaultValue;
    try {
      return new Date(date).toLocaleDateString();
    } catch {
      return defaultValue;
    }
  },

  /**
   * Safely parse JSON
   */
  safeJSONParse: (jsonString, defaultValue = null) => {
    if (!jsonString) return defaultValue;
    try {
      return JSON.parse(jsonString);
    } catch {
      return defaultValue;
    }
  },

  /**
   * Safely stringify JSON
   */
  safeJSONStringify: (obj, defaultValue = '{}') => {
    if (obj === null || obj === undefined) return defaultValue;
    try {
      return JSON.stringify(obj);
    } catch {
      return defaultValue;
    }
  }
};

// Export individual functions for convenience
export const { 
  safeString, 
  safeReplace,
  formatEnum, 
  formatEnumTitle, 
  safeGet, 
  safeDate,
  safeJSONParse,
  safeJSONStringify
} = SafetyUtils;

export default SafetyUtils;