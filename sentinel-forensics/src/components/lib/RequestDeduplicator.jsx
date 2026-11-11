import { logger } from '../utils/Logger';

/**
 * REQUEST DEDUPLICATION
 * Prevents duplicate in-flight requests
 */
class RequestDeduplicator {
  constructor() {
    this.pending = new Map();
  }

  /**
   * Execute request with deduplication
   */
  async dedupe(key, requestFn) {
    // Check if request already in-flight
    if (this.pending.has(key)) {
      logger.debug('Request deduplicated (in-flight)', { key });
      return this.pending.get(key);
    }

    // Execute request and store promise
    const promise = requestFn()
      .then(result => {
        this.pending.delete(key);
        return result;
      })
      .catch(error => {
        this.pending.delete(key);
        throw error;
      });

    this.pending.set(key, promise);
    return promise;
  }

  /**
   * Clear pending request
   */
  clear(key) {
    this.pending.delete(key);
  }

  /**
   * Clear all pending requests
   */
  clearAll() {
    this.pending.clear();
  }

  /**
   * Get pending request count
   */
  getPendingCount() {
    return this.pending.size;
  }
}

export const requestDeduplicator = new RequestDeduplicator();