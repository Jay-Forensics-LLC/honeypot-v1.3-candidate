/**
 * PHASE 4: Navigation State Persistence & Recovery
 * 
 * Saves and restores navigation state for crash recovery and session restoration.
 */

/**
 * Save navigation state to localStorage
 * @param {Object} state - Navigation state to save
 */
export function saveNavigationState(state) {
  try {
    const existing = loadNavigationState();
    const updated = {
      ...existing,
      ...state,
      timestamp: Date.now()
    };
    
    localStorage.setItem('navigation_state', JSON.stringify(updated));
  } catch (error) {
    console.warn('Failed to save navigation state:', error);
  }
}

/**
 * Load navigation state from localStorage
 * @returns {Object|null} Navigation state or null
 */
export function loadNavigationState() {
  try {
    const stored = localStorage.getItem('navigation_state');
    if (!stored) return null;
    
    const state = JSON.parse(stored);
    
    // Expire state after 24 hours
    if (Date.now() - state.timestamp > 24 * 60 * 60 * 1000) {
      clearNavigationState();
      return null;
    }
    
    return state;
  } catch (error) {
    console.warn('Failed to load navigation state:', error);
    return null;
  }
}

/**
 * Clear navigation state
 */
export function clearNavigationState() {
  try {
    localStorage.removeItem('navigation_state');
  } catch (error) {
    console.warn('Failed to clear navigation state:', error);
  }
}

/**
 * Save navigation breadcrumb (for crash recovery)
 * @param {string} path - Current path
 */
export function saveNavigationBreadcrumb(path) {
  try {
    const breadcrumbs = JSON.parse(sessionStorage.getItem('nav_breadcrumbs') || '[]');
    breadcrumbs.push({
      path,
      timestamp: Date.now()
    });
    
    // Keep last 20 breadcrumbs
    if (breadcrumbs.length > 20) {
      breadcrumbs.shift();
    }
    
    sessionStorage.setItem('nav_breadcrumbs', JSON.stringify(breadcrumbs));
  } catch (error) {
    console.warn('Failed to save breadcrumb:', error);
  }
}

/**
 * Get navigation breadcrumbs
 */
export function getNavigationBreadcrumbs() {
  try {
    return JSON.parse(sessionStorage.getItem('nav_breadcrumbs') || '[]');
  } catch (error) {
    return [];
  }
}

/**
 * Detect navigation crashes (rapid repeated failures)
 */
export function detectNavigationCrash() {
  const breadcrumbs = getNavigationBreadcrumbs();
  
  // Check for same path repeated 3+ times in 5 seconds
  if (breadcrumbs.length < 3) return false;
  
  const recent = breadcrumbs.slice(-3);
  const samePath = recent.every(b => b.path === recent[0].path);
  const quickSuccession = recent[recent.length - 1].timestamp - recent[0].timestamp < 5000;
  
  return samePath && quickSuccession;
}

/**
 * Get last known good navigation state (for recovery)
 */
export function getLastKnownGoodState() {
  const state = loadNavigationState();
  const crash = detectNavigationCrash();
  
  if (crash && state?.previousPath) {
    return {
      recoveryPath: state.previousPath,
      reason: 'Navigation crash detected',
      timestamp: state.timestamp
    };
  }
  
  return null;
}