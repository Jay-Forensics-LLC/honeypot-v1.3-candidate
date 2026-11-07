import { createContext, useContext, useCallback } from 'react';
import { toast } from 'sonner';
import { rateLimitMiddleware } from '@/functions/rateLimitMiddleware';

/**
 * RATE LIMIT GUARD - Client-Side Enforcement
 * 
 * REMEDIATION: REM-002
 * 
 * Wraps API calls with rate limit checking to prevent abuse
 * Works in conjunction with server-side rate limiting
 */

const RateLimitContext = createContext(null);

export const useRateLimit = () => {
  const context = useContext(RateLimitContext);
  if (!context) {
    throw new Error('useRateLimit must be used within RateLimitProvider');
  }
  return context;
};

export const RateLimitProvider = ({ children }) => {
  const checkRateLimit = useCallback(async (endpoint) => {
    try {
      const response = await rateLimitMiddleware({
        endpoint,
        ip_address: 'client' // Server will override with real IP
      });

      if (!response.data.allowed) {
        toast.error('Rate Limit Exceeded', {
          description: `Please wait ${response.data.retry_after || 60} seconds before trying again`,
          duration: 5000
        });
        return false;
      }

      // Show warning if close to limit
      if (response.data.remaining && response.data.remaining < 3) {
        toast.warning('Approaching Rate Limit', {
          description: `${response.data.remaining} requests remaining`,
          duration: 3000
        });
      }

      return true;
    } catch (error) {
      console.warn('Rate limit check failed:', error);
      // Fail-open: allow request if rate limit check fails
      return true;
    }
  }, []);

  const withRateLimit = useCallback(async (endpoint, apiCall) => {
    const allowed = await checkRateLimit(endpoint);
    
    if (!allowed) {
      throw new Error('Rate limit exceeded');
    }

    return await apiCall();
  }, [checkRateLimit]);

  return (
    <RateLimitContext.Provider value={{ checkRateLimit, withRateLimit }}>
      {children}
    </RateLimitContext.Provider>
  );
};

export default RateLimitProvider;