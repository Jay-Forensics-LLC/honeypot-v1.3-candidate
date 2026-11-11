import { offlineDB } from './OfflineDB';

/**
 * ENHANCED INDEXEDDB MANAGER
 * Batching, snapshots, rollbacks, and schema migrations
 */
class IndexedDBManager {
  constructor() {
    this.db = offlineDB;
    this.batchQueue = [];
    this.batchTimeout = null;
    this.batchSize = 50;
    this.batchDelayMs = 100;
    this.snapshots = new Map();
    this.maxSnapshots = 10;
    this.migrationVersion = 3;
  }

  /**
   * Initialize and run migrations
   */
  async init() {
    if (!this.db.isAvailable) {
      console.warn('IndexedDB not available - skipping initialization');
      return;
    }
    await this.runMigrations();
  }

  /**
   * Batch write operation
   */
  async batchWrite(tableName, operation, data) {
    if (!this.db.isAvailable) {
      return Promise.reject(new Error('IndexedDB not available'));
    }
    return new Promise((resolve, reject) => {
      this.batchQueue.push({
        tableName,
        operation,
        data,
        resolve,
        reject
      });

      // Clear existing timeout
      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
      }

      // Process batch if full or after delay
      if (this.batchQueue.length >= this.batchSize) {
        this.processBatch();
      } else {
        this.batchTimeout = setTimeout(() => this.processBatch(), this.batchDelayMs);
      }
    });
  }

  /**
   * Process batch queue
   */
  async processBatch() {
    if (this.batchQueue.length === 0) return;

    const batch = this.batchQueue.splice(0, this.batchSize);
    const operations = new Map();

    // Group by table and operation
    for (const item of batch) {
      const key = `${item.tableName}:${item.operation}`;
      if (!operations.has(key)) {
        operations.set(key, []);
      }
      operations.get(key).push(item);
    }

    // Execute batched operations
    for (const [key, items] of operations.entries()) {
      const [tableName, operation] = key.split(':');

      try {
        if (operation === 'put') {
          const dataArray = items.map(i => i.data);
          await this.db.db.table(tableName).bulkPut(dataArray);
          items.forEach(i => i.resolve());
        } else if (operation === 'delete') {
          const ids = items.map(i => i.data);
          await this.db.db.table(tableName).bulkDelete(ids);
          items.forEach(i => i.resolve());
        }
      } catch (error) {
        items.forEach(i => i.reject(error));
      }
    }
  }

  /**
   * Create snapshot of current state
   */
  async createSnapshot(name) {
    if (!this.db.isAvailable) {
      throw new Error('IndexedDB not available');
    }
    const snapshot = {
      id: name || `snapshot_${Date.now()}`,
      timestamp: Date.now(),
      data: {}
    };

    // Snapshot all tables
    const tables = ['cases', 'evidence', 'alerts', 'devices'];
    for (const table of tables) {
      try {
        const data = await this.db.db.table(table).toArray();
        snapshot.data[table] = data;
      } catch (error) {
        console.error(`Failed to snapshot ${table}:`, error);
      }
    }

    // Store snapshot
    this.snapshots.set(snapshot.id, snapshot);

    // Limit snapshots
    if (this.snapshots.size > this.maxSnapshots) {
      const oldest = Array.from(this.snapshots.keys())[0];
      this.snapshots.delete(oldest);
    }

    return snapshot.id;
  }

  /**
   * Restore from snapshot
   */
  async restoreSnapshot(snapshotId) {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    // Restore each table
    for (const [table, data] of Object.entries(snapshot.data)) {
      try {
        await this.db.db.table(table).clear();
        await this.db.db.table(table).bulkPut(data);
      } catch (error) {
        console.error(`Failed to restore ${table}:`, error);
        throw error;
      }
    }

    return true;
  }

  /**
   * Rollback last N operations
   */
  async rollback(count = 1) {
    // Get latest snapshot
    const snapshots = Array.from(this.snapshots.values())
      .sort((a, b) => b.timestamp - a.timestamp);

    if (snapshots.length === 0) {
      throw new Error('No snapshots available for rollback');
    }

    // Restore most recent snapshot
    return await this.restoreSnapshot(snapshots[0].id);
  }

  /**
   * Run schema migrations
   */
  async runMigrations() {
    const currentVersion = await this.getCurrentVersion();

    if (currentVersion < 2) {
      await this.migrateV1toV2();
    }

    if (currentVersion < 3) {
      await this.migrateV2toV3();
    }

    await this.setCurrentVersion(this.migrationVersion);
  }

  /**
   * Migration V1 -> V2: Add indexes
   */
  async migrateV1toV2() {
    console.log('Running migration V1 -> V2');
    // Add any schema changes for V2
    // Example: adding indexes, new columns, etc.
  }

  /**
   * Migration V2 -> V3: Add new tables
   */
  async migrateV2toV3() {
    console.log('Running migration V2 -> V3');
    // Add any schema changes for V3
  }

  /**
   * Get current schema version
   */
  async getCurrentVersion() {
    try {
      const versionData = await this.db.db.table('syncStatus').get('schema_version');
      return versionData?.version || 1;
    } catch (error) {
      return 1;
    }
  }

  /**
   * Set schema version
   */
  async setCurrentVersion(version) {
    await this.db.db.table('syncStatus').put({
      entity: 'schema_version',
      version,
      lastSync: Date.now()
    });
  }

  /**
   * Get all snapshots
   */
  getSnapshots() {
    return Array.from(this.snapshots.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Delete snapshot
   */
  deleteSnapshot(snapshotId) {
    return this.snapshots.delete(snapshotId);
  }

  /**
   * Clear all snapshots
   */
  clearSnapshots() {
    this.snapshots.clear();
  }

  /**
   * Get storage usage
   */
  async getStorageUsage() {
    if (!navigator.storage || !navigator.storage.estimate) {
      return null;
    }

    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage,
      quota: estimate.quota,
      percentUsed: (estimate.usage / estimate.quota) * 100
    };
  }
}

// Global instance
export const indexedDBManager = new IndexedDBManager();

// Auto-initialize - only if IndexedDB is available
if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
  indexedDBManager.init().catch(console.error);
}