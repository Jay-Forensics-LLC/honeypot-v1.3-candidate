/**
 * iOS-OPTIMIZED Date Utilities
 * Handles Safari's strict date parsing and prevents "Invalid Date" errors
 */
import { format, isValid, parseISO, formatDistanceToNow } from "date-fns";

export const DateUtils = {
  /**
   * Parse date with iOS Safari compatibility
   * Safari requires ISO 8601 format with 'T' separator, not space
   */
  parseDate: (date) => {
    if (!date) return null;
    
    try {
      // Already a Date object
      if (date instanceof Date) {
        return isValid(date) ? date : null;
      }
      
      // Handle string dates
      if (typeof date === 'string') {
        // iOS Safari Fix: Replace space with 'T' for datetime strings
        // "2025-10-29 14:30:00" → "2025-10-29T14:30:00"
        let normalized = date.trim();
        
        // If it has space between date and time, replace with 'T'
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(normalized)) {
          normalized = normalized.replace(' ', 'T');
        }
        
        // Add 'Z' if missing timezone for UTC
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized)) {
          normalized = normalized + 'Z';
        }
        
        const parsed = parseISO(normalized);
        return isValid(parsed) ? parsed : null;
      }
      
      // Handle timestamps (numbers)
      if (typeof date === 'number') {
        const dateObj = new Date(date);
        return isValid(dateObj) ? dateObj : null;
      }
      
      return null;
    } catch (error) {
      console.warn('Date parsing failed for:', date, error);
      return null;
    }
  },

  /**
   * Safely format date with fallback
   */
  safeFormat: (date, formatStr = 'MMM d, yyyy', fallback = 'N/A') => {
    if (!date) return fallback;
    
    try {
      const dateObj = DateUtils.parseDate(date);
      if (!dateObj) return fallback;
      
      return format(dateObj, formatStr);
    } catch (error) {
      console.warn('Date format error:', error);
      return fallback;
    }
  },

  /**
   * Format datetime with time
   */
  safeFormatDateTime: (date, fallback = 'N/A') => {
    return DateUtils.safeFormat(date, 'MMM d, yyyy HH:mm:ss', fallback);
  },

  /**
   * Format time only
   */
  safeFormatTime: (date, fallback = 'N/A') => {
    return DateUtils.safeFormat(date, 'HH:mm:ss', fallback);
  },

  /**
   * Format date only
   */
  safeFormatDate: (date, fallback = 'N/A') => {
    return DateUtils.safeFormat(date, 'MMM d, yyyy', fallback);
  },

  /**
   * Check if date is valid
   */
  isValidDate: (date) => {
    if (!date) return false;
    const dateObj = DateUtils.parseDate(date);
    return dateObj !== null;
  },

  /**
   * Get relative time (e.g., "2 hours ago")
   */
  safeRelativeTime: (date, fallback = 'N/A') => {
    if (!date) return fallback;
    
    try {
      const dateObj = DateUtils.parseDate(date);
      if (!dateObj) return fallback;
      
      return formatDistanceToNow(dateObj, { addSuffix: true });
    } catch (error) {
      console.warn('Relative time error:', error);
      return fallback;
    }
  },

  /**
   * Format with count for messages
   */
  safeFormatWithCount: (date, count, fallback = 'No messages') => {
    if (!date && (!count || count === 0)) return fallback;
    if (!date) return `${count} messages`;
    
    const formatted = DateUtils.safeRelativeTime(date, null);
    if (!formatted || formatted === 'N/A') {
      return count ? `${count} messages` : fallback;
    }
    
    return `${count || 0} messages • ${formatted}`;
  }
};

export const { 
  safeFormat, 
  safeFormatDateTime, 
  safeFormatTime, 
  safeFormatDate,
  isValidDate,
  safeRelativeTime,
  safeFormatWithCount,
  parseDate
} = DateUtils;

export default DateUtils;