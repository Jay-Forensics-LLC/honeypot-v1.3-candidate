/**
 * PHASE 4: Navigation Pattern Analysis
 * 
 * Analyzes user navigation patterns to optimize UX and detect issues.
 */

import { getNavigationTelemetry } from './NavigationTelemetry';

/**
 * Analyze navigation patterns from telemetry
 */
export function analyzeNavigationPatterns() {
  const telemetry = getNavigationTelemetry();
  if (!telemetry) return null;
  
  const analysis = {
    totalEvents: telemetry.total,
    successRate: 0,
    avgEventsPerSession: 0,
    topRoutes: [],
    problemRoutes: [],
    recommendations: []
  };
  
  // Calculate success rate
  const successCount = telemetry.byType['nav_success'] || 0;
  const failureCount = telemetry.byType['nav_failure'] || 0;
  const totalNav = successCount + failureCount;
  
  if (totalNav > 0) {
    analysis.successRate = (successCount / totalNav * 100).toFixed(1);
  }
  
  // Identify problem routes
  const routeFailures = {};
  telemetry.recentFailures?.forEach(failure => {
    routeFailures[failure.page] = (routeFailures[failure.page] || 0) + 1;
  });
  
  analysis.problemRoutes = Object.entries(routeFailures)
    .sort((a, b) => b[1] - a[1])
    .map(([route, count]) => ({ route, failures: count }));
  
  // Identify blocked routes
  const routeBlocks = {};
  telemetry.recentBlocked?.forEach(blocked => {
    routeBlocks[blocked.page] = (routeBlocks[blocked.page] || 0) + 1;
  });
  
  analysis.blockedRoutes = Object.entries(routeBlocks)
    .sort((a, b) => b[1] - a[1])
    .map(([route, count]) => ({ route, blocks: count }));
  
  // Generate recommendations
  if (analysis.successRate < 95) {
    analysis.recommendations.push({
      severity: 'HIGH',
      message: 'Navigation success rate below 95% - investigate failures'
    });
  }
  
  if (analysis.problemRoutes.length > 0) {
    analysis.recommendations.push({
      severity: 'MEDIUM',
      message: `${analysis.problemRoutes.length} routes have failures - check logs`
    });
  }
  
  if (analysis.blockedRoutes?.length > 3) {
    analysis.recommendations.push({
      severity: 'LOW',
      message: 'User attempting to access blocked routes - consider UI hints'
    });
  }
  
  return analysis;
}

/**
 * Get most common navigation paths (user journey analysis)
 */
export function getNavigationPaths() {
  try {
    const sessionLog = JSON.parse(sessionStorage.getItem('nav_telemetry') || '[]');
    const paths = [];
    
    for (let i = 0; i < sessionLog.length - 1; i++) {
      const current = sessionLog[i];
      const next = sessionLog[i + 1];
      
      if (current.type === 'nav_success' && next.type === 'nav_success') {
        paths.push(`${current.page} → ${next.page}`);
      }
    }
    
    // Count path frequencies
    const pathCounts = {};
    paths.forEach(path => {
      pathCounts[path] = (pathCounts[path] || 0) + 1;
    });
    
    return Object.entries(pathCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, count]) => ({ path, count }));
  } catch (error) {
    console.error('Failed to analyze paths:', error);
    return [];
  }
}

/**
 * Calculate navigation health score (0-100)
 */
export function calculateNavigationHealthScore() {
  const analysis = analyzeNavigationPatterns();
  if (!analysis) return 100; // Default optimistic
  
  let score = 100;
  
  // Deduct points for failures
  if (analysis.successRate < 100) {
    score -= (100 - parseFloat(analysis.successRate));
  }
  
  // Deduct points for problem routes
  score -= analysis.problemRoutes.length * 5;
  
  // Deduct points for blocked attempts
  score -= (analysis.blockedRoutes?.length || 0) * 2;
  
  return Math.max(0, Math.min(100, score));
}