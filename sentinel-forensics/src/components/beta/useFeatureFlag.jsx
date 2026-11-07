import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * Hook to check if a feature flag is enabled for current user
 * @param {string} flagKey - Feature flag key
 * @returns {{ enabled: boolean, loading: boolean, reason: string }}
 */
export function useFeatureFlag(flagKey) {
  const { data, isLoading } = useQuery({
    queryKey: ['feature-flag', flagKey],
    queryFn: async () => {
      const response = await base44.functions.invoke('checkFeatureFlag', { flag_key: flagKey });
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: !!flagKey
  });

  return {
    enabled: data?.enabled || false,
    loading: isLoading,
    reason: data?.reason || 'unknown'
  };
}