import Dexie from 'dexie';
import { logger } from '../utils/logger';

/**
 * OFFLINE DATABASE LAYER
 * IndexedDB wrapper for offline data persistence
 */

class OfflineDatabase extends Dexie {
  constructor() {
    super('SentinelForensicsDB');
    
    // CRITICAL: Guard against server-side rendering or missing IndexedDB
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      this.isAvailable = false;
      // Don't call super methods if IndexedDB unavailable
      return;
    }
    
    this.isAvailable = true;
    
    // Version 2: Added forensic and security event stores
    this.version(2).stores({
      forensicLogs: '++id, sequenceNumber, timestamp, eventType',
      forensicEvents: '++id, timestamp, eventType',
      securityEvents: '++id, timestamp, eventType',
      auditEvents: '++id, timestamp, eventType',
      appendOnlyEvents: '++id, timestamp, eventType'
    });
    
    this.version(1).stores({
      // Cached API responses
      apiCache: 'url, data, timestamp, expiresAt',
      
      // Offline mutation queue
      mutationQueue: '++id, type, payload, timestamp, retryCount, status',
      
      // Entity caches (for offline access)
      cases: 'id, organization_id, updated_date',
      evidence: 'id, organization_id, case_id, updated_date',
      alerts: 'id, organization_id, updated_date',
      devices: 'id, organization_id, updated_date',
      
      // User data
      userData: 'key, value, timestamp',
      
      // Sync metadata
      syncStatus: 'entity, lastSyncTime, status'
    });
  }

  /**
   * Cache API response
   */
  async cacheResponse(url, data, ttlMs = 300000) {
    if (!this.isAvailable) return;
    try {
      const timestamp = Date.now();
      const expiresAt = timestamp + ttlMs;
      
      await this.apiCache.put({
        url,
        data,
        timestamp,
        expiresAt
      });
      
      logger.debug('Cached API response', { url, ttlMs });
    } catch (error) {
      logger.error('Failed to cache response', { url, error });
    }
  }

  /**
   * Get cached response if not expired
   */
  async getCachedResponse(url) {
    if (!this.isAvailable) return null;
    try {
      const cached = await this.apiCache.get(url);
      
      if (!cached) {
        logger.debug('Cache miss', { url });
        return null;
      }
      
      const now = Date.now();
      if (now > cached.expiresAt) {
        logger.debug('Cache expired', { url });
        await this.apiCache.delete(url);
        return null;
      }
      
      logger.debug('Cache hit', { url });
      return cached.data;
    } catch (error) {
      logger.error('Failed to get cached response', { url, error });
      return null;
    }
  }

  /**
   * Clear expired cache entries
   */
  async clearExpiredCache() {
    if (!this.isAvailable) return;
    try {
      const now = Date.now();
      const expired = await this.apiCache.where('expiresAt').below(now).count();
      await this.apiCache.where('expiresAt').below(now).delete();
      
      if (expired > 0) {
        logger.info('Cleared expired cache entries', { count: expired });
      }
    } catch (error) {
      logger.error('Failed to clear expired cache', { error });
    }
  }

  /**
   * Queue offline mutation
   */
  async queueMutation(type, payload) {
    if (!this.isAvailable) throw new Error('IndexedDB not available');
    try {
      const id = await this.mutationQueue.add({
        type,
        payload,
        timestamp: Date.now(),
        retryCount: 0,
        status: 'pending'
      });
      
      logger.info('Queued offline mutation', { id, type });
      return id;
    } catch (error) {
      logger.error('Failed to queue mutation', { type, error });
      throw error;
    }
  }

  /**
   * Get pending mutations
   */
  async getPendingMutations() {
    if (!this.isAvailable) return [];
    try {
      return await this.mutationQueue
        .where('status')
        .equals('pending')
        .sortBy('timestamp');
    } catch (error) {
      logger.error('Failed to get pending mutations', { error });
      return [];
    }
  }

  /**
   * Mark mutation as completed
   */
  async completeMutation(id) {
    if (!this.isAvailable) return;
    try {
      await this.mutationQueue.update(id, { status: 'completed' });
      logger.info('Marked mutation as completed', { id });
    } catch (error) {
      logger.error('Failed to complete mutation', { id, error });
    }
  }

  /**
   * Mark mutation as failed
   */
  async failMutation(id, error) {
    if (!this.isAvailable) return;
    try {
      await this.mutationQueue.update(id, {
        status: 'failed',
        error: error.message,
        failedAt: Date.now()
      });
      logger.warn('Marked mutation as failed', { id, error: error.message });
    } catch (err) {
      logger.error('Failed to mark mutation as failed', { id, error: err });
    }
  }

  /**
   * Increment retry count
   */
  async incrementRetry(id) {
    if (!this.isAvailable) return;
    try {
      const mutation = await this.mutationQueue.get(id);
      if (mutation) {
        await this.mutationQueue.update(id, {
          retryCount: mutation.retryCount + 1
        });
      }
    } catch (error) {
      logger.error('Failed to increment retry count', { id, error });
    }
  }

  /**
   * Cache entity data
   */
  async cacheEntity(entityName, data) {
    if (!this.isAvailable) return;
    try {
      const table = this[entityName];
      if (!table) {
        logger.warn('Unknown entity table', { entityName });
        return;
      }

      if (Array.isArray(data)) {
        await table.bulkPut(data);
        logger.debug('Cached entity batch', { entityName, count: data.length });
      } else {
        await table.put(data);
        logger.debug('Cached entity', { entityName, id: data.id });
      }
    } catch (error) {
      logger.error('Failed to cache entity', { entityName, error });
    }
  }

  /**
   * Get cached entities
   */
  async getCachedEntities(entityName, filter = {}) {
    if (!this.isAvailable) return [];
    try {
      const table = this[entityName];
      if (!table) {
        logger.warn('Unknown entity table', { entityName });
        return [];
      }

      let query = table.toCollection();
      
      // Apply filters
      Object.entries(filter).forEach(([key, value]) => {
        query = query.filter(item => item[key] === value);
      });

      const results = await query.toArray();
      logger.debug('Retrieved cached entities', { entityName, count: results.length });
      return results;
    } catch (error) {
      logger.error('Failed to get cached entities', { entityName, error });
      return [];
    }
  }

  /**
   * Update sync status
   */
  async updateSyncStatus(entity, status) {
    if (!this.isAvailable) return;
    try {
      await this.syncStatus.put({
        entity,
        lastSyncTime: Date.now(),
        status
      });
      logger.debug('Updated sync status', { entity, status });
    } catch (error) {
      logger.error('Failed to update sync status', { entity, error });
    }
  }

  /**
   * Get sync status
   */
  async getSyncStatus(entity) {
    if (!this.isAvailable) return null;
    try {
      return await this.syncStatus.get(entity);
    } catch (error) {
      logger.error('Failed to get sync status', { entity, error });
      return null;
    }
  }

  /**
   * Clear all data (for logout/reset)
   */
  async clearAll() {
    if (!this.isAvailable) return;
    try {
      await Promise.all([
        this.apiCache.clear(),
        this.mutationQueue.clear(),
        this.cases.clear(),
        this.evidence.clear(),
        this.alerts.clear(),
        this.devices.clear(),
        this.userData.clear(),
        this.syncStatus.clear()
      ]);
      logger.info('Cleared all offline data');
    } catch (error) {
      logger.error('Failed to clear offline data', { error });
    }
  }

  /**
   * Get database stats
   */
  async getStats() {
    if (!this.isAvailable) return null;
    try {
      const [
        cacheCount,
        queueCount,
        casesCount,
        evidenceCount,
        alertsCount,
        devicesCount
      ] = await Promise.all([
        this.apiCache.count(),
        this.mutationQueue.where('status').equals('pending').count(),
        this.cases.count(),
        this.evidence.count(),
        this.alerts.count(),
        this.devices.count()
      ]);

      return {
        cacheCount,
        queueCount,
        casesCount,
        evidenceCount,
        alertsCount,
        devicesCount
      };
    } catch (error) {
      logger.error('Failed to get database stats', { error });
      return null;
    }
  }
}

// CRITICAL: Lazy initialization to avoid indexedDB access at module load
let _offlineDB = null;

export const offlineDB = new Proxy({}, {
  get(target, prop) {
    // Initialize on first access
    if (!_offlineDB) {
      _offlineDB = new OfflineDatabase();
    }
    return _offlineDB[prop];
  }
});

// Periodic cache cleanup - deferred to avoid module-load errors
if (typeof window !== 'undefined') {
  setTimeout(() => {
    if (typeof indexedDB !== 'undefined' && offlineDB.isAvailable) {
      setInterval(() => {
        offlineDB.clearExpiredCache();
      }, 600000); // Every 10 minutes
    }
  }, 1000);
}