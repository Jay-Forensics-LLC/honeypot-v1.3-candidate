/**
 * PRODUCTION: Secure Storage Utilities
 * Eliminates localStorage for sensitive data
 * All sensitive data goes through Base44 backend
 */

// Whitelist of safe localStorage keys (non-sensitive only)
const SAFE_STORAGE_KEYS = [
  'theme_preference',
  'sidebar_collapsed',
  'table_view_mode',
  'dashboard_layout'
];

export const secureStorage = {
  /**
   * Set non-sensitive UI preference
   */
  setPreference: (key, value) => {
    if (!SAFE_STORAGE_KEYS.includes(key)) {
      console.error(`Blocked attempt to store unsafe key: ${key}`);
      return false;
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Storage error:', error);
      return false;
    }
  },

  /**
   * Get non-sensitive UI preference
   */
  getPreference: (key, defaultValue = null) => {
    if (!SAFE_STORAGE_KEYS.includes(key)) {
      console.error(`Blocked attempt to read unsafe key: ${key}`);
      return defaultValue;
    }
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      return defaultValue;
    }
  },

  /**
   * Remove preference
   */
  removePreference: (key) => {
    if (!SAFE_STORAGE_KEYS.includes(key)) return false;
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      return false;
    }
  },

  /**
   * Clear all preferences
   */
  clearAll: () => {
    try {
      SAFE_STORAGE_KEYS.forEach(key => {
        localStorage.removeItem(key);
      });
      return true;
    } catch (error) {
      return false;
    }
  },

  /**
   * Audit and remove any unsafe keys
   */
  auditAndClean: () => {
    const removed = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && !SAFE_STORAGE_KEYS.includes(key)) {
          localStorage.removeItem(key);
          removed.push(key);
        }
      }
      if (removed.length > 0) {
        console.warn('Removed unsafe localStorage keys:', removed);
      }
      return removed;
    } catch (error) {
      console.error('Storage audit failed:', error);
      return [];
    }
  }
};

// Auto-clean on module load
if (typeof window !== 'undefined') {
  secureStorage.auditAndClean();
}