/**
 * Centralized API Client Library for Sentinel Forensics
 * Provides typed, rate-limited, resilient access to all external APIs
 * 
 * Providers:
 * - Stripe (payments)
 * - Anthropic Claude (AI analysis)
 * - OpenAI GPT (AI fallback)
 * - VirusTotal (malware scanning)
 * - Shodan (network intelligence)
 * - Censys (internet scanning)
 * - HIBP (breach detection)
 * - WebSocket (agent communication)
 */

import { RateLimiter } from '../lib/rateLimiter';
import { CircuitBreaker } from '../lib/circuitBreaker';
import { RequestCache } from '../lib/requestCache';
import { base44 } from '@/api/base44Client';

// ============================================================================
// Configuration & Policies
// ============================================================================

export const API_POLICIES = {
  stripe: {
    rateLimit: { requests: 100, per: 'second' },
    timeout: 30000,
    retries: 3,
    cacheTTL: 0, // Never cache payment operations
  },
  anthropic: {
    rateLimit: { requests: 50, per: 'minute' },
    timeout: 120000, // 2 minutes for long analyses
    retries: 2,
    cacheTTL: 3600, // 1 hour for deterministic prompts
    costPerToken: 0.000008, // $8 per 1M tokens (Claude 3.5 Sonnet)
  },
  openai: {
    rateLimit: { requests: 60, per: 'minute' },
    timeout: 60000,
    retries: 2,
    cacheTTL: 3600,
    costPerToken: 0.000002, // $2 per 1M tokens (GPT-3.5)
  },
  virustotal: {
    rateLimit: { requests: 4, per: 'minute' }, // Free tier
    timeout: 30000,
    retries: 1,
    cacheTTL: 86400, // 24 hours for hash lookups
  },
  shodan: {
    rateLimit: { requests: 1, per: 'second' },
    timeout: 30000,
    retries: 2,
    cacheTTL: 604800, // 7 days
  },
  censys: {
    rateLimit: { requests: 120, per: 'minute' },
    timeout: 30000,
    retries: 2,
    cacheTTL: 604800,
  },
  hibp: {
    rateLimit: { requests: 1, per: '1500ms' }, // Very strict
    timeout: 10000,
    retries: 1,
    cacheTTL: 2592000, // 30 days
  },
  websocket: {
    rateLimit: { requests: 1000, per: 'minute' },
    timeout: 5000,
    retries: 5,
    cacheTTL: 0,
  },
};

// ============================================================================
// Base API Client with Resilience
// ============================================================================

class BaseAPIClient {
  constructor(providerName, policy) {
    this.providerName = providerName;
    this.policy = policy;
    this.limiter = new RateLimiter(policy.rateLimit);
    this.breaker = new CircuitBreaker({
      threshold: 5,
      timeout: 60000,
      resetTimeout: 30000,
    });
    this.cache = new RequestCache(policy.cacheTTL);
    this.metrics = {
      requests: 0,
      successes: 0,
      failures: 0,
      cacheHits: 0,
      totalLatency: 0,
      tokensUsed: 0,
      estimatedCost: 0,
    };
  }

