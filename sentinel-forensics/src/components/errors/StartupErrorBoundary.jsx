import React from 'react';
import { Shield, RefreshCw, AlertTriangle, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * CRITICAL: Startup Error Boundary with enhanced debugging
 * Catches errors during initial app boot
 */
export default class StartupErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error) {
    // Suppress NotFoundError and DOM manipulation errors
    const suppressedErrors = ['NotFoundError', 'The object can not be found here', 'removeChild', 'insertBefore'];
    if (suppressedErrors.some(err => error?.message?.includes(err) || error?.name?.includes(err))) {
      console.debug('Suppressed startup error:', error?.message);
      return { hasError: false };
    }
    console.error('🚨 StartupErrorBoundary caught error:', error);
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    const suppressedErrors = ['NotFoundError', 'The object can not be found here', 'removeChild', 'insertBefore'];
    if (suppressedErrors.some(err => error?.message?.includes(err) || error?.name?.includes(err))) {
      return; // Suppress
    }
    
    const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
    
    console.error('🚨 STARTUP ERROR:', {
      error: error?.message,
      stack: error?.stack,
      componentStack: errorInfo?.componentStack
    });

    // CRITICAL: Detect hooks error
    if (error?.message?.includes('Minified React error #310') || 
        error?.message?.includes('hooks') ||
        error?.message?.includes('Rendered more hooks')) {
      console.error('🔴 REACT HOOKS ERROR DETECTED:', error.message);
    }

    if (isIOS) {
      console.error('🍎 iOS startup error');
    }

    this.setState({
      error,
      errorInfo,
      retryCount: this.state.retryCount + 1
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleClearAndReload = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      
      // Clear service worker cache
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          for (let registration of registrations) {
            registration.unregister();
          }
        });
      }
      
      // Clear all caches
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => caches.delete(name));
        });
      }
    } catch (err) {
      console.warn('Clear storage error:', err);
    }
    
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const { error } = this.state;
      const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
      const isHooksError = error?.message?.includes('310') || 
                           error?.message?.includes('hooks') ||
                           error?.message?.includes('Rendered more hooks');

      return (
        <div 
          className="min-h-screen bg-gradient-to-br from-red-950 to-slate-950 flex items-center justify-center p-6"
          style={{
            minHeight: isIOS ? '-webkit-fill-available' : '100vh',
            display: 'flex !important'
          }}
        >
          <div className="max-w-2xl w-full space-y-6">
            <div className="text-center">
              <AlertTriangle className="w-24 h-24 mx-auto mb-6 text-red-400 animate-pulse" />
              <h1 className="text-4xl font-bold text-white mb-3">
                🚨 Startup Failed
              </h1>
              {isIOS && (
                <p className="text-yellow-300 text-sm mb-2">
                  🍎 iOS Device: {navigator.userAgent.match(/iPhone OS ([\d_]+)/)?.[1]?.replace(/_/g, '.') || 'Unknown'}
                </p>
              )}
              <p className="text-red-200 text-lg">
                The app encountered a critical error during startup
              </p>
            </div>

            <div className="bg-red-900/30 border-2 border-red-500/50 rounded-lg p-6">
              <div className="flex items-start gap-3 mb-4">
                <Terminal className="w-5 h-5 text-red-300 flex-shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                  <p className="text-red-200 font-semibold mb-2">Error Details:</p>
                  <p className="text-red-100 font-mono text-sm break-all">
                    {error?.message || 'Unknown error'}
                  </p>
                  
                  {isHooksError && (
                    <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-500/30 rounded">
                      <p className="text-yellow-200 text-xs font-bold mb-1">
                        ⚠️ REACT HOOKS ERROR
                      </p>
                      <p className="text-yellow-100 text-xs">
                        This error occurs when React hooks are called conditionally or in the wrong order. 
                        The developer needs to ensure all useState, useEffect, and useQuery hooks are called 
                        before any conditional returns in components.
                      </p>
                    </div>
                  )}
                </div>
              </div>
              
              {error?.stack && (
                <details className="mt-3">
                  <summary className="text-red-300 text-xs cursor-pointer hover:text-red-200">
                    Show Stack Trace
                  </summary>
                  <pre className="mt-2 p-3 bg-black/30 rounded text-xs text-red-200 overflow-auto max-h-40">
                    {error.stack}
                  </pre>
                </details>
              )}
            </div>

            <div className="space-y-3">
              <Button
                onClick={this.handleReload}
                className="w-full bg-red-600 hover:bg-red-700 text-white text-lg py-6"
              >
                <RefreshCw className="w-5 h-5 mr-2" />
                Reload Application
              </Button>

              <Button
                onClick={this.handleClearAndReload}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white"
              >
                Clear All Data & Reload
              </Button>

              <div className="bg-slate-900/50 rounded-lg p-4 text-center">
                <p className="text-slate-400 text-sm">
                  Retry attempt: {this.state.retryCount}
                </p>
                <p className="text-slate-500 text-xs mt-1">
                  If this persists, contact support with the error details above
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}