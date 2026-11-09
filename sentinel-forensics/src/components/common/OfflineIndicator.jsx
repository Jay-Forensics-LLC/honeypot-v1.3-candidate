import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { WifiOff, Wifi, RefreshCw, Database } from 'lucide-react';
import { toast } from 'sonner';
import { offlineDB } from '../lib/OfflineDB';
import { offlineQueue } from '../lib/OfflineQueue';

/**
 * OFFLINE STATUS INDICATOR
 * Shows connection status and pending queue
 * PHASE 6 FIX: Inline hook logic to avoid circular dependencies
 */
export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [queueStatus, setQueueStatus] = useState({ pending: 0, processing: false });
  const [dbStats, setDbStats] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !offlineDB.isAvailable) return;
    
    const updateStatus = async () => {
      const status = await offlineQueue.getStatus();
      setQueueStatus(status);
      const stats = await offlineDB.getStats();
      setDbStats(stats);
    };

    updateStatus();
    const interval = setInterval(updateStatus, 5000);
    
    // Add listener for queue changes
    const handleQueueChange = () => updateStatus();
    offlineQueue.addListener('enqueued', handleQueueChange);
    offlineQueue.addListener('processed', handleQueueChange);

    return () => {
      clearInterval(interval);
      offlineQueue.removeListener('enqueued', handleQueueChange);
      offlineQueue.removeListener('processed', handleQueueChange);
    };
  }, []);

  const handleSync = async () => {
    if (!isOnline) {
      toast.error('Cannot sync while offline');
      return;
    }

    try {
      await offlineQueue.processQueue();
      toast.success('Sync completed');
    } catch {
      toast.error('Sync failed');
    }
  };

  if (isOnline && queueStatus.pending === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Card className="bg-slate-900 border-slate-700 shadow-xl">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            {isOnline ? (
              <Wifi className="w-5 h-5 text-green-400" />
            ) : (
              <WifiOff className="w-5 h-5 text-orange-400" />
            )}
            
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-white">
                  {isOnline ? 'Online' : 'Offline'}
                </span>
                {queueStatus.pending > 0 && (
                  <Badge variant="outline" className="border-orange-500/50 text-orange-400">
                    {queueStatus.pending} pending
                  </Badge>
                )}
              </div>
              
              {queueStatus.processing && (
                <p className="text-xs text-slate-400">Syncing changes...</p>
              )}
              
              {dbStats && (
                <p className="text-xs text-slate-400">
                  {dbStats.cacheCount} cached responses
                </p>
              )}
            </div>

            {isOnline && queueStatus.pending > 0 && (
              <Button
                size="sm"
                onClick={handleSync}
                disabled={queueStatus.processing}
                className="ml-2"
              >
                <RefreshCw className={`w-4 h-4 ${queueStatus.processing ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * OFFLINE BANNER
 * Full-width notification for offline mode
 */
export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [queueStatus, setQueueStatus] = useState({ pending: 0 });

  useEffect(() => {
    if (typeof window === 'undefined' || !offlineDB.isAvailable) return;
    
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const updateStatus = async () => {
      const status = await offlineQueue.getStatus();
      setQueueStatus(status);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    updateStatus();
    const interval = setInterval(updateStatus, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="bg-orange-500/20 border-b border-orange-500/30 p-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <WifiOff className="w-5 h-5 text-orange-400" />
          <div>
            <p className="text-sm font-medium text-orange-300">
              You're currently offline
            </p>
            <p className="text-xs text-orange-200">
              Changes will be synced when connection is restored
              {queueStatus.pending > 0 && ` (${queueStatus.pending} pending)`}
            </p>
          </div>
        </div>
        <Database className="w-5 h-5 text-orange-400" />
      </div>
    </div>
  );
}