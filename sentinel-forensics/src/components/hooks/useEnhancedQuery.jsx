import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { enhancedQuery, enhancedMutation } from '../lib/APIClient';

/**
 * ENHANCED QUERY HOOK
 * Drop-in replacement for useQuery with performance optimizations
 */
export function useEnhancedQuery(queryKey, queryFn, options = {}) {
  const {
    cacheTTL = 300000,
    enableCache = true,
    enableDedup = true,
    enableCircuitBreaker = true,
    enableRetry = true,
    enableRateLimit = true,
    breakerName = 'default',
    ...reactQueryOptions
  } = options;

  return useQuery({
    queryKey,
    queryFn: () => enhancedQuery({
      queryKey,
      queryFn,
      cacheTTL,
      enableCache,
      enableDedup,
      enableCircuitBreaker,
      enableRetry,
      enableRateLimit,
      breakerName
    }),
    ...reactQueryOptions
  });
}

/**
 * ENHANCED MUTATION HOOK
 * Drop-in replacement for useMutation with cache invalidation
 */
export function useEnhancedMutation(mutationFn, options = {}) {
  const queryClient = useQueryClient();
  const {
    invalidatePatterns = [],
    invalidateQueries = [],
    enableCircuitBreaker = true,
    breakerName = 'mutations',
    ...reactQueryOptions
  } = options;

  return useMutation({
    mutationFn: enhancedMutation({
      mutationFn,
      invalidatePatterns,
      enableCircuitBreaker,
      breakerName
    }),
    onSuccess: (data, variables, context) => {
      // Invalidate React Query caches
      invalidateQueries.forEach(queryKey => {
        queryClient.invalidateQueries({ queryKey });
      });

      // Call user's onSuccess
      if (reactQueryOptions.onSuccess) {
        reactQueryOptions.onSuccess(data, variables, context);
      }
    },
    ...reactQueryOptions
  });
}