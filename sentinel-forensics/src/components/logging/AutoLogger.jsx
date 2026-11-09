import { base44 } from '@/api/base44Client';

/**
 * Comprehensive Auto-Logging System
 * Automatically logs ALL significant operations across Sentinel Forensics
 */

class AutoLogger {
  constructor() {
    this.enabled = true;
    this.logQueue = [];
    this.flushInterval = 5000; // Flush every 5 seconds
    this.startAutoFlush();
  }

  async log(eventType, severity, description, metadata = {}) {
    if (!this.enabled) return;

    const logEntry = {
      event_type: eventType,
      severity: severity || 'info',
      description: description,
      user_id: 'system', // Will be overridden with actual user
      timestamp: new Date().toISOString(),
      success: true,
      metadata: {
        ...metadata,
        user_agent: navigator.userAgent,
        platform: navigator.platform,
        viewport: `${window.innerWidth}x${window.innerHeight}`
      }
    };

    this.logQueue.push(logEntry);

    // If queue is large, flush immediately
    if (this.logQueue.length >= 10) {
      await this.flush();
    }
  }

  async flush() {
    if (this.logQueue.length === 0) return;

    const logsToSend = [...this.logQueue];
    this.logQueue = [];

    try {
      // Get current user
      let currentUser = 'system';
      try {
        const user = await base44.auth.me();
        currentUser = user?.email || 'system';
      } catch (e) {
        // User not logged in
      }

      // Send all logs
      for (const log of logsToSend) {
        try {
          await base44.entities.AuditLog.create({
            ...log,
            user_id: currentUser
          });
        } catch (error) {
          console.error('Failed to create audit log:', error);
        }
      }
    } catch (error) {
      console.error('Audit log flush failed:', error);
      // Put logs back in queue
      this.logQueue = [...logsToSend, ...this.logQueue];
    }
  }

  startAutoFlush() {
    setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  // Convenience methods for common operations
  async logPageView(pageName) {
    await this.log('page_viewed', 'info', `User viewed ${pageName}`, { page: pageName });
  }

  async logFeatureUsed(featureName, details = {}) {
    await this.log('feature_used', 'info', `User used ${featureName}`, { feature: featureName, ...details });
  }

  async logSecurityEvent(eventName, severity, details = {}) {
    await this.log(eventName, severity, `Security event: ${eventName}`, details);
  }

  async logDataOperation(operation, entityName, recordId, details = {}) {
    await this.log(
      `${entityName.toLowerCase()}_${operation}`,
      'info',
      `${operation} performed on ${entityName}`,
      { entity: entityName, record_id: recordId, operation, ...details }
    );
  }

  async logError(error, context = {}) {
    await this.log(
      'application_error',
      'error',
      `Error occurred: ${error.message}`,
      { error: error.toString(), stack: error.stack, ...context }
    );
  }

  async logIntegrationCall(integration, success, details = {}) {
    await this.log(
      'integration_called',
      success ? 'info' : 'warning',
      `${integration} integration called`,
      { integration, success, ...details }
    );
  }
}

// Create singleton instance
const autoLogger = new AutoLogger();

// Export functions for easy use
export const logPageView = (pageName) => autoLogger.logPageView(pageName);
export const logFeatureUsed = (featureName, details) => autoLogger.logFeatureUsed(featureName, details);
export const logSecurityEvent = (eventName, severity, details) => autoLogger.logSecurityEvent(eventName, severity, details);
export const logDataOperation = (operation, entityName, recordId, details) => autoLogger.logDataOperation(operation, entityName, recordId, details);
export const logError = (error, context) => autoLogger.logError(error, context);
export const logIntegrationCall = (integration, success, details) => autoLogger.logIntegrationCall(integration, success, details);

export default autoLogger;