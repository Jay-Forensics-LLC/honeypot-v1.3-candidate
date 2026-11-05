import React, { useState, useEffect, useRef } from 'react';

/**
 * PHASE 6: Lazy Load Component
 * Defers rendering of children until they're in viewport
 */
export default function LazyLoad({ 
  children, 
  placeholder = null,
  rootMargin = '50px',
  threshold = 0.01
}) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
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
      {isVisible ? children : placeholder}
    </div>
  );
}