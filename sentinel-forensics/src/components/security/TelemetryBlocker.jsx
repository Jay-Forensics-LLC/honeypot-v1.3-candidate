/**
 * TELEMETRY BLOCKER
 * Network-level blocking via Service Worker interception
 */
class TelemetryBlocker {
  constructor() {
    this.enabled = false;
    this.blockedDomains = new Set([
      'google-analytics.com',
      'analytics.google.com',
      'facebook.com',
      'doubleclick.net',
      'googletagmanager.com',
      'mixpanel.com',
      'hotjar.com',
      'segment.com',
      'amplitude.com'
    ]);
    this.blockedPatterns = [
      /analytics/i,
      /tracking/i,
      /telemetry/i,
      /beacon/i,
      /collect/i,
      /pixel/i
    ];
    this.blockLog = [];
  }

  /**
   * Initialize blocker
   */
  async init() {
    // Check if service workers are supported
    if (!('serviceWorker' in navigator)) {
      console.warn('Service Workers not supported - telemetry blocking limited');
      return false;
    }

    try {
      // Register service worker for network interception
      const registration = await navigator.serviceWorker.register('/telemetry-blocker-sw.js');
      console.log('Telemetry blocker service worker registered');
      
      this.enabled = true;
      return true;
    } catch (error) {
      console.error('Failed to register telemetry blocker:', error);
      return false;
    }
  }

  /**
   * Check if URL should be blocked
   */
  shouldBlock(url) {
    try {
      const urlObj = new URL(url);
      
      // Check blocked domains
      if (this.blockedDomains.has(urlObj.hostname)) {
        return true;
      }

      // Check patterns
      for (const pattern of this.blockedPatterns) {
        if (pattern.test(url)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Block request (fallback method)
   */
  blockRequest(url) {
    const originalFetch = window.fetch;
    const originalXHR = window.XMLHttpRequest;

    // Intercept fetch
    window.fetch = async (resource, options) => {
      const requestUrl = typeof resource === 'string' ? resource : resource.url;
      
      if (this.shouldBlock(requestUrl)) {
        this.logBlock(requestUrl, 'fetch');
        return new Response(null, { status: 204 });
      }

      return originalFetch(resource, options);
    };

    // Intercept XHR
    const self = this;
    const XHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
      if (self.shouldBlock(url)) {
        self.logBlock(url, 'xhr');
        // Return empty response
        this.addEventListener('readystatechange', function() {
          if (this.readyState === 4) {
            Object.defineProperty(this, 'status', { value: 204 });
            Object.defineProperty(this, 'responseText', { value: '' });
          }
        });
      }
      return XHROpen.call(this, method, url, ...args);
    };
  }

  /**
   * Log blocked request
   */
  logBlock(url, method) {
    this.blockLog.push({
      url,
      method,
      timestamp: Date.now()
    });

    // Keep last 100 blocks
    if (this.blockLog.length > 100) {
      this.blockLog.shift();
    }

    console.log(`🛡️ Blocked telemetry: ${url}`);
  }

  /**
   * Add custom blocked domain
   */
  addBlockedDomain(domain) {
    this.blockedDomains.add(domain);
  }

  /**
   * Add custom pattern
   */
  addBlockedPattern(pattern) {
    this.blockedPatterns.push(pattern);
  }

  /**
   * Get block statistics
   */
  getStats() {
    const last24h = Date.now() - (24 * 60 * 60 * 1000);
    const recentBlocks = this.blockLog.filter(b => b.timestamp > last24h);

    return {
      totalBlocked: this.blockLog.length,
      blockedLast24h: recentBlocks.length,
      enabled: this.enabled,
      blockedDomains: Array.from(this.blockedDomains),
      recentBlocks: this.blockLog.slice(-10)
    };
  }

  /**
   * Clear block log
   */
  clearLog() {
    this.blockLog = [];
  }
}

// Global instance
export const telemetryBlocker = new TelemetryBlocker();

/**
 * SCRIPT INTEGRITY CHECKER
 * Detect unauthorized script modifications
 */
export class ScriptIntegrityChecker {
  constructor() {
    this.scriptHashes = new Map();
    this.violations = [];
  }

  /**
   * Register expected script hash
   */
  async registerScript(scriptUrl, expectedHash) {
    this.scriptHashes.set(scriptUrl, expectedHash);
  }

  /**
   * Verify script integrity
   */
  async verifyScript(scriptElement) {
    const src = scriptElement.src;
    if (!src || !this.scriptHashes.has(src)) {
      return { valid: true, reason: 'Not registered' };
    }

    try {
      const response = await fetch(src);
      const scriptContent = await response.text();
      const hash = await this.calculateHash(scriptContent);
      const expectedHash = this.scriptHashes.get(src);

      if (hash !== expectedHash) {
        const violation = {
          src,
          expectedHash,
          actualHash: hash,
          timestamp: Date.now()
        };
        this.violations.push(violation);
        
        console.error('⚠️ Script integrity violation:', violation);
        return { valid: false, violation };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Calculate SHA-256 hash
   */
  async calculateHash(content) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Monitor all scripts on page
   */
  monitorScripts() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.tagName === 'SCRIPT') {
            this.verifyScript(node);
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    return observer;
  }

  /**
   * Get violations
   */
  getViolations() {
    return [...this.violations];
  }
}

export const scriptIntegrityChecker = new ScriptIntegrityChecker();