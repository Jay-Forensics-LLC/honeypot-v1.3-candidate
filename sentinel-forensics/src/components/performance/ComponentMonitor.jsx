import { useEffect, useRef } from 'react';
import { logger } from '../utils/logger';

/**
 * COMPONENT PERFORMANCE MONITOR
 * Tracks component render performance
 */
export function useRenderMonitor(componentName) {
  const renderCount = useRef(0);
  const lastRender = useRef(Date.now());

  useEffect(() => {
    renderCount.current++;
    const now = Date.now();
    const timeSinceLastRender = now - lastRender.current;
    lastRender.current = now;

    // Warn if component renders too frequently
    if (renderCount.current > 10 && timeSinceLastRender < 100) {
      logger.warn('Excessive re-renders detected', {
        component: componentName,
        renderCount: renderCount.current,
        timeSinceLastRender
      });
    }
  });

  return {
    renderCount: renderCount.current,
    reset: () => {
      renderCount.current = 0;
      lastRender.current = Date.now();
    }
  };
}

/**
 * MEMORY LEAK DETECTOR
 * Detects potential memory leaks in components
 */
export function useMemoryLeakDetector(componentName) {
  const mountTime = useRef(Date.now());
  const timers = useRef([]);
  const listeners = useRef([]);

  useEffect(() => {
    return () => {
      const lifespan = Date.now() - mountTime.current;
      
      // Check for uncleared timers
      if (timers.current.length > 0) {
        logger.warn('Component unmounted with active timers', {
          component: componentName,
          timerCount: timers.current.length,
          lifespan
        });
      }

      // Check for unremoved listeners
      if (listeners.current.length > 0) {
        logger.warn('Component unmounted with active listeners', {
          component: componentName,
          listenerCount: listeners.current.length,
          lifespan
        });
      }
    };
  }, [componentName]);

  return {
    trackTimer: (id) => timers.current.push(id),
    clearTimer: (id) => {
      const index = timers.current.indexOf(id);
      if (index > -1) timers.current.splice(index, 1);
    },
    trackListener: (name) => listeners.current.push(name),
    clearListener: (name) => {
      const index = listeners.current.indexOf(name);
      if (index > -1) listeners.current.splice(index, 1);
    }
  };
}