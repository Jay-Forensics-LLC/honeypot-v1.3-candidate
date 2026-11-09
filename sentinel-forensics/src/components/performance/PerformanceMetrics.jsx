import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Database, Zap, TrendingUp, Cpu } from 'lucide-react';
import { requestCache } from '../lib/RequestCache';
import { requestDeduplicator } from '../lib/RequestDeduplicator';
import { CircuitBreakerRegistry } from '../lib/CircuitBreaker';
import { offlineDB } from '../lib/OfflineDB';
import { rateLimiterRegistry } from '../lib/RateLimiter';
import { memoryManager } from './MemoryManager';

/**
 * PERFORMANCE METRICS DASHBOARD
 * Shows real-time performance stats (dev/admin only)
 */
export default function PerformanceMetrics() {
  const [metrics, setMetrics] = useState({
    cache: { size: 0, hitRate: 0 },
    dedup: { pending: 0 },
    breakers: {},
    offline: { cacheCount: 0, queueCount: 0 },
    rateLimit: {},
    memory: null
  });

  useEffect(() => {
    const updateMetrics = async () => {
      const cacheStats = requestCache.getStats();
      const dedupCount = requestDeduplicator.getPendingCount();
      const breakerMetrics = CircuitBreakerRegistry.getAllMetrics();
      const offlineStats = await offlineDB.getStats();
      const rateLimitStats = rateLimiterRegistry.getAllStatus();
      const memoryStats = memoryManager.getMemoryStats();

      setMetrics({
        cache: cacheStats,
        dedup: { pending: dedupCount },
        breakers: breakerMetrics,
        offline: offlineStats,
        rateLimit: rateLimitStats,
        memory: memoryStats
      });
    };

    updateMetrics();
    const interval = setInterval(updateMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  const totalBreakers = Object.keys(metrics.breakers).length;
  const openBreakers = Object.values(metrics.breakers).filter(
    m => m.state === 'OPEN'
  ).length;

  const apiLimitStatus = metrics.rateLimit.api || { tokens: 0, maxTokens: 100, utilizationPercent: 0 };
  const hasMemoryAPI = metrics.memory !== null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
      {/* Request Cache */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-400" />
            Request Cache
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Entries</span>
              <span className="text-white font-medium">
                {metrics.cache.size}/{metrics.cache.maxSize}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Hit Rate</span>
              <Badge variant="outline" className="text-green-400 border-green-500/30">
                {Math.round(metrics.cache.hitRate * 100)}%
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Request Deduplication */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            Deduplication
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">In-Flight</span>
              <span className="text-white font-medium">
                {metrics.dedup.pending}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Circuit Breakers */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-orange-400" />
            Circuit Breakers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Total</span>
              <span className="text-white font-medium">{totalBreakers}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Open</span>
              <Badge 
                variant="outline" 
                className={openBreakers > 0 ? 'text-red-400 border-red-500/30' : 'text-green-400 border-green-500/30'}
              >
                {openBreakers}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Offline Storage */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-purple-400" />
            Offline Storage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Cached</span>
              <span className="text-white font-medium">
                {metrics.offline.cacheCount || 0}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Queued</span>
              <span className="text-white font-medium">
                {metrics.offline.queueCount || 0}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rate Limiter */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            Rate Limiter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Tokens</span>
              <span className="text-white font-medium">
                {apiLimitStatus.tokens}/{apiLimitStatus.maxTokens}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Usage</span>
              <Badge 
                variant="outline" 
                className={
                  apiLimitStatus.utilizationPercent > 80 
                    ? 'text-red-400 border-red-500/30' 
                    : 'text-green-400 border-green-500/30'
                }
              >
                {apiLimitStatus.utilizationPercent}%
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Memory Usage */}
      {hasMemoryAPI && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-400" />
              Memory
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Used</span>
                <span className="text-white font-medium">
                  {metrics.memory.used}MB
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Usage</span>
                <Badge 
                  variant="outline" 
                  className={
                    metrics.memory.usagePercent > 80 
                      ? 'text-red-400 border-red-500/30' 
                      : 'text-green-400 border-green-500/30'
                  }
                >
                  {metrics.memory.usagePercent}%
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}