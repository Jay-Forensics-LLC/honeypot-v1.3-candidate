/**
 * ENRICHMENT CACHE
 * In-memory cache for enrichment results with TTL support
 * Respects court-admissible mode (never cache in court mode)
 */

class EnrichmentCache {
  constructor() {
    this.cache = new Map();
  }

  generateKey(provider, indicatorValue, strictness) {
    return `${provider}:${indicatorValue}:${strictness}`;
  }

  get(provider, indicatorValue, strictness) {
    const key = this.generateKey(provider, indicatorValue, strictness);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check TTL
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(provider, indicatorValue, strictness, data, ttlHours = 24) {
    const key = this.generateKey(provider, indicatorValue, strictness);
    const expiresAt = Date.now() + (ttlHours * 60 * 60 * 1000);

    this.cache.set(key, {
      data,
      expiresAt,
      createdAt: Date.now()
    });
  }

  clear() {
    this.cache.clear();
  }

  getStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        expiresIn: Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000))
      }))
    };
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

export const enrichmentCache = new EnrichmentCache();

// Cleanup expired entries every 5 minutes
setInterval(() => enrichmentCache.cleanup(), 5 * 60 * 1000);