  async executeWithResilience(key, fn, options = {}) {
    const startTime = Date.now();
    const cacheKey = this.cache.generateKey(key);
    
    // Check cache first
    if (options.cacheable !== false) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.metrics.cacheHits++;
        console.log(`[${this.providerName}] Cache hit:`, cacheKey);
        return cached;
      }
    }

    // Wait for rate limiter
    await this.limiter.acquire();

    // Check circuit breaker
    if (!this.breaker.canExecute()) {
      const error = new Error(`Circuit breaker open for ${this.providerName}`);
      error.code = 'CIRCUIT_OPEN';
      throw error;
    }

    this.metrics.requests++;

    try {
      // Execute with timeout
      const result = await this.withTimeout(fn(), this.policy.timeout);
      
      this.breaker.recordSuccess();
      this.metrics.successes++;
      this.metrics.totalLatency += Date.now() - startTime;

      // Cache successful results
      if (options.cacheable !== false) {
        this.cache.set(cacheKey, result);
      }

      // Log metrics
      this.logMetrics(key, Date.now() - startTime, 'success', null);

      return result;
    } catch (error) {
      this.breaker.recordFailure();
      this.metrics.failures++;
      this.metrics.totalLatency += Date.now() - startTime;

      // Handle rate limiting
      if (error.status === 429) {
        const retryAfter = error.headers?.['retry-after'] || 60;
        console.warn(`[${this.providerName}] Rate limited. Retry after ${retryAfter}s`);
        await this.sleep(retryAfter * 1000);
        
        // Retry once after backoff
        return this.executeWithResilience(key, fn, { ...options, _retryCount: 1 });
      }

      // Handle server errors with exponential backoff
      if (error.status >= 500 && (!options._retryCount || options._retryCount < this.policy.retries)) {
        const backoff = Math.min(1000 * Math.pow(2, options._retryCount || 0), 30000);
        const jitter = Math.random() * 1000;
        console.warn(`[${this.providerName}] Server error. Retrying in ${backoff + jitter}ms`);
        await this.sleep(backoff + jitter);
        
        return this.executeWithResilience(key, fn, {
          ...options,
          _retryCount: (options._retryCount || 0) + 1,
        });
      }

      this.logMetrics(key, Date.now() - startTime, 'failure', error);
      throw error;
    }
  }

  async withTimeout(promise, timeout) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeout)
      ),
    ]);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  logMetrics(endpoint, latency, status, error) {
    console.log(`[${this.providerName}] ${endpoint}:`, {
      latency_ms: latency,
      status,
      error: error?.message,
      cache_hit_rate: (this.metrics.cacheHits / this.metrics.requests * 100).toFixed(2) + '%',
      success_rate: (this.metrics.successes / this.metrics.requests * 100).toFixed(2) + '%',
      avg_latency: (this.metrics.totalLatency / this.metrics.requests).toFixed(0) + 'ms',
    });
  }

  getMetrics() {
    return {
      ...this.metrics,
      provider: this.providerName,
      cacheHitRate: this.metrics.cacheHits / Math.max(this.metrics.requests, 1),
      successRate: this.metrics.successes / Math.max(this.metrics.requests, 1),
      avgLatency: this.metrics.totalLatency / Math.max(this.metrics.requests, 1),
    };
  }
}

// ============================================================================
// Anthropic Claude Client
// ============================================================================

export class AnthropicClient extends BaseAPIClient {
  constructor() {
    super('anthropic', API_POLICIES.anthropic);
  }

  async generateForensicSummary(caseData, options = {}) {
    return this.executeWithResilience('forensic-summary', async () => {
      const response = await base44.functions.invoke('generateForensicSummary', {
        case_id: caseData.case_id,
        ...options,
      });

      // Track token usage and cost
      const tokens = response.data.tokens_used || 0;
      this.metrics.tokensUsed += tokens;
      this.metrics.estimatedCost += tokens * this.policy.costPerToken;

      return response.data;
    }, { cacheable: false }); // Don't cache forensic summaries
  }

