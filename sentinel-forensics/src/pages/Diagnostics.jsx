import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Terminal, Database, Network, Activity, AlertTriangle, CheckCircle, 
  XCircle, RefreshCw, Download, Trash2, WifiOff, Loader2, TrendingUp,
  TrendingDown, Cpu, HardDrive, Zap
} from 'lucide-react';
import { toast } from 'sonner';
import { usePerformanceStore, useNetworkStore, useCacheStore } from '../components/stores';
import { container } from '../components/lib/Container';
import { requestCache } from '../components/lib/RequestCache';
import { offlineQueue } from '../components/lib/OfflineQueue';

export default function Diagnostics() {
  const [systemHealth, setSystemHealth] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [clearing, setClearing] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const performanceMetrics = usePerformanceStore((state) => state.metrics);
  const performanceWarnings = usePerformanceStore((state) => state.warnings);
  const networkState = useNetworkStore();
  const cacheState = useCacheStore();

  useEffect(() => {
    loadDiagnostics();
    const interval = setInterval(loadDiagnostics, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadDiagnostics() {
    try {
      const health = {
        cache: await checkCache(),
        database: await checkDatabase(),
        network: checkNetwork(),
        performance: checkPerformance(),
        storage: await checkStorage(),
        offlineQueue: await checkOfflineQueue()
      };

      const allHealthy = Object.values(health).every(c => c.status === 'healthy');
      
      setSystemHealth({
        status: allHealthy ? 'healthy' : 'degraded',
        checks: health,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Failed to load diagnostics:', error);
    }
  }

  async function checkCache() {
    try {
      const stats = requestCache.getStats();
      return {
        status: stats.size < stats.maxSize * 0.9 ? 'healthy' : 'warning',
        message: `${stats.size}/${stats.maxSize} entries (${stats.hitRate.toFixed(1)}% hit rate)`,
        details: stats
      };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  async function checkDatabase() {
    try {
      const db = await container.resolve('offlineDB');
      const stats = await db.getStats();
      return {
        status: 'healthy',
        message: `${stats.cacheCount} cached responses`,
        details: stats
      };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  function checkNetwork() {
    return {
      status: networkState.online ? 'healthy' : 'warning',
      message: networkState.online ? 'Connected' : 'Offline',
      details: {
        online: networkState.online,
        pendingRequests: networkState.pendingRequests,
        failedRequests: networkState.failedRequests.length
      }
    };
  }

  function checkPerformance() {
    const fps = performanceMetrics?.fps || 60;
    const memory = performanceMetrics?.memoryUsage || 0;

    let status = 'healthy';
    if (fps < 30 || memory > 90) status = 'critical';
    else if (fps < 45 || memory > 80) status = 'warning';

    return {
      status,
      message: `${Math.round(fps)} FPS, ${Math.round(memory)}% memory`,
      details: performanceMetrics
    };
  }

  async function checkStorage() {
    try {
      if (!navigator.storage?.estimate) {
        return { status: 'unknown', message: 'Storage API unavailable' };
      }

      const estimate = await navigator.storage.estimate();
      const percentUsed = (estimate.usage / estimate.quota) * 100;

      let status = 'healthy';
      if (percentUsed > 90) status = 'critical';
      else if (percentUsed > 80) status = 'warning';

      return {
        status,
        message: `${Math.round(percentUsed)}% used (${(estimate.usage / 1024 / 1024).toFixed(1)} MB / ${(estimate.quota / 1024 / 1024).toFixed(1)} MB)`,
        details: estimate
      };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  async function checkOfflineQueue() {
    try {
      const status = await offlineQueue.getStatus();
      return {
        status: status.pending > 10 ? 'warning' : 'healthy',
        message: `${status.pending} pending operations`,
        details: status
      };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadDiagnostics();
    setTimeout(() => setRefreshing(false), 500);
    toast.success('Diagnostics refreshed');
  }

  async function handleClearCache() {
    if (!confirm('Clear all cached data? This will not affect your saved data.')) return;
    
    setClearing(true);
    try {
      requestCache.clear();
      await offlineQueue.clearCompleted();
      toast.success('Cache cleared successfully');
      await loadDiagnostics();
    } catch (error) {
      toast.error('Failed to clear cache');
    } finally {
      setClearing(false);
    }
  }

  async function handleRetryFailed() {
    setRetrying(true);
    try {
      await offlineQueue.processQueue();
      toast.success('Retrying failed requests');
      await loadDiagnostics();
    } catch (error) {
      toast.error('Retry failed');
    } finally {
      setRetrying(false);
    }
  }

  function handleExport() {
    const data = {
      systemHealth,
      performance: performanceMetrics,
      warnings: performanceWarnings,
      network: networkState,
      cache: cacheState,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagnostics-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Diagnostics exported');
  }

  if (!systemHealth) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  const StatusIcon = systemHealth.status === 'healthy' ? CheckCircle :
                     systemHealth.status === 'degraded' ? AlertTriangle : XCircle;

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">System Diagnostics</h1>
            <p className="text-slate-400">Real-time performance and health monitoring</p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefresh}
              disabled={refreshing}
              className="border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExport}
              className="border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Overall Status */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                systemHealth.status === 'healthy' ? 'bg-green-500/20' :
                systemHealth.status === 'degraded' ? 'bg-yellow-500/20' :
                'bg-red-500/20'
              }`}>
                <StatusIcon className={`w-8 h-8 ${
                  systemHealth.status === 'healthy' ? 'text-green-400' :
                  systemHealth.status === 'degraded' ? 'text-yellow-400' :
                  'text-red-400'
                }`} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">
                  {systemHealth.status === 'healthy' ? 'All Systems Operational' :
                   systemHealth.status === 'degraded' ? 'System Degraded' :
                   'System Critical'}
                </h2>
                <p className="text-slate-400">
                  Last updated: {new Date(systemHealth.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <Cpu className="w-5 h-5 text-blue-400" />
                {performanceMetrics?.fps >= 45 ? (
                  <TrendingUp className="w-4 h-4 text-green-400" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-400" />
                )}
              </div>
              <p className="text-3xl font-bold text-white">{Math.round(performanceMetrics?.fps || 60)}</p>
              <p className="text-xs text-slate-400">FPS</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <HardDrive className="w-5 h-5 text-purple-400" />
                {(performanceMetrics?.memoryUsage || 0) < 80 ? (
                  <TrendingDown className="w-4 h-4 text-green-400" />
                ) : (
                  <TrendingUp className="w-4 h-4 text-red-400" />
                )}
              </div>
              <p className="text-3xl font-bold text-white">{Math.round(performanceMetrics?.memoryUsage || 0)}%</p>
              <p className="text-xs text-slate-400">Memory</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <Zap className="w-5 h-5 text-green-400" />
                <Network className="w-4 h-4 text-green-400" />
              </div>
              <p className="text-3xl font-bold text-white">{Math.round(performanceMetrics?.apiLatency || 0)}</p>
              <p className="text-xs text-slate-400">Latency (ms)</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <Database className="w-5 h-5 text-orange-400" />
                {networkState.pendingRequests === 0 ? (
                  <CheckCircle className="w-4 h-4 text-green-400" />
                ) : (
                  <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
                )}
              </div>
              <p className="text-3xl font-bold text-white">{networkState.pendingRequests}</p>
              <p className="text-xs text-slate-400">Pending Requests</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-white flex items-center gap-2">
                <Terminal className="w-5 h-5 text-blue-400" />
                System Health Monitor
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleClearCache}
                  disabled={clearing}
                  className="border-slate-700 text-white hover:bg-slate-800"
                >
                  {clearing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-2" />
                  )}
                  Clear Cache
                </Button>
                {networkState.failedRequests.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRetryFailed}
                    disabled={retrying}
                    className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
                  >
                    {retrying ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Retry Failed ({networkState.failedRequests.length})
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-5 bg-slate-800">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="performance">Performance</TabsTrigger>
                <TabsTrigger value="storage">Storage</TabsTrigger>
                <TabsTrigger value="network">Network</TabsTrigger>
                <TabsTrigger value="warnings">Warnings</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                {Object.entries(systemHealth.checks).map(([name, check]) => (
                  <div key={name} className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      {check.status === 'healthy' && <CheckCircle className="w-5 h-5 text-green-400" />}
                      {check.status === 'warning' && <AlertTriangle className="w-5 h-5 text-yellow-400" />}
                      {check.status === 'error' && <XCircle className="w-5 h-5 text-red-400" />}
                      {check.status === 'critical' && <XCircle className="w-5 h-5 text-red-500" />}
                      <div>
                        <div className="text-sm font-medium text-white capitalize">
                          {name.replace(/([A-Z])/g, ' $1').trim()}
                        </div>
                        <div className="text-xs text-slate-400">{check.message}</div>
                      </div>
                    </div>
                    <Badge variant="outline" className={
                      check.status === 'healthy' ? 'text-green-400 border-green-500/30' :
                      check.status === 'warning' ? 'text-yellow-400 border-yellow-500/30' :
                      check.status === 'critical' ? 'text-red-500 border-red-500/50' :
                      'text-red-400 border-red-500/30'
                    }>
                      {check.status}
                    </Badge>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="performance" className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <Card className="bg-slate-800/30 border-slate-700">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-slate-400">Frame Rate</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-end gap-2">
                        <p className="text-4xl font-bold text-white">
                          {Math.round(performanceMetrics?.fps || 60)}
                        </p>
                        <p className="text-lg text-slate-400 mb-1">FPS</p>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        {(performanceMetrics?.fps || 60) >= 45 ? (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                            Excellent
                          </Badge>
                        ) : (
                          <Badge className="bg-red-500/20 text-red-400 border-red-500/50">
                            Poor
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-slate-800/30 border-slate-700">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-slate-400">Memory Usage</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-end gap-2">
                        <p className="text-4xl font-bold text-white">
                          {Math.round(performanceMetrics?.memoryUsage || 0)}
                        </p>
                        <p className="text-lg text-slate-400 mb-1">%</p>
                      </div>
                      <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${
                            (performanceMetrics?.memoryUsage || 0) > 80 ? 'bg-red-500' :
                            (performanceMetrics?.memoryUsage || 0) > 60 ? 'bg-yellow-500' :
                            'bg-green-500'
                          }`}
                          style={{ width: `${performanceMetrics?.memoryUsage || 0}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-slate-800/30 border-slate-700">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-slate-400">API Latency</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-end gap-2">
                        <p className="text-4xl font-bold text-white">
                          {Math.round(performanceMetrics?.apiLatency || 0)}
                        </p>
                        <p className="text-lg text-slate-400 mb-1">ms</p>
                      </div>
                      <div className="mt-2">
                        {(performanceMetrics?.apiLatency || 0) < 500 ? (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                            Fast
                          </Badge>
                        ) : (
                          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50">
                            Slow
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-slate-800/30 border-slate-700">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-slate-400">Render Time</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-end gap-2">
                        <p className="text-4xl font-bold text-white">
                          {Math.round(performanceMetrics?.renderTime || 0)}
                        </p>
                        <p className="text-lg text-slate-400 mb-1">ms</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="storage" className="space-y-4">
                {systemHealth.checks.storage.details && (
                  <>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="bg-slate-800/30 rounded-lg p-4">
                        <p className="text-sm text-slate-400 mb-1">Storage Used</p>
                        <p className="text-2xl font-bold text-white">
                          {(systemHealth.checks.storage.details.usage / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <div className="bg-slate-800/30 rounded-lg p-4">
                        <p className="text-sm text-slate-400 mb-1">Storage Quota</p>
                        <p className="text-2xl font-bold text-white">
                          {(systemHealth.checks.storage.details.quota / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>

                    <div className="bg-slate-800/30 rounded-lg p-4">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-slate-400">Usage</span>
                        <span className="text-white">
                          {((systemHealth.checks.storage.details.usage / systemHealth.checks.storage.details.quota) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                          style={{ 
                            width: `${(systemHealth.checks.storage.details.usage / systemHealth.checks.storage.details.quota) * 100}%` 
                          }}
                        />
                      </div>
                    </div>
                  </>
                )}

                {systemHealth.checks.database.details && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-white">IndexedDB Statistics</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-slate-800/30 rounded p-3">
                        <p className="text-xs text-slate-400">Cached Responses</p>
                        <p className="text-xl font-bold text-white">
                          {systemHealth.checks.database.details.cacheCount}
                        </p>
                      </div>
                      <div className="bg-slate-800/30 rounded p-3">
                        <p className="text-xs text-slate-400">Queued Mutations</p>
                        <p className="text-xl font-bold text-white">
                          {systemHealth.checks.database.details.queueCount}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="network" className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-slate-800/30 rounded-lg">
                  {networkState.online ? (
                    <CheckCircle className="w-6 h-6 text-green-400" />
                  ) : (
                    <WifiOff className="w-6 h-6 text-red-400" />
                  )}
                  <div>
                    <p className="font-semibold text-white">
                      {networkState.online ? 'Online' : 'Offline'}
                    </p>
                    <p className="text-sm text-slate-400">
                      {networkState.pendingRequests} pending • {networkState.failedRequests.length} failed
                    </p>
                  </div>
                </div>

                {networkState.failedRequests.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-white">Failed Requests</p>
                      <Button
                        size="sm"
                        onClick={handleRetryFailed}
                        disabled={retrying}
                        className="bg-orange-600 hover:bg-orange-700"
                      >
                        {retrying ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Retry All'
                        )}
                      </Button>
                    </div>
                    {networkState.failedRequests.slice(0, 5).map((req, idx) => (
                      <div key={idx} className="text-xs text-red-300 bg-red-950/20 border border-red-500/30 rounded p-2">
                        {req.type || 'Request'} failed at {new Date(req.timestamp).toLocaleTimeString()}
                      </div>
                    ))}
                  </div>
                )}

                {systemHealth.checks.offlineQueue?.details && (
                  <div className="bg-slate-800/30 rounded-lg p-4">
                    <p className="text-sm font-semibold text-white mb-3">Offline Queue</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-slate-400">Pending</p>
                        <p className="text-2xl font-bold text-white">
                          {systemHealth.checks.offlineQueue.details.pending}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Processing</p>
                        <p className="text-2xl font-bold text-white">
                          {systemHealth.checks.offlineQueue.details.processing ? 'Yes' : 'No'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="warnings" className="space-y-3">
                {performanceWarnings.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-400" />
                    <p className="text-white">No warnings</p>
                    <p className="text-sm text-slate-400">System is running smoothly</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-slate-400">
                        Showing {Math.min(20, performanceWarnings.length)} of {performanceWarnings.length} warnings
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => usePerformanceStore.getState().clearWarnings()}
                        className="border-slate-700 text-white hover:bg-slate-800"
                      >
                        Clear All
                      </Button>
                    </div>
                    {performanceWarnings.slice(0, 20).map((warning, idx) => (
                      <Alert 
                        key={idx} 
                        className={
                          warning.severity === 'critical' ? 'bg-red-950/20 border-red-500/30' :
                          warning.severity === 'error' ? 'bg-orange-950/20 border-orange-500/30' :
                          'bg-yellow-950/20 border-yellow-500/30'
                        }
                      >
                        <AlertTriangle className={`h-4 w-4 ${
                          warning.severity === 'critical' ? 'text-red-400' :
                          warning.severity === 'error' ? 'text-orange-400' :
                          'text-yellow-400'
                        }`} />
                        <AlertDescription className="text-sm">
                          <div className="flex items-center justify-between">
                            <span className={
                              warning.severity === 'critical' ? 'text-red-200' :
                              warning.severity === 'error' ? 'text-orange-200' :
                              'text-yellow-200'
                            }>
                              {warning.message}
                            </span>
                            <span className="text-xs text-slate-500">
                              {new Date(warning.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        </AlertDescription>
                      </Alert>
                    ))}
                  </>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Cache Statistics */}
        {systemHealth.checks.cache?.details && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Cache Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-4 gap-4">
                <div className="bg-slate-800/30 rounded p-3">
                  <p className="text-xs text-slate-400 mb-1">Size</p>
                  <p className="text-xl font-bold text-white">
                    {systemHealth.checks.cache.details.size}
                  </p>
                </div>
                <div className="bg-slate-800/30 rounded p-3">
                  <p className="text-xs text-slate-400 mb-1">Max Size</p>
                  <p className="text-xl font-bold text-white">
                    {systemHealth.checks.cache.details.maxSize}
                  </p>
                </div>
                <div className="bg-slate-800/30 rounded p-3">
                  <p className="text-xs text-slate-400 mb-1">Hit Rate</p>
                  <p className="text-xl font-bold text-white">
                    {systemHealth.checks.cache.details.hitRate.toFixed(1)}%
                  </p>
                </div>
                <div className="bg-slate-800/30 rounded p-3">
                  <p className="text-xs text-slate-400 mb-1">Evictions</p>
                  <p className="text-xl font-bold text-white">
                    {systemHealth.checks.cache.details.evictionCount}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}