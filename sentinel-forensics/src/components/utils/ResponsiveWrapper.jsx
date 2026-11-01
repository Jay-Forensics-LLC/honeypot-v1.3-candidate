import { useEffect } from 'react';

/**
 * iOS-OPTIMIZED Responsive Wrapper - MINIMAL VERSION
 * Removed complex logic that might cause issues
 */
export default function ResponsiveWrapper({ children }) {
  useEffect(() => {
    // Simple viewport height fix for iOS
    const setVH = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };

    setVH();
    
    let resizeTimer;
    const debouncedSetVH = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(setVH, 150);
    };
    
    window.addEventListener('resize', debouncedSetVH);
    window.addEventListener('orientationchange', setVH);

    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', debouncedSetVH);
      window.removeEventListener('orientationchange', setVH);
    };
  }, []);

  return (
    <>
      {/* Minimal meta tags */}
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <meta name="theme-color" content="#0B0B0C" />
      {children}
    </>
  );
}