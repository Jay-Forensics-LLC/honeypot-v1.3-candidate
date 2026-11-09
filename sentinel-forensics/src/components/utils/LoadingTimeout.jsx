import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, RefreshCw, AlertCircle } from 'lucide-react';

/**
 * Loading with Timeout Component
 * Shows loading state with automatic timeout after 10 seconds
 * Provides retry functionality
 */
export default function LoadingTimeout({ 
  isLoading, 
  error, 
  onRetry, 
  timeout = 10000,
  children 
}) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setTimedOut(false);
      return;
    }

    const timer = setTimeout(() => {
      setTimedOut(true);
    }, timeout);

    return () => clearTimeout(timer);
  }, [isLoading, timeout]);

  if (error) {
    return (
      <Card className="bg-red-900/20 border-red-500/30">
        <CardContent className="p-8 text-center">
          <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-400" />
          <h3 className="text-xl font-bold text-red-300 mb-2">Error Loading Data</h3>
          <p className="text-red-200 mb-4">{error.message || 'An error occurred'}</p>
          {onRetry && (
            <Button
              onClick={onRetry}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (isLoading && timedOut) {
    return (
      <Card className="bg-yellow-900/20 border-yellow-500/30">
        <CardContent className="p-8 text-center">
          <AlertCircle className="w-16 h-16 mx-auto mb-4 text-yellow-400" />
          <h3 className="text-xl font-bold text-yellow-300 mb-2">Taking Longer Than Expected</h3>
          <p className="text-yellow-200 mb-4">
            The request is still loading but hasn't completed within 10 seconds.
          </p>
          {onRetry && (
            <Button
              onClick={onRetry}
              className="bg-yellow-600 hover:bg-yellow-700 text-white"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry Request
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 className="w-16 h-16 mx-auto mb-4 text-blue-400 animate-spin" />
          <p className="text-slate-300">Loading...</p>
          <p className="text-xs text-slate-500 mt-2">Timeout in {timeout / 1000}s</p>
        </div>
      </div>
    );
  }

  return children;
}