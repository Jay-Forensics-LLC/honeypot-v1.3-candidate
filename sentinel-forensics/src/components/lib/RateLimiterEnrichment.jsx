/**
 * RATE LIMITER FOR ENRICHMENT PROVIDERS
 * Prevents API abuse and respects provider limits
 */

class RateLimiterEnrichment {
  constructor() {
    this.requests = new Map();
    this.limits = {
      internal: 60, // 60 requests per minute
      ipqs: 20,
      geoip: 30,
      asn: 30,
      tor_list: 60,
      disposable_email: 60
    };
  }

  async checkLimit(provider) {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window
    const limit = this.limits[provider] || 10;

    if (!this.requests.has(provider)) {
      this.requests.set(provider, []);
    }

    const requests = this.requests.get(provider);
    
    // Remove requests outside window
    const validRequests = requests.filter(time => now - time < windowMs);
    this.requests.set(provider, validRequests);

    if (validRequests.length >= limit) {
      const oldestRequest = Math.min(...validRequests);
      const waitMs = windowMs - (now - oldestRequest);
      throw new Error(`Rate limit exceeded for ${provider}. Retry in ${Math.ceil(waitMs / 1000)}s`);
    }

    // Record this request
    validRequests.push(now);
    return true;
  }

  getStats(provider) {
    const now = Date.now();
    const windowMs = 60 * 1000;
    const requests = this.requests.get(provider) || [];
    const validRequests = requests.filter(time => now - time < windowMs);

    return {
      current: validRequests.length,
      limit: this.limits[provider] || 10,
      remaining: Math.max(0, (this.limits[provider] || 10) - validRequests.length)
    };
  }
}

export const rateLimiterEnrichment = new RateLimiterEnrichment();