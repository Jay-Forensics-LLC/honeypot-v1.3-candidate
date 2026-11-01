/**
 * PHASE 8: Observability Logger
 * Structured logging for critical operations
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4
};

const CURRENT_LOG_LEVEL = LOG_LEVELS.INFO;

class ObservabilityLogger {
  constructor() {
    this.sessionId = this.generateSessionId();
    this.buffer = [];
    this.maxBufferSize = 100;
  }

  generateSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  formatLog(level, category, message, context = {}) {
    return {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      sessionId: this.sessionId,
      url: window.location.href,
      userAgent: navigator.userAgent.substring(0, 200),
      ...context
    };
  }

  log(level, category, message, context = {}) {
    if (LOG_LEVELS[level] < CURRENT_LOG_LEVEL) return;

    const logEntry = this.formatLog(level, category, message, context);
    
    // Console output
    const consoleMethod = level === 'ERROR' || level === 'CRITICAL' ? 'error' :
                         level === 'WARN' ? 'warn' :
                         level === 'DEBUG' ? 'debug' : 'log';
    
    console[consoleMethod](`[${level}] ${category}:`, message, context);

    // Buffer for batch sending
    this.buffer.push(logEntry);
    if (this.buffer.length >= this.maxBufferSize) {
      this.flush();
    }

    // Critical errors - send immediately
    if (level === 'CRITICAL') {
      this.sendLog(logEntry);
    }
  }

  debug(category, message, context) {
    this.log('DEBUG', category, message, context);
  }

  info(category, message, context) {
    this.log('INFO', category, message, context);
  }

  warn(category, message, context) {
    this.log('WARN', category, message, context);
  }

  error(category, message, context) {
    this.log('ERROR', category, message, context);
  }

  critical(category, message, context) {
    this.log('CRITICAL', category, message, context);
  }

  // Structured logging for specific operations

  logBillingEvent(event, details) {
    this.info('BILLING', event, {
      subscription_tier: details.tier,
      subscription_status: details.status,
      stripe_customer_id: details.customerId,
      amount: details.amount,
      currency: details.currency
    });
  }

  logWebhookEvent(event, details) {
    this.info('WEBHOOK', event, {
      webhook_type: details.type,
      webhook_id: details.id,
      status: details.status,
      processing_time_ms: details.processingTime
    });
  }

  logReferralEvent(event, details) {
    this.info('REFERRAL', event, {
      referral_code: details.code,
      referrer_email: details.referrerEmail,
      referee_email: details.refereeEmail,
      status: details.status,
      commission: details.commission
    });
  }

  logSecurityEvent(event, details) {
    this.warn('SECURITY', event, {
      event_type: details.eventType,
      severity: details.severity,
      user_email: details.userEmail,
      ip_address: details.ipAddress,
      resource_type: details.resourceType,
      resource_id: details.resourceId
    });
  }

  logPerformanceMetric(metric, details) {
    this.debug('PERFORMANCE', metric, {
      metric_name: metric,
      value: details.value,
      unit: details.unit,
      page: details.page,
      component: details.component
    });
  }

  logAPICall(endpoint, details) {
    this.debug('API', endpoint, {
      method: details.method,
      status_code: details.statusCode,
      response_time_ms: details.responseTime,
      error: details.error
    });
  }

  logAuthEvent(event, details) {
    this.info('AUTH', event, {
      event_type: event,
      user_email: details.userEmail,
      mfa_enabled: details.mfaEnabled,
      login_method: details.loginMethod
    });
  }

  // Batch operations

  async flush() {
    if (this.buffer.length === 0) return;

    const logs = [...this.buffer];
    this.buffer = [];

    try {
      // Send to backend for persistence (if implemented)
      // await this.sendLogs(logs);
      
      // For now, just clear buffer
      console.debug(`Flushed ${logs.length} log entries`);
    } catch (error) {
      console.error('Failed to flush logs:', error);
      // Restore logs to buffer
      this.buffer = [...logs, ...this.buffer].slice(-this.maxBufferSize);
    }
  }

  async sendLog(logEntry) {
    try {
      // Implement backend logging endpoint
      // await fetch('/api/logs', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(logEntry)
      // });
      
      console.debug('Log sent:', logEntry);
    } catch (error) {
      console.error('Failed to send log:', error);
    }
  }

  // Error boundary integration

  logReactError(error, errorInfo) {
    this.error('REACT', error.message, {
      stack: error.stack,
      componentStack: errorInfo?.componentStack,
      error_boundary: true
    });
  }

  // Unhandled promise rejection

  logUnhandledRejection(reason, promise) {
    this.error('UNHANDLED_REJECTION', String(reason), {
      promise: String(promise),
      stack: reason?.stack
    });
  }
}

// Singleton instance
export const observabilityLogger = new ObservabilityLogger();

// Setup global error handlers
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    observabilityLogger.logUnhandledRejection(event.reason, event.promise);
  });

  window.addEventListener('error', (event) => {
    observabilityLogger.error('GLOBAL_ERROR', event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack
    });
  });
}

// Export convenience functions
export const logBilling = (event, details) => observabilityLogger.logBillingEvent(event, details);
export const logWebhook = (event, details) => observabilityLogger.logWebhookEvent(event, details);
export const logReferral = (event, details) => observabilityLogger.logReferralEvent(event, details);
export const logSecurity = (event, details) => observabilityLogger.logSecurityEvent(event, details);
export const logPerformance = (metric, details) => observabilityLogger.logPerformanceMetric(metric, details);
export const logAPI = (endpoint, details) => observabilityLogger.logAPICall(endpoint, details);
export const logAuth = (event, details) => observabilityLogger.logAuthEvent(event, details);