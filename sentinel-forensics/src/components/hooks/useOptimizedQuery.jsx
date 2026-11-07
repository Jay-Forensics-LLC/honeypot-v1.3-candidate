import { useEnhancedQuery } from './useEnhancedQuery';
import { useMemo } from 'react';

/**
 * OPTIMIZED QUERY HOOK
 * Wrapper with automatic optimization flags
 */
export function useOptimizedQuery(queryKey, queryFn, options = {}) {
  // Memoize query key to prevent unnecessary re-renders
  const memoizedKey = useMemo(() => queryKey, [JSON.stringify(queryKey)]);

  return useEnhancedQuery(memoizedKey, queryFn, {
    staleTime: 600000, // 10 min
    cacheTime: 1200000, // 20 min
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: 2000,
    enableCache: true,
    enableDedup: true,
    enableCircuitBreaker: true,
    enableRetry: true,
    enableRateLimit: true,
    ...options
  });
}

/**
 * CRITICAL DATA QUERY
 * For data that must be fresh
 */
export function useCriticalQuery(queryKey, queryFn, options = {}) {
  const memoizedKey = useMemo(() => queryKey, [JSON.stringify(queryKey)]);

  return useEnhancedQuery(memoizedKey, queryFn, {
    staleTime: 60000, // 1 min
    cacheTime: 300000, // 5 min
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    retry: 2,
    enableCache: false, // No caching for critical data
    enableDedup: true,
    enableCircuitBreaker: true,
    enableRetry: true,
    enableRateLimit: true,
    ...options
  });
}

/**
 * BACKGROUND QUERY
 * For non-critical data
 */
export function useBackgroundQuery(queryKey, queryFn, options = {}) {
  const memoizedKey = useMemo(() => queryKey, [JSON.stringify(queryKey)]);

  return useEnhancedQuery(memoizedKey, queryFn, {
    staleTime: 1800000, // 30 min
    cacheTime: 3600000, // 60 min
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 0,
    enableCache: true,
    enableDedup: true,
    enableCircuitBreaker: false,
    enableRetry: false,
    enableRateLimit: true,
    ...options
  });
}