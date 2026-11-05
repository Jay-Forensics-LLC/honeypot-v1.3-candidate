import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Route-level timeout protection
 * If route takes > maxMs, shows error with retry
 */
export function RouteGate({ children, maxMs = 10000 }) {
  const [timedOut, setTimedOut] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startTime = Date.now();

    const elapsedInterval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);

    const timeout = setTimeout(() => {
      console.error(`⏰ ROUTE TIMEOUT: Exceeded ${maxMs}ms`);
      setTimedOut(true);
    }, maxMs);

    return () => {
      clearTimeout(timeout);
      clearInterval(elapsedInterval);
    };
  }, [maxMs]);

  if (timedOut) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">
            Route Load Timeout
          </h2>
          <p className="text-slate-400 mb-6">
            This page took too long to load ({(elapsed / 1000).toFixed(1)}s)
          </p>
          <Button
            onClick={() => window.location.reload()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reload Page
          </Button>
        </div>
      </div>
    );
  }

  return children;
}