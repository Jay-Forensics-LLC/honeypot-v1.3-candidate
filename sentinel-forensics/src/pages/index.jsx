/**
 * ROOT APP ENTRY POINT (pages/index.js)
 * 
 * Base44 Platform Entry - exports the App component for platform mounting.
 * Platform handles ReactDOM.createRoot internally.
 * Global error handlers initialized here.
 */

import React, { useEffect } from "react";
import App from "./App";

// Global Error Handler Component
function GlobalErrorHandlers({ children }) {
  useEffect(() => {
    // PHASE 9: Suppress Sentry noise in non-production environments
    if (import.meta.env?.MODE !== 'production' && import.meta.env?.PROD !== true) {
      // Filter out Sentry console spam in dev/preview
      const originalError = console.error;
      console.error = (...args) => {
        const msg = args.join(' ');
        if (msg.includes('Sentry') || msg.includes('sentry') || 
            msg.includes('envelope') || msg.includes('403')) {
          return; // Suppress Sentry-related errors in non-production
        }
        originalError.apply(console, args);
      };
    }

    // PHASE 8: Scoped error handlers - only suppress known non-actionable browser noise
    const handleUnhandledRejection = (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      
      // Suppress ONLY known non-actionable browser extension errors
      if (event.reason?.message?.includes('Extension context invalidated') ||
          event.reason?.message?.includes('chrome-extension://')) {
        console.warn('⚠️ Browser extension error suppressed (non-actionable)');
        event.preventDefault();
        return;
      }

      // WebSocket connection failures are non-critical (offline queue handles them)
      if (event.reason?.message?.includes('WebSocket') || 
          event.reason?.message?.includes('websocket')) {
        console.warn('⚠️ WebSocket connection error (non-critical, will retry)');
        event.preventDefault();
        return;
      }

      // Log all other errors for diagnostics
      try {
        const errors = JSON.parse(localStorage.getItem('sentinel_error_log') || '[]');
        errors.unshift({
          type: 'unhandledrejection',
          message: event.reason?.message || String(event.reason),
          stack: event.reason?.stack,
          timestamp: new Date().toISOString(),
          route: window.location.pathname
        });
        localStorage.setItem('sentinel_error_log', JSON.stringify(errors.slice(0, 50)));
      } catch (e) {
        // Ignore storage errors
      }
    };

    const handleError = (event) => {
      console.error('Global error:', event.error);
      
      // Suppress ONLY ResizeObserver loop errors (browser quirk, non-actionable)
      if (event.message?.includes('ResizeObserver loop')) {
        console.warn('⚠️ ResizeObserver loop error suppressed (browser quirk)');
        event.preventDefault();
        return;
      }

      // Suppress browser extension errors
      if (event.message?.includes('Extension context invalidated') ||
          event.filename?.includes('chrome-extension://') ||
          event.filename?.includes('moz-extension://')) {
        console.warn('⚠️ Browser extension error suppressed');
        event.preventDefault();
        return;
      }

      // Log all other errors for diagnostics
      try {
        const errors = JSON.parse(localStorage.getItem('sentinel_error_log') || '[]');
        errors.unshift({
          type: 'error',
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
          timestamp: new Date().toISOString(),
          route: window.location.pathname
        });
        localStorage.setItem('sentinel_error_log', JSON.stringify(errors.slice(0, 50)));
      } catch (e) {
        // Ignore storage errors
      }
    };

    // iOS Detection
    if (typeof window !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
      console.log('🍎 iOS Detected:', {
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        pixelRatio: window.devicePixelRatio,
        standalone: window.navigator.standalone
      });
    }

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);

  return children;
}

export default function IndexPage() {
  return (
    <GlobalErrorHandlers>
      <App />
    </GlobalErrorHandlers>
  );
}