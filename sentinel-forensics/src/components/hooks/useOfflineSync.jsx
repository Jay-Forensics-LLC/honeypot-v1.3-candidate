import { useState, useEffect, useCallback } from 'react';
import { offlineDB } from '../lib/OfflineDB';
import { offlineQueue } from '../lib/OfflineQueue';
import { logger } from '../utils/Logger';

/**
 * OFFLINE SYNC HOOK
 * Manages offline data synchronization and queue status
 */
export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueStatus, setQueueStatus] = useState({ pending: 0, processing: false });
  const [dbStats, setDbStats] = useState(null);

  // Update online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      logger.info('Device is online');
    };

    const handleOffline = () => {
      setIsOnline(false);
      logger.warn('Device is offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Monitor queue status
  useEffect(() => {
    const updateStatus = async () => {
      const status = await offlineQueue.getStatus();
      setQueueStatus(status);
    };

    updateStatus();
    const interval = setInterval(updateStatus, 5000); // Update every 5 seconds

    // Listen to queue events
    const unsubscribe = offlineQueue.addListener((event) => {
      logger.debug('Queue event', { event });
      updateStatus();
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  // Get database stats
  const refreshStats = useCallback(async () => {
    const stats = await offlineDB.getStats();
    setDbStats(stats);
  }, []);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  // Manual sync trigger
  const syncNow = useCallback(async () => {
    if (!isOnline) {
      logger.warn('Cannot sync while offline');
      return false;
    }

    try {
      await offlineQueue.processQueue();
      await refreshStats();
      return true;
    } catch (error) {
      logger.error('Manual sync failed', { error });
      return false;
    }
  }, [isOnline, refreshStats]);

  // Clear offline data
  const clearOfflineData = useCallback(async () => {
    try {
      await offlineDB.clearAll();
      await refreshStats();
      logger.info('Cleared all offline data');
    } catch (error) {
      logger.error('Failed to clear offline data', { error });
    }
  }, [refreshStats]);

  return {
    isOnline,
    queueStatus,
    dbStats,
    syncNow,
    clearOfflineData,
    refreshStats
  };
}

/**
 * OFFLINE-AWARE QUERY HOOK
 * Fetches data with offline fallback
 */
export function useOfflineQuery(queryKey, queryFn, options = {}) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const { isOnline } = useOfflineSync();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (isOnline) {
        // Try to fetch from API
        const result = await queryFn();
        setData(result);

        // Cache the result
        if (options.cacheKey) {
          await offlineDB.cacheEntity(options.cacheKey, result);
        }
      } else {
        // Fetch from cache
        if (options.cacheKey) {
          const cached = await offlineDB.getCachedEntities(options.cacheKey, options.filter);
          setData(cached);
        } else {
          throw new Error('No offline cache available');
        }
      }
    } catch (err) {
      logger.error('Query failed', { queryKey, error: err });
      setError(err);

      // Try cache as fallback
      if (options.cacheKey) {
        try {
          const cached = await offlineDB.getCachedEntities(options.cacheKey, options.filter);
          if (cached.length > 0) {
            setData(cached);
            setError(null); // Clear error if cache provides data
          }
        } catch (cacheErr) {
          logger.error('Cache fallback failed', { error: cacheErr });
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [queryKey, queryFn, isOnline, options.cacheKey, options.filter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}