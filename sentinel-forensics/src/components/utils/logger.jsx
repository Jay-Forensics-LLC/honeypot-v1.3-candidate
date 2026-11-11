
/**
 * PRODUCTION: Centralized Logging Utility
 * Standardizes application logging with appropriate levels
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// BROWSER-SAFE: Use environment detection without Deno
const isProduction = typeof window !== 'undefined' && window.location?.hostname?.includes('base44.app');
const CURRENT_LEVEL = isProduction ? LOG_LEVELS.INFO : LOG_LEVELS.DEBUG;

export const logger = {
  debug: (message, ...args) => {
    if (CURRENT_LEVEL <= LOG_LEVELS.DEBUG) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  },

  info: (message, ...args) => {
    if (CURRENT_LEVEL <= LOG_LEVELS.INFO) {
      console.log(`[INFO] ${message}`, ...args);
    }
  },

  warn: (message, ...args) => {
    if (CURRENT_LEVEL <= LOG_LEVELS.WARN) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  },

  error: (message, error, ...args) => {
    if (CURRENT_LEVEL <= LOG_LEVELS.ERROR) {
      console.error(`[ERROR] ${message}`, error, ...args);
    }
  },

  /**
   * Log function entry (for debugging complex flows)
   */
  fnEnter: (fnName, params = {}) => {
    logger.debug(`→ Entering ${fnName}`, params);
  },

  /**
   * Log function exit (for debugging complex flows)
   */
  fnExit: (fnName, result = null) => {
    logger.debug(`← Exiting ${fnName}`, result);
  },

  /**
   * Log API call
   */
  apiCall: (method, endpoint, params = {}) => {
    logger.debug(`API ${method} ${endpoint}`, params);
  },

  /**
   * Log API response
   */
  apiResponse: (endpoint, status, duration = null) => {
    const msg = duration 
      ? `API Response ${endpoint} - ${status} (${duration}ms)`
      : `API Response ${endpoint} - ${status}`;
    logger.debug(msg);
  }
};

export default logger;
