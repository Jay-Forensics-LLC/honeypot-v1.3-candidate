import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUser } from '../hooks/useUser';
import { createPageUrl } from '../utils';
import LoadingFallback from '../demo/LoadingFallback';

/**
 * ONBOARDING GUARD - FIXED ARCHITECTURE
 * 
 * CRITICAL: This wraps ONLY the Outlet content inside Layout.
 * Layout shell (sidebar/header) must ALWAYS render.
 * This component only controls what appears in the main content area.
 */
export function OnboardingGuard({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: user, isLoading } = useUser();

  useEffect(() => {
    if (isLoading) return;

    // Allow welcome and wizard pages
    const allowedPaths = ['/WelcomeOnboarding', '/QuickStartWizard', '/Pricing', '/payment-success', '/payment-cancelled'];
    const currentPath = location.pathname;
    
    if (allowedPaths.some(path => currentPath.includes(path))) {
      return;
    }

    // SECURITY: Enforce organization_id requirement
    if (user && !user.organization_id) {
      console.error('CRITICAL: User missing organization_id - redirecting to onboarding');
      navigate(createPageUrl('WelcomeOnboarding'), { replace: true });
      return;
    }

    // Check if user needs onboarding
    if (user && user.onboarding_completed !== true) {
      navigate(createPageUrl('WelcomeOnboarding'), { replace: true });
    }
  }, [user, isLoading, location.pathname, navigate]);

  // CRITICAL: Always render children immediately
  // Layout shell renders around this, so we never block it
  return children;
}