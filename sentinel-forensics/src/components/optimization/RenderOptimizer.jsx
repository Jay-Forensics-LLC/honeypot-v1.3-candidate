import React, { Suspense, memo, useTransition, useDeferredValue, startTransition } from 'react';
import { LoadingFallback } from '../demo/LoadingFallback';

/**
 * OPTIMIZED SUSPENSE WRAPPER
 * Suspense with loading fallback
 */
export function OptimizedSuspense({ children, fallback = <LoadingFallback /> }) {
  return (
    <Suspense fallback={fallback}>
      {children}
    </Suspense>
  );
}

/**
 * DEFERRED CONTENT
 * Defer low-priority updates
 */
export function DeferredContent({ children, delay = 0 }) {
  const deferredChildren = useDeferredValue(children);
  
  return (
    <div className="deferred-content">
      {deferredChildren}
    </div>
  );
}

/**
 * TRANSITION WRAPPER
 * Use transition API for non-urgent updates
 */
export function TransitionWrapper({ children, onStart, onComplete }) {
  const [isPending, startTransition] = useTransition();

  const handleTransition = (callback) => {
    if (onStart) onStart();
    
    startTransition(() => {
      callback();
      if (onComplete) onComplete();
    });
  };

  return children({ isPending, startTransition: handleTransition });
}

/**
 * MEMOIZED COMPONENT HOC
 * Deep memo with custom comparison
 */
export function withMemo(Component, propsAreEqual) {
  return memo(Component, propsAreEqual);
}

/**
 * RENDER THROTTLE HOC
 * Throttle component re-renders
 */
export function withRenderThrottle(Component, delayMs = 100) {
  return memo((props) => {
    const [throttledProps, setThrottledProps] = React.useState(props);
    const timeoutRef = React.useRef(null);

    React.useEffect(() => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setThrottledProps(props);
      }, delayMs);

      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, [props]);

    return <Component {...throttledProps} />;
  });
}

/**
 * INTERSECTION OBSERVER LAZY LOAD
 * Load component when visible
 */
export function LazyLoad({ 
  children, 
  fallback = null,
  rootMargin = '50px',
  threshold = 0.1 
}) {
  const [isVisible, setIsVisible] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [rootMargin, threshold]);

  return (
    <div ref={ref}>
      {isVisible ? children : fallback}
    </div>
  );
}

/**
 * FRAME-SYNCHRONIZED UPDATES
 * Batch updates within animation frame
 */
export function useFrameSync(callback) {
  const rafRef = React.useRef(null);
  const callbackRef = React.useRef(callback);

  React.useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const scheduleUpdate = React.useCallback((...args) => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      callbackRef.current(...args);
      rafRef.current = null;
    });
  }, []);

  React.useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return scheduleUpdate;
}

/**
 * BATCHED UPDATES
 * Batch multiple state updates
 */
export function useBatchedUpdates() {
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);
  const updates = React.useRef([]);
  const timeoutRef = React.useRef(null);

  const scheduleUpdate = React.useCallback((updateFn) => {
    updates.current.push(updateFn);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      const batchedUpdates = [...updates.current];
      updates.current = [];
      
      batchedUpdates.forEach(fn => fn());
      forceUpdate();
    }, 16); // ~60fps
  }, []);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return scheduleUpdate;
}

/**
 * DEBOUNCED RENDER
 * Debounce component re-renders
 */
export function useDebouncedRender(value, delayMs = 300) {
  const [debouncedValue, setDebouncedValue] = React.useState(value);

  React.useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debouncedValue;
}

/**
 * RENDER COUNT TRACKER
 * Track component render count (dev only)
 */
export function useRenderCount(componentName) {
  const renderCount = React.useRef(0);

  React.useEffect(() => {
    renderCount.current += 1;
    
    if (import.meta.env.MODE === 'development') {
      console.log(`[${componentName}] Render count: ${renderCount.current}`);
    }
  });

  return renderCount.current;
}