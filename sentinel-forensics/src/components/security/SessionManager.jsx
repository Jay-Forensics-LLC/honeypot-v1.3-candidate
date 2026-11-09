import { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

/**
 * MOBILE-OPTIMIZED Session Manager
 * Handles session expiry and idle timeout WITHOUT causing freezes
 * 
 * CRITICAL FIXES:
 * - Throttled event listeners
 * - Passive event handling
 * - No aggressive polling
 */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_BEFORE_MS = 5 * 60 * 1000; // 5 minute warning

export default function SessionManager({ user }) {
  useEffect(() => {
    if (!user) return;

    let idleTimer;
    let warningTimer;
    let lastActivity = Date.now();
    let throttleTimer;

    const resetTimers = () => {
      lastActivity = Date.now();
      
      clearTimeout(idleTimer);
      clearTimeout(warningTimer);

      // Set warning timer
      warningTimer = setTimeout(() => {
        toast.warning('Session expiring soon', {
          description: 'Your session will expire in 5 minutes due to inactivity',
          duration: 60000
        });
      }, IDLE_TIMEOUT_MS - WARNING_BEFORE_MS);

      // Set logout timer
      idleTimer = setTimeout(() => {
        toast.error('Session expired', {
          description: 'You have been logged out due to inactivity'
        });
        
        setTimeout(() => {
          base44.auth.logout();
        }, 1000);
      }, IDLE_TIMEOUT_MS);
    };

    // CRITICAL FIX: Throttle activity handler to prevent excessive resets
    const handleActivity = () => {
      if (throttleTimer) return; // Already scheduled
      
      throttleTimer = setTimeout(() => {
        if (Date.now() - lastActivity > 60000) { // Only reset if >1min since last reset
          resetTimers();
        }
        throttleTimer = null;
      }, 1000); // Max once per second
    };

    // CRITICAL FIX: Use passive listeners to prevent blocking
    const events = ['mousedown', 'keydown', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true, capture: false });
    });

    // Don't listen to scroll on mobile (causes performance issues)
    if (!(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent))) {
      document.addEventListener('scroll', handleActivity, { passive: true });
    }

    resetTimers();

    return () => {
      clearTimeout(idleTimer);
      clearTimeout(warningTimer);
      clearTimeout(throttleTimer);
      
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      
      document.removeEventListener('scroll', handleActivity);
    };
  }, [user]);

  return null;
}