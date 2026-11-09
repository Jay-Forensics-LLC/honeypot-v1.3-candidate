import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

/**
 * PRODUCTION: Standardized Error State Component
 * Consistent error UI with retry capability
 */
export default function ErrorState({ 
  error, 
  onRetry, 
  fullScreen = false,
  title = 'Something went wrong',
  showDetails = true
}) {
  const content = (
    <div className="flex flex-col items-center justify-center p-12">
      <AlertTriangle className="w-16 h-16 text-red-400 mb-4" />
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      {showDetails && error && (
        <p className="text-sm text-slate-400 mb-4 text-center max-w-md">
          {error.message || 'An unexpected error occurred'}
        </p>
      )}
      {onRetry && (
        <Button
          onClick={onRetry}
          variant="outline"
          className="border-slate-700 hover:bg-slate-800"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Try Again
        </Button>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center">
        {content}
      </div>
    );
  }

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardContent className="p-0">
        {content}
      </CardContent>
    </Card>
  );
}