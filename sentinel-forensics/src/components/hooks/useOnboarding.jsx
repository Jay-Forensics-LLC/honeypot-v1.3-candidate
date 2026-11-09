import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from './useUser';

/**
 * Hook for managing user onboarding state
 * @returns {Object} Onboarding data and mutations
 */
export function useOnboarding() {
  const queryClient = useQueryClient();
  const { data: user } = useUser();

  const { data: onboardingData, isLoading } = useQuery({
    queryKey: ['user-onboarding', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const records = await base44.entities.UserOnboarding.filter({
        user_email: user.email
      });
      return records[0] || null;
    },
    enabled: !!user?.email,
    staleTime: 60000
  });

  const updateOnboarding = useMutation({
    mutationFn: async (updates) => {
      if (onboardingData?.id) {
        return await base44.entities.UserOnboarding.update(onboardingData.id, updates);
      } else {
        return await base44.entities.UserOnboarding.create({
          user_email: user?.email,
          ...updates
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-onboarding'] });
    }
  });

  const completeOnboarding = useMutation({
    mutationFn: async () => {
      const updates = {
        onboarding_status: 'completed',
        completed_at: new Date().toISOString(),
        progress_percentage: 100
      };
      
      if (onboardingData?.id) {
        return await base44.entities.UserOnboarding.update(onboardingData.id, updates);
      } else {
        return await base44.entities.UserOnboarding.create({
          user_email: user?.email,
          ...updates
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-onboarding'] });
    }
  });

  const skipOnboarding = useMutation({
    mutationFn: async (reason) => {
      const updates = {
        onboarding_status: 'skipped',
        skip_reason: reason,
        completed_at: new Date().toISOString()
      };
      
      if (onboardingData?.id) {
        return await base44.entities.UserOnboarding.update(onboardingData.id, updates);
      } else {
        return await base44.entities.UserOnboarding.create({
          user_email: user?.email,
          ...updates
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-onboarding'] });
    }
  });

  return {
    data: onboardingData,
    isLoading,
    updateOnboarding,
    completeOnboarding,
    skipOnboarding,
    isCompleted: onboardingData?.onboarding_status === 'completed',
    isSkipped: onboardingData?.onboarding_status === 'skipped',
    progressPercentage: onboardingData?.progress_percentage || 0
  };
}