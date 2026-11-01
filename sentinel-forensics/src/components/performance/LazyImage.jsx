/**
 * PHASE 4: Lazy Loading Image Component
 * Optimizes image loading with IntersectionObserver
 */

import React, { useState, useEffect, useRef } from 'react';

export function LazyImage({ 
  src, 
  alt, 
  placeholder = '/placeholder.png',
  className = '',
  threshold = 0.1,
  ...props 
}) {
  const [imageSrc, setImageSrc] = useState(placeholder);
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    let observer;
    const imgElement = imgRef.current;

    if (imgElement && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setImageSrc(src);
              observer.unobserve(imgElement);
            }
          });
        },
        { threshold }
      );

      observer.observe(imgElement);
    } else {
      // Fallback for browsers without IntersectionObserver
      setImageSrc(src);
    }

    return () => {
      if (observer && imgElement) {
        observer.unobserve(imgElement);
      }
    };
  }, [src, threshold]);

  return (
    <img
      ref={imgRef}
      src={imageSrc}
      alt={alt}
      className={`${className} ${isLoaded ? 'opacity-100' : 'opacity-50'} transition-opacity duration-300`}
      onLoad={() => setIsLoaded(true)}
      loading="lazy"
      {...props}
    />
  );
}

export default LazyImage;