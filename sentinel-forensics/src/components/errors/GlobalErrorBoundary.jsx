import React from 'react';
import { Shield, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * PERFORMANCE OPTIMIZED ErrorBoundary v2.0
 * - Minimal state
 * - Fast error display
 * - No heavy computations
 */
export default class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // PHASE 2: Narrowly defined framework errors only
    // Only suppress known React/Radix reconciliation issues
    const knownFrameworkErrors = [
      'removeChild: The node to be removed is not a child of this node',
      'insertBefore: Child to insert before is not a child of this node',
      'NotFoundError: Failed to execute \'removeChild\' on \'Node\''
    ];
    
    const errorString = error?.message || '';
    const isFrameworkError = knownFrameworkErrors.some(msg => 
      errorString.includes(msg)
    );
    
    if (isFrameworkError) {
      console.debug('Framework DOM reconciliation (safe):', errorString);
      return { hasError: false, error: null };
    }
    
    // All other errors are surfaced
    return { hasError: true, error };
  }

  async componentDidCatch(error, errorInfo) {
    // PHASE 8: Only skip narrow framework errors
    const knownFrameworkErrors = [
      'removeChild: The node to be removed is not a child of this node',
      'insertBefore: Child to insert before is not a child of this node'
    ];
    
    if (knownFrameworkErrors.some(msg => error?.message?.includes(msg))) {
      return;
    }
    
    // PHASE 8: Enhanced error logging with full context
    const errorLog = {
      timestamp: new Date().toISOString(),
      name: error.name,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      route: window.location.pathname,
      userAgent: navigator.userAgent
    };

    // Try to get user context
    try {
      const userStr = localStorage.getItem('sentinel_user');
      if (userStr) {
        const user = JSON.parse(userStr);
        errorLog.userId = user.email;
        errorLog.orgId = user.organization_id;
      }
    } catch (e) {
      // Ignore if user context unavailable
    }
    
    console.error('🚨 Global Error Boundary:', errorLog);
    
    // Store error for DiagnosticsConsole
    try {
      const errors = JSON.parse(localStorage.getItem('sentinel_error_log') || '[]');
      errors.unshift(errorLog);
      localStorage.setItem('sentinel_error_log', JSON.stringify(errors.slice(0, 50)));
    } catch (e) {
      console.error('Failed to store error log:', e);
    }
    
    // PHASE 8: Non-blocking backend error logging
    this.logErrorToBackend(error, errorInfo, errorLog).catch(() => {
      // Silent fail - don't break user experience
    });
  }

  async logErrorToBackend(error, errorInfo, errorLog) {
    try {
      const { base44 } = await import('@/api/base44Client');
      await base44.functions.invoke('createAuditLog', {
        event_type: 'frontend_error',
        severity: 'critical',
        description: `Frontend error: ${error.message}`,
        action_performed: 'error_caught',
        metadata: {
          ...errorLog,
          error_stack: error.stack?.substring(0, 500),
          component_stack: errorInfo.componentStack?.substring(0, 500)
        },
        success: false
      });
    } catch (logError) {
      console.warn('Error logging failed:', logError);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-red-950/20 flex items-center justify-center p-6">
          <div className="max-w-md bg-red-950/50 border-2 border-red-500 rounded-lg p-6 text-center">
            <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-red-400" />
            <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
            <p className="text-red-200 mb-6">{this.state.error?.message || 'An unexpected error occurred'}</p>
            <div className="space-y-3">
              <Button
                onClick={() => window.location.reload()}
                className="w-full bg-red-600 hover:bg-red-700"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Reload Page
              </Button>
              <Button
                onClick={() => window.location.href = '/'}
                variant="outline"
                className="w-full border-red-500/30 text-red-200 hover:bg-red-950/50"
              >
                <Shield className="w-4 h-4 mr-2" />
                Go to Dashboard
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}