import { logger } from '../utils/logger';

/**
 * RATE LIMITER
 * Token bucket algorithm for API rate limiting
 */
export class RateLimiter {
  constructor(options = {}) {
    this.maxTokens = options.maxTokens || 100;
    this.refillRate = options.refillRate || 10; // tokens per second
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    this.queue = [];
    this.processing = false;
  }

  /**
   * Refill tokens based on time elapsed
   */
  refill() {
    const now = Date.now();
    const elapsedMs = now - this.lastRefill;
    const elapsedSec = elapsedMs / 1000;
    
    const tokensToAdd = elapsedSec * this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Acquire token (wait if needed)
   */
  async acquire(cost = 1) {
    return new Promise((resolve) => {
      this.queue.push({ cost, resolve });
      this.processQueue();
    });
  }

  /**
   * Process waiting requests
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      this.refill();

      const next = this.queue[0];
      
      if (this.tokens >= next.cost) {
        this.tokens -= next.cost;
        this.queue.shift();
        next.resolve();
      } else {
        // Wait for refill
        const tokensNeeded = next.cost - this.tokens;
        const waitMs = (tokensNeeded / this.refillRate) * 1000;
        
        logger.debug('Rate limit waiting', { 
          waitMs: Math.round(waitMs), 
          tokens: Math.round(this.tokens),
          needed: next.cost
        });
        
        await new Promise(resolve => setTimeout(resolve, Math.min(waitMs, 1000)));
      }
    }

    this.processing = false;
  }

  /**
   * Execute function with rate limiting
   */
  async execute(fn, cost = 1) {
    await this.acquire(cost);
    return await fn();
  }

  /**
   * Get current status
   */
  getStatus() {
    this.refill();
    return {
      tokens: Math.round(this.tokens),
      maxTokens: this.maxTokens,
      queueLength: this.queue.length,
      utilizationPercent: Math.round((1 - this.tokens / this.maxTokens) * 100)
    };
  }
}

/**
 * RATE LIMITER REGISTRY
 * Manage multiple rate limiters by name
 */
class RateLimiterRegistry {
  constructor() {
    this.limiters = new Map();
  }

  get(name, options) {
    if (!this.limiters.has(name)) {
      this.limiters.set(name, new RateLimiter(options));
    }
    return this.limiters.get(name);
  }

  getAllStatus() {
    const status = {};
    for (const [name, limiter] of this.limiters.entries()) {
      status[name] = limiter.getStatus();
    }
    return status;
  }
}

export const rateLimiterRegistry = new RateLimiterRegistry();

// Default limiters
export const apiLimiter = rateLimiterRegistry.get('api', { maxTokens: 100, refillRate: 10 });
export const mutationLimiter = rateLimiterRegistry.get('mutations', { maxTokens: 50, refillRate: 5 });