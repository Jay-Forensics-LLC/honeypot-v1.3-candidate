/**
 * TAMPER-EVIDENT FORENSIC LOGGER
 * Cryptographic hashing with chain integrity
 */
class ForensicLogger {
  constructor() {
    this.eventChain = [];
    this.previousHash = null;
    this.sequenceNumber = 0;
    this.initialized = false;
  }

  /**
   * Initialize logger
   */
  async init() {
    if (this.initialized) return;
    
    // Load chain from storage
    await this.loadChain();
    this.initialized = true;
  }

  /**
   * Log forensic event with tamper-evident hash
   */
  async logEvent(event) {
    if (!this.initialized) {
      await this.init();
    }

    const timestamp = new Date().toISOString();
    const sequenceNumber = ++this.sequenceNumber;

    // Create event payload
    const eventPayload = {
      ...event,
      timestamp,
      sequenceNumber,
      previousHash: this.previousHash
    };

    // Calculate hash chain
    const hash = await this.calculateHash(eventPayload);
    const signedEvent = {
      ...eventPayload,
      hash,
      hashAlgorithm: 'SHA-256'
    };

    // Update chain
    this.eventChain.push(signedEvent);
    this.previousHash = hash;

    // Persist to storage
    await this.persistEvent(signedEvent);

    return signedEvent;
  }

  /**
   * Calculate SHA-256 hash
   */
  async calculateHash(data) {
    const encoder = new TextEncoder();
    const dataString = JSON.stringify(data, Object.keys(data).sort());
    const dataBuffer = encoder.encode(dataString);
    
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex;
  }

  /**
   * Verify chain integrity
   */
  async verifyChain() {
    const results = {
      valid: true,
      errors: [],
      checkedEvents: 0
    };

    let expectedPreviousHash = null;

    for (let i = 0; i < this.eventChain.length; i++) {
      const event = this.eventChain[i];
      results.checkedEvents++;

      // Check sequence
      if (event.sequenceNumber !== i + 1) {
        results.valid = false;
        results.errors.push({
          index: i,
          error: 'Sequence number mismatch',
          expected: i + 1,
          actual: event.sequenceNumber
        });
      }

      // Check previous hash
      if (event.previousHash !== expectedPreviousHash) {
        results.valid = false;
        results.errors.push({
          index: i,
          error: 'Hash chain broken',
          expected: expectedPreviousHash,
          actual: event.previousHash
        });
      }

      // Verify event hash
      const { hash, ...eventData } = event;
      const calculatedHash = await this.calculateHash(eventData);
      
      if (calculatedHash !== hash) {
        results.valid = false;
        results.errors.push({
          index: i,
          error: 'Event hash mismatch (tampering detected)',
          expected: hash,
          actual: calculatedHash
        });
      }

      expectedPreviousHash = event.hash;
    }

    return results;
  }

  /**
   * Export chain for forensic analysis
   */
  exportChain(format = 'json') {
    if (format === 'json') {
      return JSON.stringify(this.eventChain, null, 2);
    } else if (format === 'csv') {
      return this.exportAsCSV();
    }
    return null;
  }

  /**
   * Export as CSV
   */
  exportAsCSV() {
    if (this.eventChain.length === 0) return '';

    const headers = ['sequenceNumber', 'timestamp', 'eventType', 'hash', 'previousHash'];
    const rows = [headers.join(',')];

    for (const event of this.eventChain) {
      const row = headers.map(h => {
        const value = event[h] || '';
        return `"${String(value).replace(/"/g, '""')}"`;
      });
      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  /**
   * Persist event to IndexedDB
   */
  async persistEvent(event) {
    try {
      const { offlineDB } = await import('../lib/OfflineDB');
      await offlineDB.db.table('forensicLogs').add(event);
    } catch (error) {
      console.error('Failed to persist forensic event:', error);
    }
  }

  /**
   * Load chain from storage
   */
  async loadChain() {
    try {
      const { offlineDB } = await import('../lib/OfflineDB');
      const events = await offlineDB.db.table('forensicLogs')
        .orderBy('sequenceNumber')
        .toArray();
      
      this.eventChain = events;
      
      if (events.length > 0) {
        const lastEvent = events[events.length - 1];
        this.previousHash = lastEvent.hash;
        this.sequenceNumber = lastEvent.sequenceNumber;
      }
    } catch (error) {
      console.error('Failed to load forensic chain:', error);
    }
  }

  /**
   * Get chain statistics
   */
  getStats() {
    return {
      totalEvents: this.eventChain.length,
      sequenceNumber: this.sequenceNumber,
      lastHash: this.previousHash,
      firstEvent: this.eventChain[0]?.timestamp,
      lastEvent: this.eventChain[this.eventChain.length - 1]?.timestamp
    };
  }
}

// Global instance
export const forensicLogger = new ForensicLogger();

/**
 * EVENT NORMALIZATION SCHEMA
 * Standard format for all forensic events
 */
export class ForensicEvent {
  constructor(type, data = {}) {
    this.eventType = type;
    this.eventData = data;
    this.metadata = {
      source: 'sentinel-forensics',
      version: '1.0',
      userAgent: navigator.userAgent,
      url: window.location.href
    };
  }

  /**
   * Normalize event data
   */
  normalize() {
    return {
      eventType: this.eventType,
      eventData: this.sanitizeData(this.eventData),
      metadata: this.metadata,
      normalized: true
    };
  }

  /**
   * Sanitize sensitive data
   */
  sanitizeData(data) {
    const sanitized = { ...data };
    const sensitiveKeys = ['password', 'token', 'secret', 'apiKey'];

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        sanitized[key] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}

/**
 * Helper to log forensic events
 */
export async function logForensicEvent(type, data) {
  const event = new ForensicEvent(type, data);
  const normalized = event.normalize();
  return await forensicLogger.logEvent(normalized);
}

// Event types
export const ForensicEventTypes = {
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  EVIDENCE_UPLOAD: 'evidence.upload',
  EVIDENCE_ACCESS: 'evidence.access',
  EVIDENCE_DELETE: 'evidence.delete',
  CASE_CREATE: 'case.create',
  CASE_UPDATE: 'case.update',
  ALERT_TRIGGERED: 'alert.triggered',
  SECURITY_BREACH: 'security.breach',
  DATA_EXPORT: 'data.export',
  CONFIG_CHANGE: 'config.change'
};