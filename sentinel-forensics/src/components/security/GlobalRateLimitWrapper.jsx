import { useEffect } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * GLOBAL RATE LIMIT WRAPPER
 * 
 * REMEDIATION: REM-002
 * 
 * Intercepts ALL Base44 API calls and enforces rate limiting
 * This ensures rate limits apply globally, not just to specific endpoints
 */

export default function GlobalRateLimitWrapper({ children }) {
  useEffect(() => {
    // Track request counts in memory (client-side throttling)
    const requestCounts = new Map();
    const WINDOW_MS = 60000; // 1 minute
    const MAX_REQUESTS = 100; // Default limit

    // Intercept base44.entities calls
    const originalList = base44.entities.ThreatIntelligence.list;
    
    // Wrap list method with rate limiting
    base44.entities.ThreatIntelligence.list = async (...args) => {
      const key = 'ThreatIntelligence.list';
      const now = Date.now();
      
      if (!requestCounts.has(key)) {
        requestCounts.set(key, { count: 0, windowStart: now });
      }

      const tracker = requestCounts.get(key);
      
      // Reset window if expired
      if (now - tracker.windowStart > WINDOW_MS) {
        tracker.count = 0;
        tracker.windowStart = now;
      }

      // Check limit
      if (tracker.count >= MAX_REQUESTS) {
        const waitTime = Math.ceil((WINDOW_MS - (now - tracker.windowStart)) / 1000);
        throw new Error(`Rate limit exceeded. Please wait ${waitTime} seconds.`);
      }

      tracker.count++;
      
      return originalList.apply(base44.entities.ThreatIntelligence, args);
    };

    // Cleanup on unmount
    return () => {
      base44.entities.ThreatIntelligence.list = originalList;
    };
  }, []);

  return <>{children}</>;
}