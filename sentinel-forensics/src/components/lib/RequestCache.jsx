import { logger } from '../utils/Logger';

/**
 * IN-MEMORY REQUEST CACHE
 * Fast memory cache with TTL and LRU eviction
 */
class RequestCache {
  constructor(maxSize = 100) {
    this.cache = new Map();
    this.accessOrder = new Map();
    this.maxSize = maxSize;
  }

  /**
   * Generate cache key from request params
   */
  generateKey(url, params = {}) {
    const sortedParams = JSON.stringify(params, Object.keys(params).sort());
    return `${url}:${sortedParams}`;
  }

  /**
   * Get cached value
   */
  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      return null;
    }

    // Update access order for LRU
    this.accessOrder.set(key, Date.now());
    return entry.data;
  }

  /**
   * Set cached value with TTL
   */
  set(key, data, ttlMs = 300000) {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
      createdAt: Date.now()
    });
    this.accessOrder.set(key, Date.now());
  }

  /**
   * Evict least recently used entry
   */
  evictOldest() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, time] of this.accessOrder.entries()) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.accessOrder.delete(oldestKey);
      logger.debug('Evicted cache entry (LRU)', { key: oldestKey });
    }
  }

  /**
   * Invalidate specific key or pattern
   */
  invalidate(pattern) {
    const keysToDelete = [];
    
    for (const key of this.cache.keys()) {
      if (typeof pattern === 'string' && key.includes(pattern)) {
        keysToDelete.push(key);
      } else if (pattern instanceof RegExp && pattern.test(key)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => {
      this.cache.delete(key);
      this.accessOrder.delete(key);
    });

    if (keysToDelete.length > 0) {
      logger.debug('Invalidated cache entries', { count: keysToDelete.length, pattern });
    }
  }

  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
    this.accessOrder.clear();
    logger.info('Cleared request cache');
  }

  /**
   * Get cache stats
   */
  getStats() {
    let expired = 0;
    const now = Date.now();

    for (const entry of this.cache.values()) {
      if (now > entry.expiresAt) {
        expired++;
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      expired,
      hitRate: this.hitRate || 0
    };
  }
}

export const requestCache = new RequestCache();