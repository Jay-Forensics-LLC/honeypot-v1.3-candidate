import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * Custom hook for user data with optimized caching
 * @returns {Object} User query result with data, isLoading, error
 */
export function useUser() {
  return useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      try {
        const result = await base44.auth.me();
        console.log('✅ User loaded successfully:', result?.email);
        return result;
      } catch (error) {
        console.error('❌ useUser fetch error:', {
          message: error?.message,
          response: error?.response?.data,
          status: error?.response?.status,
          url: window.location.href
        });
        // CRITICAL: Provide detailed error context for debugging
        throw new Error(error?.response?.data?.message || error?.message || 'Failed to load user session');
      }
    },
    staleTime: 600000, // 10 minutes - PHASE 5: Extended cache
    gcTime: 1200000, // 20 minutes (formerly cacheTime)
    retry: 3, // INCREASED: Try 3 times on failure
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000), // Exponential backoff
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: true, // CHANGED: Reconnect should refetch
    suspense: false,
    useErrorBoundary: false,
    networkMode: 'online' // Only run when online
  });
}

/**
 * Check if current user is admin
 * @returns {boolean} True if user is admin
 */
export function useIsAdmin() {
  const { data: user } = useUser();
  return user?.role === 'admin';
}

/**
 * Check if user has specific role
 * @param {string} role - Role to check
 * @returns {boolean} True if user has role
 */
export function useHasRole(role) {
  const { data: user } = useUser();
  return user?.role === role;
}

/**
 * Get user's subscription tier
 * @returns {string} Subscription tier (free, professional, enterprise, forensic_suite)
 */
export function useSubscriptionTier() {
  const { data: user } = useUser();
  return user?.subscription_tier || 'free';
}