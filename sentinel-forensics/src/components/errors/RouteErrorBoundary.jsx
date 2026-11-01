import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';
import { logForensicEvent, ForensicEventTypes } from '../forensics/ForensicLogger';

/**
 * ENHANCED ROUTE ERROR BOUNDARY
 * Per-route error isolation with forensic logging
 */
export class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      errorId: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  async componentDidCatch(error, errorInfo) {
    const errorId = `ERR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const errorPayload = {
      errorId,
      route: this.props.route || window.location.pathname,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      componentStack: errorInfo.componentStack,
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: new Date().toISOString()
    };

    // Log to forensic logger
    try {
      await logForensicEvent(ForensicEventTypes.SECURITY_BREACH, {
        type: 'react_error_boundary',
        ...errorPayload
      });
    } catch (logError) {
      console.error('Failed to log error to forensic logger:', logError);
    }

    // Log to console
    console.error('Route Error Boundary caught error:', errorPayload);

    this.setState({
      error,
      errorInfo,
      errorId
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: this.state.retryCount + 1
    });
    
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  handleReportBug = () => {
    const { error, errorInfo, errorId } = this.state;
    const bugReport = {
      errorId,
      error: error?.message,
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
      url: window.location.href,
      userAgent: navigator.userAgent
    };

    // Copy to clipboard
    navigator.clipboard.writeText(JSON.stringify(bugReport, null, 2))
      .then(() => alert('Bug report copied to clipboard'))
      .catch(() => alert('Failed to copy bug report'));
  };

  render() {
    if (this.state.hasError) {
      const isDev = import.meta.env.MODE === 'development';
      const { retryCount } = this.state;

      return (
        <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center p-6">
          <Card className="bg-red-950/20 border-red-500/50 max-w-2xl w-full">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <AlertTriangle className="w-6 h-6 text-red-400" />
                {this.props.title || 'Something went wrong'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-red-200">
                {this.props.message || 'An unexpected error occurred on this page. Our team has been notified.'}
              </p>

              {isDev && this.state.error && (
                <div className="bg-slate-900 rounded-lg p-4 space-y-2">
                  <p className="text-xs text-slate-400 font-mono">Error ID: {this.state.errorId}</p>
                  <p className="text-sm text-red-400 font-semibold">{this.state.error.toString()}</p>
                  {this.state.error.stack && (
                    <details className="text-xs text-slate-300">
                      <summary className="cursor-pointer hover:text-white">Stack Trace</summary>
                      <pre className="mt-2 overflow-auto max-h-40 text-xs">
                        {this.state.error.stack}
                      </pre>
                    </details>
                  )}
                  {this.state.errorInfo?.componentStack && (
                    <details className="text-xs text-slate-400">
                      <summary className="cursor-pointer hover:text-white">Component Stack</summary>
                      <pre className="mt-2 overflow-auto max-h-32 text-xs">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {!isDev && this.state.errorId && (
                <div className="bg-slate-900 rounded-lg p-3">
                  <p className="text-xs text-slate-400 font-mono">
                    Error ID: {this.state.errorId}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Reference this ID when contacting support
                  </p>
                </div>
              )}

              {retryCount > 0 && (
                <div className="bg-yellow-950/20 border border-yellow-500/30 rounded-lg p-3">
                  <p className="text-xs text-yellow-400">
                    Retry attempt {retryCount}. If this persists, try refreshing the page.
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <Button 
                  onClick={this.handleReset}
                  className="bg-blue-600 hover:bg-blue-700 flex-1"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
                <Button 
                  onClick={this.handleGoHome}
                  variant="outline"
                  className="border-slate-700 flex-1"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Go Home
                </Button>
                {isDev && (
                  <Button
                    onClick={this.handleReportBug}
                    variant="outline"
                    className="border-slate-700"
                  >
                    <Bug className="w-4 h-4 mr-2" />
                    Copy Bug Report
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * HOC for wrapping components with error boundary
 */
export function withErrorBoundary(Component, boundaryProps = {}) {
  return function ErrorBoundaryWrapper(props) {
    return (
      <RouteErrorBoundary {...boundaryProps}>
        <Component {...props} />
      </RouteErrorBoundary>
    );
  };
}