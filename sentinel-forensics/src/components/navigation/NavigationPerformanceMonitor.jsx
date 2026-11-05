/**
 * PHASE 5: Navigation Performance Monitoring
 * 
 * Tracks navigation performance metrics and alerts on degradation.
 */

/**
 * Measure navigation timing
 */
export function measureNavigationTiming(startTime, endTime, pageName) {
  const duration = endTime - startTime;
  
  // Store timing data
  const timings = JSON.parse(sessionStorage.getItem('nav_timings') || '[]');
  timings.push({
    page: pageName,
    duration,
    timestamp: Date.now()
  });
  
  // Keep last 50 timings
  if (timings.length > 50) {
    timings.shift();
  }
  
  sessionStorage.setItem('nav_timings', JSON.stringify(timings));
  
  // Alert on slow navigation (>2s)
  if (duration > 2000) {
    console.warn(`⚠️ Slow navigation detected: ${pageName} took ${duration}ms`);
  }
  
  return duration;
}

/**
 * Get navigation performance stats
 */
export function getNavigationPerformanceStats() {
  try {
    const timings = JSON.parse(sessionStorage.getItem('nav_timings') || '[]');
    
    if (timings.length === 0) {
      return {
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        count: 0
      };
    }
    
    const durations = timings.map(t => t.duration).sort((a, b) => a - b);
    const sum = durations.reduce((acc, d) => acc + d, 0);
    
    return {
      avgDuration: Math.round(sum / durations.length),
      minDuration: durations[0],
      maxDuration: durations[durations.length - 1],
      p50: durations[Math.floor(durations.length * 0.5)],
      p95: durations[Math.floor(durations.length * 0.95)],
      p99: durations[Math.floor(durations.length * 0.99)],
      count: timings.length,
      slowestPages: getSlowPages(timings)
    };
  } catch (error) {
    console.error('Failed to get performance stats:', error);
    return null;
  }
}

/**
 * Get slowest pages
 */
function getSlowPages(timings) {
  const pageTimings = {};
  
  timings.forEach(t => {
    if (!pageTimings[t.page]) {
      pageTimings[t.page] = [];
    }
    pageTimings[t.page].push(t.duration);
  });
  
  const avgTimings = Object.entries(pageTimings).map(([page, durations]) => ({
    page,
    avgDuration: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
  }));
  
  return avgTimings
    .sort((a, b) => b.avgDuration - a.avgDuration)
    .slice(0, 5);
}

/**
 * Navigation performance hook
 */
export function useNavigationPerformance(pageName) {
  useEffect(() => {
    const startTime = performance.now();
    
    return () => {
      const endTime = performance.now();
      measureNavigationTiming(startTime, endTime, pageName);
    };
  }, [pageName]);
}