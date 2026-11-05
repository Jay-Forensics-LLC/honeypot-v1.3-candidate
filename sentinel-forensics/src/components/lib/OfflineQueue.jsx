import { logger } from '../utils/Logger';

/**
 * OFFLINE QUEUE MANAGER
 * Queues mutations when offline and retries when online
 * 
 * SECURITY FIX: 
 * - Max 100 operations (prevents infinite queue growth)
 * - Operations expire after 24 hours
 * - Failed operations removed after 3 retries
 */

const MAX_QUEUE_SIZE = 100;
const MAX_RETRY_COUNT = 3;
const OPERATION_TTL = 24 * 60 * 60 * 1000; // 24 hours

class OfflineQueue {
  constructor() {
    this.queue = this.loadQueue();
    this.isProcessing = false;
    this.listeners = [];
    
    // Listen for online/offline events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.processQueue());
      window.addEventListener('offline', () => logger.info('Offline mode activated'));
    }
  }

  /**
   * Add event listener
   */
  addListener(event, callback) {
    this.listeners.push({ event, callback });
  }

  /**
   * Remove event listener
   */
  removeListener(event, callback) {
    this.listeners = this.listeners.filter(
      l => !(l.event === event && l.callback === callback)
    );
  }

  /**
   * Emit event to listeners
   */
  emit(event, data) {
    this.listeners
      .filter(l => l.event === event)
      .forEach(l => l.callback(data));
  }

  /**
   * Load queue from storage
   */
  loadQueue() {
    try {
      const stored = localStorage.getItem('offline_queue');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Filter expired operations
        const now = Date.now();
        return parsed.filter(op => (now - op.timestamp) < OPERATION_TTL);
      }
    } catch (e) {
      logger.error('Failed to load offline queue', { error: e });
    }
    return [];
  }

  /**
   * Save queue to storage
   */
  saveQueue() {
    try {
      // Enforce max queue size (FIFO)
      const queue = this.queue.slice(-MAX_QUEUE_SIZE);
      localStorage.setItem('offline_queue', JSON.stringify(queue));
      this.queue = queue;
    } catch (e) {
      logger.error('Failed to save offline queue', { error: e });
    }
  }

  /**
   * Add operation to queue
   */
  enqueue(operation) {
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      logger.warn('Offline queue full, dropping oldest operation');
      this.queue.shift(); // Remove oldest
    }

    this.queue.push({
      ...operation,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      retryCount: 0
    });
    
    this.saveQueue();
    this.emit('enqueued', { queueSize: this.queue.length });
    logger.info('Operation queued for offline processing', { 
      operation: operation.type,
      queueSize: this.queue.length 
    });
  }

  /**
   * Process queue when back online
   */
  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    
    this.isProcessing = true;
    logger.info('Processing offline queue', { operations: this.queue.length });

    const results = {
      success: 0,
      failed: 0,
      expired: 0
    };

    while (this.queue.length > 0) {
      const operation = this.queue[0];
      
      // Check if expired
      if ((Date.now() - operation.timestamp) >= OPERATION_TTL) {
        logger.warn('Operation expired, removing from queue', { operation: operation.type });
        this.queue.shift();
        results.expired++;
        continue;
      }

      try {
        await operation.execute();
        logger.info('Offline operation succeeded', { operation: operation.type });
        this.queue.shift(); // Remove on success
        results.success++;
      } catch (error) {
        operation.retryCount++;
        logger.error('Offline operation failed', { 
          operation: operation.type,
          retryCount: operation.retryCount,
          error 
        });

        if (operation.retryCount >= MAX_RETRY_COUNT) {
          logger.error('Max retries reached, removing operation', { operation: operation.type });
          this.queue.shift();
          results.failed++;
        } else {
          // Move to end of queue for retry
          this.queue.push(this.queue.shift());
        }
      }

      this.saveQueue();
    }

    this.isProcessing = false;
    this.emit('processed', results);
    logger.info('Offline queue processing complete', results);
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      size: this.queue.length,
      operations: this.queue.map(op => ({
        type: op.type,
        timestamp: op.timestamp,
        retryCount: op.retryCount
      }))
    };
  }

  /**
   * Clear queue
   */
  clear() {
    this.queue = [];
    this.saveQueue();
    logger.info('Offline queue cleared');
  }
}

export const offlineQueue = new OfflineQueue();