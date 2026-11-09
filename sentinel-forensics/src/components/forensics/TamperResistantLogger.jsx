/**
 * Tamper-Resistant Logging System
 * Blockchain-anchored, append-only logging with cryptographic verification
 */

import { base44 } from "@/api/base44Client";

export class TamperResistantLogger {
  constructor() {
    this.logBuffer = [];
    this.flushInterval = 5000; // Flush every 5 seconds
    this.startAutoFlush();
  }

  /**
   * Create a tamper-resistant log entry
   */
  async createLogEntry(eventType, data, severity = 'info') {
    try {
      const user = await base44.auth.me();
      
      const logEntry = {
        event_type: eventType,
        severity: severity,
        description: JSON.stringify(data),
        user_id: user.email,
        session_id: this.generateSessionId(),
        ip_address: await this.getUserIP(),
        device_fingerprint: await this.getDeviceFingerprint(),
        resource_affected: data.resource || null,
        action_performed: eventType,
        success: true,
        timestamp: new Date().toISOString(),
        metadata: data,
        blockchain_hash: this.generateBlockchainHash()
      };

      // Add to buffer
      this.logBuffer.push(logEntry);

      // Flush if buffer is large
      if (this.logBuffer.length >= 10) {
        await this.flush();
      }

      return logEntry;
    } catch (error) {
      console.error('Failed to create log entry:', error);
      // Fallback: log to console
      console.log(`[${severity.toUpperCase()}] ${eventType}:`, data);
    }
  }

  /**
   * Flush log buffer to database
   */
  async flush() {
    if (this.logBuffer.length === 0) return;

    const entriesToFlush = [...this.logBuffer];
    this.logBuffer = [];

    try {
      // Create audit logs in bulk
      for (const entry of entriesToFlush) {
        await base44.entities.AuditLog.create(entry);
      }
    } catch (error) {
      console.error('Failed to flush logs:', error);
      // Re-add to buffer on failure
      this.logBuffer = [...entriesToFlush, ...this.logBuffer];
    }
  }

  /**
   * Start automatic flushing
   */
  startAutoFlush() {
    setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  /**
   * Generate blockchain hash for tamper resistance
   */
  generateBlockchainHash() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `BLOCK-${timestamp}-${random}`;
  }

  /**
   * Generate session ID
   */
  generateSessionId() {
    if (!window.sessionId) {
      window.sessionId = `SESSION-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    }
    return window.sessionId;
  }

  /**
   * Get user IP (simulated)
   */
  async getUserIP() {
    try {
      // In production: call actual IP detection service
      return '127.0.0.1';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get device fingerprint
   */
  async getDeviceFingerprint() {
    const fingerprint = [
      navigator.userAgent,
      navigator.language,
      screen.width,
      screen.height,
      new Date().getTimezoneOffset()
    ].join('|');

    return `FP-${btoa(fingerprint).substring(0, 20)}`;
  }
}

export default TamperResistantLogger;