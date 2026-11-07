import { formatDistanceToNow, format, parseISO } from 'date-fns';

/**
 * Utility formatters for consistent data display
 */

export function formatRelativeTime(dateString) {
  if (!dateString) return 'Never';
  
  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
    return formatDistanceToNow(date, { addSuffix: true });
  } catch (error) {
    return 'Invalid date';
  }
}

export function formatDateTime(dateString) {
  if (!dateString) return 'N/A';
  
  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
    return format(date, 'MMM d, yyyy HH:mm:ss');
  } catch (error) {
    return 'Invalid date';
  }
}

export function formatDate(dateString) {
  if (!dateString) return 'N/A';
  
  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
    return format(date, 'MMM d, yyyy');
  } catch (error) {
    return 'Invalid date';
  }
}

export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
}

export function formatNumber(num) {
  if (!num && num !== 0) return 'N/A';
  
  return new Intl.NumberFormat('en-US').format(num);
}

export function formatPercentage(value, decimals = 1) {
  if (!value && value !== 0) return 'N/A';
  
  return `${parseFloat(value).toFixed(decimals)}%`;
}

export function formatDuration(ms) {
  if (!ms && ms !== 0) return 'N/A';
  
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  
  return `${(ms / 3600000).toFixed(1)}h`;
}

export function formatHash(hash, length = 16) {
  if (!hash) return 'N/A';
  
  return hash.substring(0, length) + '...';
}

export function formatIPAddress(ip) {
  if (!ip) return 'N/A';
  return ip;
}

export function formatThreatScore(score) {
  if (!score && score !== 0) return 'N/A';
  
  const level = score >= 75 ? 'CRITICAL' :
                score >= 50 ? 'HIGH' :
                score >= 25 ? 'MEDIUM' : 'LOW';
  
  return `${score}/100 (${level})`;
}

export function truncate(text, maxLength = 100) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  
  return text.substring(0, maxLength) + '...';
}

export default {
  formatRelativeTime,
  formatDateTime,
  formatDate,
  formatFileSize,
  formatNumber,
  formatPercentage,
  formatDuration,
  formatHash,
  formatIPAddress,
  formatThreatScore,
  truncate
};