/**
 * PHASE 5: Automated Navigation Recovery System
 * 
 * Automatically detects and recovers from navigation failures.
 * Ensures users never get stuck or locked out.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { detectNavigationCrash, getLastKnownGoodState, clearNavigationState } from './NavigationStateManager';
import { emergencyNavigationReset } from './NavigationGuard';

/**
 * Auto-recovery system
 * Monitors for navigation failures and auto-recovers
 */
export function useNavigationRecovery() {
  const navigate = useNavigate();

  useEffect(() => {
    // Check for crash on mount
    const crash = detectNavigationCrash();
    
    if (crash) {
      console.error('🚨 Navigation crash detected on mount');
      
      const recovery = getLastKnownGoodState();
      
      if (recovery) {
        console.log('🔧 Auto-recovering to:', recovery.recoveryPath);
        setTimeout(() => {
          navigate(recovery.recoveryPath, { replace: true });
        }, 100);
      } else {
        console.log('🔧 No recovery state, resetting to Dashboard');
        setTimeout(() => {
          navigate('/Dashboard', { replace: true });
        }, 100);
      }
    }
  }, [navigate]);

  // Monitor for repeated navigation errors
  useEffect(() => {
    const errorHandler = (event) => {
      // Track consecutive errors
      const errorCount = parseInt(sessionStorage.getItem('nav_error_count') || '0') + 1;
      sessionStorage.setItem('nav_error_count', String(errorCount));
      
      // If 3+ consecutive errors, trigger emergency reset
      if (errorCount >= 3) {
        console.error('🚨 Multiple navigation errors detected, triggering emergency reset');
        sessionStorage.removeItem('nav_error_count');
        
        if (confirm('Navigation system experiencing errors. Reset navigation state?')) {
          emergencyNavigationReset();
        }
      }
    };

    window.addEventListener('error', errorHandler);
    return () => window.removeEventListener('error', errorHandler);
  }, []);

  // Reset error count on successful navigation
  useEffect(() => {
    sessionStorage.setItem('nav_error_count', '0');
  }, [navigate]);
}

/**
 * Navigation timeout guard
 * Prevents infinite loading states
 */
export function useNavigationTimeout(timeout = 10000) {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      const loadingIndicators = document.querySelectorAll('[data-loading="true"]');
      
      if (loadingIndicators.length > 0) {
        console.error('🚨 Navigation timeout - page stuck loading');
        
        if (confirm('Page is taking too long to load. Return to Dashboard?')) {
          navigate('/Dashboard', { replace: true });
          window.location.reload();
        }
      }
    }, timeout);

    return () => clearTimeout(timer);
  }, [navigate, timeout]);
}

/**
 * Network failure recovery
 */
export function useNetworkRecovery() {
  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 Network restored');
      const pendingNav = sessionStorage.getItem('pending_navigation');
      
      if (pendingNav) {
        console.log('🔧 Retrying pending navigation:', pendingNav);
        sessionStorage.removeItem('pending_navigation');
        window.location.href = pendingNav;
      }
    };

    const handleOffline = () => {
      console.warn('🌐 Network connection lost');
      sessionStorage.setItem('pending_navigation', window.location.pathname);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
}