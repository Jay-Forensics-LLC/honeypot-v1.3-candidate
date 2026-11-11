import { useState, useEffect, useCallback } from 'react';
import { useUser } from './useUser';
import { FEATURE_VISIBILITY, qualifiesForDeveloperAccess } from '../config/navigationConfig';

/**
 * PHASE 6: Two-Tier Access Control with Qualification Checks
 * 
 * Three visibility tiers:
 * - PUBLIC: Core workflow (Dashboard, Cases, Evidence, Devices, Reports)
 * - BETA: Advanced features (Network tools, Analytics, Integrations, Live Defense, Covert Ops)
 * - INTERNAL: Developer/diagnostic tools (Admin, Agents, System Health, Codebase Audit)
 * 
 * Access control:
 * - Public users: PUBLIC tier only
 * - Expert Mode: PUBLIC + BETA (toggled by user, available to all)
 * - Developer Mode: ALL tiers (auto-enabled for qualified users via qualifiesForDeveloperAccess)
 * 
 * Qualification for Developer Access:
 * - Allowlisted email addresses
 * - Admin role + sentinel-forensics.com domain
 * - Enterprise subscription tier
 * - Explicit developer_access_granted flag
 */
export function useExpertMode() {
  const { data: user } = useUser();
  const [expertMode, setExpertMode] = useState(false);
  const [isReady, setIsReady] = useState(false);
  
  // PHASE 6: Qualification-based developer detection
  const isDeveloper = qualifiesForDeveloperAccess(user);
  
  // Load persisted expert mode preference - ALWAYS ENABLED
  useEffect(() => {
    // CRITICAL: Mark as ready even if user is null to prevent infinite loading
    if (!user?.email) {
      setIsReady(true);
      setExpertMode(true); // FORCE EXPERT MODE FOR ALL
      return;
    }
    
    // FORCE EXPERT MODE ON FOR ALL USERS
    setExpertMode(true);
    try {
      localStorage.setItem(`expert_mode_${user.email}`, 'true');
    } catch (error) {
      console.warn('Failed to save expert mode preference:', error);
    }
    setIsReady(true);
  }, [user?.email]);
  
  // Toggle expert mode - DISABLED (always on per requirements)
  const toggleExpertMode = useCallback(() => {
    // NO-OP: Expert mode is forced on for all users
    console.info('Expert mode is permanently enabled');
  }, []);
  
  // Calculate max visibility level
  // FORCED: All users get BETA access, developers get INTERNAL
  const maxVisibility = isDeveloper 
    ? FEATURE_VISIBILITY.INTERNAL 
    : FEATURE_VISIBILITY.BETA; // FORCED: Always BETA for non-developers
  
  return {
    expertMode: true, // FORCED: Always enabled for all users
    toggleExpertMode, // NO-OP
    maxVisibility,
    isDeveloper,
    isReady
  };
}