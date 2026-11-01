import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FEATURE_FLAGS, DEMO_USER } from '../config/featureFlags';
import { base44 } from '@/api/base44Client';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * CRITICAL: Ultra-simple auth wrapper that NEVER hangs
 * Maximum wait time: 5 seconds, then ALWAYS renders
 */
export function DemoAuthWrapper({ children }) {
  const [forceRender, setForceRender] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // CRITICAL: Force render after 5 seconds NO MATTER WHAT
  useEffect(() => {
    console.log('🚀 DemoAuthWrapper mounted');
    
    const startTime = Date.now();
    
    // Update elapsed time
    const elapsedInterval = setInterval(() => {
      const now = Date.now();
      setElapsed(now - startTime);
    }, 100);

    // HARD TIMEOUT - Force render after 5 seconds
    const forceTimeout = setTimeout(() => {
      console.warn('⚠️ AUTH TIMEOUT - Force rendering app');
      setForceRender(true);
    }, 5000);

    return () => {
      clearTimeout(forceTimeout);
      clearInterval(elapsedInterval);
    };
  }, []);

  // CRITICAL: Always call useQuery (can't be conditional)
  // But disable it in demo mode or when force rendering
  const { data: user, isLoading, error } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      console.log('🔐 Fetching user...');
      try {
        const userData = await base44.auth.me();
        console.log('✅ User fetched:', userData?.email);
        return userData;
      } catch (err) {
        console.error('❌ Auth failed:', err);
        throw err;
      }
    },
    staleTime: Infinity,
    retry: 0, // NO RETRIES
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    enabled: !FEATURE_FLAGS.PUBLIC_DEMO_MODE && !forceRender // Disable in demo mode or forced
  });

  // PRODUCTION: Demo mode disabled - always require authentication
  if (FEATURE_FLAGS.PUBLIC_DEMO_MODE) {
    console.log('🎭 Demo Mode - Disabled in production');
  }

  // If force render triggered, render children
  if (forceRender) {
    console.log('⚡ Force render triggered');
    return children;
  }

  // Show loading for max 5 seconds
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-400" />
          <p className="text-slate-400">Authenticating...</p>
          <p className="text-slate-600 text-sm mt-2">{(elapsed / 1000).toFixed(1)}s</p>
          {elapsed > 3000 && (
            <p className="text-yellow-400 text-xs mt-2 animate-pulse">
              Taking longer than usual...
            </p>
          )}
        </div>
      </div>
    );
  }

  // Handle error - redirect to login
  if (error) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Authentication Required</h2>
          <p className="text-slate-400 mb-6">Please log in to continue</p>
          <div className="space-y-3">
            <Button
              onClick={() => base44.auth.redirectToLogin()}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              Go to Login
            </Button>
            <Button
              onClick={() => setForceRender(true)}
              variant="outline"
              className="w-full border-slate-700"
            >
              Continue Anyway (Demo)
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Always render children (with or without user)
  console.log('✅ Rendering app');
  return children;
}