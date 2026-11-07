import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

/**
 * APP STATE STORE
 * Global application state with persistence
 */
export const useAppStore = create(
  devtools(
    persist(
      (set, get) => ({
        // UI State
        sidebarOpen: true,
        theme: 'dark',
        compactMode: false,
        
        // User preferences
        preferences: {
          notifications: true,
          soundEffects: false,
          autoRefresh: true,
          refreshInterval: 30000
        },

        // Feature flags
        features: {
          offlineMode: true,
          advancedAnalytics: false,
          experimentalFeatures: false
        },

        // Actions
        setSidebarOpen: (open) => set({ sidebarOpen: open }),
        toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
        setTheme: (theme) => set({ theme }),
        setCompactMode: (compact) => set({ compactMode: compact }),
        
        updatePreferences: (prefs) => set((state) => ({
          preferences: { ...state.preferences, ...prefs }
        })),
        
        updateFeatures: (features) => set((state) => ({
          features: { ...state.features, ...features }
        })),

        reset: () => set({
          sidebarOpen: true,
          theme: 'dark',
          compactMode: false,
          preferences: {
            notifications: true,
            soundEffects: false,
            autoRefresh: true,
            refreshInterval: 30000
          }
        })
      }),
      {
        name: 'sentinel-app-state',
        partialize: (state) => ({
          theme: state.theme,
          compactMode: state.compactMode,
          preferences: state.preferences,
          features: state.features
        })
      }
    ),
    { name: 'AppStore' }
  )
);

/**
 * PERFORMANCE STORE
 * Track performance metrics
 */
export const usePerformanceStore = create(
  devtools((set, get) => ({
    metrics: {
      fps: 60,
      memoryUsage: 0,
      apiLatency: 0,
      renderTime: 0
    },
    
    warnings: [],
    maxWarnings: 50,

    updateMetric: (key, value) => set((state) => ({
      metrics: { ...state.metrics, [key]: value }
    })),

    addWarning: (warning) => set((state) => {
      const warnings = [
        { ...warning, timestamp: Date.now(), id: Math.random() },
        ...state.warnings
      ].slice(0, state.maxWarnings);
      return { warnings };
    }),

    clearWarnings: () => set({ warnings: [] }),

    getMetrics: () => get().metrics,
    getWarnings: () => get().warnings
  }), { name: 'PerformanceStore' })
);

/**
 * NETWORK STORE
 * Track network state
 */
export const useNetworkStore = create(
  devtools((set, get) => ({
    online: navigator.onLine,
    syncStatus: 'idle', // idle | syncing | success | error
    pendingRequests: 0,
    failedRequests: [],
    
    setOnline: (online) => set({ online }),
    setSyncStatus: (status) => set({ syncStatus: status }),
    
    incrementPending: () => set((state) => ({
      pendingRequests: state.pendingRequests + 1
    })),
    
    decrementPending: () => set((state) => ({
      pendingRequests: Math.max(0, state.pendingRequests - 1)
    })),
    
    addFailedRequest: (request) => set((state) => ({
      failedRequests: [...state.failedRequests, {
        ...request,
        timestamp: Date.now(),
        id: Math.random()
      }].slice(-20)
    })),
    
    clearFailedRequests: () => set({ failedRequests: [] }),

    retryFailed: async () => {
      const failed = get().failedRequests;
      // Implementation for retrying failed requests
      console.log('Retrying failed requests:', failed.length);
    }
  }), { name: 'NetworkStore' })
);

/**
 * CACHE STORE
 * Manage cache state
 */
export const useCacheStore = create(
  devtools((set, get) => ({
    cacheSize: 0,
    hitRate: 0,
    lastClear: null,
    
    updateStats: (stats) => set({
      cacheSize: stats.size || 0,
      hitRate: stats.hitRate || 0
    }),
    
    clearCache: () => set({
      lastClear: Date.now()
    }),
    
    getStats: () => ({
      cacheSize: get().cacheSize,
      hitRate: get().hitRate,
      lastClear: get().lastClear
    })
  }), { name: 'CacheStore' })
);

/**
 * SECURITY STORE
 * Track security state
 */
export const useSecurityStore = create(
  devtools((set, get) => ({
    sessionExpiry: null,
    mfaRequired: false,
    securityAlerts: [],
    trustedDevices: [],
    
    setSessionExpiry: (expiry) => set({ sessionExpiry: expiry }),
    setMfaRequired: (required) => set({ mfaRequired: required }),
    
    addSecurityAlert: (alert) => set((state) => ({
      securityAlerts: [
        { ...alert, timestamp: Date.now(), id: Math.random() },
        ...state.securityAlerts
      ].slice(0, 100)
    })),
    
    clearSecurityAlerts: () => set({ securityAlerts: [] }),
    
    addTrustedDevice: (device) => set((state) => ({
      trustedDevices: [...state.trustedDevices, device]
    })),
    
    removeTrustedDevice: (deviceId) => set((state) => ({
      trustedDevices: state.trustedDevices.filter(d => d.id !== deviceId)
    }))
  }), { name: 'SecurityStore' })
);

/**
 * Helper: Clear all stores
 */
export function clearAllStores() {
  useAppStore.getState().reset();
  usePerformanceStore.setState({ metrics: {}, warnings: [] });
  useNetworkStore.setState({ failedRequests: [], pendingRequests: 0 });
  useCacheStore.setState({ cacheSize: 0, hitRate: 0 });
  useSecurityStore.setState({ securityAlerts: [], trustedDevices: [] });
}