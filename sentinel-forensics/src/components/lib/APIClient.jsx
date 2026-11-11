import { CircuitBreaker } from './CircuitBreaker';
import { requestCache } from './RequestCache';
import { requestDeduplicator } from './RequestDeduplicator';
import { retryHandler } from './RetryHandler';
import { apiLimiter } from './RateLimiter';
import { logger } from '../utils/Logger';

/**
 * ENHANCED API CLIENT
 * Wraps base44 SDK with caching, deduplication, and circuit breaking
 */

const breakers = new Map();

function getBreaker(name) {
  if (!breakers.has(name)) {
    breakers.set(name, new CircuitBreaker(name, {
      failureThreshold: 5,
      timeout: 10000,
      resetTimeout: 30000
    }));
  }
  return breakers.get(name);
}

/**
 * Enhanced query wrapper
 */
export async function enhancedQuery({
  queryKey,
  queryFn,
  cacheTTL = 300000,
  enableCache = true,
  enableDedup = true,
  enableCircuitBreaker = true,
  enableRetry = true,
  enableRateLimit = true,
  breakerName = 'default'
}) {
  const cacheKey = requestCache.generateKey(queryKey.join(':'));

  // Try cache first
  if (enableCache) {
    const cached = requestCache.get(cacheKey);
    if (cached) {
      logger.debug('Query cache hit', { queryKey });
      return cached;
    }
  }

  // Wrap request function with all layers
  const wrappedFn = async () => {
    // Layer 1: Rate limiting
    const rateLimitedFn = enableRateLimit
      ? () => apiLimiter.execute(queryFn)
      : queryFn;

    // Layer 2: Circuit breaker
    const breakerFn = enableCircuitBreaker
      ? async () => {
          const breaker = getBreaker(breakerName);
          return await breaker.execute(rateLimitedFn);
        }
      : rateLimitedFn;

    // Layer 3: Retry logic
    const result = enableRetry
      ? await retryHandler.execute(breakerFn, { queryKey })
      : await breakerFn();

    // Cache successful result
    if (enableCache && result) {
      requestCache.set(cacheKey, result, cacheTTL);
    }

    return result;
  };

  // Execute with deduplication
  if (enableDedup) {
    return await requestDeduplicator.dedupe(cacheKey, wrappedFn);
  }

  return await wrappedFn();
}

/**
 * Enhanced mutation wrapper
 */
export async function enhancedMutation({
  mutationFn,
  invalidatePatterns = [],
  enableCircuitBreaker = true,
  breakerName = 'mutations'
}) {
  const wrappedFn = async (...args) => {
    let result;

    if (enableCircuitBreaker) {
      const breaker = getBreaker(breakerName);
      result = await breaker.execute(() => mutationFn(...args));
    } else {
      result = await mutationFn(...args);
    }

    // Invalidate cache patterns
    invalidatePatterns.forEach(pattern => {
      requestCache.invalidate(pattern);
    });

    return result;
  };

  return wrappedFn;
}

/**
 * Batch request handler
 */
export async function batchRequests(requests, options = {}) {
  const {
    maxConcurrent = 5,
    delayMs = 0
  } = options;

  const results = [];
  const chunks = [];

  // Split into chunks
  for (let i = 0; i < requests.length; i += maxConcurrent) {
    chunks.push(requests.slice(i, i + maxConcurrent));
  }

  // Execute chunks with delay
  for (const chunk of chunks) {
    const chunkResults = await Promise.allSettled(
      chunk.map(req => req())
    );
    results.push(...chunkResults);

    if (delayMs > 0 && chunk !== chunks[chunks.length - 1]) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

/**
 * Prefetch helper
 */
export async function prefetch(queryKey, queryFn, cacheTTL = 300000) {
  const cacheKey = requestCache.generateKey(queryKey.join(':'));
  
  // Don't prefetch if already cached
  if (requestCache.get(cacheKey)) {
    return;
  }

  try {
    const result = await queryFn();
    requestCache.set(cacheKey, result, cacheTTL);
    logger.debug('Prefetched data', { queryKey });
  } catch (error) {
    logger.error('Prefetch failed', { queryKey, error });
  }
}