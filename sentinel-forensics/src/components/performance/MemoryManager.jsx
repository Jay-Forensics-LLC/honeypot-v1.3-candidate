import { logger } from '../utils/logger';

/**
 * MEMORY MANAGER
 * Monitors and manages memory usage
 */
class MemoryManager {
  constructor() {
    this.observers = [];
    this.threshold = 0.9; // 90% memory threshold
    this.checkInterval = 30000; // Check every 30s
    this.monitoring = false;
  }

  /**
   * Start memory monitoring
   */
  startMonitoring() {
    if (this.monitoring) return;
    
    this.monitoring = true;
    
    if (typeof window !== 'undefined' && 'memory' in performance) {
      this.monitorInterval = setInterval(() => {
        this.checkMemory();
      }, this.checkInterval);
      
      logger.info('Memory monitoring started');
    }
  }

  /**
   * Stop memory monitoring
   */
  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitoring = false;
      logger.info('Memory monitoring stopped');
    }
  }

  /**
   * Check current memory usage
   */
  checkMemory() {
    if (!('memory' in performance)) return;

    const memory = performance.memory;
    const usageRatio = memory.usedJSHeapSize / memory.jsHeapSizeLimit;

    if (usageRatio > this.threshold) {
      logger.warn('High memory usage detected', {
        used: Math.round(memory.usedJSHeapSize / 1048576) + 'MB',
        limit: Math.round(memory.jsHeapSizeLimit / 1048576) + 'MB',
        usagePercent: Math.round(usageRatio * 100)
      });

      this.notifyObservers({ usageRatio, memory });
    }
  }

  /**
   * Get current memory stats
   */
  getMemoryStats() {
    if (!('memory' in performance)) {
      return null;
    }

    const memory = performance.memory;
    return {
      used: Math.round(memory.usedJSHeapSize / 1048576),
      total: Math.round(memory.totalJSHeapSize / 1048576),
      limit: Math.round(memory.jsHeapSizeLimit / 1048576),
      usagePercent: Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100)
    };
  }

  /**
   * Register memory observer
   */
  onHighMemory(callback) {
    this.observers.push(callback);
  }

  /**
   * Notify observers
   */
  notifyObservers(data) {
    this.observers.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        logger.error('Memory observer error', { error });
      }
    });
  }

  /**
   * Trigger garbage collection (if available)
   */
  requestGC() {
    if (typeof window !== 'undefined' && window.gc) {
      logger.debug('Triggering garbage collection');
      window.gc();
    }
  }
}

export const memoryManager = new MemoryManager();