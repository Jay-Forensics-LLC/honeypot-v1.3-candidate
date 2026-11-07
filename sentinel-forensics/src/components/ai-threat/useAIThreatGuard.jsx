/**
 * AI THREAT GUARD HOOK
 * 
 * React hook to wrap AI operations with automatic threat detection.
 * Use this to protect any AI input/output in the application.
 * 
 * SECURITY: This is a defense-in-depth layer.
 */

import { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { quickThreatCheck, createThreatContext } from './AIContentAnalyzer';
import { toast } from 'sonner';

/**
 * Hook for AI threat protection
 * @param {Object} options - Configuration options
 * @returns {Object} - Guard functions and state
 */
export function useAIThreatGuard(options = {}) {
  const {
    blockOnCritical = true,
    warnOnHigh = true,
    logAllAnalysis = false,
    contextProvider = null
  } = options;

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState(null);

  /**
   * Analyze content for AI threats
   * @param {string} content - Content to analyze
   * @param {string} direction - 'input' or 'output'
   * @returns {Promise<Object>} - Analysis result
   */
  const analyzeContent = useCallback(async (content, direction = 'input') => {
    if (!content || typeof content !== 'string') {
      return { safe: true, blocked: false };
    }

    setIsAnalyzing(true);

    try {
      // Quick client-side check first
      const quickResult = quickThreatCheck(content);
      
      // If critical threat detected client-side and blocking enabled, block immediately
      if (quickResult.maxSeverity === 'critical' && blockOnCritical) {
        setLastAnalysis(quickResult);
        setIsAnalyzing(false);
        
        toast.error('Critical AI threat detected - request blocked', {
          description: `Detected: ${quickResult.threats.map(t => t.type).join(', ')}`
        });
        
        return {
          safe: false,
          blocked: true,
          severity: 'critical',
          threats: quickResult.threats,
          source: 'client'
        };
      }

      // Full backend analysis for detected threats or if logging all
      if (quickResult.detected || logAllAnalysis) {
        const context = contextProvider ? contextProvider() : createThreatContext();
        
        const { data } = await base44.functions.invoke('aiThreatDetector', {
          action: 'analyze',
          content,
          direction,
          context
        });

        setLastAnalysis(data);

        // Handle critical threats
        if (data.severity === 'critical' && blockOnCritical) {
          toast.error('Critical AI threat detected - request blocked', {
            description: data.recommendation
          });
          
          return {
            safe: false,
            blocked: true,
            severity: data.severity,
            threats: data.threats,
            threatEventId: data.threat_event_id,
            source: 'backend'
          };
        }

        // Warn on high severity
        if (data.severity === 'high' && warnOnHigh) {
          toast.warning('Potential AI threat detected', {
            description: data.recommendation
          });
        }

        return {
          safe: !data.detected || data.severity === 'low' || data.severity === 'info',
          blocked: data.blocked,
          severity: data.severity,
          threats: data.threats,
          threatEventId: data.threat_event_id,
          recommendation: data.recommendation,
          source: 'backend'
        };
      }

      // No threats detected
      setLastAnalysis({ safe: true });
      return { safe: true, blocked: false };

    } catch (error) {
      console.error('[AI_THREAT_GUARD] Analysis error:', error);
      // Fail open with warning - don't block legitimate requests due to analysis errors
      toast.warning('AI threat analysis unavailable', {
        description: 'Proceeding with caution'
      });
      return { safe: true, blocked: false, error: error.message };
    } finally {
      setIsAnalyzing(false);
    }
  }, [blockOnCritical, warnOnHigh, logAllAnalysis, contextProvider]);

  /**
   * Wrap an async function with AI threat protection
   * @param {Function} fn - Function to wrap
   * @param {Object} options - Options for extraction
   * @returns {Function} - Wrapped function
   */
  const guardAsync = useCallback((fn, extractOptions = {}) => {
    const { 
      inputExtractor = (args) => args[0], 
      outputExtractor = (result) => result,
      direction = 'both'
    } = extractOptions;

    return async (...args) => {
      // Check input
      if (direction === 'both' || direction === 'input') {
        const input = inputExtractor(args);
        if (input) {
          const inputAnalysis = await analyzeContent(input, 'input');
          if (inputAnalysis.blocked) {
            throw new Error(`AI threat blocked: ${inputAnalysis.threats?.map(t => t.type).join(', ')}`);
          }
        }
      }

      // Execute function
      const result = await fn(...args);

      // Check output
      if (direction === 'both' || direction === 'output') {
        const output = outputExtractor(result);
        if (output) {
          const outputAnalysis = await analyzeContent(output, 'output');
          if (outputAnalysis.blocked) {
            throw new Error(`AI output threat blocked: ${outputAnalysis.threats?.map(t => t.type).join(', ')}`);
          }
        }
      }

      return result;
    };
  }, [analyzeContent]);

  /**
   * Protected InvokeLLM wrapper
   * @param {Object} params - InvokeLLM parameters
   * @returns {Promise<any>} - LLM response
   */
  const protectedInvokeLLM = useCallback(async (params) => {
    const { prompt, ...rest } = params;

    // Analyze input prompt
    const inputAnalysis = await analyzeContent(prompt, 'input');
    if (inputAnalysis.blocked) {
      throw new Error(`Prompt blocked due to detected threat: ${inputAnalysis.threats?.map(t => t.type).join(', ')}`);
    }

    // Call LLM
    const result = await base44.integrations.Core.InvokeLLM({ prompt, ...rest });

    // Analyze output
    const outputContent = typeof result === 'string' ? result : JSON.stringify(result);
    const outputAnalysis = await analyzeContent(outputContent, 'output');
    
    if (outputAnalysis.blocked) {
      throw new Error(`LLM output blocked due to detected threat: ${outputAnalysis.threats?.map(t => t.type).join(', ')}`);
    }

    // If high severity in output, add warning to result
    if (outputAnalysis.severity === 'high') {
      console.warn('[AI_THREAT_GUARD] High severity threat in LLM output:', outputAnalysis);
    }

    return result;
  }, [analyzeContent]);

  return {
    analyzeContent,
    guardAsync,
    protectedInvokeLLM,
    isAnalyzing,
    lastAnalysis
  };
}

export default useAIThreatGuard;