  async analyzeEvidence(evidenceId, analysisType = 'comprehensive') {
    return this.executeWithResilience(`analyze-${evidenceId}`, async () => {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze this forensic evidence (ID: ${evidenceId}) with ${analysisType} analysis. 
                 Provide: 1) Summary, 2) Key findings, 3) Threat assessment, 4) Recommendations.`,
        add_context_from_internet: false,
        response_json_schema: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            key_findings: { type: 'array', items: { type: 'string' } },
            threat_level: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            recommendations: { type: 'array', items: { type: 'string' } },
          },
        },
      });

      return response;
    }, { cacheable: true });
  }

  async extractIOCs(text) {
    return this.executeWithResilience('extract-iocs', async () => {
      const response = await base44.functions.invoke('extractIOCs', { text });
      return response.data;
    }, { cacheable: true });
  }

  async triageAlert(alertData) {
    return this.executeWithResilience('triage-alert', async () => {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `Triage this security alert:
                 Type: ${alertData.alert_type}
                 Severity: ${alertData.severity}
                 Description: ${alertData.description}
                 Source: ${alertData.source}
                 
                 Provide: 1) Risk assessment, 2) Immediate actions, 3) Investigation steps.`,
        response_json_schema: {
          type: 'object',
          properties: {
            risk_level: { type: 'string' },
            immediate_actions: { type: 'array', items: { type: 'string' } },
            investigation_steps: { type: 'array', items: { type: 'string' } },
            estimated_impact: { type: 'string' },
          },
        },
      });

      return response;
    }, { cacheable: false });
  }
}

// ============================================================================
// OpenAI Client (Fallback & Quick Tasks)
// ============================================================================

export class OpenAIClient extends BaseAPIClient {
  constructor() {
    super('openai', API_POLICIES.openai);
  }

  async quickClassification(text, categories) {
    return this.executeWithResilience('classify', async () => {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `Classify the following into one of these categories: ${categories.join(', ')}\n\nText: ${text}`,
        response_json_schema: {
          type: 'object',
          properties: {
            category: { type: 'string', enum: categories },
            confidence: { type: 'number' },
            reasoning: { type: 'string' },
          },
        },
      });

      return response;
    }, { cacheable: true });
  }

  async generateAlertMessage(alertType, context) {
    return this.executeWithResilience('generate-alert', async () => {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `Generate a clear, actionable security alert message for:
                 Alert Type: ${alertType}
                 Context: ${JSON.stringify(context)}
                 
                 Keep it concise (max 2 sentences) and actionable.`,
      });

      return response;
    }, { cacheable: false });
  }
}

// ============================================================================
// VirusTotal Client
// ============================================================================

export class VirusTotalClient extends BaseAPIClient {
  constructor() {
    super('virustotal', API_POLICIES.virustotal);
  }

  async scanHash(hash, type = 'file') {
    return this.executeWithResilience(`scan-${hash}`, async () => {
      const response = await base44.functions.invoke('virusTotal', {
        hash,
        type,
      });

      return response.data;
    }, { cacheable: true });
  }

  async scanURL(url) {
    return this.executeWithResilience(`scan-url-${url}`, async () => {
      const response = await base44.functions.invoke('urlscan', {
        url,
        action: 'submit',
      });

      return response.data;
    }, { cacheable: true });
  }
}

// ============================================================================
// Shodan Client
// ============================================================================

export class ShodanClient extends BaseAPIClient {
  constructor() {
    super('shodan', API_POLICIES.shodan);
  }

  async lookupIP(ipAddress) {
    return this.executeWithResilience(`ip-${ipAddress}`, async () => {
      const response = await base44.functions.invoke('proxyShodan', {
        ip_address: ipAddress,
      });

      return response.data;
    }, { cacheable: true });
  }
}

// ============================================================================
// Censys Client
// ============================================================================

export class CensysClient extends BaseAPIClient {
  constructor() {
    super('censys', API_POLICIES.censys);
  }

  async searchHosts(query) {
    return this.executeWithResilience(`search-${query}`, async () => {
      const response = await base44.functions.invoke('proxyCensys', {
        query,
        search_type: 'hosts',
      });

      return response.data;
    }, { cacheable: true });
  }
}

// ============================================================================
// HIBP Client
// ============================================================================

export class HIBPClient extends BaseAPIClient {
  constructor() {
    super('hibp', API_POLICIES.hibp);
  }

  async checkBreach(email) {
    // K-anonymity: only store boolean result, not details
    return this.executeWithResilience(`breach-${email}`, async () => {
      const response = await base44.functions.invoke('proxyHIBP', {
        email,
      });

      return {
        breached: response.data.breaches?.length > 0,
        breach_count: response.data.breaches?.length || 0,
        // Never store actual breach details
      };
    }, { cacheable: true });
  }
}

// ============================================================================
// Stripe Client
// ============================================================================

export class StripeClient extends BaseAPIClient {
  constructor() {
    super('stripe', API_POLICIES.stripe);
    this.idempotencyKeys = new Map();
  }

  generateIdempotencyKey(operation, params) {
    const key = `${operation}-${JSON.stringify(params)}-${Date.now()}`;
    return key;
  }

  async createCheckoutSession(priceId, tier) {
    const idempotencyKey = this.generateIdempotencyKey('checkout', { priceId, tier });
    
    return this.executeWithResilience('create-checkout', async () => {
      const response = await base44.functions.invoke('createCheckoutSession', {
        priceId,
        tier,
        idempotency_key: idempotencyKey,
      });

      return response.data;
    }, { cacheable: false });
  }

  async verifySubscription(sessionId) {
    return this.executeWithResilience('verify-subscription', async () => {
      const response = await base44.functions.invoke('verifySubscription', {
        sessionId,
      });

      return response.data;
    }, { cacheable: false });
  }

  async cancelSubscription() {
    const idempotencyKey = this.generateIdempotencyKey('cancel', {});
    
    return this.executeWithResilience('cancel-subscription', async () => {
      const response = await base44.functions.invoke('cancelSubscription', {
        idempotency_key: idempotencyKey,
      });

      return response.data;
    }, { cacheable: false });
  }
}

// ============================================================================
// API Orchestrator (Singleton)
// ============================================================================

class APIOrchestrator {
  constructor() {
    this.clients = {
      anthropic: new AnthropicClient(),
      openai: new OpenAIClient(),
      virustotal: new VirusTotalClient(),
      shodan: new ShodanClient(),
      censys: new CensysClient(),
      hibp: new HIBPClient(),
      stripe: new StripeClient(),
    };

    this.quotas = {
      daily: {
        anthropic: { limit: 1000000, used: 0 }, // 1M tokens
        openai: { limit: 500000, used: 0 },
        virustotal: { limit: 500, used: 0 },
        shodan: { limit: 100, used: 0 },
        censys: { limit: 250, used: 0 },
        hibp: { limit: 100, used: 0 },
      },
    };

    // Reset quotas daily
    setInterval(() => this.resetQuotas(), 86400000);
  }

  resetQuotas() {
    Object.keys(this.quotas.daily).forEach(provider => {
      this.quotas.daily[provider].used = 0;
    });
    console.log('📊 Daily API quotas reset');
  }

  checkQuota(provider) {
    const quota = this.quotas.daily[provider];
    if (!quota) return true;

    if (quota.used >= quota.limit) {
      throw new Error(`Daily quota exceeded for ${provider}`);
    }

    quota.used++;
    return true;
  }

  async llmRouter(task, priority = 'normal') {
    // Route based on task complexity and cost
    const isComplexTask = task.length > 2000 || task.includes('detailed') || task.includes('comprehensive');
    
    try {
      if (isComplexTask || priority === 'high') {
        // Use Anthropic for complex analysis
        this.checkQuota('anthropic');
        return { provider: 'anthropic', client: this.clients.anthropic };
      } else {
        // Use OpenAI for quick tasks
        this.checkQuota('openai');
        return { provider: 'openai', client: this.clients.openai };
      }
    } catch (error) {
      // Fallback logic
      console.warn(`Primary LLM unavailable, falling back:`, error.message);
      
      if (isComplexTask) {
        return { provider: 'openai', client: this.clients.openai };
      } else {
        return { provider: 'anthropic', client: this.clients.anthropic };
      }
    }
  }

  getAllMetrics() {
    const metrics = {};
    Object.entries(this.clients).forEach(([name, client]) => {
      metrics[name] = client.getMetrics();
    });
    
    metrics.quotas = this.quotas;
    return metrics;
  }

  getProviderStatus() {
    const status = {};
    Object.entries(this.clients).forEach(([name, client]) => {
      status[name] = {
        healthy: client.breaker.canExecute(),
        metrics: client.getMetrics(),
        quotaRemaining: this.quotas.daily[name]?.limit - this.quotas.daily[name]?.used,
      };
    });
    return status;
  }
}

// Export singleton instance
export const apiOrchestrator = new APIOrchestrator();

// Export individual clients for direct access when needed
export const {
  anthropic,
  openai,
  virustotal,
  shodan,
  censys,
  hibp,
  stripe,
} = apiOrchestrator.clients;