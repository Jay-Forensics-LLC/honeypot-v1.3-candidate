/**
 * DEPENDENCY INJECTION CONTAINER
 * Production-grade service container with lifecycle management
 */
class ServiceContainer {
  constructor() {
    this.services = new Map();
    this.singletons = new Map();
    this.factories = new Map();
    this.initializing = new Set();
  }

  /**
   * Register singleton service
   */
  registerSingleton(name, factory) {
    this.services.set(name, { type: 'singleton', factory });
    return this;
  }

  /**
   * Register transient service (new instance each time)
   */
  registerTransient(name, factory) {
    this.services.set(name, { type: 'transient', factory });
    return this;
  }

  /**
   * Register factory function
   */
  registerFactory(name, factory) {
    this.factories.set(name, factory);
    return this;
  }

  /**
   * Register instance directly
   */
  registerInstance(name, instance) {
    this.singletons.set(name, instance);
    return this;
  }

  /**
   * Resolve service by name
   */
  async resolve(name) {
    // Check for circular dependencies
    if (this.initializing.has(name)) {
      throw new Error(`Circular dependency detected: ${name}`);
    }

    // Return cached singleton
    if (this.singletons.has(name)) {
      return this.singletons.get(name);
    }

    // Get service definition
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service not registered: ${name}`);
    }

    this.initializing.add(name);

    try {
      const instance = typeof service.factory === 'function'
        ? await service.factory(this)
        : service.factory;

      // Cache singletons
      if (service.type === 'singleton') {
        this.singletons.set(name, instance);
      }

      return instance;
    } finally {
      this.initializing.delete(name);
    }
  }

  /**
   * Resolve multiple services
   */
  async resolveAll(names) {
    return Promise.all(names.map(name => this.resolve(name)));
  }

  /**
   * Check if service exists
   */
  has(name) {
    return this.services.has(name) || this.singletons.has(name);
  }

  /**
   * Clear all services (for testing)
   */
  clear() {
    this.services.clear();
    this.singletons.clear();
    this.factories.clear();
    this.initializing.clear();
  }

  /**
   * Dispose all services
   */
  async dispose() {
    for (const [name, instance] of this.singletons.entries()) {
      if (instance && typeof instance.dispose === 'function') {
        try {
          await instance.dispose();
        } catch (error) {
          console.error(`Failed to dispose ${name}:`, error);
        }
      }
    }
    this.clear();
  }
}

// Global container instance
export const container = new ServiceContainer();

/**
 * Setup core services
 */
export function setupContainer() {
  // Lazy load services to avoid circular dependencies
  container.registerSingleton('logger', async () => {
    const { logger } = await import('../utils/Logger');
    return logger;
  });

  container.registerSingleton('cache', async () => {
    const { requestCache } = await import('./RequestCache');
    return requestCache;
  });

  container.registerSingleton('offlineDB', async () => {
    const { offlineDB } = await import('./OfflineDB');
    return offlineDB;
  });

  container.registerSingleton('offlineQueue', async () => {
    const { offlineQueue } = await import('./OfflineQueue');
    return offlineQueue;
  });

  container.registerSingleton('circuitBreaker', async () => {
    const { CircuitBreakerRegistry } = await import('./CircuitBreaker');
    return CircuitBreakerRegistry;
  });

  container.registerSingleton('eventBus', async () => {
    const { eventBus } = await import('./EventBus');
    return eventBus;
  });

  container.registerSingleton('transportLayer', async () => {
    const { transportLayer } = await import('./TransportLayer');
    return transportLayer;
  });

  container.registerSingleton('healthMonitor', async () => {
    const { appHealthMonitor } = await import('../monitoring/AppHealthMonitor');
    return appHealthMonitor;
  });

  return container;
}