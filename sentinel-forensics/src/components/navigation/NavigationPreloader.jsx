/**
 * PHASE 4: Intelligent Route Preloading
 * 
 * Analyzes navigation patterns and preloads likely next routes
 * to eliminate load times and improve UX.
 */

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getNavigationTelemetry } from './NavigationTelemetry';

/**
 * Common navigation paths by current route
 * Based on typical user workflows
 */
const NAVIGATION_PATTERNS = {
  'Dashboard': ['Cases', 'Evidence', 'DeviceInventory', 'Reports'],
  'Cases': ['CaseDetail', 'Evidence', 'Reports'],
  'Evidence': ['EvidenceDetail', 'Cases', 'TagManagement'],
  'CaseDetail': ['Evidence', 'Reports', 'AIAnalytics', 'CompositeRisk'],
  'DeviceInventory': ['DeviceDetail', 'DeviceCompliance', 'NetworkMonitor'],
  'Reports': ['ReportBuilder', 'Cases', 'Evidence'],
};

/**
 * Get predicted next routes based on current location and history
 */
function getPredictedRoutes(currentPath) {
  const basePath = currentPath.replace(/^\//, '').split('/')[0];
  
  // Start with pattern-based predictions
  const predictions = new Set(NAVIGATION_PATTERNS[basePath] || []);
  
  // Enhance with telemetry-based predictions
  try {
    const telemetry = getNavigationTelemetry();
    if (telemetry?.recentFailures) {
      // Don't preload routes that recently failed
      telemetry.recentFailures.forEach(failure => {
        predictions.delete(failure.page);
      });
    }
  } catch (error) {
    console.warn('Telemetry unavailable for predictions:', error);
  }
  
  return Array.from(predictions).slice(0, 3); // Limit to top 3
}

/**
 * Preload route component
 */
function preloadRoute(pageName) {
  try {
    // Dynamic import triggers webpack/vite to load the chunk
    import(`../../pages/${pageName}.js`).catch(err => {
      console.debug(`Preload failed for ${pageName}:`, err);
    });
  } catch (error) {
    // Silent fail - preloading is best-effort
  }
}

/**
 * Navigation Preloader Hook
 * Automatically preloads likely next routes
 */
export function useNavigationPreloader() {
  const location = useLocation();
  
  useEffect(() => {
    // Defer preloading to avoid blocking initial render
    const timer = setTimeout(() => {
      const predictions = getPredictedRoutes(location.pathname);
      predictions.forEach(route => {
        preloadRoute(route);
      });
      
      console.debug('🚀 Preloaded routes:', predictions);
    }, 2000); // Wait 2s after navigation
    
    return () => clearTimeout(timer);
  }, [location.pathname]);
}

/**
 * Preload all PUBLIC routes on idle
 * Ensures core workflow is always instant
 */
export function useIdlePreloader(publicRoutes = []) {
  useEffect(() => {
    // Only run once on mount
    if ('requestIdleCallback' in window) {
      const handle = requestIdleCallback(() => {
        publicRoutes.forEach(route => preloadRoute(route));
        console.debug('🔥 Idle preloaded PUBLIC routes:', publicRoutes);
      }, { timeout: 5000 });
      
      return () => cancelIdleCallback(handle);
    } else {
      // Fallback for Safari
      const timer = setTimeout(() => {
        publicRoutes.forEach(route => preloadRoute(route));
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, []); // Run once
}

/**
 * Preload route on hover (anticipatory loading)
 */
export function useHoverPreload(ref, pageName) {
  useEffect(() => {
    if (!ref?.current || !pageName) return;
    
    let preloadTimer;
    const handleMouseEnter = () => {
      // Preload after 200ms hover (user likely to click)
      preloadTimer = setTimeout(() => {
        preloadRoute(pageName);
      }, 200);
    };
    
    const handleMouseLeave = () => {
      clearTimeout(preloadTimer);
    };
    
    const element = ref.current;
    element.addEventListener('mouseenter', handleMouseEnter);
    element.addEventListener('mouseleave', handleMouseLeave);
    
    return () => {
      element.removeEventListener('mouseenter', handleMouseEnter);
      element.removeEventListener('mouseleave', handleMouseLeave);
      clearTimeout(preloadTimer);
    };
  }, [ref, pageName]);
}