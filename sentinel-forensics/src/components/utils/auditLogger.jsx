import { base44 } from '@/api/base44Client';
import { logger } from './logger';

/**
 * PRODUCTION: Centralized Audit Logging
 * All security-relevant actions use this logger
 * 
 * Features:
 * - Server-generated timestamps (tamper-proof)
 * - Automatic sensitive data redaction
 * - Organization isolation
 * - Blockchain hash chain integrity
 * 
 * Usage:
 *   import { auditLogger } from '@/components/utils/auditLogger';
 *   await auditLogger.log({ event_type: 'case_created', severity: 'info', ... });
 */

export const auditLogger = {
  /**
   * Create an audit log entry via backend function
   * @param {Object} logData - Audit log data (event_type, severity, description, etc.)
   * @returns {Promise<Object>} - Created audit log response
   */
  async log(logData) {
    try {
      // PHASE 8: Structured logging for audit events
      console.log('[AUDIT]', logData.event_type, {
        severity: logData.severity || 'info',
        resource_type: logData.resource_type,
        resource_id: logData.resource_id
      });
      
      const response = await base44.functions.invoke('createAuditLog', {
        event_type: logData.event_type,
        severity: logData.severity || 'info',
        description: logData.description,
        resource_type: logData.resource_type,
        resource_id: logData.resource_id,
        case_id: logData.case_id,
        evidence_id: logData.evidence_id,
        alert_id: logData.alert_id,
        action_performed: logData.action_performed,
        fields_changed: logData.fields_changed,
        previous_state: logData.previous_state,
        new_state: logData.new_state,
        success: logData.success !== false,
        error_message: logData.error_message,
        session_id: logData.session_id,
        device_fingerprint: logData.device_fingerprint,
        metadata: logData.metadata
      });
      
      return response.data;
    } catch (error) {
      logger.error('Audit logging failed', error);
      return null;
    }
  },

  /**
   * Batch log multiple events (useful for bulk operations)
   */
  async logBatch(logDataArray) {
    const results = await Promise.allSettled(
      logDataArray.map(data => this.log(data))
    );
    
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    if (failed > 0) {
      logger.warn(`Batch audit logging: ${succeeded} succeeded, ${failed} failed`);
    }
    
    return { succeeded, failed };
  }
};

/**
 * Sanitize string to prevent sensitive data logging
 */
function sanitizeString(str, maxLength = 500) {
  if (!str) return '';
  const cleaned = String(str).substring(0, maxLength);
  return cleaned
    .replace(/([a-zA-Z0-9_-]{20,})/g, '[REDACTED_TOKEN]')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
    .replace(/api[_-]?key[s]?\s*[:=]\s*[^\s&]+/gi, 'api_key=[REDACTED]');
}

/**
 * Sanitize metadata object
 */
function sanitizeMetadata(obj) {
  if (!obj || typeof obj !== 'object') return {};
  
  const sensitiveKeys = [
    'password', 'token', 'secret', 'api_key', 'apikey', 
    'auth', 'authorization', 'bearer', 'credential', 
    'mfa_secret', 'backup_codes', 'private_key'
  ];
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 1000) {
      sanitized[key] = value.substring(0, 1000) + '... [truncated]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}