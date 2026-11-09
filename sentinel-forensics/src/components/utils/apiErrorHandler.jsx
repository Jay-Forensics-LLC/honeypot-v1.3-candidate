/**
 * PHASE 2: Centralized API Error Handler
 * Standardizes error handling across all API calls with retry logic
 */

import { toast } from 'sonner';
import { getUserFriendlyError } from './errorHandler';

class APIErrorHandler {
  constructor() {
    this.defaultRetryConfig = {
      maxRetries: 2,
      retryDelay: 1000,
      retryableStatusCodes: [408, 429, 500, 502, 503, 504],
      retryableErrors: ['NetworkError', 'TimeoutError', 'ECONNREFUSED']
    };
  }

  /**
   * Check if error is retryable
   */
  isRetryable(error, method = 'GET') {
    // Never retry non-idempotent operations by default
    if (['POST', 'PUT', 'DELETE'].includes(method.toUpperCase())) {
      return false;
    }

    // Check status code
    if (error?.response?.status && 
        this.defaultRetryConfig.retryableStatusCodes.includes(error.response.status)) {
      return true;
    }

    // Check error type
    const errorType = error?.name || error?.type || '';
    return this.defaultRetryConfig.retryableErrors.some(type => 
      errorType.includes(type)
    );
  }

  /**
   * Wait with exponential backoff
   */
  async wait(attempt, baseDelay = 1000) {
    const delay = baseDelay * Math.pow(2, attempt);
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Wrap API call with retry logic
   */
  async withRetry(apiCall, options = {}) {
    const {
      maxRetries = this.defaultRetryConfig.maxRetries,
      retryDelay = this.defaultRetryConfig.retryDelay,
      method = 'GET',
      context = '',
      silent = false
    } = options;

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await apiCall();
      } catch (error) {
        lastError = error;
        
        // Log error
        console.error(`API call failed (attempt ${attempt + 1}/${maxRetries + 1})${context ? ` - ${context}` : ''}:`, error);

        // Check if should retry
        if (attempt < maxRetries && this.isRetryable(error, method)) {
          await this.wait(attempt, retryDelay);
          continue;
        }

        // No more retries, handle error
        break;
      }
    }

    // All retries exhausted, surface error
    return this.handleError(lastError, { silent, context });
  }

  /**
   * Handle error and show user-friendly message
   */
  handleError(error, options = {}) {
    const { silent = false, context = '' } = options;

    const userMessage = getUserFriendlyError(error);
    
    // Log to console for debugging
    console.error('API Error:', {
      context,
      message: error?.message,
      status: error?.response?.status,
      data: error?.response?.data
    });

    // Show toast notification unless silent
    if (!silent) {
      const isAuthError = error?.response?.status === 401 || 
                          error?.message?.toLowerCase().includes('unauthorized');
      
      toast.error(userMessage, {
        description: context || undefined,
        duration: isAuthError ? 5000 : 4000,
        style: {
          background: '#7F1D1D',
          border: '1px solid #DC2626',
          color: '#FEE2E2'
        }
      });
    }

    // Throw the error for caller to handle
    throw error;
  }

  /**
   * Wrapper for safe API calls that always resolve
   */
  async safe(apiCall, options = {}) {
    try {
      const result = await this.withRetry(apiCall, { ...options, silent: true });
      return { success: true, data: result, error: null };
    } catch (error) {
      return { 
        success: false, 
        data: null, 
        error: getUserFriendlyError(error) 
      };
    }
  }
}

// Singleton instance
export const apiErrorHandler = new APIErrorHandler();

/**
 * Quick helper functions
 */
export const withRetry = (apiCall, options) => 
  apiErrorHandler.withRetry(apiCall, options);

export const safeAPI = (apiCall, options) => 
  apiErrorHandler.safe(apiCall, options);