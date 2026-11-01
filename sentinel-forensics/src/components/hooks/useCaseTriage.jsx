import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

/**
 * Hook for triggering AI case triage
 */
export function useCaseTriage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (caseId) => {
      const result = await base44.functions.invoke('aiCaseTriage', { caseId });
      return result.data;
    },
    onSuccess: (data, caseId) => {
      toast.success(`Case triaged: ${data.triage.priority} priority assigned`);
      queryClient.invalidateQueries({ queryKey: ['case', caseId] });
      queryClient.invalidateQueries({ queryKey: ['org-query', 'Case'] });
    },
    onError: (error) => {
      toast.error(`Triage failed: ${error.message}`);
    }
  });
}