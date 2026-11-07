/**
 * PHASE 3: Navigation Telemetry & Analytics
 * 
 * Tracks navigation events, failures, and patterns for monitoring.
 * Helps identify broken routes, unauthorized access attempts, and UX issues.
 */

import { base44 } from '@/api/base44Client';

/**
 * Navigation event types
 */
export const NAV_EVENT_TYPES = {
  CLICK: 'nav_click',
  SUCCESS: 'nav_success',
  FAILURE: 'nav_failure',
  BLOCKED: 'nav_blocked',
  ERROR: 'nav_error',
  SIDEBAR_TOGGLE: 'sidebar_toggle',
  MODE_SWITCH: 'mode_switch'
};

/**
 * Log navigation event
 */
export async function logNavigationEvent(eventType, metadata = {}) {
  try {
    // Track in analytics
    base44.analytics.track({
      eventName: eventType,
      properties: {
        ...metadata,
        timestamp: new Date().toISOString(),
        url: window.location.pathname,
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`
      }
    });

    // Store in session for debugging
    const sessionLog = JSON.parse(sessionStorage.getItem('nav_telemetry') || '[]');
    sessionLog.push({
      type: eventType,
      ...metadata,
      timestamp: Date.now()
    });
    
    // Keep last 100 events
    if (sessionLog.length > 100) {
      sessionLog.shift();
    }
    
    sessionStorage.setItem('nav_telemetry', JSON.stringify(sessionLog));
  } catch (error) {
    console.warn('Navigation telemetry failed:', error);
  }
}

/**
 * Log successful navigation
 */
export function logNavigationSuccess(page, source = 'sidebar') {
  logNavigationEvent(NAV_EVENT_TYPES.SUCCESS, {
    page,
    source,
    status: 'success'
  });
}

/**
 * Log failed navigation
 */
export function logNavigationFailure(page, error, source = 'sidebar') {
  logNavigationEvent(NAV_EVENT_TYPES.FAILURE, {
    page,
    source,
    error: error?.message || 'Unknown error',
    status: 'failed'
  });
  
  console.error('Navigation failure:', { page, source, error });
}

/**
 * Log blocked navigation (feature gating)
 */
export function logNavigationBlocked(page, reason, visibility) {
  logNavigationEvent(NAV_EVENT_TYPES.BLOCKED, {
    page,
    reason,
    visibility,
    status: 'blocked'
  });
  
  console.warn('Navigation blocked:', { page, reason, visibility });
}

/**
 * Log sidebar toggle
 */
export function logSidebarToggle(newState) {
  logNavigationEvent(NAV_EVENT_TYPES.SIDEBAR_TOGGLE, {
    state: newState ? 'open' : 'closed',
    isMobile: window.innerWidth < 768
  });
}

/**
 * Log mode switch (Expert/Developer)
 */
export function logModeSwitch(mode, visibility) {
  logNavigationEvent(NAV_EVENT_TYPES.MODE_SWITCH, {
    mode,
    visibility,
    triggeredReload: true
  });
}

/**
 * Get navigation telemetry summary
 */
export function getNavigationTelemetry() {
  try {
    const sessionLog = JSON.parse(sessionStorage.getItem('nav_telemetry') || '[]');
    
    const summary = {
      total: sessionLog.length,
      byType: {},
      recentFailures: [],
      recentBlocked: []
    };
    
    sessionLog.forEach(event => {
      summary.byType[event.type] = (summary.byType[event.type] || 0) + 1;
      
      if (event.type === NAV_EVENT_TYPES.FAILURE) {
        summary.recentFailures.push(event);
      }
      
      if (event.type === NAV_EVENT_TYPES.BLOCKED) {
        summary.recentBlocked.push(event);
      }
    });
    
    return summary;
  } catch (error) {
    console.error('Failed to get navigation telemetry:', error);
    return null;
  }
}

/**
 * Clear navigation telemetry
 */
export function clearNavigationTelemetry() {
  sessionStorage.removeItem('nav_telemetry');
}

/**
 * Export navigation telemetry for debugging
 */
export function exportNavigationTelemetry() {
  const data = sessionStorage.getItem('nav_telemetry');
  const blob = new Blob([data || '[]'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `navigation-telemetry-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}