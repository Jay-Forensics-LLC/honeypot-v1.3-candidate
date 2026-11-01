import { logger } from '../utils/logger';

/**
 * RETRY HANDLER
 * Exponential backoff with jitter
 */
export class RetryHandler {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelayMs = options.baseDelayMs || 1000;
    this.maxDelayMs = options.maxDelayMs || 10000;
    this.retryableStatuses = options.retryableStatuses || [408, 429, 500, 502, 503, 504];
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  calculateDelay(attempt) {
    const exponentialDelay = Math.min(
      this.baseDelayMs * Math.pow(2, attempt),
      this.maxDelayMs
    );
    
    // Add jitter (random 0-50% of delay)
    const jitter = exponentialDelay * Math.random() * 0.5;
    return exponentialDelay + jitter;
  }

  /**
   * Check if error is retryable
   */
  isRetryable(error) {
    // Network errors
    if (!error.response && error.request) {
      return true;
    }

    // Status code errors
    if (error.response?.status && this.retryableStatuses.includes(error.response.status)) {
      return true;
    }

    // Timeout errors
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return true;
    }

    return false;
  }

  /**
   * Execute function with retry logic
   */
  async execute(fn, context = {}) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await fn();
        
        if (attempt > 0) {
          logger.info('Retry succeeded', { attempt, context });
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        // Don't retry if not retryable or max retries reached
        if (!this.isRetryable(error) || attempt === this.maxRetries) {
          logger.error('Request failed (not retrying)', { 
            attempt, 
            error: error.message,
            retryable: this.isRetryable(error),
            context 
          });
          throw error;
        }

        // Calculate delay and wait
        const delayMs = this.calculateDelay(attempt);
        logger.warn('Request failed, retrying', { 
          attempt: attempt + 1, 
          maxRetries: this.maxRetries, 
          delayMs: Math.round(delayMs),
          error: error.message,
          context 
        });
        
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  }
}

// Export default instance
export const retryHandler = new RetryHandler();