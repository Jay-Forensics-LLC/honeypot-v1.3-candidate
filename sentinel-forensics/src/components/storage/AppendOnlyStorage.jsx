/**
 * APPEND-ONLY EVENT STORAGE
 * Immutable storage with timestamp monotonicity and pruning
 */
class AppendOnlyStorage {
  constructor(options = {}) {
    this.storeName = options.storeName || 'appendOnlyEvents';
    this.maxEvents = options.maxEvents || 10000;
    this.retentionDays = options.retentionDays || 90;
    this.lastTimestamp = 0;
    this.eventCount = 0;
  }

  /**
   * Initialize storage
   */
  async init() {
    const { offlineDB } = await import('../lib/OfflineDB');
    this.db = offlineDB.db;
    
    // Load last timestamp
    const stats = await this.getStats();
    this.lastTimestamp = stats.lastTimestamp || 0;
    this.eventCount = stats.count || 0;
  }

  /**
   * Append event (immutable)
   */
  async append(event) {
    if (!this.db) {
      await this.init();
    }

    const now = Date.now();

    // Enforce timestamp monotonicity
    if (now <= this.lastTimestamp) {
      throw new Error('Timestamp monotonicity violation: clock skew detected');
    }

    const eventRecord = {
      ...event,
      id: `${now}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: now,
      appendedAt: new Date().toISOString(),
      immutable: true
    };

    // Store event
    await this.db.table(this.storeName).add(eventRecord);

    // Update state
    this.lastTimestamp = now;
    this.eventCount++;

    // Check if pruning needed
    if (this.eventCount > this.maxEvents) {
      await this.prune();
    }

    return eventRecord;
  }

  /**
   * Batch append multiple events
   */
  async batchAppend(events) {
    const records = [];
    let timestamp = Date.now();

    for (const event of events) {
      // Increment timestamp to maintain monotonicity
      timestamp++;

      records.push({
        ...event,
        id: `${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp,
        appendedAt: new Date().toISOString(),
        immutable: true
      });
    }

    await this.db.table(this.storeName).bulkAdd(records);
    
    this.lastTimestamp = timestamp;
    this.eventCount += records.length;

    return records;
  }

  /**
   * Query events
   */
  async query(options = {}) {
    const {
      startTime = 0,
      endTime = Date.now(),
      eventType = null,
      limit = 100,
      offset = 0
    } = options;

    let collection = this.db.table(this.storeName)
      .where('timestamp')
      .between(startTime, endTime, true, true);

    if (eventType) {
      collection = collection.filter(e => e.eventType === eventType);
    }

    const results = await collection
      .offset(offset)
      .limit(limit)
      .toArray();

    return results;
  }

  /**
   * Prune old events based on retention policy
   */
  async prune() {
    const cutoffTime = Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000);
    
    const deleted = await this.db.table(this.storeName)
      .where('timestamp')
      .below(cutoffTime)
      .delete();

    this.eventCount -= deleted;

    console.log(`Pruned ${deleted} old events (retention: ${this.retentionDays} days)`);
    
    return deleted;
  }

  /**
   * Get storage statistics
   */
  async getStats() {
    const count = await this.db.table(this.storeName).count();
    
    const oldest = await this.db.table(this.storeName)
      .orderBy('timestamp')
      .first();
    
    const newest = await this.db.table(this.storeName)
      .orderBy('timestamp')
      .last();

    return {
      count,
      oldestTimestamp: oldest?.timestamp || 0,
      lastTimestamp: newest?.timestamp || 0,
      oldestDate: oldest?.appendedAt || null,
      newestDate: newest?.appendedAt || null,
      retentionDays: this.retentionDays,
      maxEvents: this.maxEvents
    };
  }

  /**
   * Verify timestamp monotonicity
   */
  async verifyMonotonicity() {
    const events = await this.db.table(this.storeName)
      .orderBy('timestamp')
      .toArray();

    const violations = [];
    let prevTimestamp = 0;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      
      if (event.timestamp <= prevTimestamp) {
        violations.push({
          index: i,
          event: event.id,
          timestamp: event.timestamp,
          previousTimestamp: prevTimestamp,
          violation: 'Non-monotonic timestamp'
        });
      }

      prevTimestamp = event.timestamp;
    }

    return {
      valid: violations.length === 0,
      violations,
      checkedEvents: events.length
    };
  }

  /**
   * Export events for forensic analysis
   */
  async export(format = 'json') {
    const events = await this.db.table(this.storeName)
      .orderBy('timestamp')
      .toArray();

    if (format === 'json') {
      return JSON.stringify(events, null, 2);
    } else if (format === 'csv') {
      return this.exportAsCSV(events);
    }

    return events;
  }

  /**
   * Export as CSV
   */
  exportAsCSV(events) {
    if (events.length === 0) return '';

    const headers = ['id', 'timestamp', 'appendedAt', 'eventType'];
    const rows = [headers.join(',')];

    for (const event of events) {
      const row = headers.map(h => {
        const value = event[h] || '';
        return `"${String(value).replace(/"/g, '""')}"`;
      });
      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  /**
   * Clear all events (dangerous - requires confirmation)
   */
  async clearAll(confirmationToken) {
    if (confirmationToken !== 'CONFIRM_CLEAR_ALL') {
      throw new Error('Confirmation token required to clear append-only storage');
    }

    const count = await this.db.table(this.storeName).count();
    await this.db.table(this.storeName).clear();
    
    this.eventCount = 0;
    this.lastTimestamp = 0;

    console.warn(`⚠️ Cleared ${count} events from append-only storage`);
    return count;
  }
}

// Global instances for different event types
export const forensicEventStorage = new AppendOnlyStorage({
  storeName: 'forensicEvents',
  maxEvents: 50000,
  retentionDays: 365
});

export const securityEventStorage = new AppendOnlyStorage({
  storeName: 'securityEvents',
  maxEvents: 10000,
  retentionDays: 90
});

export const auditEventStorage = new AppendOnlyStorage({
  storeName: 'auditEvents',
  maxEvents: 100000,
  retentionDays: 730 // 2 years
});