import { container } from './Container';
import { EventTypes } from './EventBus';

/**
 * UNIFIED API TRANSPORT LAYER
 * Production-grade request handling with coalescing, batching, abort
 */
class TransportLayer {
  constructor() {
    this.pendingRequests = new Map();
    this.requestQueue = [];
    this.batchQueue = [];
    this.batchTimeout = null;
    this.maxBatchSize = 10;
    this.batchDelayMs = 50;
    this.controllers = new Map();
  }

  /**
   * Initialize with container
   */
  async init() {
    this.cache = await container.resolve('cache');
    this.logger = await container.resolve('logger');
    this.eventBus = await container.resolve('eventBus');
    this.circuitBreaker = await container.resolve('circuitBreaker');
  }

  /**
   * Execute request with full pipeline
   */
  async request(config) {
    const {
      url,
      method = 'GET',
      data = null,
      params = {},
      headers = {},
      cacheTTL = 300000,
      enableCache = true,
      enableCoalescing = true,
      enableRetry = true,
      enableCircuitBreaker = true,
      retryOptions = {},
      circuitBreakerName = 'default',
      signal = null
    } = config;

    const requestKey = this.generateRequestKey({ url, method, data, params });

    // Create abort controller
    const controller = new AbortController();
    this.controllers.set(requestKey, controller);

    // Link with provided signal
    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }

    try {
      // Check cache first
      if (enableCache && method === 'GET') {
        const cached = this.cache.get(requestKey);
        if (cached) {
          this.logger.debug('Transport cache hit', { url });
          return cached;
        }
      }

      // Coalesce duplicate in-flight requests
      if (enableCoalescing && this.pendingRequests.has(requestKey)) {
        this.logger.debug('Request coalesced', { url });
        return await this.pendingRequests.get(requestKey);
      }

      // Emit request start event
      await this.eventBus.emit(EventTypes.REQUEST_START, { url, method });

      // Execute request
      const requestPromise = this.executeRequest({
        url,
        method,
        data,
        params,
        headers,
        enableRetry,
        enableCircuitBreaker,
        retryOptions,
        circuitBreakerName,
        signal: controller.signal
      });

      // Store pending request for coalescing
      if (enableCoalescing) {
        this.pendingRequests.set(requestKey, requestPromise);
      }

      const result = await requestPromise;

      // Cache successful GET requests
      if (enableCache && method === 'GET' && result) {
        this.cache.set(requestKey, result, cacheTTL);
      }

      // Emit success event
      await this.eventBus.emit(EventTypes.REQUEST_SUCCESS, { url, method });

      return result;
    } catch (error) {
      // Emit error event
      await this.eventBus.emit(EventTypes.REQUEST_ERROR, { 
        url, 
        method, 
        error: error.message 
      });
      throw error;
    } finally {
      // Cleanup
      this.pendingRequests.delete(requestKey);
      this.controllers.delete(requestKey);
    }
  }

  /**
   * Execute request with retry and circuit breaker
   */
  async executeRequest(config) {
    const {
      url,
      method,
      data,
      params,
      headers,
      enableRetry,
      enableCircuitBreaker,
      retryOptions,
      circuitBreakerName,
      signal
    } = config;

    const requestFn = async () => {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: data ? JSON.stringify(data) : undefined,
        signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    };

    let result;

    // Apply circuit breaker
    if (enableCircuitBreaker) {
      const breaker = this.circuitBreaker.getBreaker(circuitBreakerName);
      result = await breaker.execute(requestFn);
    } else {
      result = await requestFn();
    }

    // Apply retry logic
    if (enableRetry && !result) {
      result = await this.retryWithBackoff(requestFn, retryOptions);
    }

    return result;
  }

  /**
   * Retry with exponential backoff
   */
  async retryWithBackoff(fn, options = {}) {
    const {
      maxRetries = 3,
      baseDelayMs = 1000,
      maxDelayMs = 10000,
      backoffMultiplier = 2
    } = options;

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt === maxRetries) {
          throw error;
        }

        const delay = Math.min(
          baseDelayMs * Math.pow(backoffMultiplier, attempt),
          maxDelayMs
        );

        // Add jitter
        const jitter = delay * Math.random() * 0.3;
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
      }
    }

    throw lastError;
  }

  /**
   * Batch multiple requests
   */
  async batch(requests, options = {}) {
    const {
      maxConcurrent = 5,
      delayMs = 0,
      failFast = false
    } = options;

    const results = [];
    const chunks = [];

    // Split into chunks
    for (let i = 0; i < requests.length; i += maxConcurrent) {
      chunks.push(requests.slice(i, i + maxConcurrent));
    }

    // Execute chunks
    for (const chunk of chunks) {
      const chunkPromises = chunk.map(config => this.request(config));

      const chunkResults = failFast
        ? await Promise.all(chunkPromises)
        : await Promise.allSettled(chunkPromises);

      results.push(...chunkResults);

      // Delay between chunks
      if (delayMs > 0 && chunk !== chunks[chunks.length - 1]) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }

  /**
   * Abort request by key
   */
  abort(requestKey) {
    const controller = this.controllers.get(requestKey);
    if (controller) {
      controller.abort();
      this.controllers.delete(requestKey);
      this.pendingRequests.delete(requestKey);
    }
  }

  /**
   * Abort all requests
   */
  abortAll() {
    for (const controller of this.controllers.values()) {
      controller.abort();
    }
    this.controllers.clear();
    this.pendingRequests.clear();
  }

  /**
   * Generate unique request key
   */
  generateRequestKey(config) {
    const { url, method, data, params } = config;
    const paramsStr = JSON.stringify(params, Object.keys(params).sort());
    const dataStr = data ? JSON.stringify(data) : '';
    return `${method}:${url}:${paramsStr}:${dataStr}`;
  }

  /**
   * Get pending request count
   */
  getPendingCount() {
    return this.pendingRequests.size;
  }

  /**
   * Clear all pending requests
   */
  clear() {
    this.abortAll();
    this.pendingRequests.clear();
    this.controllers.clear();
    this.requestQueue = [];
    this.batchQueue = [];
  }
}

// Global transport instance
export const transportLayer = new TransportLayer();

// Auto-initialize
if (typeof window !== 'undefined') {
  transportLayer.init().catch(console.error);
}