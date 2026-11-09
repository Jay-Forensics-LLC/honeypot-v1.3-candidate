/**
 * PHASE 5: Advanced Navigation Guards
 * 
 * Comprehensive route protection, validation, and recovery system.
 * Ensures navigation always works, even under hostile conditions.
 */

import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { isRouteAllowed } from '../config/navigationConfig';
import { logNavigationBlocked } from './NavigationTelemetry';
import { detectNavigationCrash, getLastKnownGoodState } from './NavigationStateManager';

/**
 * Navigation Guard Hook
 * Validates route access and handles crashes
 */
export function useNavigationGuard(maxVisibility, user) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Skip guard for public routes and login flows
    if (!maxVisibility || location.pathname === '/') return;

    // Check if current route is allowed
    const allowed = isRouteAllowed(location.pathname, maxVisibility);
    
    if (!allowed) {
      console.warn('🚫 Route blocked by feature gating:', location.pathname);
      logNavigationBlocked(location.pathname, 'feature_gating', maxVisibility);
      
      // Redirect to dashboard
      navigate('/Dashboard', { replace: true });
      return;
    }

    // Check for navigation crash
    const crash = detectNavigationCrash();
    if (crash) {
      console.error('🚨 Navigation crash detected!');
      const recovery = getLastKnownGoodState();
      
      if (recovery?.recoveryPath) {
        console.log('🔧 Recovering to:', recovery.recoveryPath);
        navigate(recovery.recoveryPath, { replace: true });
      } else {
        console.log('🔧 Recovering to Dashboard');
        navigate('/Dashboard', { replace: true });
      }
    }
  }, [location.pathname, maxVisibility, user, navigate]);
}

/**
 * Validate navigation config integrity on mount
 */
export function useNavigationIntegrityCheck() {
  useEffect(() => {
    const errors = [];
    
    // Check for common configuration errors
    try {
      const configStr = JSON.stringify(require('../config/navigationConfig').navigationConfig);
      
      // Check for duplicate pages
      const pages = [];
      JSON.parse(configStr).forEach(cat => {
        cat.submenu?.forEach(item => {
          if (pages.includes(item.page)) {
            errors.push(`Duplicate page in nav config: ${item.page}`);
          }
          pages.push(item.page);
        });
      });
      
      if (errors.length > 0) {
        console.error('Navigation config errors:', errors);
      }
    } catch (error) {
      console.error('Navigation config validation failed:', error);
    }
  }, []);
}

/**
 * Emergency navigation reset
 */
export function emergencyNavigationReset() {
  console.warn('🚨 Emergency navigation reset triggered');
  
  // Clear all navigation state
  localStorage.removeItem('navigation_state');
  sessionStorage.removeItem('nav_telemetry');
  sessionStorage.removeItem('nav_breadcrumbs');
  
  // Clear sidebar preferences
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('sidebar_open_') || key.startsWith('expert_mode_')) {
      localStorage.removeItem(key);
    }
  });
  
  // Reload to safe state
  window.location.href = '/Dashboard';
}