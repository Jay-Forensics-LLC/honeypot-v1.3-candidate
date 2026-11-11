/**
 * PHASE 4: Performance Monitoring & Optimization
 * Tracks and reports performance metrics
 */

export class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.enabled = process.env.NODE_ENV === 'production';
  }

  // Mark performance entry
  mark(name) {
    if (!this.enabled || !window.performance) return;
    try {
      performance.mark(name);
    } catch (e) {
      console.warn('Performance mark failed:', e);
    }
  }

  // Measure between two marks
  measure(name, startMark, endMark) {
    if (!this.enabled || !window.performance) return;
    try {
      performance.measure(name, startMark, endMark);
      const entries = performance.getEntriesByName(name);
      if (entries.length > 0) {
        const duration = entries[entries.length - 1].duration;
        this.metrics.set(name, duration);
        
        // Log slow operations
        if (duration > 1000) {
          console.warn(`Slow operation detected: ${name} took ${duration}ms`);
        }
      }
    } catch (e) {
      console.warn('Performance measure failed:', e);
    }
  }

  // Get all metrics
  getMetrics() {
    return Object.fromEntries(this.metrics);
  }

  // Clear all metrics
  clear() {
    this.metrics.clear();
    if (window.performance?.clearMarks) {
      performance.clearMarks();
      performance.clearMeasures();
    }
  }

  // Report Web Vitals
  reportWebVitals() {
    if (!this.enabled) return;

    // Largest Contentful Paint
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        console.log('LCP:', lastEntry.renderTime || lastEntry.loadTime);
      }).observe({ entryTypes: ['largest-contentful-paint'] });
    } catch (e) {
      // Observer not supported
    }

    // First Input Delay
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          console.log('FID:', entry.processingStart - entry.startTime);
        });
      }).observe({ entryTypes: ['first-input'] });
    } catch (e) {
      // Observer not supported
    }

    // Cumulative Layout Shift
    try {
      let clsValue = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        }
        console.log('CLS:', clsValue);
      }).observe({ entryTypes: ['layout-shift'] });
    } catch (e) {
      // Observer not supported
    }
  }
}

export const performanceMonitor = new PerformanceMonitor();

// React component wrapper for performance tracking
export function withPerformanceTracking(Component, componentName) {
  return function PerformanceTrackedComponent(props) {
    React.useEffect(() => {
      performanceMonitor.mark(`${componentName}-mount-start`);
      return () => {
        performanceMonitor.mark(`${componentName}-mount-end`);
        performanceMonitor.measure(
          `${componentName}-mount`,
          `${componentName}-mount-start`,
          `${componentName}-mount-end`
        );
      };
    }, []);

    return React.createElement(Component, props);
  };
}