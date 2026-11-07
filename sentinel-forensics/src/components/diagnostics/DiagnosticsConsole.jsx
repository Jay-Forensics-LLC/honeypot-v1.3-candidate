import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Terminal, 
  Database, 
  Network, 
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Download
} from 'lucide-react';
import { usePerformanceStore } from '../stores';
import { container } from '../lib/Container';

/**
 * DIAGNOSTICS CONSOLE
 * Global system diagnostics and health monitoring
 */
export default function DiagnosticsConsole() {
  const [systemHealth, setSystemHealth] = useState(null);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const performanceMetrics = usePerformanceStore((state) => state.metrics);

  useEffect(() => {
    loadDiagnostics();
    const interval = setInterval(loadDiagnostics, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadDiagnostics() {
    try {
      // Gather system diagnostics
      const health = await gatherSystemHealth();
      setSystemHealth(health);

      // Load recent logs
      const recentLogs = await loadRecentLogs();
      setLogs(recentLogs);
    } catch (error) {
      console.error('Failed to load diagnostics:', error);
    }
  }

  async function gatherSystemHealth() {
    const checks = {
      cache: await checkCache(),
      database: await checkDatabase(),
      network: await checkNetwork(),
      performance: checkPerformance(),
      storage: await checkStorage()
    };

    const allHealthy = Object.values(checks).every(c => c.status === 'healthy');

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      checks,
      timestamp: Date.now()
    };
  }

  async function checkCache() {
    try {
      const cache = await container.resolve('cache');
      const stats = cache.getStats();
      return {
        status: 'healthy',
        details: stats,
        message: `${stats.size}/${stats.maxSize} entries`
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
        details: stats,
        message: `${stats.cacheCount} cached items`
      };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  async function checkNetwork() {
    const online = navigator.onLine;
    return {
      status: online ? 'healthy' : 'warning',
      message: online ? 'Connected' : 'Offline',
      details: { online }
    };
  }

  function checkPerformance() {
    const fps = performanceMetrics?.fps || 0;
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
        return { status: 'unknown', message: 'Storage API not available' };
      }

      const estimate = await navigator.storage.estimate();
      const percentUsed = (estimate.usage / estimate.quota) * 100;

      let status = 'healthy';
      if (percentUsed > 90) status = 'critical';
      else if (percentUsed > 80) status = 'warning';

      return {
        status,
        message: `${Math.round(percentUsed)}% used`,
        details: estimate
      };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  async function loadRecentLogs() {
    try {
      const logger = await container.resolve('logger');
      return logger.getLogs?.() || [];
    } catch (error) {
      return [];
    }
  }

  function exportDiagnostics() {
    const data = {
      systemHealth,
      logs,
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
  }

  if (!systemHealth) {
    return <div className="text-slate-400">Loading diagnostics...</div>;
  }

  const StatusIcon = systemHealth.status === 'healthy' ? CheckCircle :
                     systemHealth.status === 'degraded' ? AlertTriangle : XCircle;

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Terminal className="w-5 h-5 text-blue-400" />
              System Diagnostics
              <Badge variant="outline" className={
                systemHealth.status === 'healthy' ? 'text-green-400 border-green-500/30' :
                systemHealth.status === 'degraded' ? 'text-yellow-400 border-yellow-500/30' :
                'text-red-400 border-red-500/30'
              }>
                <StatusIcon className="w-3 h-3 mr-1" />
                {systemHealth.status.toUpperCase()}
              </Badge>
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={loadDiagnostics}>
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={exportDiagnostics}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="errors">Errors</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="storage">Storage</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
            </TabsList>

            <TabsContent value="errors" className="space-y-4">
              <div className="space-y-2 max-h-96 overflow-auto">
                {(() => {
                  try {
                    const errorLog = JSON.parse(localStorage.getItem('sentinel_error_log') || '[]');
                    
                    if (errorLog.length === 0) {
                      return (
                        <div className="text-center py-8">
                          <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-400" />
                          <p className="text-sm text-slate-400">No errors captured</p>
                        </div>
                      );
                    }

                    return errorLog.slice(0, 30).map((error, idx) => (
                      <div key={idx} className="p-3 bg-slate-800/30 rounded border border-red-500/20">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                            <Badge variant="outline" className="text-xs text-red-400 border-red-500/30">
                              {error.type || 'error'}
                            </Badge>
                            <span className="text-xs text-slate-500">
                              {new Date(error.timestamp).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <div className="text-sm text-white mb-1 font-mono">
                          {error.name && <span className="text-red-400">{error.name}: </span>}
                          {error.message}
                        </div>
                        {error.route && (
                          <div className="text-xs text-slate-400">
                            Route: {error.route}
                          </div>
                        )}
                        {error.userId && (
                          <div className="text-xs text-slate-400">
                            User: {error.userId} {error.orgId && `(Org: ${error.orgId})`}
                          </div>
                        )}
                        {error.stack && (
                          <details className="mt-2">
                            <summary className="text-xs text-slate-500 cursor-pointer">
                              Stack trace
                            </summary>
                            <pre className="text-xs text-slate-400 mt-1 overflow-auto max-h-32 font-mono">
                              {error.stack}
                            </pre>
                          </details>
                        )}
                      </div>
                    ));
                  } catch (e) {
                    return (
                      <div className="text-sm text-red-400">
                        Failed to load error log: {e.message}
                      </div>
                    );
                  }
                })()}
              </div>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => {
                  localStorage.removeItem('sentinel_error_log');
                  loadDiagnostics();
                }}
                className="w-full"
              >
                Clear Error Log
              </Button>
            </TabsContent>

            <TabsContent value="overview" className="space-y-4">
              {Object.entries(systemHealth.checks).map(([name, check]) => (
                <div key={name} className="flex items-center justify-between p-3 bg-slate-800/30 rounded">
                  <div className="flex items-center gap-3">
                    {check.status === 'healthy' && <CheckCircle className="w-4 h-4 text-green-400" />}
                    {check.status === 'warning' && <AlertTriangle className="w-4 h-4 text-yellow-400" />}
                    {check.status === 'error' && <XCircle className="w-4 h-4 text-red-400" />}
                    <div>
                      <div className="text-sm font-medium text-white capitalize">{name}</div>
                      <div className="text-xs text-slate-400">{check.message}</div>
                    </div>
                  </div>
                  <Badge variant="outline">{check.status}</Badge>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="performance">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-800/30 rounded">
                  <div className="text-sm text-slate-400">FPS</div>
                  <div className="text-2xl font-bold text-white">
                    {Math.round(performanceMetrics?.fps || 0)}
                  </div>
                </div>
                <div className="p-4 bg-slate-800/30 rounded">
                  <div className="text-sm text-slate-400">Memory</div>
                  <div className="text-2xl font-bold text-white">
                    {Math.round(performanceMetrics?.memoryUsage || 0)}%
                  </div>
                </div>
                <div className="p-4 bg-slate-800/30 rounded">
                  <div className="text-sm text-slate-400">API Latency</div>
                  <div className="text-2xl font-bold text-white">
                    {Math.round(performanceMetrics?.apiLatency || 0)}ms
                  </div>
                </div>
                <div className="p-4 bg-slate-800/30 rounded">
                  <div className="text-sm text-slate-400">Render Time</div>
                  <div className="text-2xl font-bold text-white">
                    {Math.round(performanceMetrics?.renderTime || 0)}ms
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="storage">
              <div className="space-y-3">
                {systemHealth.checks.storage.details && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Used</span>
                      <span className="text-white">
                        {(systemHealth.checks.storage.details.usage / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Quota</span>
                      <span className="text-white">
                        {(systemHealth.checks.storage.details.quota / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                  </>
                )}
              </div>
            </TabsContent>

            <TabsContent value="logs">
              <div className="space-y-2 max-h-64 overflow-auto">
                {logs.length === 0 ? (
                  <div className="text-sm text-slate-400">No recent logs</div>
                ) : (
                  logs.slice(0, 20).map((log, idx) => (
                    <div key={idx} className="text-xs font-mono text-slate-400">
                      [{new Date(log.timestamp).toLocaleTimeString()}] {log.message}
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}