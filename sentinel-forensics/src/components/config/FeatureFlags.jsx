/**
 * FEATURE FLAGS SYSTEM
 * Progressive rollout and A/B testing
 */
class FeatureFlagManager {
  constructor() {
    this.flags = new Map();
    this.overrides = new Map();
    this.listeners = new Set();
    this.loadFromStorage();
  }

  /**
   * Initialize default flags
   */
  initDefaults() {
    // Performance enhancements
    this.register('unified_transport', true, 'Use unified API transport layer');
    this.register('request_batching', true, 'Enable request batching');
    this.register('request_coalescing', true, 'Enable request coalescing');
    this.register('advanced_caching', true, 'Enable advanced caching strategies');
    
    // Render optimizations
    this.register('virtual_lists', true, 'Enable virtualized lists');
    this.register('suspense_boundaries', true, 'Use React Suspense boundaries');
    this.register('transition_api', false, 'Use React transition API');
    
    // IndexedDB enhancements
    this.register('batch_writes', true, 'Batch IndexedDB writes');
    this.register('snapshots', true, 'Enable database snapshots');
    this.register('auto_migrations', true, 'Automatic schema migrations');
    
    // Monitoring
    this.register('health_monitoring', true, 'Enable health monitoring');
    this.register('performance_tracking', true, 'Track performance metrics');
    this.register('error_tracking', true, 'Enhanced error tracking');
    
    // Security
    this.register('session_refresh', true, 'Automatic session refresh');
    this.register('csp_sandbox', false, 'CSP-conscious script sandboxing');
    this.register('rate_limiting', true, 'Client-side rate limiting');
    
    // Experimental
    this.register('dependency_injection', true, 'Use DI container');
    this.register('event_bus', true, 'Event bus system');
    this.register('typed_stores', true, 'Zustand typed stores');
  }

  /**
   * Register feature flag
   */
  register(key, defaultValue, description = '') {
    if (!this.flags.has(key)) {
      this.flags.set(key, {
        key,
        defaultValue,
        description,
        enabled: defaultValue,
        rolloutPercent: 100
      });
    }
  }

  /**
   * Check if flag is enabled
   */
  isEnabled(key) {
    // Check override first
    if (this.overrides.has(key)) {
      return this.overrides.get(key);
    }

    const flag = this.flags.get(key);
    if (!flag) {
      console.warn(`Feature flag not found: ${key}`);
      return false;
    }

    // Check rollout percentage
    if (flag.rolloutPercent < 100) {
      const userId = this.getUserId();
      const hash = this.hashString(`${userId}-${key}`);
      const bucket = hash % 100;
      if (bucket >= flag.rolloutPercent) {
        return false;
      }
    }

    return flag.enabled;
  }

  /**
   * Enable flag
   */
  enable(key) {
    const flag = this.flags.get(key);
    if (flag) {
      flag.enabled = true;
      this.notifyListeners(key, true);
      this.saveToStorage();
    }
  }

  /**
   * Disable flag
   */
  disable(key) {
    const flag = this.flags.get(key);
    if (flag) {
      flag.enabled = false;
      this.notifyListeners(key, false);
      this.saveToStorage();
    }
  }

  /**
   * Override flag (temporary, not persisted)
   */
  override(key, value) {
    this.overrides.set(key, value);
    this.notifyListeners(key, value);
  }

  /**
   * Clear override
   */
  clearOverride(key) {
    this.overrides.delete(key);
    const flag = this.flags.get(key);
    if (flag) {
      this.notifyListeners(key, flag.enabled);
    }
  }

  /**
   * Set rollout percentage (0-100)
   */
  setRollout(key, percent) {
    const flag = this.flags.get(key);
    if (flag) {
      flag.rolloutPercent = Math.max(0, Math.min(100, percent));
      this.saveToStorage();
    }
  }

  /**
   * Get all flags
   */
  getAll() {
    return Array.from(this.flags.values()).map(flag => ({
      ...flag,
      overridden: this.overrides.has(flag.key),
      currentValue: this.isEnabled(flag.key)
    }));
  }

  /**
   * Subscribe to flag changes
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify listeners
   */
  notifyListeners(key, value) {
    this.listeners.forEach(callback => {
      try {
        callback(key, value);
      } catch (error) {
        console.error('Feature flag listener error:', error);
      }
    });
  }

  /**
   * Hash string for bucketing
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Get user ID for bucketing
   */
  getUserId() {
    let userId = localStorage.getItem('feature_flag_user_id');
    if (!userId) {
      userId = Math.random().toString(36).substr(2, 9);
      localStorage.setItem('feature_flag_user_id', userId);
    }
    return userId;
  }

  /**
   * Save to localStorage
   */
  saveToStorage() {
    try {
      const data = {};
      for (const [key, flag] of this.flags.entries()) {
        data[key] = {
          enabled: flag.enabled,
          rolloutPercent: flag.rolloutPercent
        };
      }
      localStorage.setItem('feature_flags', JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save feature flags:', error);
    }
  }

  /**
   * Load from localStorage
   */
  loadFromStorage() {
    try {
      const data = localStorage.getItem('feature_flags');
      if (data) {
        const parsed = JSON.parse(data);
        for (const [key, value] of Object.entries(parsed)) {
          const flag = this.flags.get(key);
          if (flag) {
            flag.enabled = value.enabled;
            flag.rolloutPercent = value.rolloutPercent;
          }
        }
      }
    } catch (error) {
      console.error('Failed to load feature flags:', error);
    }
  }

  /**
   * Reset to defaults
   */
  reset() {
    for (const flag of this.flags.values()) {
      flag.enabled = flag.defaultValue;
      flag.rolloutPercent = 100;
    }
    this.overrides.clear();
    this.saveToStorage();
  }
}

// Global instance
export const featureFlags = new FeatureFlagManager();

// Initialize defaults
featureFlags.initDefaults();

/**
 * React hook for feature flags
 */
export function useFeatureFlag(key) {
  const [enabled, setEnabled] = React.useState(() => featureFlags.isEnabled(key));

  React.useEffect(() => {
    const unsubscribe = featureFlags.subscribe((changedKey, value) => {
      if (changedKey === key) {
        setEnabled(value);
      }
    });
    return unsubscribe;
  }, [key]);

  return enabled;
}

/**
 * HOC for feature-gated components
 */
export function withFeatureFlag(key, FallbackComponent = null) {
  return function FeatureFlaggedComponent(Component) {
    return function Wrapped(props) {
      const enabled = useFeatureFlag(key);
      
      if (!enabled) {
        return FallbackComponent ? <FallbackComponent {...props} /> : null;
      }
      
      return <Component {...props} />;
    };
  };
}