/**
 * PHASE 5: Mobile Navigation Optimization
 * 
 * Ensures flawless navigation on mobile devices with touch optimization,
 * gesture support, and iOS-specific fixes.
 */

import { useEffect } from 'react';

/**
 * Touch optimization for mobile navigation
 */
export function useTouchOptimization() {
  useEffect(() => {
    // Prevent pull-to-refresh when sidebar is open
    let lastTouchY = 0;
    
    const handleTouchStart = (e) => {
      lastTouchY = e.touches[0].clientY;
    };
    
    const handleTouchMove = (e) => {
      const touchY = e.touches[0].clientY;
      const touchDiff = touchY - lastTouchY;
      
      // Prevent pull-to-refresh on sidebar
      const sidebar = document.querySelector('aside');
      if (sidebar && e.target.closest('aside') && touchDiff > 0 && window.scrollY === 0) {
        e.preventDefault();
      }
    };
    
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);
}

/**
 * iOS-specific navigation fixes
 */
export function useIOSNavigationFixes() {
  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (!isIOS) return;

    // Fix iOS 100vh issue
    const setVH = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };

    setVH();
    window.addEventListener('resize', setVH);
    window.addEventListener('orientationchange', setVH);

    // Prevent iOS bounce scroll
    document.body.style.overscrollBehavior = 'none';

    return () => {
      window.removeEventListener('resize', setVH);
      window.removeEventListener('orientationchange', setVH);
    };
  }, []);
}

/**
 * Swipe gesture for sidebar (mobile)
 */
export function useSwipeGesture(onSwipeRight, onSwipeLeft) {
  useEffect(() => {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;

    const handleTouchStart = (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    };

    const handleTouchEnd = (e) => {
      touchEndX = e.changedTouches[0].screenX;
      touchEndY = e.changedTouches[0].screenY;
      handleSwipe();
    };

    const handleSwipe = () => {
      const diffX = touchEndX - touchStartX;
      const diffY = touchEndY - touchStartY;
      
      // Only trigger if horizontal swipe is dominant
      if (Math.abs(diffX) > Math.abs(diffY)) {
        // Swipe right (open sidebar)
        if (diffX > 50 && touchStartX < 50) {
          onSwipeRight?.();
        }
        // Swipe left (close sidebar)
        else if (diffX < -50) {
          onSwipeLeft?.();
        }
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onSwipeRight, onSwipeLeft]);
}

/**
 * Haptic feedback for navigation (mobile)
 */
export function triggerHapticFeedback(type = 'light') {
  if ('vibrate' in navigator) {
    const patterns = {
      light: [10],
      medium: [20],
      heavy: [30],
      success: [10, 20, 10],
      error: [50, 50, 50]
    };
    
    navigator.vibrate(patterns[type] || patterns.light);
  }
}