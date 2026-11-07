/**
 * AI THREAT INTERCEPTOR
 * 
 * Global interceptor that wraps AI integrations to automatically
 * scan all inputs and outputs for threats.
 * 
 * USAGE: Import and use the wrapped functions instead of direct base44 calls
 * 
 * import { safeInvokeLLM, safeGenerateImage } from '@/components/ai-threat/AIThreatInterceptor';
 */

import { base44 } from '@/api/base44Client';
import { quickThreatCheck, hashContent, createThreatContext } from './AIContentAnalyzer';

// Configuration
const CONFIG = {
  blockOnCritical: true,
  logAllRequests: true,
  enableBackendAnalysis: true,
  maxContentLength: 100000,
  timeoutMs: 30000
};

/**
 * Log threat event to backend
 */
async function logThreatToBackend(content, direction, analysis, context = {}) {
  if (!CONFIG.enableBackendAnalysis) return;
  
  try {
    await base44.functions.invoke('aiThreatDetector', {
      action: 'analyze',
      content,
      direction,
      context: {
        ...createThreatContext(),
        ...context
      }
    });
  } catch (error) {
    console.error('[AI_THREAT_INTERCEPTOR] Failed to log threat:', error);
  }
}

/**
 * Sanitize content before AI processing
 */
function sanitizeInput(content) {
  if (!content || typeof content !== 'string') return content;
  
  // Remove potential delimiter injection
  let sanitized = content
    .replace(/<\|im_start\|>/gi, '')
    .replace(/<\|im_end\|>/gi, '')
    .replace(/\[system\]/gi, '[sys]')
    .replace(/\[assistant\]/gi, '[asst]')
    .replace(/###\s*system/gi, '### sys');
  
  // Limit length
  if (sanitized.length > CONFIG.maxContentLength) {
    sanitized = sanitized.substring(0, CONFIG.maxContentLength);
    console.warn('[AI_THREAT_INTERCEPTOR] Content truncated to max length');
  }
  
  return sanitized;
}

/**
 * Safe wrapper for InvokeLLM
 */
export async function safeInvokeLLM(params) {
  const { prompt, ...rest } = params;
  
  // Pre-flight threat check on input
  const inputCheck = quickThreatCheck(prompt);
  
  if (inputCheck.detected) {
    console.warn('[AI_THREAT_INTERCEPTOR] Threat detected in input:', inputCheck);
    
    // Log to backend
    logThreatToBackend(prompt, 'input', inputCheck, { operation: 'InvokeLLM' });
    
    if (inputCheck.maxSeverity === 'critical' && CONFIG.blockOnCritical) {
      throw new Error(`AI request blocked: Critical threat detected (${inputCheck.threats.map(t => t.type).join(', ')})`);
    }
  }
  
  // Sanitize input
  const sanitizedPrompt = sanitizeInput(prompt);
  
  // Call the actual LLM
  const result = await base44.integrations.Core.InvokeLLM({
    prompt: sanitizedPrompt,
    ...rest
  });
  
  // Post-flight threat check on output
  const outputContent = typeof result === 'string' ? result : JSON.stringify(result);
  const outputCheck = quickThreatCheck(outputContent);
  
  if (outputCheck.detected) {
    console.warn('[AI_THREAT_INTERCEPTOR] Threat detected in output:', outputCheck);
    
    // Log to backend
    logThreatToBackend(outputContent, 'output', outputCheck, { operation: 'InvokeLLM' });
    
    if (outputCheck.maxSeverity === 'critical' && CONFIG.blockOnCritical) {
      throw new Error(`AI response blocked: Critical threat detected in output`);
    }
  }
  
  return result;
}

/**
 * Safe wrapper for GenerateImage
 */
export async function safeGenerateImage(params) {
  const { prompt, ...rest } = params;
  
  // Pre-flight threat check
  const inputCheck = quickThreatCheck(prompt);
  
  if (inputCheck.detected) {
    console.warn('[AI_THREAT_INTERCEPTOR] Threat detected in image prompt:', inputCheck);
    logThreatToBackend(prompt, 'input', inputCheck, { operation: 'GenerateImage' });
    
    if (inputCheck.maxSeverity === 'critical' && CONFIG.blockOnCritical) {
      throw new Error(`Image generation blocked: Critical threat detected`);
    }
  }
  
  // Sanitize
  const sanitizedPrompt = sanitizeInput(prompt);
  
  return base44.integrations.Core.GenerateImage({
    prompt: sanitizedPrompt,
    ...rest
  });
}

/**
 * Safe wrapper for ExtractDataFromUploadedFile
 */
export async function safeExtractData(params) {
  const result = await base44.integrations.Core.ExtractDataFromUploadedFile(params);
  
  // Check output for threats
  if (result.output) {
    const outputContent = JSON.stringify(result.output);
    const outputCheck = quickThreatCheck(outputContent);
    
    if (outputCheck.detected) {
      console.warn('[AI_THREAT_INTERCEPTOR] Threat detected in extracted data:', outputCheck);
      logThreatToBackend(outputContent, 'output', outputCheck, { operation: 'ExtractData' });
    }
  }
  
  return result;
}

/**
 * Create a protected version of any function that processes AI content
 */
export function createProtectedFunction(fn, options = {}) {
  const {
    inputExtractor = (args) => args[0]?.prompt || args[0],
    outputExtractor = (result) => typeof result === 'string' ? result : JSON.stringify(result),
    operationName = 'unknown'
  } = options;
  
  return async (...args) => {
    // Check input
    const input = inputExtractor(args);
    if (input && typeof input === 'string') {
      const inputCheck = quickThreatCheck(input);
      if (inputCheck.detected) {
        logThreatToBackend(input, 'input', inputCheck, { operation: operationName });
        if (inputCheck.maxSeverity === 'critical' && CONFIG.blockOnCritical) {
          throw new Error(`Operation blocked: Critical AI threat detected`);
        }
      }
    }
    
    // Execute function
    const result = await fn(...args);
    
    // Check output
    const output = outputExtractor(result);
    if (output && typeof output === 'string') {
      const outputCheck = quickThreatCheck(output);
      if (outputCheck.detected) {
        logThreatToBackend(output, 'output', outputCheck, { operation: operationName });
        if (outputCheck.maxSeverity === 'critical' && CONFIG.blockOnCritical) {
          throw new Error(`Operation blocked: Critical AI threat in response`);
        }
      }
    }
    
    return result;
  };
}

/**
 * Batch analyze multiple contents
 */
export async function batchAnalyze(contents, direction = 'input') {
  const results = [];
  
  for (const content of contents) {
    const check = quickThreatCheck(content);
    results.push({
      content: content.substring(0, 100) + '...',
      detected: check.detected,
      severity: check.maxSeverity,
      threats: check.threats
    });
    
    if (check.detected) {
      await logThreatToBackend(content, direction, check, { operation: 'batchAnalyze' });
    }
  }
  
  return {
    total: contents.length,
    detected: results.filter(r => r.detected).length,
    results
  };
}

export default {
  safeInvokeLLM,
  safeGenerateImage,
  safeExtractData,
  createProtectedFunction,
  batchAnalyze,
  CONFIG
};