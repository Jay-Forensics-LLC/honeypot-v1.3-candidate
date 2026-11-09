/**
 * TRANSACTIONAL EVENT BUS
 * Production-grade event system with transactions and rollback
 */
class EventBus {
  constructor() {
    this.listeners = new Map();
    this.transactions = [];
    this.history = [];
    this.maxHistory = 100;
  }

  /**
   * Subscribe to event
   */
  on(event, handler, options = {}) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    const listener = {
      handler,
      once: options.once || false,
      priority: options.priority || 0,
      id: Math.random().toString(36).substr(2, 9)
    };

    const listeners = this.listeners.get(event);
    listeners.push(listener);
    
    // Sort by priority (higher first)
    listeners.sort((a, b) => b.priority - a.priority);

    // Return unsubscribe function
    return () => this.off(event, listener.id);
  }

  /**
   * Subscribe once
   */
  once(event, handler, options = {}) {
    return this.on(event, handler, { ...options, once: true });
  }

  /**
   * Unsubscribe from event
   */
  off(event, listenerId) {
    const listeners = this.listeners.get(event);
    if (!listeners) return;

    const index = listeners.findIndex(l => l.id === listenerId);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  }

  /**
   * Emit event
   */
  async emit(event, payload = {}, options = {}) {
    const { transactional = false, abortable = false } = options;

    const eventData = {
      event,
      payload,
      timestamp: Date.now(),
      id: Math.random().toString(36).substr(2, 9)
    };

    // Add to history
    this.addToHistory(eventData);

    // Start transaction if requested
    if (transactional) {
      this.beginTransaction(eventData);
    }

    const listeners = this.listeners.get(event) || [];
    const results = [];
    let aborted = false;

    try {
      for (const listener of listeners) {
        if (aborted) break;

        try {
          const result = await listener.handler(payload, eventData);
          results.push({ success: true, result });

          // Check for abort signal
          if (abortable && result === false) {
            aborted = true;
            if (transactional) {
              await this.rollbackTransaction();
            }
          }

          // Remove if once listener
          if (listener.once) {
            this.off(event, listener.id);
          }
        } catch (error) {
          results.push({ success: false, error });
          
          if (transactional) {
            await this.rollbackTransaction();
            throw error;
          }
        }
      }

      // Commit transaction if successful
      if (transactional && !aborted) {
        this.commitTransaction();
      }

      return { success: !aborted, results };
    } catch (error) {
      if (transactional) {
        await this.rollbackTransaction();
      }
      throw error;
    }
  }

  /**
   * Begin transaction
   */
  beginTransaction(eventData) {
    this.transactions.push({
      id: eventData.id,
      event: eventData.event,
      timestamp: eventData.timestamp,
      rollbackActions: []
    });
  }

  /**
   * Add rollback action to current transaction
   */
  addRollback(action) {
    const current = this.transactions[this.transactions.length - 1];
    if (current) {
      current.rollbackActions.push(action);
    }
  }

  /**
   * Commit transaction
   */
  commitTransaction() {
    this.transactions.pop();
  }

  /**
   * Rollback transaction
   */
  async rollbackTransaction() {
    const transaction = this.transactions.pop();
    if (!transaction) return;

    // Execute rollback actions in reverse order
    for (let i = transaction.rollbackActions.length - 1; i >= 0; i--) {
      try {
        await transaction.rollbackActions[i]();
      } catch (error) {
        console.error('Rollback action failed:', error);
      }
    }
  }

  /**
   * Add to event history
   */
  addToHistory(eventData) {
    this.history.unshift(eventData);
    if (this.history.length > this.maxHistory) {
      this.history.pop();
    }
  }

  /**
   * Get event history
   */
  getHistory(event = null, limit = 10) {
    let filtered = this.history;
    if (event) {
      filtered = filtered.filter(e => e.event === event);
    }
    return filtered.slice(0, limit);
  }

  /**
   * Clear all listeners
   */
  clear() {
    this.listeners.clear();
    this.transactions = [];
    this.history = [];
  }

  /**
   * Get listener count for event
   */
  getListenerCount(event) {
    return (this.listeners.get(event) || []).length;
  }

  /**
   * Get all registered events
   */
  getEvents() {
    return Array.from(this.listeners.keys());
  }
}

// Global event bus instance
export const eventBus = new EventBus();

// Common event types
export const EventTypes = {
  // Data events
  ENTITY_CREATED: 'entity:created',
  ENTITY_UPDATED: 'entity:updated',
  ENTITY_DELETED: 'entity:deleted',
  
  // Network events
  REQUEST_START: 'request:start',
  REQUEST_SUCCESS: 'request:success',
  REQUEST_ERROR: 'request:error',
  
  // Auth events
  USER_LOGIN: 'user:login',
  USER_LOGOUT: 'user:logout',
  SESSION_REFRESH: 'session:refresh',
  
  // Offline events
  OFFLINE_DETECTED: 'offline:detected',
  ONLINE_DETECTED: 'online:detected',
  SYNC_START: 'sync:start',
  SYNC_COMPLETE: 'sync:complete',
  
  // Performance events
  PERFORMANCE_WARNING: 'performance:warning',
  MEMORY_PRESSURE: 'memory:pressure',
  
  // Error events
  ERROR_OCCURRED: 'error:occurred',
  CRITICAL_ERROR: 'error:critical'
};