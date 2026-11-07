import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from './useUser';

/**
 * PHASE 5: Frontend Hook for AI Orchestrator
 * Simplifies calling orchestrator with structured payload
 */
export function useAIOrchestrator() {
  const { data: user } = useUser();

  return useMutation({
    mutationFn: async ({
      taskType,
      prompt,
      sensitivity = 'medium',
      latencyToleranceMs = 10000,
      context,
      rawDataRefs,
      responseJsonSchema,
      temperature,
      maxTokens
    }) => {
      const payload = {
        orgId: user?.organization_id,
        userId: user?.email,
        taskType,
        sensitivity,
        costTier: user?.subscription_tier || 'free',
        latencyToleranceMs,
        input: {
          prompt,
          ...(context && { context }),
          ...(rawDataRefs && { rawDataRefs })
        },
        ...(responseJsonSchema && { response_json_schema: responseJsonSchema }),
        ...(temperature !== undefined && { temperature }),
        ...(maxTokens && { max_tokens: maxTokens })
      };

      const result = await base44.functions.invoke('aiOrchestrator', payload);
      return result.data;
    }
  });
}

/**
 * Shortcut for forensic case analysis
 */
export function useForensicAnalysis() {
  const orchestrator = useAIOrchestrator();

  return useMutation({
    mutationFn: async ({ caseData, evidenceRefs = [] }) => {
      return orchestrator.mutateAsync({
        taskType: 'forensic_report',
        prompt: `Analyze this forensic case and provide comprehensive findings.`,
        sensitivity: 'high',
        latencyToleranceMs: 15000,
        context: caseData,
        rawDataRefs: evidenceRefs
      });
    }
  });
}

/**
 * Shortcut for quick evidence summaries
 */
export function useEvidenceSummary() {
  const orchestrator = useAIOrchestrator();

  return useMutation({
    mutationFn: async ({ evidenceData, evidenceId }) => {
      return orchestrator.mutateAsync({
        taskType: 'quick_summary',
        prompt: `Provide a concise forensic summary of this evidence.`,
        sensitivity: 'low',
        latencyToleranceMs: 5000,
        context: evidenceData,
        rawDataRefs: evidenceId ? [evidenceId] : []
      });
    }
  });
}