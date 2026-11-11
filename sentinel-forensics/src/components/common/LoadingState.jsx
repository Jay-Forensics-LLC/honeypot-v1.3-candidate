import React from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

/**
 * PRODUCTION: Standardized Loading State Component
 * Consistent loading UI across the app
 */
export default function LoadingState({ message = 'Loading...', fullScreen = false }) {
  const content = (
    <div className="flex flex-col items-center justify-center p-12">
      <Loader2 className="w-12 h-12 text-blue-400 animate-spin mb-4" />
      <p className="text-slate-400">{message}</p>
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